document.addEventListener('DOMContentLoaded', async () => {
	// --- Иконки и Темы ---
	const ICONS = {
		theme: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 01.75.75v.518a13.535 13.535 0 015.65 2.181.75.75 0 01-.53 1.321A12.036 12.036 0 0012 6a12.036 12.036 0 00-5.87 1.27.75.75 0 01-.53-1.32A13.535 13.535 0 0111.25 2.768V2.25a.75.75 0 01.75-.75zM4.533 8.243A13.545 13.545 0 013 12a13.545 13.545 0 011.533 3.757.75.75 0 01-1.255.787A15.045 15.045 0 001.5 12c0-2.425.57-4.722 1.588-6.79.467-.954 1.683-.902 2.106.088a.75.75 0 01-.762 1.045zM21.22 7.21a.75.75 0 01.762 1.045 15.045 15.045 0 01-1.588 6.79.75.75 0 11-1.255-.787A13.545 13.545 0 0021 12a13.545 13.545 0 00-1.533-3.757c-.424-1.028.74-1.848 2.106-.088a.75.75 0 01-.353-.944zM12 1.5a.75.75 0 01.75.75v19.5a.75.75 0 01-1.5 0V2.25A.75.75 0 0112 1.5z" /></svg>`,
		pause: `<svg class="pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 00-.75.75v12c0 .414.336.75.75.75h2.25a.75.75 0 00.75-.75v-12a.75.75 0 00-.75-.75H6.75zm8.25 0a.75.75 0 00-.75.75v12c0 .414.336.75.75.75h2.25a.75.75 0 00.75-.75v-12a.75.75 0 00-.75-.75H15z" clip-rule="evenodd" /></svg>`,
		play: `<svg class="play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>`,
	}
	const THEMES = [
		{ id: 'monolith', name: 'Monolith' },
		{ id: 'nord', name: 'Nord' },
		{ id: 'matcha', name: 'Matcha' },
		{ id: 'solar', name: 'Solar' },
	]

	// --- Элементы UI ---
	const periodSelect = document.getElementById('period-select')
	const themeButton = document.getElementById('theme-button')
	const pauseButton = document.getElementById('pause-button')
	const trendChartCtx = document.getElementById('trend-chart').getContext('2d')

	const liveHostname = document.getElementById('live-hostname'),
		liveTimer = document.getElementById('live-timer'),
		liveFavicon = document.getElementById('live-favicon')
	const summaryTitle = document.getElementById('summary-title'),
		summaryTime = document.getElementById('summary-time'),
		comparisonInsight = document.getElementById('comparison-insight')
	const sitesListContainer = document.getElementById('sites-list-container')

	let trendChart,
		allRecords = []

	// --- Логика тем ---
	const applyTheme = themeId => {
		document.body.dataset.theme = themeId
		if (allRecords.length > 0) updateDashboard()
	}
	const buildThemeMenu = () => {
		const menu = document.getElementById('theme-menu')
		menu.innerHTML = ''
		THEMES.forEach(theme => {
			const button = document.createElement('button')
			button.innerHTML = `<div class="theme-dot ${theme.id}"></div> ${theme.name}`
			button.onclick = () => {
				applyTheme(theme.id)
				chrome.storage.sync.set({ theme: theme.id })
				menu.style.display = 'none'
			}
			menu.appendChild(button)
		})
		return menu
	}
	const themeMenu = buildThemeMenu()
	themeButton.addEventListener(
		'click',
		() =>
			(themeMenu.style.display =
				themeMenu.style.display === 'flex' ? 'none' : 'flex')
	)
	document.addEventListener('click', e => {
		if (!document.getElementById('theme-control').contains(e.target)) {
			themeMenu.style.display = 'none'
		}
	})

	// --- Остальная логика ---
	const applyPauseState = isPaused =>
		document.body.classList.toggle('paused', isPaused)
	const formatHMS = s => new Date(s * 1000).toISOString().slice(11, 19)
	const getStartOfDay = d =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate())
	const getStartOfWeek = d => {
		const date = new Date(d)
		const day = date.getDay()
		const diff = date.getDate() - day + (day === 0 ? -6 : 1)
		return getStartOfDay(new Date(date.setDate(diff)))
	}
	const getStartOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1)

	const getFilteredRecords = () => {
		const period = periodSelect.value
		const now = new Date()
		let startDate, prevStartDate, title
		if (period === 'today') {
			startDate = getStartOfDay(now)
			prevStartDate = getStartOfDay(
				new Date(new Date().setDate(now.getDate() - 1))
			)
			title = 'Всего за сегодня'
		} else if (period === 'week') {
			startDate = getStartOfWeek(now)
			prevStartDate = getStartOfWeek(
				new Date(new Date().setDate(now.getDate() - 7))
			)
			title = 'Всего за неделю'
		} else {
			startDate = getStartOfMonth(now)
			prevStartDate = getStartOfMonth(
				new Date(new Date().setMonth(now.getMonth() - 1))
			)
			title = 'Всего за месяц'
		}
		summaryTitle.textContent = title
		const currentPeriodRecords = allRecords.filter(
			r => r.timestamp * 1000 >= startDate.getTime()
		)
		const prevPeriodRecords = allRecords.filter(
			r =>
				r.timestamp * 1000 >= prevStartDate.getTime() &&
				r.timestamp * 1000 < startDate.getTime()
		)
		return { currentPeriodRecords, prevPeriodRecords }
	}

	const updateDashboard = () => {
		const { currentPeriodRecords, prevPeriodRecords } = getFilteredRecords()
		renderSummary(currentPeriodRecords, prevPeriodRecords)
		renderSitesList(currentPeriodRecords)
		renderTrendChart(currentPeriodRecords)
	}

	function renderSummary(records, prevRecords) {
		summaryTime.textContent = formatHMS(records.length)
		const prevTime = prevRecords.length
		if (prevTime === 0) {
			comparisonInsight.textContent = '...'
			return
		}
		const percentageChange = ((records.length - prevTime) / prevTime) * 100
		const trend = percentageChange >= 0 ? '↑' : '↓'
		const trendClass = percentageChange >= 0 ? 'trend-up' : 'trend-down'
		comparisonInsight.innerHTML = `<span class="${trendClass}">${trend}${Math.abs(
			percentageChange
		).toFixed(0)}%</span>`
	}

	function renderSitesList(records) {
		const dataBySite = {}
		records.forEach(r => {
			dataBySite[r.host] = (dataBySite[r.host] || 0) + 1
		})
		const sortedSites = Object.entries(dataBySite)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 7)
		sitesListContainer.innerHTML =
			sortedSites.length > 0
				? sortedSites
						.map(
							([host, time]) => `
            <div class="site-entry" data-host="${host}"><span class="site-name">${host}</span><span class="site-time">${formatHMS(
								time
							)}</span></div>`
						)
						.join('')
				: `<p class="placeholder">Нет данных.</p>`
	}

	function renderTrendChart(records) {
		if (trendChart) trendChart.destroy()
		const dataByDay = {}
		records.forEach(r => {
			const day = getStartOfDay(new Date(r.timestamp * 1000))
				.toISOString()
				.split('T')[0]
			dataByDay[day] = (dataByDay[day] || 0) + 1
		})
		const labels = Object.keys(dataByDay).sort()
		const data = labels.map(label => dataByDay[label])

		const styles = getComputedStyle(document.body)
		const accentColor = styles.getPropertyValue('--accent').trim()
		const textColor = styles.getPropertyValue('--text-secondary').trim()
		const gridColor = styles.getPropertyValue('--card-border').trim()

		const gradient = trendChartCtx.createLinearGradient(
			0,
			0,
			0,
			trendChartCtx.canvas.height
		)
		gradient.addColorStop(0, accentColor + '60')
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
						pointRadius: data.length < 15 ? 4 : 0,
						pointHoverRadius: 6,
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
								new Date(ctx[0].label).toLocaleDateString('ru-RU', {
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

	const calculateCurrentSessionTime = (host, records) => {
		let sessionTime = 0
		if (!host || records.length === 0) return 0
		const now = Math.floor(Date.now() / 1000)
		const lastRecord = records[records.length - 1]
		if (lastRecord.host !== host || now - lastRecord.timestamp > 2) return 0

		for (let i = records.length - 1; i >= 0; i--) {
			const record = records[i]
			const prevTimestamp =
				i > 0 ? records[i - 1].timestamp : record.timestamp - 1
			if (record.host !== host || record.timestamp - prevTimestamp > 2) break
			sessionTime++
		}
		return sessionTime
	}

	// --- ФИНАЛЬНАЯ, АРХИТЕКТУРНО ПРАВИЛЬНАЯ ЛОГИКА ---
	const updateLiveActivity = async () => {
		const { isPaused } = await chrome.storage.local.get({ isPaused: false })
		if (isPaused) {
			liveTimer.textContent = 'На паузе'
			liveHostname.textContent = '...'
			liveFavicon.src = ''
			return
		}
		try {
			const [activeTab] = await chrome.tabs.query({
				active: true,
				lastFocusedWindow: true,
			})
			if (activeTab && activeTab.url && activeTab.url.startsWith('http')) {
				const host = new URL(activeTab.url).hostname
				liveHostname.textContent = host
				liveFavicon.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${host}`
				const sessionTime = calculateCurrentSessionTime(host, allRecords)
				liveTimer.textContent = formatHMS(sessionTime)
			} else {
				liveHostname.textContent = 'Нет активной вкладки'
				liveTimer.textContent = '...'
				liveFavicon.src = ''
			}
		} catch (e) {
			/* Игнорируем */
		}
	}

	const init = async () => {
		const { timeRecords, isPaused } = await chrome.storage.local.get({
			timeRecords: [],
			isPaused: false,
		})
		const { theme } = await chrome.storage.sync.get({ theme: 'monolith' })

		allRecords = timeRecords || []
		themeButton.innerHTML = ICONS.theme
		pauseButton.innerHTML = ICONS.pause + ICONS.play

		applyTheme(theme)
		applyPauseState(isPaused)
		updateDashboard()
		updateLiveActivity()

		periodSelect.addEventListener('change', updateDashboard)
		pauseButton.addEventListener('click', async () => {
			let { isPaused } = await chrome.storage.local.get({ isPaused: false })
			isPaused = !isPaused
			await chrome.storage.local.set({ isPaused })
			applyPauseState(isPaused)
		})

		// САМОЕ ВАЖНОЕ: слушаем изменения из background.js
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === 'local' && changes.timeRecords) {
				allRecords = changes.timeRecords.newValue
				updateDashboard()
				updateLiveActivity()
			}
		})
	}

	init()
})
