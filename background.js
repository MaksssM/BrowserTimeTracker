// --- Логика динамического создания иконок ---

function createIcon(isPaused = false) {
	const size = 128 // Рисуем в высоком разрешении
	const canvas = new OffscreenCanvas(size, size)
	const ctx = canvas.getContext('2d')

	// Рисуем основной фон (градиентный круг)
	const gradient = ctx.createLinearGradient(0, 0, size, size)
	gradient.addColorStop(0, '#8A7FFF') // Светло-фиолетовый
	gradient.addColorStop(1, '#6d5dfc') // Наш акцентный цвет
	ctx.fillStyle = gradient
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI)
	ctx.fill()

	if (isPaused) {
		// Рисуем символ паузы, если трекинг остановлен
		ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
		const barWidth = size * 0.15
		const barHeight = size * 0.5
		const gap = size * 0.1
		const top = (size - barHeight) / 2

		ctx.fillRect(size / 2 - barWidth - gap / 2, top, barWidth, barHeight)
		ctx.fillRect(size / 2 + gap / 2, top, barWidth, barHeight)
	}

	return ctx.getImageData(0, 0, size, size)
}

function updateIcon(isPaused) {
	const iconData = createIcon(isPaused)
	chrome.action.setIcon({ imageData: iconData })
}

// --- Основная логика трекинга (без изменений, кроме вызова иконки) ---

// Устанавливаем иконку при запуске расширения
chrome.runtime.onStartup.addListener(async () => {
	const { isPaused } = await chrome.storage.local.get({ isPaused: false })
	updateIcon(isPaused)
})

// Устанавливаем иконку при установке или обновлении
chrome.runtime.onInstalled.addListener(async () => {
	const { isPaused } = await chrome.storage.local.get({ isPaused: false })
	updateIcon(isPaused)
})

async function logActivity() {
	const { isPaused } = await chrome.storage.local.get({ isPaused: false })
	if (isPaused) return

	const idleState = await chrome.idle.queryState(60) // 60 секунд бездействия
	if (idleState !== 'active') return

	try {
		const [activeTab] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		})
		if (activeTab && activeTab.url && activeTab.url.startsWith('http')) {
			const host = new URL(activeTab.url).hostname
			const timestamp = Math.floor(Date.now() / 1000)
			const { timeRecords } = await chrome.storage.local.get({
				timeRecords: [],
			})
			timeRecords.push({ host, timestamp })
			await chrome.storage.local.set({ timeRecords })
		}
	} catch (e) {
		// Ошибки могут возникать, если нет активных окон, это нормально
	}
}

setInterval(logActivity, 1000)

// Слушатель для обновления иконки при изменении состояния паузы из popup
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.isPaused) {
		updateIcon(changes.isPaused.newValue)
	}
})
