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

	const periodSelect = document.getElementById('period-select')
	const themeButton = document.getElementById('theme-button')
	const pauseButton = document.getElementById('pause-button')
	let trendChartCtx

	const liveHostname = document.getElementById('live-hostname'),
		liveTimer = document.getElementById('live-timer'),
		liveFavicon = document.getElementById('live-favicon')
	const summaryTitle = document.getElementById('summary-title'),
		summaryTime = document.getElementById('summary-time'),
		comparisonInsight = document.getElementById('comparison-insight')
	const sitesListContainer = document.getElementById('sites-list-container')

	let trendChart,
		dailyStats = {},
		liveTimerInterval = null // Переменная для управления таймером

	const applyTheme = themeId => {
		document.body.dataset.theme = themeId
		updateDashboard()
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

	const applyPauseState = isPaused =>
		document.body.classList.toggle('paused', isPaused)

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
		let startDate, prevStartDate, title

		if (period === 'today') {
			startDate = new Date(now.setHours(0, 0, 0, 0))
			prevStartDate = new Date(new Date().setDate(now.getDate() - 1))
			prevStartDate.setHours(0, 0, 0, 0)
			title = 'Всего за сегодня'
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
			title = 'Всего за неделю'
		} else if (period === 'month') {
			startDate = new Date(now.getFullYear(), now.getMonth(), 1)
			const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
			prevStartDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1)
			title = 'Всего за месяц'
		} else {
			// year
			startDate = new Date(now.getFullYear(), 0, 1)
			prevStartDate = new Date(new Date().setFullYear(now.getFullYear() - 1))
			title = 'Всего за год'
		}
		summaryTitle.textContent = title

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
							([host, time]) =>
								`<div class="site-entry"><span class="site-name">${host}</span><span class="site-time">${formatHMS(
									time
								)}</span></div>`
						)
						.join('')
				: `<p class="placeholder">Нет данных.</p>`
	}

	function renderTrendChart(startDate) {
		if (!trendChartCtx) return
		if (trendChart) trendChart.destroy()

		const labels = [],
			data = []
		const period = periodSelect.value

		if (period === 'today') {
			// ...
		} else if (period === 'year') {
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
					const month = new Date(dayKey).getMonth()
					monthlyData[month] += Object.values(dailyStats[dayKey]).reduce(
						(a, b) => a + b,
						0
					)
				}
			}
			labels.push(...monthLabels)
			data.push(...monthlyData)
		} else {
			// week or month
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
				const dayTotal = dailyStats[dayKey]
					? Object.values(dailyStats[dayKey]).reduce((a, b) => a + b, 0)
					: 0
				data.push(dayTotal)
				dateIterator.setDate(dateIterator.getDate() + 1)
			}
		}

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
						pointRadius: data.length < 31 ? 4 : 0,
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

	// ИЗМЕНЕННАЯ ФУНКЦИЯ
	function updateLiveActivity(currentState) {
		clearInterval(liveTimerInterval) // Очищаем старый таймер

		const { isPaused, currentHost, currentSessionStart } = currentState

		if (isPaused) {
			liveTimer.textContent = 'На паузе'
			liveHostname.textContent = '...'
			liveFavicon.src = ''
			return
		}

		if (currentHost && currentSessionStart) {
			liveHostname.textContent = currentHost
			liveFavicon.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${currentHost}`

			// Запускаем новый таймер для обновления счетчика в реальном времени
			liveTimerInterval = setInterval(() => {
				const sessionTime = Math.floor(Date.now() / 1000) - currentSessionStart
				liveTimer.textContent = formatHMS(sessionTime)
			}, 1000)
		} else {
			liveHostname.textContent = 'Нет активной вкладки'
			liveTimer.textContent = '...'
			liveFavicon.src = ''
		}
	}

	const init = async () => {
		trendChartCtx = document.getElementById('trend-chart').getContext('2d')

		const { isPaused } = await chrome.storage.local.get({ isPaused: false })
		const { theme } = await chrome.storage.sync.get({ theme: 'monolith' })

		const data = await chrome.storage.local.get(['dailyStats', 'currentState'])
		dailyStats = data.dailyStats || {}
		const currentState = data.currentState || {}

		themeButton.innerHTML = ICONS.theme
		pauseButton.innerHTML = ICONS.pause + ICONS.play
		applyTheme(theme)
		applyPauseState(isPaused)
		updateDashboard()
		updateLiveActivity(currentState)

		periodSelect.addEventListener('change', updateDashboard)
		pauseButton.addEventListener('click', async () => {
			const { isPaused } = await chrome.storage.local.get({ isPaused: false })
			await chrome.storage.local.set({ isPaused: !isPaused })
		})

		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === 'local') {
				if (changes.dailyStats) {
					dailyStats = changes.dailyStats.newValue
					updateDashboard()
				}
				if (changes.currentState) {
					updateLiveActivity(changes.currentState.newValue)
				}
				if (changes.isPaused) {
					applyPauseState(changes.isPaused.newValue)
				}
			}
		})
	}

	init()
})
