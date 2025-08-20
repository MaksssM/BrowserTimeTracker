document.addEventListener('DOMContentLoaded', async () => {
	// --- Глобальные переменные ---
	let trendChart,
		dailyStats = {}
	let liveTimerInterval = null
	let currentLang = 'en'

	const THEMES = [
		{ id: 'monolith', key: 'themeMonolith' },
		{ id: 'nord', key: 'themeNord' },
		{ id: 'matcha', key: 'themeMatcha' },
		{ id: 'solar', key: 'themeSolar' },
	]
	const LANGUAGES = [
		{ id: 'ru', name: 'Русский' },
		{ id: 'uk', name: 'Українська' },
		{ id: 'en', name: 'English' },
		{ id: 'es', name: 'Español' },
		{ id: 'de', name: 'Deutsch' },
		{ id: 'fr', name: 'Français' },
	]

	// --- Получение элементов DOM ---
	const periodSelect = document.getElementById('period-select')
	const themeButton = document.getElementById('theme-button')
	const pauseButton = document.getElementById('pause-button')
	const themeMenu = document.getElementById('theme-menu')
	const langButton = document.getElementById('lang-button')
	const langMenu = document.getElementById('lang-menu')
	const liveHostname = document.getElementById('live-hostname'),
		liveTimer = document.getElementById('live-timer'),
		liveFavicon = document.getElementById('live-favicon')
	const summaryTitle = document.getElementById('summary-title'),
		summaryTime = document.getElementById('summary-time'),
		comparisonInsight = document.getElementById('comparison-insight')
	const sitesListContainer = document.getElementById('sites-list-container')

	const setLanguage = lang => {
		currentLang = lang
		document.documentElement.lang = lang
		langButton.textContent = lang.toUpperCase()
		document.querySelectorAll('[data-i18n-key]').forEach(el => {
			const key = el.getAttribute('data-i18n-key')
			if (translations[lang] && translations[lang][key]) {
				el.textContent = translations[lang][key]
			}
		})
		document.querySelectorAll('[data-i18n-key-title]').forEach(el => {
			const key = el.getAttribute('data-i18n-key-title')
			if (translations[lang] && translations[lang][key]) {
				el.title = translations[lang][key]
			}
		})
		buildThemeMenu()
		if (Object.keys(dailyStats).length > 0) {
			updateDashboard()
		}
	}

	const formatHMS = s => {
		const hours = Math.floor(s / 3600)
			.toString()
			.padStart(2, '0')
		const minutes = Math.floor((s % 3600) / 60)
			.toString()
			.padStart(2, '0')
		const seconds = Math.floor(s % 60)
			.toString()
			.padStart(2, '0')
		return `${hours}:${minutes}:${seconds}`
	}

	const applyTheme = themeId => {
		document.body.dataset.theme = themeId
		if (Object.keys(dailyStats).length > 0) {
			// Чтобы применить цвет к графику, нужно найти дату начала текущего периода
			const period = periodSelect.value
			const now = new Date()
			let startDate
			if (period === 'today') {
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
			} else if (period === 'week') {
				const dayOfWeek = now.getDay()
				startDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
				)
			} else if (period === 'month') {
				startDate = new Date(now.getFullYear(), now.getMonth(), 1)
			} else {
				startDate = new Date(now.getFullYear(), 0, 1)
			}
			renderTrendChart(startDate)
		}
	}

	const buildThemeMenu = () => {
		themeMenu.innerHTML = ''
		THEMES.forEach(theme => {
			const button = document.createElement('button')
			button.innerHTML = `<div class="theme-dot"></div> ${
				translations[currentLang][theme.key]
			}`
			button.onclick = () => {
				applyTheme(theme.id)
				chrome.storage.sync.set({ theme: theme.id })
				themeMenu.style.display = 'none'
			}
			themeMenu.appendChild(button)
		})
	}

	const buildLangMenu = () => {
		langMenu.innerHTML = ''
		LANGUAGES.forEach(lang => {
			const button = document.createElement('button')
			button.textContent = lang.name
			button.onclick = () => {
				setLanguage(lang.id)
				chrome.storage.sync.set({ language: lang.id })
				langMenu.style.display = 'none'
			}
			langMenu.appendChild(button)
		})
	}

	themeButton.addEventListener('click', e => {
		e.stopPropagation()
		themeMenu.style.display =
			themeMenu.style.display === 'flex' ? 'none' : 'flex'
	})
	langButton.addEventListener('click', e => {
		e.stopPropagation()
		langMenu.style.display = langMenu.style.display === 'flex' ? 'none' : 'flex'
	})
	document.addEventListener('click', e => {
		if (themeMenu && !themeMenu.contains(e.target))
			themeMenu.style.display = 'none'
		if (langMenu && !langMenu.contains(e.target))
			langMenu.style.display = 'none'
	})

	const getRecordsForPeriod = (startDate, endDate = new Date()) => {
		const records = {}
		const startKey = startDate.toISOString().slice(0, 10)
		const endKey = endDate.toISOString().slice(0, 10)
		for (const dayKey in dailyStats) {
			if (dayKey >= startKey && dayKey <= endKey) {
				for (const host in dailyStats[dayKey]) {
					records[host] = (records[host] || 0) + dailyStats[dayKey][host]
				}
			}
		}
		return records
	}

	const updateDashboard = () => {
		const period = periodSelect.value
		const now = new Date()
		let startDate, prevStartDate, titleKey

		if (period === 'today') {
			startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
			prevStartDate = new Date(new Date().setDate(now.getDate() - 1))
			titleKey = 'periodToday'
		} else if (period === 'week') {
			const dayOfWeek = now.getDay()
			startDate = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
			)
			prevStartDate = new Date(
				new Date(startDate).setDate(startDate.getDate() - 7)
			)
			titleKey = 'periodWeek'
		} else if (period === 'month') {
			startDate = new Date(now.getFullYear(), now.getMonth(), 1)
			prevStartDate = new Date(new Date().setMonth(now.getMonth() - 1))
			titleKey = 'periodMonth'
		} else {
			startDate = new Date(now.getFullYear(), 0, 1)
			prevStartDate = new Date(new Date().setFullYear(now.getFullYear() - 1))
			titleKey = 'periodYear'
		}

		summaryTitle.textContent = `${
			translations[currentLang].summaryPrefix
		} ${translations[currentLang][titleKey].toLowerCase()}`

		const currentPeriodRecords = getRecordsForPeriod(startDate)
		const prevPeriodRecords = getRecordsForPeriod(prevStartDate, startDate)
		renderSummary(currentPeriodRecords, prevPeriodRecords)
		renderSitesList(currentPeriodRecords)
		renderTrendChart(startDate)
	}

	function renderSummary(records, prevRecords) {
		const totalTime = Object.values(records).reduce((a, b) => a + b, 0)
		summaryTime.textContent = formatHMS(totalTime)
		const prevTime = Object.values(prevRecords).reduce((a, b) => a + b, 0)
		if (prevTime === 0) {
			comparisonInsight.textContent = '...'
			return
		}
		const percentageChange = ((totalTime - prevTime) / prevTime) * 100
		const trend = percentageChange >= 0 ? '↑' : '↓'
		const trendClass = percentageChange >= 0 ? 'trend-up' : 'trend-down'
		comparisonInsight.innerHTML = `<span class="${trendClass}">${trend}${Math.abs(
			percentageChange
		).toFixed(0)}%</span>`
	}

	function renderSitesList(records) {
		const sortedSites = Object.entries(records).sort((a, b) => b[1] - a[1])
		sitesListContainer.innerHTML =
			sortedSites.length > 0
				? sortedSites
						.map(
							([host, time]) => `
            <div class="site-entry"><span class="site-name">${host}</span><span class="site-time">${formatHMS(
								time
							)}</span></div>`
						)
						.join('')
				: `<p class="placeholder">${translations[currentLang].statusNoData}</p>`
	}

	function renderTrendChart(startDate) {
		const trendChartCtx = document
			.getElementById('trend-chart')
			.getContext('2d')
		if (trendChart) trendChart.destroy()
		const labels = [],
			data = []
		const period = periodSelect.value
		if (period === 'year') {
			const monthLabels = [
				'Янв',
				'Фев',
				'Мар',
				'Апр',
				'Май',
				'Июн',
				'Июл',
				'Авг',
				'Сен',
				'Окт',
				'Ноя',
				'Дек',
			]
			const monthlyData = Array(12).fill(0)
			for (const dayKey in dailyStats) {
				if (dayKey.startsWith(startDate.getFullYear().toString())) {
					monthlyData[new Date(dayKey).getMonth()] += Object.values(
						dailyStats[dayKey]
					).reduce((a, b) => a + b, 0)
				}
			}
			labels.push(...monthLabels)
			data.push(...monthlyData)
		} else {
			let numDays =
				period === 'week'
					? 7
					: new Date(
							startDate.getFullYear(),
							startDate.getMonth() + 1,
							0
					  ).getDate()
			const dateIterator = new Date(startDate)
			for (let i = 0; i < numDays; i++) {
				const dayKey = dateIterator.toISOString().slice(0, 10)
				labels.push(dayKey)
				data.push(
					dailyStats[dayKey]
						? Object.values(dailyStats[dayKey]).reduce((a, b) => a + b, 0)
						: 0
				)
				dateIterator.setDate(dateIterator.getDate() + 1)
			}
		}
		const styles = getComputedStyle(document.body)
		const accentColor = styles.getPropertyValue('--accent').trim()
		const textColor = styles.getPropertyValue('--text-secondary').trim()
		const gridColor = styles.getPropertyValue('--glass-border').trim()

		// --- ИСПРАВЛЕНИЕ ОШИБКИ ---
		// Надежно преобразуем цвет в формат RGBA, который Canvas API всегда поймет.
		let accentColorWithAlpha = 'rgba(136, 192, 208, 0.4)' // Цвет по умолчанию
		try {
			// Создаем временный элемент, чтобы браузер вычислил цвет в формате rgb()
			const tempEl = document.createElement('div')
			tempEl.style.color = accentColor
			document.body.appendChild(tempEl)
			const computedColor = getComputedStyle(tempEl).color // Получаем цвет как "rgb(r, g, b)"
			document.body.removeChild(tempEl)
			// Преобразуем "rgb(r, g, b)" в "rgba(r, g, b, 0.4)"
			accentColorWithAlpha = computedColor
				.replace('rgb', 'rgba')
				.replace(')', ', 0.4)')
		} catch (e) {
			console.warn(
				'Не удалось проанализировать цвет для градиента, используется значение по умолчанию.'
			)
		}

		const gradient = trendChartCtx.createLinearGradient(
			0,
			0,
			0,
			trendChartCtx.canvas.height
		)
		gradient.addColorStop(0, accentColorWithAlpha) // Используем исправленный цвет
		gradient.addColorStop(1, 'transparent')

		trendChart = new Chart(trendChartCtx, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						data,
						borderColor: accentColor,
						backgroundColor: gradient,
						fill: true,
						tension: 0.4,
						pointBackgroundColor: accentColor,
						pointBorderWidth: 0,
						pointRadius: data.length < 31 ? 3 : 0,
						pointHoverRadius: 5,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { intersect: false, mode: 'index' },
				scales: {
					x: {
						ticks: { color: textColor, font: { size: 10 } },
						grid: { display: false },
						border: { color: gridColor },
					},
					y: {
						ticks: {
							color: textColor,
							callback: v => formatHMS(v).slice(0, 5),
						},
						grid: { color: gridColor, drawTicks: false },
						border: { display: false },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						displayColors: false,
						callbacks: {
							title: ctx =>
								period === 'year'
									? labels[ctx[0].dataIndex]
									: new Date(ctx[0].label).toLocaleDateString('ru-RU', {
											day: 'numeric',
											month: 'long',
									  }),
							label: ctx => `Всего: ${formatHMS(ctx.raw)}`,
						},
					},
				},
			},
		})
	}

	function updateLiveActivity(currentState) {
		if (liveTimerInterval) clearInterval(liveTimerInterval)
		const { isPaused, currentHost, currentSessionStart } = currentState || {}
		if (isPaused) {
			liveTimer.textContent = translations[currentLang].statusPaused
			liveHostname.textContent = '...'
			liveFavicon.src = ''
			return
		}
		if (currentHost && currentSessionStart) {
			liveHostname.textContent = currentHost
			liveFavicon.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${currentHost}`
			const update = () => {
				liveTimer.textContent = formatHMS(
					Math.floor(Date.now() / 1000) - currentSessionStart
				)
			}
			update()
			liveTimerInterval = setInterval(update, 1000)
		} else {
			liveHostname.textContent = translations[currentLang].statusNoTab
			liveTimer.textContent = '...'
			liveFavicon.src = ''
		}
	}

	const init = async () => {
		const syncData = await chrome.storage.sync.get({
			theme: 'monolith',
			language: 'en',
		})
		const localData = await chrome.storage.local.get([
			'dailyStats',
			'currentState',
			'isPaused',
		])

		dailyStats = localData.dailyStats || {}

		document.body.classList.toggle('paused', localData.isPaused || false)

		buildLangMenu()
		setLanguage(syncData.language)
		applyTheme(syncData.theme)

		updateDashboard()
		updateLiveActivity(localData.currentState)

		periodSelect.addEventListener('change', updateDashboard)
		pauseButton.addEventListener('click', () =>
			chrome.storage.local.get({ isPaused: false }, ({ isPaused }) =>
				chrome.storage.local.set({ isPaused: !isPaused })
			)
		)

		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === 'local') {
				if (changes.dailyStats) {
					dailyStats = changes.dailyStats.newValue
					updateDashboard()
				}
				if (changes.currentState)
					updateLiveActivity(changes.currentState.newValue)
				if (changes.isPaused)
					document.body.classList.toggle('paused', changes.isPaused.newValue)
			}
			if (area === 'sync') {
				if (changes.language) setLanguage(changes.language.newValue)
			}
		})
	}
	init()
})
