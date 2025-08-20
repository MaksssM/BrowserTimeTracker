// --- Состояние по умолчанию, которое будет храниться в памяти ---
let state = {
	currentHost: null,
	currentSessionStart: null, // timestamp в секундах
	isPaused: false,
}

// --- Основной цикл, который работает всегда ---
setInterval(async () => {
	// 1. Получаем актуальное состояние паузы из хранилища
	const { isPaused } = await chrome.storage.local.get({ isPaused: false })
	state.isPaused = isPaused

	if (state.isPaused) {
		state.currentHost = null
		state.currentSessionStart = null
		// Сообщаем окну, что мы на паузе
		await chrome.storage.local.set({ currentState: state })
		return
	}

	const idleState = await chrome.idle.queryState(60) // 60 секунд бездействия
	if (idleState !== 'active') {
		state.currentHost = null
		state.currentSessionStart = null
		// Сообщаем окну, что мы неактивны
		await chrome.storage.local.set({ currentState: state })
		return
	}

	try {
		const [activeTab] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		})
		const host =
			activeTab && activeTab.url && activeTab.url.startsWith('http')
				? new URL(activeTab.url).hostname
				: null

		if (!host) {
			state.currentHost = null
			state.currentSessionStart = null
			await chrome.storage.local.set({ currentState: state })
			return
		}

		const now = Math.floor(Date.now() / 1000)

		// 2. Управление сессией
		if (host !== state.currentHost) {
			state.currentHost = host
			state.currentSessionStart = now
		}

		// 3. Агрегация данных
		const { dailyStats } = await chrome.storage.local.get({ dailyStats: {} })
		const todayKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

		if (!dailyStats[todayKey]) {
			dailyStats[todayKey] = {}
		}
		dailyStats[todayKey][host] = (dailyStats[todayKey][host] || 0) + 1

		// 4. Сохранение всего состояния
		await chrome.storage.local.set({
			dailyStats: dailyStats,
			currentState: state,
		})
	} catch (e) {
		state.currentHost = null
		state.currentSessionStart = null
		await chrome.storage.local.set({ currentState: state })
	}
}, 1000)

// Инициализация при установке
chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.local.set({
		dailyStats: {},
		currentState: { currentHost: null, currentSessionStart: null },
		isPaused: false,
	})
})
