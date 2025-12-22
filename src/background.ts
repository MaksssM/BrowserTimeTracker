;(() => {
	interface DailyStats {
		[date: string]: {
			[hostname: string]: number
		}
	}

	interface CurrentState {
		currentHost: string | null
		currentSessionStart: number | null
	}

	interface SiteTransition {
		from: string
		to: string
		timestamp: number
	}

	interface HourlyStats {
		[date: string]: {
			[hour: number]: number // 0-23 hours
		}
	}

	let dailyStats: DailyStats = {}
	let currentState: CurrentState = {
		currentHost: null,
		currentSessionStart: null,
	}
	let isPaused = false
	let saveInterval: number | null = null
	let lastProcessedDate: string | null = null
	let lastRemindedHost: string | null = null
	let reminderThreshold: number = 30 * 60 * 1000 // 30 minutes default
	let siteTransitions: SiteTransition[] = []
	let hourlyStats: HourlyStats = {}

	const getHost = (url: string): string | null => {
		try {
			const urlObj = new URL(url)
			return urlObj.hostname.replace('www.', '')
		} catch (error) {
			return null
		}
	}

	const getDateKey = (date: Date = new Date()): string => {
		return date.toISOString().slice(0, 10)
	}

	const getStartOfDay = (date: Date = new Date()): Date => {
		const start = new Date(date)
		start.setHours(0, 0, 0, 0)
		return start
	}

	const loadInitialData = async () => {
		try {
			const data = await chrome.storage.local.get([
				'dailyStats',
				'isPaused',
				'lastProcessedDate',
				'reminderThreshold',
				'siteTransitions',
				'hourlyStats',
			])
			dailyStats = data.dailyStats || {}
			isPaused = data.isPaused || false
			lastProcessedDate = data.lastProcessedDate || null
			reminderThreshold = data.reminderThreshold || 30 * 60 * 1000
			siteTransitions = data.siteTransitions || []
			hourlyStats = data.hourlyStats || {}
			console.log('Initial data loaded.', {
				dailyStats,
				isPaused,
				lastProcessedDate,
				transitionsCount: siteTransitions.length,
			})
		} catch (error) {
			console.error('Error loading initial data:', error)
			dailyStats = {}
			isPaused = false
			lastProcessedDate = null
			siteTransitions = []
			hourlyStats = {}
		}
	}

	const saveCurrentSession = () => {
		if (
			isPaused ||
			!currentState.currentHost ||
			!currentState.currentSessionStart
		) {
			return
		}

		const sessionStartDate = new Date(currentState.currentSessionStart * 1000)
		const startOfDay = getStartOfDay()

		if (sessionStartDate < startOfDay) {
			currentState.currentSessionStart = Math.floor(startOfDay.getTime() / 1000)
		}

		const sessionDuration = Math.floor(
			Date.now() / 1000 - currentState.currentSessionStart
		)
		if (sessionDuration < 1) return

		const today = getDateKey()
		const currentHour = new Date().getHours()

		// Save to daily stats
		dailyStats[today] = dailyStats[today] || {}
		dailyStats[today][currentState.currentHost] =
			(dailyStats[today][currentState.currentHost] || 0) + sessionDuration

		// Save to hourly stats
		hourlyStats[today] = hourlyStats[today] || {}
		hourlyStats[today][currentHour] =
			(hourlyStats[today][currentHour] || 0) + sessionDuration

		currentState.currentSessionStart = Math.floor(Date.now() / 1000)

		chrome.storage.local.set({ dailyStats, hourlyStats })
		console.log(
			`Saved ${sessionDuration}s for ${currentState.currentHost} at hour ${currentHour}`
		)
	}

	const updateActivity = async () => {
		if (isPaused) {
			if (currentState.currentHost) {
				saveCurrentSession()
				currentState.currentHost = null
				currentState.currentSessionStart = null
				chrome.storage.local.set({ currentState })
			}
			return
		}

		try {
			const [activeTab] = await chrome.tabs.query({
				active: true,
				lastFocusedWindow: true,
			})

			if (!activeTab || !activeTab.url) {
				if (currentState.currentHost) {
					saveCurrentSession()
					currentState.currentHost = null
					currentState.currentSessionStart = null
					chrome.storage.local.set({ currentState })
				}
				return
			}

			const host = getHost(activeTab.url)

			if (!host || host === currentState.currentHost) {
				return
			}

			if (currentState.currentHost) {
				saveCurrentSession()

				// Track site transition
				siteTransitions.push({
					from: currentState.currentHost,
					to: host,
					timestamp: Date.now(),
				})

				// Keep only last 1000 transitions to avoid storage bloat
				if (siteTransitions.length > 1000) {
					siteTransitions = siteTransitions.slice(-1000)
				}

				chrome.storage.local.set({ siteTransitions })
			}

			const now = Date.now() / 1000
			const startOfDay = Math.floor(getStartOfDay().getTime() / 1000)
			currentState.currentSessionStart = Math.max(now, startOfDay)

			currentState.currentHost = host
			chrome.storage.local.set({ currentState })
			console.log(`New activity: ${host}`)
		} catch (error) {
			console.error('Error updating activity:', error)
		}
	}

	const migrateOldData = () => {
		const today = getDateKey()
		let needsMigration = false
		if (!dailyStats[today]) {
			dailyStats[today] = {}
			needsMigration = true
		}
		if (needsMigration) {
			chrome.storage.local.set({ dailyStats })
			console.log('Data migration completed')
		}
	}

	const cleanupOldData = () => {
		const ninetyDaysAgo = new Date()
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

		for (const date in dailyStats) {
			if (new Date(date) < ninetyDaysAgo) {
				delete dailyStats[date]
			}
		}

		chrome.storage.local.set({ dailyStats })
		console.log('Cleaned up old data')
	}

	const checkLongActivityReminder = () => {
		if (
			isPaused ||
			!currentState.currentHost ||
			!currentState.currentSessionStart
		) {
			lastRemindedHost = null
			return
		}

		const sessionDuration = Date.now() / 1000 - currentState.currentSessionStart
		const sessionDurationMs = sessionDuration * 1000

		// Только показываем напоминание если:
		// 1. Время превышает порог
		// 2. Это не тот хост, на который уже показали напоминание
		if (
			sessionDurationMs >= reminderThreshold &&
			lastRemindedHost !== currentState.currentHost
		) {
			const hours = Math.floor(sessionDuration / 3600)
			const minutes = Math.floor((sessionDuration % 3600) / 60)
			const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

			chrome.notifications.create({
				type: 'basic',
				iconUrl:
					'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIyMCIgZmlsbD0iIzRmNDZlNSIvPjwvc3ZnPg==',
				title: 'Time for a Break',
				message: `You've spent ${timeStr} on ${currentState.currentHost}. Consider taking a break!`,
				priority: 1,
			})

			lastRemindedHost = currentState.currentHost
		}
	}

	const checkNewDay = async () => {
		const today = getDateKey()

		if (lastProcessedDate !== today) {
			if (currentState.currentHost) {
				saveCurrentSession()
				currentState.currentHost = null
				currentState.currentSessionStart = null
				chrome.storage.local.set({ currentState })
			}
			lastProcessedDate = today
			await chrome.storage.local.set({ lastProcessedDate: today })
			console.log('New day started:', today)
		}
	}

	chrome.runtime.onStartup.addListener(() => {
		loadInitialData().then(() => {
			checkNewDay()
			updateActivity()
		})
	})

	chrome.runtime.onInstalled.addListener(details => {
		if (details.reason === 'install') {
			loadInitialData().then(() => {
				const today = getDateKey()
				dailyStats[today] = dailyStats[today] || {}
				lastProcessedDate = today
				chrome.storage.local.set({ dailyStats, lastProcessedDate })
				console.log('Extension installed, initialized daily stats')
			})
		} else if (details.reason === 'update') {
			loadInitialData().then(() => {
				migrateOldData()
				checkNewDay()
				updateActivity()
			})
		}

		// Create context menu items
		chrome.contextMenus.create({
			id: 'zenith-add-category',
			title: 'Add to Category',
			contexts: ['page'],
		})

		const categories = [
			'work',
			'learning',
			'entertainment',
			'social',
			'shopping',
			'other',
		]
		categories.forEach(cat => {
			chrome.contextMenus.create({
				id: `zenith-cat-${cat}`,
				parentId: 'zenith-add-category',
				title: cat.charAt(0).toUpperCase() + cat.slice(1),
				contexts: ['page'],
			})
		})
	})

	chrome.contextMenus.onClicked.addListener((info, tab) => {
		if (
			info.menuItemId.toString().startsWith('zenith-cat-') &&
			tab &&
			tab.url
		) {
			const category = info.menuItemId.toString().replace('zenith-cat-', '')
			const host = getHost(tab.url)
			if (host) {
				chrome.storage.local.get('siteCategories', data => {
					const siteCategories = data.siteCategories || {}
					siteCategories[host.toLowerCase()] = category
					chrome.storage.local.set({ siteCategories }, () => {
						console.log(`Added ${host.toLowerCase()} to ${category}`)
					})
				})
			}
		}
	})

	chrome.tabs.onActivated.addListener(updateActivity)
	chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
		if (changeInfo.status === 'complete' && tab.active) {
			updateActivity()
		}
	})
	chrome.windows.onFocusChanged.addListener(updateActivity)

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local') {
			if (changes.isPaused) {
				isPaused = changes.isPaused.newValue
				console.log('Pause state changed to:', isPaused)
				if (isPaused) {
					saveCurrentSession()
					currentState.currentHost = null
					currentState.currentSessionStart = null
					chrome.storage.local.set({ currentState })
					if (saveInterval) clearInterval(saveInterval)
					saveInterval = null
				} else {
					updateActivity()
					if (!saveInterval) {
						saveInterval = setInterval(saveCurrentSession, 15000)
					}
				}
			}
			if (changes.lastProcessedDate) {
				lastProcessedDate = changes.lastProcessedDate.newValue
			}
		}
	})

	chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
		if (request.type === 'GET_CURRENT_STATE') {
			sendResponse({
				dailyStats: dailyStats,
				currentState: currentState,
				isPaused: isPaused,
			})
		} else if (request.type === 'EXPORT_DATA') {
			sendResponse({
				success: true,
				data: dailyStats,
			})
		} else if (request.type === 'CLEAR_DATA') {
			dailyStats = {}
			const today = getDateKey()
			dailyStats[today] = {}
			chrome.storage.local.set({ dailyStats })
			sendResponse({ success: true })
		} else if (request.type === 'GET_DAY_START') {
			sendResponse({
				startOfDay: getStartOfDay().getTime(),
			})
		} else if (request.type === 'SET_REMINDER_THRESHOLD') {
			reminderThreshold = request.threshold || 30 * 60 * 1000
			chrome.storage.local.set({ reminderThreshold })
			sendResponse({ success: true })
		} else if (request.type === 'GET_SITE_TRANSITIONS') {
			sendResponse({
				success: true,
				transitions: siteTransitions,
			})
		} else if (request.type === 'GET_HOURLY_STATS') {
			sendResponse({
				success: true,
				hourlyStats: hourlyStats,
			})
		}
		return true
	})

	loadInitialData().then(() => {
		migrateOldData()
		checkNewDay()
		updateActivity()

		if (!saveInterval) {
			saveInterval = setInterval(() => {
				checkNewDay()
				saveCurrentSession()
				checkLongActivityReminder()
			}, 15000)
		}

		setInterval(checkNewDay, 60000)
		setInterval(cleanupOldData, 7 * 24 * 60 * 60 * 1000)
	})
})()
