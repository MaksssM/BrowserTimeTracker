import { translations } from './translations'
import { Chart, registerables, TooltipItem, ChartType } from 'chart.js'
Chart.register(...registerables)

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
	timezone?: string
}

interface SiteCategory {
	[hostname: string]: string // hostname -> category name
}

interface CategoryColor {
	[category: string]: string // category -> color
}

document.addEventListener('DOMContentLoaded', () => {
	let dailyStats: DailyStats = {}
	let currentState: CurrentState = { isPaused: false }
	let liveTimerInterval: number | null = null
	let currentLang = 'en'
	let currentSearchQuery = ''
	let currentChartType = 'daily'
	let currentSitesPeriod = 'daily'
	let currentDistributionPeriod = 'daily'
	let activityChartInstance: Chart | null = null
	let distributionChartInstance: Chart | null = null
	let siteCategories: SiteCategory = {}
	let currentTimezone = 'auto'
	const defaultCategoryColors: CategoryColor = {
		work: '#6366f1',
		learning: '#f59e0b',
		entertainment: '#ec4899',
		social: '#06b6d4',
		shopping: '#10b981',
		other: '#8b5cf6',
	}
	let categoryColors: CategoryColor = { ...defaultCategoryColors }

	const LANGUAGES = [
		{ id: 'ua', name: 'Українська' },
		{ id: 'en', name: 'English' },
		{ id: 'es', name: 'Español' },
		{ id: 'de', name: 'Deutsch' },
		{ id: 'fr', name: 'Français' },
	]

	const THEMES = [
		{ id: 'monolith', key: 'themeMonolith' },
		{ id: 'nord', key: 'themeNord' },
		{ id: 'matcha', key: 'themeMatcha' },
		{ id: 'solar', key: 'themeSolar' },
		{ id: 'cyberpunk', key: 'themeCyberpunk' },
		{ id: 'dracula', key: 'themeDracula' },
		{ id: 'latte', key: 'themeLatte' },
		{ id: 'coffee', key: 'themeCoffee' },
		{ id: 'ocean', key: 'themeOcean' },
		{ id: 'forest', key: 'themeForest' },
		{ id: 'sunset', key: 'themeSunset' },
		{ id: 'nebula', key: 'themeNebula' },
	]

	const elements = {
		periodSelect: document.getElementById('period-select') as HTMLSelectElement,
		pauseButton: document.getElementById('pause-button') as HTMLButtonElement,
		exportButton: document.getElementById('export-button') as HTMLButtonElement,
		settingsButton: document.getElementById(
			'settings-button'
		) as HTMLButtonElement,

		langButton: document.getElementById('lang-button') as HTMLButtonElement,
		langMenu: document.getElementById('lang-menu') as HTMLDivElement,
		themeButton: document.getElementById('theme-button') as HTMLButtonElement,
		themeMenu: document.getElementById('theme-menu') as HTMLDivElement,
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
		productivityScoreValue: document.getElementById(
			'productivity-score-value'
		) as HTMLSpanElement,
		productivityBar: document.getElementById(
			'productivity-bar'
		) as HTMLDivElement,
		chartDaily: document.getElementById('chart-daily') as HTMLButtonElement,
		chartWeekly: document.getElementById('chart-weekly') as HTMLButtonElement,
		chartMonthly: document.getElementById('chart-monthly') as HTMLButtonElement,
		chartYearly: document.getElementById('chart-yearly') as HTMLButtonElement,
		sitesDaily: document.getElementById('sites-daily') as HTMLButtonElement,
		sitesWeekly: document.getElementById('sites-weekly') as HTMLButtonElement,
		sitesMonthly: document.getElementById('sites-monthly') as HTMLButtonElement,
		sitesYearly: document.getElementById('sites-yearly') as HTMLButtonElement,
		activityChart: document.getElementById(
			'activity-chart'
		) as HTMLCanvasElement,
		distributionChart: document.getElementById(
			'distribution-chart'
		) as HTMLCanvasElement,
		distDaily: document.getElementById('dist-daily') as HTMLButtonElement,
		distWeekly: document.getElementById('dist-weekly') as HTMLButtonElement,
		distMonthly: document.getElementById('dist-monthly') as HTMLButtonElement,
		distYearly: document.getElementById('dist-yearly') as HTMLButtonElement,
		settingsModal: document.getElementById('settings-modal') as HTMLDivElement,
		modalClose: document.querySelector('.modal-close') as HTMLButtonElement,
		saveSettingsBtn: document.getElementById(
			'save-settings-btn'
		) as HTMLButtonElement,
		timezoneSelect: document.getElementById(
			'timezone-select'
		) as HTMLSelectElement,
		categoriesButton: document.getElementById(
			'categories-button'
		) as HTMLButtonElement,
		manageCategoriesBtn: document.getElementById(
			'manage-categories-btn'
		) as HTMLButtonElement,
		categoriesModal: document.getElementById(
			'categories-modal'
		) as HTMLDivElement,
		categoriesModalClose: document.getElementById(
			'categories-modal-close'
		) as HTMLButtonElement,
		categoriesCloseBtn: document.getElementById(
			'categories-close-btn'
		) as HTMLButtonElement,
		newSiteInput: document.getElementById('new-site-input') as HTMLInputElement,
		categoriesList: document.getElementById(
			'categories-list'
		) as HTMLDivElement,
		siteSearch: document.getElementById('sites-search') as HTMLInputElement,
		bulkActionsPanel: document.getElementById(
			'bulk-actions-panel'
		) as HTMLDivElement,
		selectedCount: document.getElementById('selected-count') as HTMLSpanElement,
		bulkCategoryBtn: document.getElementById(
			'bulk-category-btn'
		) as HTMLButtonElement,
		bulkDeleteBtn: document.getElementById(
			'bulk-delete-btn'
		) as HTMLButtonElement,
		bulkCancelBtn: document.getElementById(
			'bulk-cancel-btn'
		) as HTMLButtonElement,
		newCategoryName: document.getElementById(
			'new-category-name'
		) as HTMLInputElement,
		newCategoryColor: document.getElementById(
			'new-category-color'
		) as HTMLInputElement,
		createCategoryBtn: document.getElementById(
			'create-category-btn'
		) as HTMLButtonElement,
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

	const openSettingsModal = () => {
		elements.settingsModal.classList.add('show')
	}

	const closeSettingsModal = () => {
		elements.settingsModal.classList.remove('show')
	}

	const saveSettings = () => {
		currentTimezone = elements.timezoneSelect.value
		chrome.storage.sync.set({ timezone: currentTimezone })

		closeSettingsModal()
	}

	const saveSiteCategories = () => {
		chrome.storage.local.set({ siteCategories })
	}

	const loadSiteCategories = async () => {
		const data = await chrome.storage.local.get('siteCategories')
		if (data.siteCategories) {
			siteCategories = data.siteCategories
		}
	}

	const saveCategoryColors = () => {
		chrome.storage.local.set({ categoryColors })
	}

	const loadCategoryColors = async () => {
		const data = await chrome.storage.local.get('categoryColors')
		if (data.categoryColors) {
			categoryColors = { ...defaultCategoryColors, ...data.categoryColors }
		}
	}

	const getCategoryEmoji = (category: string): string => {
		const emojis: { [key: string]: string } = {
			work: '💼',
			learning: '📚',
			entertainment: '🎬',
			social: '👥',
			shopping: '🛍️',
			other: '📌',
		}
		return emojis[category] || '📌'
	}

	const renderCategoryButtons = () => {
		const container = document.getElementById(
			'category-buttons-container'
		) as HTMLDivElement
		if (!container) return

		container.innerHTML = ''
		const categories = Object.keys(categoryColors)

		categories.forEach(category => {
			const btn = document.createElement('button')
			const color = categoryColors[category]
			const emoji = getCategoryEmoji(category)
			const categoryName =
				translations[currentLang][
					'category' + category.charAt(0).toUpperCase() + category.slice(1)
				] || category

			btn.innerHTML = `${emoji} ${categoryName}`
			btn.style.padding = '8px 10px'
			btn.style.borderRadius = '6px'
			btn.style.border = `1.5px solid ${color}`
			btn.style.background = `rgba(${parseInt(
				color.slice(1, 3),
				16
			)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(
				color.slice(5, 7),
				16
			)}, 0.1)`
			btn.style.color = color
			btn.style.cursor = 'pointer'
			btn.style.fontSize = '12px'
			btn.style.fontWeight = '500'
			btn.style.transition = 'all 0.2s'
			btn.style.whiteSpace = 'nowrap'
			btn.dataset.category = category

			btn.onmouseenter = () => {
				btn.style.background = `rgba(${parseInt(
					color.slice(1, 3),
					16
				)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(
					color.slice(5, 7),
					16
				)}, 0.2)`
			}
			btn.onmouseleave = () => {
				btn.style.background = `rgba(${parseInt(
					color.slice(1, 3),
					16
				)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(
					color.slice(5, 7),
					16
				)}, 0.1)`
			}

			btn.onclick = () => {
				const checkedBoxes = document.querySelectorAll('.site-checkbox:checked')
				if (checkedBoxes.length > 0) {
					checkedBoxes.forEach((cb: any) => {
						const host = cb.getAttribute('data-host')
						siteCategories[host] = category
					})
					saveSiteCategories()

					checkedBoxes.forEach((cb: any) => {
						cb.checked = false
					})
					updateBulkActionsState()
					closeCategoriesModal()
					updateDashboard()
				} else {
					const site = elements.newSiteInput.value.trim().toLowerCase()
					if (!site) {
						showError(
							translations[currentLang]?.enterSiteName ||
								'Please enter a site name first'
						)
						return
					}
					siteCategories[site] = category
					saveSiteCategories()
					elements.newSiteInput.value = ''
					renderCategoriesList()
					renderCategoryButtons()
					updateDashboard()
				}
			}

			container.appendChild(btn)
		})
	}

	const renderCategoriesList = () => {
		elements.categoriesList.innerHTML = ''
		const categories: { [key: string]: string[] } = {}

		// Групувати сайти за категоріями
		for (const [host, cat] of Object.entries(siteCategories)) {
			if (!categories[cat]) categories[cat] = []
			categories[cat].push(host.toLowerCase())
		}

		if (Object.keys(categories).length === 0) {
			const emptyMsg = document.createElement('div')
			emptyMsg.style.textAlign = 'center'
			emptyMsg.style.padding = '24px'
			emptyMsg.style.color = 'rgba(255,255,255,0.5)'
			emptyMsg.style.fontSize = '13px'
			emptyMsg.textContent =
				translations[currentLang]?.noCategories ||
				'No categories yet. Add a site to get started!'
			elements.categoriesList.appendChild(emptyMsg)
			return
		}

		// Вивести кожну категорію
		const orderedCategories = Object.keys(categoryColors)
		for (const category of orderedCategories) {
			const sites = categories[category]
			if (!sites) continue

			const color = categoryColors[category]
			const emoji = getCategoryEmoji(category)
			const categoryName =
				translations[currentLang][
					'category' + category.charAt(0).toUpperCase() + category.slice(1)
				] || category

			const categoryDiv = document.createElement('div')
			categoryDiv.style.padding = '10px'
			categoryDiv.style.borderRadius = '8px'
			categoryDiv.style.border = `1.5px solid ${color}`
			categoryDiv.style.background = `rgba(${parseInt(
				color.slice(1, 3),
				16
			)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(
				color.slice(5, 7),
				16
			)}, 0.08)`

			const title = document.createElement('div')
			title.style.fontWeight = '600'
			title.style.marginBottom = '8px'
			title.style.color = color
			title.style.fontSize = '12px'
			title.innerHTML = `${emoji} ${categoryName.toUpperCase()} (${
				sites.length
			})`

			const sitesList = document.createElement('div')
			sitesList.style.display = 'flex'
			sitesList.style.flexDirection = 'column'
			sitesList.style.gap = '4px'

			sites.forEach(host => {
				const siteRow = document.createElement('div')
				siteRow.className = 'category-site-row'
				siteRow.style.display = 'flex'
				siteRow.style.justifyContent = 'space-between'
				siteRow.style.alignItems = 'center'
				siteRow.style.padding = '6px 10px'
				siteRow.style.borderRadius = '6px'
				siteRow.style.background = 'rgba(255,255,255,0.03)'
				siteRow.style.fontSize = '13px'
				siteRow.style.cursor = 'pointer'
				siteRow.title = 'Click to edit'

				const span = document.createElement('span')
				span.textContent = host
				span.style.wordBreak = 'break-all'

				// Click to edit/reassign
				siteRow.onclick = e => {
					// Don't trigger if delete button was clicked
					if ((e.target as HTMLElement).tagName === 'BUTTON') return
					elements.newSiteInput.value = host
					elements.newSiteInput.focus()
					// Visual feedback
					siteRow.style.background = 'rgba(255,255,255,0.1)'
					setTimeout(() => {
						siteRow.style.background = 'rgba(255,255,255,0.03)'
					}, 200)
				}

				const btn = document.createElement('button')
				btn.innerHTML =
					'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
				btn.style.background = 'none'
				btn.style.border = 'none'
				btn.style.color = 'rgba(255,255,255,0.4)'
				btn.style.cursor = 'pointer'
				btn.style.padding = '4px'
				btn.style.display = 'flex'
				btn.style.alignItems = 'center'
				btn.style.justifyContent = 'center'
				btn.style.borderRadius = '4px'
				btn.style.transition = 'all 0.2s'
				btn.style.marginLeft = '8px'
				btn.style.flexShrink = '0'

				btn.onmouseenter = () => {
					btn.style.color = '#ff4444'
					btn.style.background = 'rgba(255, 68, 68, 0.1)'
				}
				btn.onmouseleave = () => {
					btn.style.color = 'rgba(255,255,255,0.4)'
					btn.style.background = 'none'
				}

				btn.onclick = e => {
					e.stopPropagation()
					delete siteCategories[host]
					saveSiteCategories()
					renderCategoriesList()
					renderCategoryButtons()
				}

				siteRow.appendChild(span)
				siteRow.appendChild(btn)
				sitesList.appendChild(siteRow)
			})

			categoryDiv.appendChild(title)
			categoryDiv.appendChild(sitesList)
			elements.categoriesList.appendChild(categoryDiv)
		}
	}

	const openCategoriesModal = () => {
		elements.categoriesModal.classList.add('show')

		// Auto-fill with current host if available and valid
		if (
			currentState.currentHost &&
			currentState.currentHost !== 'newtab' &&
			currentState.currentHost !== 'extensions'
		) {
			elements.newSiteInput.value = formatHostname(currentState.currentHost)
		}

		renderCategoriesList()
		renderCategoryButtons()
		setTimeout(() => elements.newSiteInput.focus(), 100)
	}

	const closeCategoriesModal = () => {
		elements.categoriesModal.classList.remove('show')
	}

	const init = async () => {
		try {
			const syncData = (await chrome.storage.sync.get({
				theme: 'monolith',
				language: 'en',
				timezone: 'auto',
			})) as SyncData

			// Set language immediately to avoid translation errors
			currentLang = syncData.language || 'en'
			currentTimezone = syncData.timezone || 'auto'
			await loadSiteCategories()
			await loadCategoryColors()

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

	const updateBulkActionsState = () => {
		const checkedBoxes = document.querySelectorAll('.site-checkbox:checked')
		const count = checkedBoxes.length

		if (count > 0) {
			elements.bulkActionsPanel.classList.add('visible')
			elements.selectedCount.textContent = `${count} selected`
		} else {
			elements.bulkActionsPanel.classList.remove('visible')
		}
	}

	const setupUI = (syncData: SyncData) => {
		setLanguage(syncData.language)
		buildLangMenu()
		buildThemeMenu()
		applyTheme(syncData.theme)
		updateUsageDays()
		setupFeedbackButton()

		elements.siteSearch?.addEventListener('input', e => {
			currentSearchQuery = (e.target as HTMLInputElement).value
			updateDashboard()
		})

		elements.bulkCancelBtn?.addEventListener('click', () => {
			document.querySelectorAll('.site-checkbox:checked').forEach((cb: any) => {
				cb.checked = false
			})
			updateBulkActionsState()
		})

		elements.bulkDeleteBtn?.addEventListener('click', () => {
			const checkedBoxes = document.querySelectorAll('.site-checkbox:checked')
			if (
				confirm(
					translations[currentLang]?.confirmBulkDelete ||
						'Delete selected sites?'
				)
			) {
				const hostsToDelete: string[] = []
				checkedBoxes.forEach((cb: any) => {
					hostsToDelete.push(cb.getAttribute('data-host'))
				})

				for (const date in dailyStats) {
					for (const host of hostsToDelete) {
						delete dailyStats[date][host]
					}
				}

				for (const host of hostsToDelete) {
					delete siteCategories[host]
				}

				saveSiteCategories()
				chrome.storage.local.set({ dailyStats }, () => {
					updateDashboard()
					renderActivityChart()
					updateBulkActionsState()
				})
			}
		})

		elements.bulkCategoryBtn?.addEventListener('click', () => {
			const checkedBoxes = document.querySelectorAll('.site-checkbox:checked')
			if (checkedBoxes.length > 0) {
				openCategoriesModal()
			}
		})

		elements.createCategoryBtn?.addEventListener('click', () => {
			const name = elements.newCategoryName.value.trim().toLowerCase()
			const color = elements.newCategoryColor.value

			if (!name) return

			if (categoryColors[name]) {
				showError('Category already exists')
				return
			}

			categoryColors[name] = color
			saveCategoryColors()

			elements.newCategoryName.value = ''
			renderCategoryButtons()
			renderCategoriesList()
		})

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
		elements.chartYearly.addEventListener('click', () => setChartType('yearly'))

		elements.sitesDaily.addEventListener('click', () => setSitesPeriod('daily'))
		elements.sitesWeekly.addEventListener('click', () =>
			setSitesPeriod('weekly')
		)
		elements.sitesMonthly.addEventListener('click', () =>
			setSitesPeriod('monthly')
		)
		elements.sitesYearly.addEventListener('click', () =>
			setSitesPeriod('yearly')
		)

		elements.distDaily.addEventListener('click', () =>
			setDistributionPeriod('daily')
		)
		elements.distWeekly.addEventListener('click', () =>
			setDistributionPeriod('weekly')
		)
		elements.distMonthly.addEventListener('click', () =>
			setDistributionPeriod('monthly')
		)
		elements.distYearly.addEventListener('click', () =>
			setDistributionPeriod('yearly')
		)

		elements.modalClose.addEventListener('click', closeSettingsModal)
		elements.saveSettingsBtn.addEventListener('click', saveSettings)

		document.addEventListener('click', e => {
			const target = e.target as HTMLElement
			if (
				elements.settingsModal.classList.contains('show') &&
				target === elements.settingsModal
			) {
				closeSettingsModal()
			}
		})

		elements.settingsButton.addEventListener('click', () => {
			openSettingsModal()
		})

		elements.categoriesButton.addEventListener('click', () => {
			openCategoriesModal()
		})

		elements.manageCategoriesBtn.addEventListener('click', () => {
			openCategoriesModal()
		})

		elements.categoriesModalClose.addEventListener(
			'click',
			closeCategoriesModal
		)
		elements.categoriesCloseBtn.addEventListener('click', closeCategoriesModal)

		document.addEventListener('click', e => {
			const target = e.target as HTMLElement
			if (
				elements.categoriesModal.classList.contains('show') &&
				target === elements.categoriesModal
			) {
				closeCategoriesModal()
			}
		})

		elements.timezoneSelect.value = currentTimezone

		elements.langButton.addEventListener('click', e => {
			e.stopPropagation()
			toggleMenu(elements.langMenu)
			hideMenu(elements.themeMenu)
		})

		elements.themeButton.addEventListener('click', e => {
			e.stopPropagation()
			toggleMenu(elements.themeMenu)
			hideMenu(elements.langMenu)
		})

		document.addEventListener('click', e => {
			const target = e.target as Node
			if (
				elements.langMenu &&
				!elements.langMenu.contains(target) &&
				target !== elements.langButton
			) {
				hideMenu(elements.langMenu)
			}
			if (
				elements.themeMenu &&
				!elements.themeMenu.contains(target) &&
				target !== elements.themeButton
			) {
				hideMenu(elements.themeMenu)
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

	const setDistributionPeriod = (period: string) => {
		currentDistributionPeriod = period
		document
			.querySelectorAll('.chart-toggle:has(#dist-daily) button')
			.forEach(btn => {
				btn.classList.remove('active')
			})
		document.getElementById(`dist-${period}`)?.classList.add('active')
		renderDistributionChart()
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
			case 'yearly':
				sitesStartDate = new Date(now.getFullYear(), 0, 1)
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
		renderSitesList(sitesRecords, currentSearchQuery)
		renderDistributionChart()
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
		} else {
			const percentageChange = ((totalTime - prevTime) / prevTime) * 100
			const trend = percentageChange >= 0 ? '↑' : '↓'
			const trendClass = percentageChange >= 0 ? 'trend-up' : 'trend-down'

			elements.comparisonInsight.innerHTML = `<span class="${trendClass}">${trend}${Math.abs(
				percentageChange
			).toFixed(0)}%</span> ${translations[currentLang].comparedToPrevious}`
		}

		// Calculate Productivity Score
		let productiveTime = 0
		let totalCategorizedTime = 0

		// Define productive categories
		const productiveCategories = ['work', 'learning']
		const neutralCategories = ['other', 'shopping']
		// const distractingCategories = ['entertainment', 'social'] // Not used yet

		for (const [host, time] of Object.entries(records)) {
			const category =
				siteCategories[host] || siteCategories[host.toLowerCase()]
			if (category) {
				totalCategorizedTime += time
				if (productiveCategories.includes(category)) {
					productiveTime += time
				} else if (neutralCategories.includes(category)) {
					// Neutral counts as half productive? Or just ignored?
					// Let's ignore neutral for score calculation denominator if we want strict,
					// or include it. Let's include it in total but 0 in numerator.
				}
			}
		}

		let score = 0
		if (totalCategorizedTime > 0) {
			score = Math.round((productiveTime / totalCategorizedTime) * 100)
		}

		if (elements.productivityScoreValue && elements.productivityBar) {
			elements.productivityScoreValue.textContent = `${score}%`
			elements.productivityBar.style.width = `${score}%`

			// Color coding
			if (score >= 70) {
				elements.productivityBar.style.background =
					'var(--accent-green, #22c55e)'
			} else if (score >= 40) {
				elements.productivityBar.style.background =
					'var(--accent-yellow, #eab308)'
			} else {
				elements.productivityBar.style.background = 'var(--accent-red, #f43f5e)'
			}
		}
	}

	function renderSitesList(
		records: { [host: string]: number },
		filter: string = ''
	) {
		let sortedSites = Object.entries(records).sort((a, b) => b[1] - a[1])

		if (filter) {
			sortedSites = sortedSites.filter(([host]) =>
				host.toLowerCase().includes(filter.toLowerCase())
			)
		}

		elements.sitesListContainer.style.opacity = '0'
		elements.sitesListContainer.style.transform = 'translateY(10px)'

		setTimeout(() => {
			elements.sitesListContainer.innerHTML =
				sortedSites.length > 0
					? sortedSites
							.map(([host, time], index) => {
								let displayHost = formatHostname(host)
								const category =
									siteCategories[host] || siteCategories[host.toLowerCase()]
								let categoryBadge = ''

								if (category) {
									const color = categoryColors[category] || '#8b5cf6'
									const emoji = getCategoryEmoji(category)
									categoryBadge = `<span class="category-badge" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;" title="${category}">${emoji}</span>`
								}

								return `
            <div class="site-entry" data-host="${host}">
              <div class="site-select-wrapper">
                  <input type="checkbox" class="site-checkbox" data-host="${host}">
              </div>
              <span class="site-rank">${index + 1}</span>
              <div class="site-info">
                  <div class="site-name-wrapper">
                    ${categoryBadge}
                    <span class="site-name" title="${host}">${displayHost}</span>
                  </div>
              </div>
              <span class="site-time" data-base-time="${time}">${formatHMS(
									time
								)}</span>
              <button class="site-category-btn" data-host="${host}" title="${
									translations[currentLang]?.addToCategory || 'Add to category'
								}">
                📁
              </button>
            </div>`
							})
							.join('')
					: `<p class="placeholder">${translations[currentLang].statusNoData}</p>`

			// Re-attach event listeners
			document.querySelectorAll('.site-checkbox').forEach(cb => {
				cb.addEventListener('change', updateBulkActionsState)
			})

			document.querySelectorAll('.site-category-btn').forEach(btn => {
				const btnElement = btn as HTMLElement
				btnElement.addEventListener('mouseenter', () => {
					btnElement.style.background = 'rgba(255,255,255,0.1)'
					btnElement.style.color = 'rgba(255,255,255,0.8)'
				})
				btnElement.addEventListener('mouseleave', () => {
					btnElement.style.background = 'none'
					btnElement.style.color = 'rgba(255,255,255,0.4)'
				})
				btnElement.addEventListener('click', (e: Event) => {
					e.stopPropagation()
					const host = btnElement.getAttribute('data-host')
					if (host) {
						elements.newSiteInput.value = host.toLowerCase()
						openCategoriesModal()
						setTimeout(() => elements.newSiteInput.focus(), 100)
					}
				})
			})

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
		// Validate language exists, otherwise use 'en'
		if (!translations[lang]) {
			lang = 'en'
		}
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

		document.querySelectorAll('[data-i18n-key-placeholder]').forEach(el => {
			const key = el.getAttribute('data-i18n-key-placeholder')
			if (key && translations[lang]?.[key]) {
				;(el as HTMLInputElement).placeholder = translations[lang][key]
			}
		})

		if (Object.keys(dailyStats).length > 0) {
			updateDashboard()
			renderActivityChart()
		}
		updateUsageDays()
		renderCategoryButtons()
		renderCategoriesList()
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

	const buildThemeMenu = () => {
		const themeMenu = document.getElementById('theme-menu') as HTMLDivElement
		if (!themeMenu) return

		themeMenu.innerHTML = ''
		THEMES.forEach(theme => {
			const button = document.createElement('button')
			button.innerHTML = `<div class="theme-dot" data-theme="${
				theme.id
			}"></div> ${translations[currentLang][theme.key]}`
			button.onclick = () => {
				applyTheme(theme.id)
				chrome.storage.sync.set({ theme: theme.id })
				hideMenu(themeMenu)
			}
			themeMenu.appendChild(button)
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
		} else if (currentChartType === 'monthly') {
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
		} else {
			// yearly
			for (let i = 11; i >= 0; i--) {
				const year = new Date(
					now.getFullYear() - Math.floor(i / 12),
					(now.getMonth() - (i % 12) + 12) % 12,
					1
				)
				labels.push(getMonthName(year.getMonth()))
				let monthTotal = 0
				const monthStart = new Date(year.getFullYear(), year.getMonth(), 1)
				const monthEnd = new Date(year.getFullYear(), year.getMonth() + 1, 0)
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

		// Use global getThemeColors

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

	const renderDistributionChart = () => {
		const ctx = elements.distributionChart.getContext('2d')
		if (!ctx || Object.keys(dailyStats).length === 0) return

		if (distributionChartInstance) {
			distributionChartInstance.destroy()
		}

		const now = new Date()
		let startDate: Date

		switch (currentDistributionPeriod) {
			case 'weekly':
				const dayOfWeekDist = now.getDay()
				startDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - dayOfWeekDist + (dayOfWeekDist === 0 ? -6 : 1)
				)
				break
			case 'monthly':
				startDate = new Date(now.getFullYear(), now.getMonth(), 1)
				break
			case 'yearly':
				startDate = new Date(now.getFullYear(), 0, 1)
				break
			default: // 'daily'
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		}

		const allSites: { [host: string]: number } = {}
		for (const dayKey in dailyStats) {
			const dayDate = new Date(dayKey)
			dayDate.setHours(0, 0, 0, 0)

			if (dayDate >= startDate) {
				for (const host in dailyStats[dayKey]) {
					allSites[host] = (allSites[host] || 0) + dailyStats[dayKey][host]
				}
			}
		}

		const topSites = Object.entries(allSites)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)

		const labels = topSites.map(([host]) => formatHostname(host))
		const data = topSites.map(([_, time]) =>
			parseFloat((time / 3600).toFixed(1))
		)

		const colors = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e']

		const borderColors = [
			'rgba(99, 102, 241, 0.8)',
			'rgba(139, 92, 246, 0.8)',
			'rgba(217, 70, 239, 0.8)',
			'rgba(236, 72, 153, 0.8)',
			'rgba(244, 63, 94, 0.8)',
		]

		const glassText =
			getComputedStyle(document.body)
				.getPropertyValue('--text-secondary')
				.trim() || '#a3a3a3'

		distributionChartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels: labels,
				datasets: [
					{
						data: data,
						backgroundColor: colors,
						borderColor: borderColors,
						borderWidth: 3,
						hoverBorderWidth: 4,
						hoverOffset: 8,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: glassText,
							font: { size: 12, weight: 'bold' },
							padding: 15,
							usePointStyle: true,
							pointStyle: 'circle',
						},
					},
					tooltip: {
						backgroundColor:
							getComputedStyle(document.body)
								.getPropertyValue('--glass-bg')
								.trim() || 'rgba(20, 20, 20, 0.6)',
						titleColor:
							getComputedStyle(document.body)
								.getPropertyValue('--text-primary')
								.trim() || '#f5f5f5',
						bodyColor: glassText,
						padding: 12,
						borderColor: 'rgba(99, 102, 241, 0.3)',
						borderWidth: 1,
						titleFont: { weight: 'bold', size: 13 },
						bodyFont: { size: 12 },
						callbacks: {
							label: function (context) {
								const hours = Math.floor((context.parsed as number) / 1)
								const minutes = Math.round(
									((context.parsed as number) % 1) * 60
								)
								return `${hours}h ${minutes}m`
							},
						},
					},
				},
			},
		})
	}

	const getThemeColors = () => {
		const style = getComputedStyle(document.body)
		return {
			accent: style.getPropertyValue('--accent').trim() || '#6366f1',
			accentLight: style.getPropertyValue('--accent-light').trim() || '#818cf8',
		}
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

	function updateUsageDays() {
		const usageDays = Object.keys(dailyStats).length
		const el = document.getElementById('usage-days')
		if (el && translations[currentLang]?.usageDays) {
			el.textContent = translations[currentLang].usageDays.replace(
				'{days}',
				usageDays.toString()
			)
		}
	}

	// Кнопка "Залишити відгук" (тимчасово alert)
	function setupFeedbackButton() {
		const btn = document.getElementById('feedback-btn')
		if (btn) {
			btn.addEventListener('click', () => {
				alert(translations[currentLang]?.feedbackAlert || 'Thank you!')
			})
		}
	}

	init()
})
