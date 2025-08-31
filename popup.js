document.addEventListener('DOMContentLoaded', () => {
	let dailyStats = {}
	let currentState = {}
	let liveTimerInterval = null
	let currentLang = 'en'
	let currentChartType = 'daily'
	let activityChartInstance = null

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

	// DOM элементы
	const elements = {
		periodSelect: document.getElementById('period-select'),
		themeButton: document.getElementById('theme-button'),
		pauseButton: document.getElementById('pause-button'),
		exportButton: document.getElementById('export-button'),
		settingsButton: document.getElementById('settings-button'),
		themeMenu: document.getElementById('theme-menu'),
		langButton: document.getElementById('lang-button'),
		langMenu: document.getElementById('lang-menu'),
		liveHostname: document.getElementById('live-hostname'),
		liveTimer: document.getElementById('live-timer'),
		liveFavicon: document.getElementById('live-favicon'),
		summaryTitle: document.getElementById('summary-title'),
		summaryTime: document.getElementById('summary-time'),
		comparisonInsight: document.getElementById('comparison-insight'),
		sitesListContainer: document.getElementById('sites-list-container'),
		errorContainer: document.getElementById('error-container'),
		sitesCount: document.getElementById('sites-count'),
		chartDaily: document.getElementById('chart-daily'),
		chartWeekly: document.getElementById('chart-weekly'),
		chartMonthly: document.getElementById('chart-monthly'),
		activityChart: document.getElementById('activity-chart'),
	}

	// Форматирование времени
	const formatHMS = s => {
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

	const formatTimeShort = s => {
		s = Math.max(0, Math.floor(s))
		if (s < 60) return `${s}s`
		if (s < 3600) return `${Math.floor(s / 60)}m`
		if (s < 86400) return `${Math.floor(s / 3600)}h`
		return `${Math.floor(s / 86400)}d`
	}

	// Форматирование доменного имени
	const formatHostname = hostname => {
		if (!hostname) return ''

		// Убираем www. и протоколы
		let cleanHost = hostname.replace(/^www\./, '').replace(/^https?:\/\//, '')

		// Обрезаем слишком длинные имена
		if (cleanHost.length > 25) {
			cleanHost = cleanHost.substring(0, 22) + '...'
		}

		return cleanHost
	}

	// Показать ошибку
	const showError = message => {
		elements.errorContainer.textContent = message
		elements.errorContainer.style.display = 'block'
		setTimeout(() => {
			elements.errorContainer.style.display = 'none'
		}, 5000)
	}

	// Применение темы
	const applyTheme = themeId => {
		document.body.dataset.theme = themeId
		updateDashboard(true)
	}

	// Инициализация
	const init = async () => {
		try {
			const syncData = await chrome.storage.sync.get({
				theme: 'monolith',
				language: 'en',
			})

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
				updateDashboard(true)
				startLiveUpdates()
				renderActivityChart()
			})
		} catch (error) {
			showError(translations[currentLang].errorInitialization)
		}
	}

	const setupUI = syncData => {
		setLanguage(syncData.language)
		buildLangMenu()
		applyTheme(syncData.theme)
		buildThemeMenu()

		elements.periodSelect.addEventListener('change', () =>
			updateDashboard(true)
		)

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

		// Обработчики для переключения графиков
		elements.chartDaily.addEventListener('click', () => {
			setChartType('daily')
		})

		elements.chartWeekly.addEventListener('click', () => {
			setChartType('weekly')
		})

		elements.chartMonthly.addEventListener('click', () => {
			setChartType('monthly')
		})

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
			if (
				elements.themeMenu &&
				!elements.themeMenu.contains(e.target) &&
				e.target !== elements.themeButton
			) {
				hideMenu(elements.themeMenu)
			}
			if (
				elements.langMenu &&
				!elements.langMenu.contains(e.target) &&
				e.target !== elements.langButton
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
					updateDashboard(true)
					renderActivityChart()
				}
				startLiveUpdates()
			}
		})
	}

	const toggleMenu = menu => {
		if (menu.classList.contains('show')) {
			hideMenu(menu)
		} else {
			showMenu(menu)
		}
	}

	const showMenu = menu => {
		menu.classList.add('show')
	}

	const hideMenu = menu => {
		menu.classList.remove('show')
	}

	const updateDashboard = (forceRedraw = false) => {
		const period = elements.periodSelect.value
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

		elements.summaryTitle.textContent = `${
			translations[currentLang].summaryPrefix
		} ${translations[currentLang][titleKey].toLowerCase()}`
		const currentPeriodRecords = getRecordsForPeriod(startDate)
		const prevPeriodRecords = getRecordsForPeriod(prevStartDate, startDate)
		renderSummary(currentPeriodRecords, prevPeriodRecords)
		renderSitesList(currentPeriodRecords)
	}

	const getRecordsForPeriod = (startDate, endDate = new Date()) => {
		const records = {}
		const startKey = startDate.toISOString().slice(0, 10)
		const endKey = endDate.toISOString().slice(0, 10)

		const adjustedStartDate = new Date(startDate)
		adjustedStartDate.setHours(0, 0, 0, 0)

		for (const dayKey in dailyStats) {
			const dayDate = new Date(dayKey)
			dayDate.setHours(0, 0, 0, 0)

			if (dayDate >= adjustedStartDate && dayDate <= endDate) {
				for (const host in dailyStats[dayKey]) {
					records[host] = (records[host] || 0) + dailyStats[dayKey][host]
				}
			}
		}
		return records
	}

	function renderSummary(records, prevRecords) {
		const totalTime = Object.values(records).reduce((a, b) => a + b, 0)
		elements.summaryTime.dataset.baseTime = totalTime
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

	function renderSitesList(records) {
		const sortedSites = Object.entries(records).sort((a, b) => b[1] - a[1])
		elements.sitesCount.textContent = sortedSites.length

		// Очищаем контейнер с анимацией
		elements.sitesListContainer.style.opacity = '0'
		elements.sitesListContainer.style.transform = 'translateY(10px)'

		setTimeout(() => {
			elements.sitesListContainer.innerHTML =
				sortedSites.length > 0
					? sortedSites
							.map(([host, time], index) => {
								// Обрезаем слишком длинные доменные имена
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

			// Плавное появление
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
				const secondsElapsed = Date.now() / 1000 - currentSessionStart
				// Таймер текущей сессии обновляется всегда, это правильно
				elements.liveTimer.textContent = formatHMS(secondsElapsed)

				// --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ---
				// Обновляем общее время и список сайтов только если выбран период "Сегодня"
				if (elements.periodSelect.value === 'today') {
					// Обновляем общее время за сегодня
					const baseTotalTime = parseInt(
						elements.summaryTime.dataset.baseTime || '0',
						10
					)
					elements.summaryTime.textContent = formatHMS(
						baseTotalTime + secondsElapsed
					)

					// Ищем текущий сайт в списке и обновляем его время
					const siteEntry = elements.sitesListContainer.querySelector(
						`.site-entry[data-host="${currentHost}"] .site-time`
					)
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

	const setLanguage = lang => {
		currentLang = lang
		document.documentElement.lang = lang
		elements.langButton.textContent = lang.toUpperCase()

		document.querySelectorAll('[data-i18n-key]').forEach(el => {
			const key = el.getAttribute('data-i18n-key')
			if (translations[lang]?.[key]) el.textContent = translations[lang][key]
		})

		document.querySelectorAll('[data-i18n-key-title]').forEach(el => {
			const key = el.getAttribute('data-i18n-key-title')
			if (translations[lang]?.[key]) el.title = translations[lang][key]
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

	const setChartType = type => {
		currentChartType = type

		// Обновляем активную кнопку
		document.querySelectorAll('.chart-toggle button').forEach(btn => {
			btn.classList.remove('active')
		})
		document.getElementById(`chart-${type}`).classList.add('active')

		// Перерисовываем график
		renderActivityChart()
	}

	const renderActivityChart = () => {
		const ctx = elements.activityChart.getContext('2d')

		// Уничтожаем предыдущий график если существует
		if (activityChartInstance) {
			activityChartInstance.destroy()
		}

		// Если нет данных
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

		// Подготавливаем данные в зависимости от типа графика
		let labels = []
		let data = []
		const now = new Date()

		if (currentChartType === 'daily') {
			// Данные за последние 7 дней
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
			// Данные за последние 8 недель
			for (let i = 7; i >= 0; i--) {
				const weekStart = new Date()
				weekStart.setDate(now.getDate() - i * 7)
				const weekEnd = new Date(weekStart)
				weekEnd.setDate(weekStart.getDate() + 6)

				// ИСПРАВЛЕНО: Просто вызываем getMonthName, без повторного обращения к translations
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
			// ДАННЫЕ ЗА МЕСЯЦ
			// Получаем данные за последние 6 месяцев
			for (let i = 5; i >= 0; i--) {
				const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
				// ИСПРАВЛЕНО: Просто вызываем getMonthName
				const monthName =
					getMonthName(month.getMonth()) +
					' ' +
					month.getFullYear().toString().slice(2)
				labels.push(monthName)

				let monthTotal = 0
				const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
				const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)

				// Перебираем все дни месяца
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

		// Конвертируем секунды в часы для лучшего отображения
		const dataInHours = data.map(seconds => (seconds / 3600).toFixed(1))

		// Получаем цвета для текущей темы
		const getThemeColors = () => {
			const theme = document.body.dataset.theme || 'monolith'

			// Резервные цвета для каждой темы
			const themeColors = {
				monolith: { accent: '#4f46e5', accentLight: '#6366f1' },
				nord: { accent: '#88c0d0', accentLight: '#8fbcbb' },
				solar: { accent: '#268bd2', accentLight: '#2aa198' },
				matcha: { accent: '#6aa378', accentLight: '#81b29a' },
			}

			return themeColors[theme] || themeColors.monolith
		}

		const themeColors = getThemeColors()
		const accentColor = themeColors.accent

		// Создаем градиент для графика
		const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height)
		gradient.addColorStop(0, hexToRgba(accentColor, 0.8))
		gradient.addColorStop(1, hexToRgba(accentColor, 0.2))

		// Получаем остальные цвета для стилизации
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

		// Создаем график с помощью Chart.js
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
							label: function (context) {
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
							callback: function (value) {
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

	// Вспомогательная функция для конвертации hex в rgba
	const hexToRgba = (hex, alpha) => {
		// Убираем # если есть
		hex = hex.replace('#', '')

		// Конвертируем 3-значный hex в 6-значный
		if (hex.length === 3) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
		}

		const r = parseInt(hex.substring(0, 2), 16)
		const g = parseInt(hex.substring(2, 4), 16)
		const b = parseInt(hex.substring(4, 6), 16)

		return `rgba(${r}, ${g}, ${b}, ${alpha})`
	}

	const getMonthName = monthIndex => {
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

	// Ресайз графика при изменении размера окна
	let resizeTimer
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
