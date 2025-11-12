import { translations } from './translations'
import { Chart, registerables, TooltipItem, ChartType } from 'chart.js'
Chart.register(...registerables)

// Type definitions
interface DailyStats {
	[date: string]: {
		[hostname: string]: number
	}
}

interface CurrentState {
	currentHost?: string | null
	currentSessionStart?: number | null
	isPaused: boolean
}

interface SyncData {
	theme: string
	language: string
}

document.addEventListener('DOMContentLoaded', () => {
	let dailyStats: DailyStats = {}
	let currentState: CurrentState = { isPaused: false }
	let liveTimerInterval: number | null = null
	let currentLang = 'en'
	let currentChartType = 'daily'
	let currentSitesPeriod = 'daily'
	let activityChartInstance: Chart | null = null

	const THEMES = [
		{ id: 'monolith', key: 'themeMonolith' },
		{ id: 'nord', key: 'themeNord' },
		{ id: 'matcha', key: 'themeMatcha' },
		{ id: 'solar', key: 'themeSolar' },
	]

	const LANGUAGES = [
		{ id: 'uk', name: 'Українська' },
		{ id: 'en', name: 'English' },
		{ id: 'es', name: 'Español' },
		{ id: 'de', name: 'Deutsch' },
		{ id: 'fr', name: 'Français' },
	]

	const elements = {
		periodSelect: document.getElementById('period-select') as HTMLSelectElement,
		themeButton: document.getElementById('theme-button') as HTMLButtonElement,
		pauseButton: document.getElementById('pause-button') as HTMLButtonElement,
		exportButton: document.getElementById('export-button') as HTMLButtonElement,
		settingsButton: document.getElementById(
			'settings-button'
		) as HTMLButtonElement,
		themeMenu: document.getElementById('theme-menu') as HTMLDivElement,
		langButton: document.getElementById('lang-button') as HTMLButtonElement,
		langMenu: document.getElementById('lang-menu') as HTMLDivElement,
		liveHostname: document.getElementById(
			'live-hostname'
		) as HTMLParagraphElement,
		liveTimer: document.getElementById('live-timer') as HTMLHeadingElement,
		liveFavicon: document.getElementById('live-favicon') as HTMLImageElement,
		summaryTitle: document.getElementById(
			'summary-title'
		) as HTMLHeadingElement,
		summaryTime: document.getElementById('summary-time') as HTMLHeadingElement,
		comparisonInsight: document.getElementById(
			'comparison-insight'
		) as HTMLParagraphElement,
		sitesListContainer: document.getElementById(
			'sites-list-container'
		) as HTMLDivElement,
		errorContainer: document.getElementById(
			'error-container'
		) as HTMLDivElement,
		sitesCount: document.getElementById('sites-count') as HTMLSpanElement,
		chartDaily: document.getElementById('chart-daily') as HTMLButtonElement,
		chartWeekly: document.getElementById('chart-weekly') as HTMLButtonElement,
		chartMonthly: document.getElementById('chart-monthly') as HTMLButtonElement,
		// Новые элементы для кнопок сайтов
		sitesDaily: document.getElementById('sites-daily') as HTMLButtonElement,
		sitesWeekly: document.getElementById('sites-weekly') as HTMLButtonElement,
		sitesMonthly: document.getElementById('sites-monthly') as HTMLButtonElement,
		activityChart: document.getElementById(
			'activity-chart'
		) as HTMLCanvasElement,
	}

	const formatHMS = (s: number): string => {
		s = Math.max(0, Math.floor(s))
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

	const formatHostname = (hostname: string | null | undefined): string => {
		if (!hostname) return ''
		let cleanHost = hostname.replace(/^www\./, '').replace(/^https?:\/\//, '')
		if (cleanHost.length > 25) {
			cleanHost = cleanHost.substring(0, 22) + '...'
		}
		return cleanHost
	}

	const showError = (message: string) => {
		elements.errorContainer.textContent = message
		elements.errorContainer.style.display = 'block'
		setTimeout(() => {
			elements.errorContainer.style.display = 'none'
		}, 5000)
	}

	const applyTheme = (themeId: string) => {
		document.body.dataset.theme = themeId
		updateDashboard()
	}

	const init = async () => {
		try {
			const syncData = (await chrome.storage.sync.get({
				theme: 'monolith',
				language: 'en',
			})) as SyncData

			chrome.runtime.sendMessage({ type: 'GET_CURRENT_STATE' }, response => {
				if (chrome.runtime.lastError) {
					showError(translations[currentLang].errorConnection)
					return
				}
				dailyStats = response.dailyStats || {}
				currentState = {
					...response.currentState,
					isPaused: response.isPaused || false,
				}
				document.body.classList.toggle('paused', currentState.isPaused)
				setupUI(syncData)
				updateDashboard()
				startLiveUpdates()
				renderActivityChart()
			})
		} catch (error) {
			showError(translations[currentLang].errorInitialization)
		}
	}

	const setupUI = (syncData: SyncData) => {
		setLanguage(syncData.language)
		buildLangMenu()
		applyTheme(syncData.theme)
		buildThemeMenu()

		elements.periodSelect.addEventListener('change', () => updateDashboard())
		elements.pauseButton.addEventListener('click', () => {
			chrome.storage.local.get({ isPaused: false }, ({ isPaused }) => {
				chrome.storage.local.set({ isPaused: !isPaused }, () => {
					document.body.classList.toggle('paused', !isPaused)
				})
			})
		})

		elements.exportButton.addEventListener('click', () => {
			const dataStr = JSON.stringify(dailyStats, null, 2)
			const dataUri =
				'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
			const exportFileDefaultName = `zenith-stats-${new Date()
				.toISOString()
				.slice(0, 10)}.json`
			const linkElement = document.createElement('a')
			linkElement.setAttribute('href', dataUri)
			linkElement.setAttribute('download', exportFileDefaultName)
			linkElement.click()
		})

		elements.chartDaily.addEventListener('click', () => setChartType('daily'))
		elements.chartWeekly.addEventListener('click', () => setChartType('weekly'))
		elements.chartMonthly.addEventListener('click', () =>
			setChartType('monthly')
		)

		elements.sitesDaily.addEventListener('click', () => setSitesPeriod('daily'))
		elements.sitesWeekly.addEventListener('click', () =>
			setSitesPeriod('weekly')
		)
		elements.sitesMonthly.addEventListener('click', () =>
			setSitesPeriod('monthly')
		)

		elements.themeButton.addEventListener('click', e => {
			e.stopPropagation()
			toggleMenu(elements.themeMenu)
			hideMenu(elements.langMenu)
		})

		elements.langButton.addEventListener('click', e => {
			e.stopPropagation()
			toggleMenu(elements.langMenu)
			hideMenu(elements.themeMenu)
		})

		document.addEventListener('click', e => {
			const target = e.target as Node
			if (
				elements.themeMenu &&
				!elements.themeMenu.contains(target) &&
				target !== elements.themeButton
			) {
				hideMenu(elements.themeMenu)
			}
			if (
				elements.langMenu &&
				!elements.langMenu.contains(target) &&
				target !== elements.langButton
			) {
				hideMenu(elements.langMenu)
			}
		})

		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === 'local') {
				let needsFullRedraw = false
				if (changes.dailyStats) {
					dailyStats = changes.dailyStats.newValue
					needsFullRedraw = true
				}
				if (changes.currentState) {
					currentState = { ...currentState, ...changes.currentState.newValue }
				}
				if (changes.isPaused) {
					currentState.isPaused = changes.isPaused.newValue
					document.body.classList.toggle('paused', currentState.isPaused)
				}
				if (needsFullRedraw) {
					updateDashboard()
					renderActivityChart()
				}
				startLiveUpdates()
			}
		})
	}

	const setSitesPeriod = (period: string) => {
		currentSitesPeriod = period
		document.querySelectorAll('.sites-toggle button').forEach(btn => {
			btn.classList.remove('active')
		})
		document.getElementById(`sites-${period}`)?.classList.add('active')
		updateDashboard()
	}

	const toggleMenu = (menu: HTMLElement) => {
		if (menu.classList.contains('show')) {
			hideMenu(menu)
		} else {
			showMenu(menu)
		}
	}

	const showMenu = (menu: HTMLElement) => {
		menu.classList.add('show')
	}

	const hideMenu = (menu: HTMLElement) => {
		menu.classList.remove('show')
	}

	const updateDashboard = () => {
		const period = elements.periodSelect.value
		const now = new Date()
		let startDate: Date, prevStartDate: Date, titleKey: string
		let sitesStartDate: Date

		switch (period) {
			case 'today':
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
				prevStartDate = new Date(new Date().setDate(now.getDate() - 1))
				titleKey = 'periodToday'
				break
			case 'week':
				const dayOfWeekSummary = now.getDay()
				startDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - dayOfWeekSummary + (dayOfWeekSummary === 0 ? -6 : 1)
				)
				prevStartDate = new Date(
					new Date(startDate).setDate(startDate.getDate() - 7)
				)
				titleKey = 'periodWeek'
				break
			case 'month':
				startDate = new Date(now.getFullYear(), now.getMonth(), 1)
				prevStartDate = new Date(new Date().setMonth(now.getMonth() - 1))
				titleKey = 'periodMonth'
				break
			default:
				startDate = new Date(now.getFullYear(), 0, 1)
				prevStartDate = new Date(new Date().setFullYear(now.getFullYear() - 1))
				titleKey = 'periodYear'
		}

		switch (currentSitesPeriod) {
			case 'weekly':
				const dayOfWeekSites = now.getDay()
				sitesStartDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - dayOfWeekSites + (dayOfWeekSites === 0 ? -6 : 1)
				)
				break
			case 'monthly':
				sitesStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
				break
			default:
				sitesStartDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate()
				)
				break
		}

		elements.summaryTitle.textContent = `${
			translations[currentLang].summaryPrefix
		} ${translations[currentLang][titleKey].toLowerCase()}`

		const currentPeriodRecords = getRecordsForPeriod(startDate)
		const prevPeriodRecords = getRecordsForPeriod(prevStartDate, startDate)
		const sitesRecords = getRecordsForPeriod(sitesStartDate)

		renderSummary(currentPeriodRecords, prevPeriodRecords)
		renderSitesList(sitesRecords)
	}

	const getRecordsForPeriod = (
		startDate: Date,
		endDate: Date = new Date()
	): { [host: string]: number } => {
		const records: { [host: string]: number } = {}
		const adjustedStartDate = new Date(startDate)
		adjustedStartDate.setHours(0, 0, 0, 0)

		for (const dayKey in dailyStats) {
			const dayDate = new Date(dayKey)
			dayDate.setHours(0, 0, 0, 0)

			if (dayDate >= adjustedStartDate && dayDate < endDate) {
				for (const host in dailyStats[dayKey]) {
					records[host] = (records[host] || 0) + dailyStats[dayKey][host]
				}
			}
		}
		return records
	}

	function renderSummary(
		records: { [host: string]: number },
		prevRecords: { [host: string]: number }
	) {
		const totalTime = Object.values(records).reduce((a, b) => a + b, 0)
		elements.summaryTime.dataset.baseTime = totalTime.toString()
		elements.summaryTime.textContent = formatHMS(totalTime)

		const prevTime = Object.values(prevRecords).reduce((a, b) => a + b, 0)
		if (prevTime === 0) {
			elements.comparisonInsight.textContent =
				translations[currentLang].noComparison
			return
		}

		const percentageChange = ((totalTime - prevTime) / prevTime) * 100
		const trend = percentageChange >= 0 ? '↑' : '↓'
		const trendClass = percentageChange >= 0 ? 'trend-up' : 'trend-down'

		elements.comparisonInsight.innerHTML = `<span class="${trendClass}">${trend}${Math.abs(
			percentageChange
		).toFixed(0)}%</span> ${translations[currentLang].comparedToPrevious}`
	}

	function renderSitesList(records: { [host: string]: number }) {
		const sortedSites = Object.entries(records).sort((a, b) => b[1] - a[1])

		elements.sitesListContainer.style.opacity = '0'
		elements.sitesListContainer.style.transform = 'translateY(10px)'

		setTimeout(() => {
			elements.sitesListContainer.innerHTML =
				sortedSites.length > 0
					? sortedSites
							.map(([host, time], index) => {
								let displayHost = formatHostname(host)
								return `
            <div class="site-entry" data-host="${host}">
              <span class="site-rank">${index + 1}</span>
              <span class="site-name" title="${host}">${displayHost}</span>
              <span class="site-time" data-base-time="${time}">${formatHMS(
									time
								)}</span>
            </div>`
							})
							.join('')
					: `<p class="placeholder">${translations[currentLang].statusNoData}</p>`

			setTimeout(() => {
				elements.sitesListContainer.style.opacity = '1'
				elements.sitesListContainer.style.transform = 'translateY(0)'
				elements.sitesListContainer.style.transition =
					'all 0.3s var(--ease-out)'
			}, 50)
		}, 300)
	}

	function startLiveUpdates() {
		if (liveTimerInterval) clearInterval(liveTimerInterval)

		const { isPaused, currentHost, currentSessionStart } = currentState

		if (isPaused) {
			elements.liveHostname.textContent = translations[currentLang].statusPaused
			elements.liveTimer.textContent = '—'
			elements.liveFavicon.src = ''
			elements.liveFavicon.style.display = 'none'
			return
		}

		if (currentHost && currentSessionStart) {
			elements.liveHostname.textContent = formatHostname(currentHost)
			elements.liveFavicon.src =
				'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iNCIgZmlsbD0iIzRmNDZlNSIvPgo8dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgdHJhbnNmb3JtPSJzY2FsZSgwLjUpIj5aPC90ZXh0Pgo8L3N2Zz4='
			elements.liveFavicon.style.display = 'block'

			const update = () => {
				if (!currentSessionStart) return
				const secondsElapsed = Date.now() / 1000 - currentSessionStart
				elements.liveTimer.textContent = formatHMS(secondsElapsed)

				if (elements.periodSelect.value === 'today') {
					const baseTotalTime = parseInt(
						elements.summaryTime.dataset.baseTime || '0',
						10
					)
					elements.summaryTime.textContent = formatHMS(
						baseTotalTime + secondsElapsed
					)

					const siteEntry = elements.sitesListContainer.querySelector(
						`.site-entry[data-host="${currentHost}"] .site-time`
					) as HTMLSpanElement
					if (siteEntry) {
						const baseSiteTime = parseInt(siteEntry.dataset.baseTime || '0', 10)
						siteEntry.textContent = formatHMS(baseSiteTime + secondsElapsed)
					}
				}
			}

			update()
			liveTimerInterval = setInterval(update, 1000)
		} else {
			elements.liveHostname.textContent = translations[currentLang].statusNoTab
			elements.liveTimer.textContent = '—'
			elements.liveFavicon.src = ''
			elements.liveFavicon.style.display = 'none'
		}
	}

	const setLanguage = (lang: string) => {
		currentLang = lang
		document.documentElement.lang = lang
		elements.langButton.textContent = lang.toUpperCase()

		document.querySelectorAll('[data-i18n-key]').forEach(el => {
			const key = el.getAttribute('data-i18n-key')
			if (key && translations[lang]?.[key]) {
				el.textContent = translations[lang][key]
			}
		})

		document.querySelectorAll('[data-i18n-key-title]').forEach(el => {
			const key = el.getAttribute('data-i18n-key-title')
			if (key && translations[lang]?.[key]) {
				;(el as HTMLElement).title = translations[lang][key]
			}
		})

		buildThemeMenu()
		if (Object.keys(dailyStats).length > 0) {
			updateDashboard()
			renderActivityChart()
		}
	}

	const buildThemeMenu = () => {
		elements.themeMenu.innerHTML = ''
		THEMES.forEach(theme => {
			const button = document.createElement('button')
			button.innerHTML = `<div class="theme-dot" data-theme="${
				theme.id
			}"></div> ${translations[currentLang][theme.key]}`
			button.onclick = () => {
				applyTheme(theme.id)
				chrome.storage.sync.set({ theme: theme.id })
				hideMenu(elements.themeMenu)
			}
			elements.themeMenu.appendChild(button)
		})
	}

	const buildLangMenu = () => {
		elements.langMenu.innerHTML = ''
		LANGUAGES.forEach(lang => {
			const button = document.createElement('button')
			button.textContent = lang.name
			button.onclick = () => {
				setLanguage(lang.id)
				chrome.storage.sync.set({ language: lang.id })
				hideMenu(elements.langMenu)
			}
			elements.langMenu.appendChild(button)
		})
	}

	const setChartType = (type: string) => {
		currentChartType = type
		document.querySelectorAll('.chart-toggle button').forEach(btn => {
			btn.classList.remove('active')
		})
		document.getElementById(`chart-${type}`)?.classList.add('active')
		renderActivityChart()
	}

	const renderActivityChart = () => {
		const ctx = elements.activityChart.getContext('2d')
		if (!ctx) return

		if (activityChartInstance) {
			activityChartInstance.destroy()
		}

		if (Object.keys(dailyStats).length === 0) {
			ctx.fillStyle = getComputedStyle(document.body).getPropertyValue(
				'--text-secondary'
			)
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.font = '13px Inter, sans-serif'
			ctx.fillText(
				translations[currentLang].statusNoData,
				ctx.canvas.width / 2,
				ctx.canvas.height / 2
			)
			return
		}

		let labels: string[] = []
		let data: number[] = []
		const now = new Date()

		if (currentChartType === 'daily') {
			for (let i = 6; i >= 0; i--) {
				const date = new Date()
				date.setDate(now.getDate() - i)
				const dateStr = date.toISOString().slice(0, 10)
				const dayName = translations[currentLang]['day' + date.getDay()]
				labels.push(dayName)
				data.push(
					dailyStats[dateStr]
						? Object.values(dailyStats[dateStr]).reduce((a, b) => a + b, 0)
						: 0
				)
			}
		} else if (currentChartType === 'weekly') {
			for (let i = 7; i >= 0; i--) {
				const weekStart = new Date()
				weekStart.setDate(now.getDate() - i * 7 - (now.getDay() - 1))
				const weekEnd = new Date(weekStart)
				weekEnd.setDate(weekStart.getDate() + 6)
				const weekLabel = `${weekStart.getDate()}-${weekEnd.getDate()} ${getMonthName(
					weekEnd.getMonth()
				)}`
				labels.push(weekLabel)
				let weekTotal = 0
				for (let d = 0; d < 7; d++) {
					const day = new Date(weekStart)
					day.setDate(weekStart.getDate() + d)
					const dayStr = day.toISOString().slice(0, 10)
					if (dailyStats[dayStr]) {
						weekTotal += Object.values(dailyStats[dayStr]).reduce(
							(a, b) => a + b,
							0
						)
					}
				}
				data.push(weekTotal)
			}
		} else {
			for (let i = 5; i >= 0; i--) {
				const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
				const monthName =
					getMonthName(month.getMonth()) +
					' ' +
					month.getFullYear().toString().slice(2)
				labels.push(monthName)
				let monthTotal = 0
				const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
				const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
				const currentDate = new Date(monthStart)
				while (currentDate <= monthEnd) {
					const dayStr = currentDate.toISOString().slice(0, 10)
					if (dailyStats[dayStr]) {
						monthTotal += Object.values(dailyStats[dayStr]).reduce(
							(a, b) => a + b,
							0
						)
					}
					currentDate.setDate(currentDate.getDate() + 1)
				}
				data.push(monthTotal)
			}
		}

		const dataInHours = data.map(seconds =>
			parseFloat((seconds / 3600).toFixed(1))
		)

		const getThemeColors = () => {
			const theme = document.body.dataset.theme || 'monolith'
			const themeColors: {
				[key: string]: { accent: string; accentLight: string }
			} = {
				monolith: { accent: '#4f46e5', accentLight: '#6366f1' },
				nord: { accent: '#88c0d0', accentLight: '#8fbcbb' },
				solar: { accent: '#268bd2', accentLight: '#2aa198' },
				matcha: { accent: '#6aa378', accentLight: '#81b29a' },
			}
			return themeColors[theme] || themeColors.monolith
		}

		const themeColors = getThemeColors()
		const accentColor = themeColors.accent
		const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height)
		gradient.addColorStop(0, hexToRgba(accentColor, 0.8))
		gradient.addColorStop(1, hexToRgba(accentColor, 0.2))

		const glassBorder =
			getComputedStyle(document.body)
				.getPropertyValue('--glass-border')
				.trim() || 'rgba(255, 255, 255, 0.1)'
		const textPrimary =
			getComputedStyle(document.body)
				.getPropertyValue('--text-primary')
				.trim() || '#ffffff'
		const textSecondary =
			getComputedStyle(document.body)
				.getPropertyValue('--text-secondary')
				.trim() || '#a3a3a3'
		const glassBg =
			getComputedStyle(document.body).getPropertyValue('--glass-bg').trim() ||
			'rgba(20, 20, 20, 0.6)'

		activityChartInstance = new Chart(ctx, {
			type: 'bar',
			data: {
				labels: labels,
				datasets: [
					{
						label: translations[currentLang].chartHours,
						data: dataInHours,
						backgroundColor: gradient,
						borderColor: accentColor,
						borderWidth: 2,
						borderRadius: 6,
						borderSkipped: false,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false,
					},
					tooltip: {
						mode: 'index',
						intersect: false,
						backgroundColor: glassBg,
						titleColor: textPrimary,
						bodyColor: textSecondary,
						borderColor: glassBorder,
						borderWidth: 1,
						padding: 12,
						callbacks: {
							label: function (context: TooltipItem<ChartType>) {
								const hours = context.parsed.y
								const totalMinutes = hours * 60
								const hoursPart = Math.floor(totalMinutes / 60)
								const minutesPart = Math.round(totalMinutes % 60)
								return `${hoursPart}h ${minutesPart}m`
							},
						},
					},
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: {
							color: glassBorder,
						},
						ticks: {
							color: textSecondary,
							callback: function (value: string | number) {
								return value + 'h'
							},
						},
					},
					x: {
						grid: {
							display: false,
						},
						ticks: {
							color: textSecondary,
							maxRotation: currentChartType === 'monthly' ? 0 : 45,
							minRotation: currentChartType === 'monthly' ? 0 : 45,
						},
					},
				},
				animation: {
					duration: 1000,
					easing: 'easeOutQuart',
				},
			},
		})
	}

	const hexToRgba = (hex: string, alpha: number): string => {
		hex = hex.replace('#', '')
		if (hex.length === 3) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
		}
		const r = parseInt(hex.substring(0, 2), 16)
		const g = parseInt(hex.substring(2, 4), 16)
		const b = parseInt(hex.substring(4, 6), 16)
		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	const getMonthName = (monthIndex: number): string => {
		const months = [
			'jan',
			'feb',
			'mar',
			'apr',
			'may',
			'jun',
			'jul',
			'aug',
			'sep',
			'oct',
			'nov',
			'dec',
		]
		const monthKey = months[monthIndex]
		return translations[currentLang][monthKey] || monthKey
	}

	let resizeTimer: number
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer)
		resizeTimer = setTimeout(() => {
			if (activityChartInstance) {
				activityChartInstance.resize()
			}
		}, 250)
	})

	init()
})
