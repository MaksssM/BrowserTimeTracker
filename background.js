;(() => {
	let dailyStats = {}
	let currentState = {
		currentHost: null,
		currentSessionStart: null,
	}
	let isPaused = false
	let saveInterval = null
	let lastProcessedDate = null

	const getHost = url => {
		try {
			const urlObj = new URL(url)
			return urlObj.hostname.replace('www.', '')
		} catch (error) {
			return null
		}
	}

	// Функция для получения ключа даты (YYYY-MM-DD)
	const getDateKey = (date = new Date()) => {
		return date.toISOString().slice(0, 10)
	}

	// Функция для получения времени начала дня (00:00:00)
	const getStartOfDay = (date = new Date()) => {
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

		// Проверяем, что сессия началась сегодня (после 00:00)
		const sessionStartDate = new Date(currentState.currentSessionStart * 1000)
		const startOfDay = getStartOfDay()

		if (sessionStartDate < startOfDay) {
			// Сессия началась вчера, обрезаем до начала сегодняшнего дня
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

			// Устанавливаем начало сессии на текущее время, но не раньше 00:00 сегодня
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

	// Функция для миграции старых данных (если нужно)
	const migrateOldData = () => {
		const today = getDateKey()
		let needsMigration = false

		// Проверяем, есть ли данные за сегодня
		if (!dailyStats[today]) {
			// Создаем пустую запись для сегодняшнего дня
			dailyStats[today] = {}
			needsMigration = true
		}

		if (needsMigration) {
			chrome.storage.local.set({ dailyStats })
			console.log('Data migration completed')
		}
	}

	// Очистка старых данных (более 90 дней)
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

	// Ежедневная проверка на новый день
	const checkNewDay = async () => {
		const today = getDateKey()

		if (lastProcessedDate !== today) {
			// Новый день - сохраняем текущую сессию и обновляем дату
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

	// Слушатели событий
	chrome.runtime.onStartup.addListener(() => {
		loadInitialData().then(() => {
			checkNewDay()
			updateActivity()
		})
	})

	chrome.runtime.onInstalled.addListener(details => {
		if (details.reason === 'install') {
			// При первой установке инициализируем данные для текущего дня
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
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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

	// Обработчик сообщений от popup
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
			dailyStats[today] = {} // Сохраняем структуру для текущего дня
			chrome.storage.local.set({ dailyStats })
			sendResponse({ success: true })
		} else if (request.type === 'GET_DAY_START') {
			sendResponse({
				startOfDay: getStartOfDay().getTime(),
			})
		}
		return true
	})

	// Инициализация
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

		// Ежедневная проверка в полночь
		setInterval(checkNewDay, 60000) // Проверяем каждую минуту

		// Еженедельная очистка старых данных
		setInterval(cleanupOldData, 7 * 24 * 60 * 60 * 1000) // Раз в 7 дней
	})
})()
