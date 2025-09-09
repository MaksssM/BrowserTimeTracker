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

	let dailyStats: DailyStats = {}
	let currentState: CurrentState = {
		currentHost: null,
		currentSessionStart: null,
	}
	let isPaused = false
	let saveInterval: number | null = null
	let lastProcessedDate: string | null = null

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
			])
			dailyStats = data.dailyStats || {}
			isPaused = data.isPaused || false
			lastProcessedDate = data.lastProcessedDate || null
			console.log('Initial data loaded.', {
				dailyStats,
				isPaused,
				lastProcessedDate,
			})
		} catch (error) {
			console.error('Error loading initial data:', error)
			dailyStats = {}
			isPaused = false
			lastProcessedDate = null
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
		dailyStats[today] = dailyStats[today] || {}
		dailyStats[today][currentState.currentHost] =
			(dailyStats[today][currentState.currentHost] || 0) + sessionDuration

		currentState.currentSessionStart = Math.floor(Date.now() / 1000)

		chrome.storage.local.set({ dailyStats })
		console.log(`Saved ${sessionDuration}s for ${currentState.currentHost}`)
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
			}, 15000)
		}

		setInterval(checkNewDay, 60000)
		setInterval(cleanupOldData, 7 * 24 * 60 * 60 * 1000)
	})
})()
