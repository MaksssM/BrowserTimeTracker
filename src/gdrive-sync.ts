export class GDriveSyncService {
	private readonly FILENAME = 'zenith_time_tracker_backup.json'

	// 1. Отримуємо токен доступу до Google
	private async getAuthToken(interactive: boolean = true): Promise<string> {
		return new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive }, token => {
				if (chrome.runtime.lastError || !token) {
					reject(
						chrome.runtime.lastError?.message || 'Не вдалося отримати токен',
					)
				} else {
					resolve(token)
				}
			})
		})
	}

	// 2. Шукаємо наш файл з бекапом в прихованій папці додатку (appDataFolder)
	private async getFileId(token: string): Promise<string | null> {
		const response = await fetch(
			`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${this.FILENAME}'`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		)
		const data = await response.json()
		return data.files && data.files.length > 0 ? data.files[0].id : null
	}

	// 3. Завантажуємо дані з Google Drive
	public async pullFromCloud(): Promise<any> {
		try {
			const token = await this.getAuthToken(true)
			const fileId = await this.getFileId(token)

			if (!fileId) return null // Файлу ще немає

			const response = await fetch(
				`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			)

			if (!response.ok) throw new Error('Помилка завантаження з GDrive')
			return await response.json()
		} catch (error) {
			console.error('Помилка Pull-синхронізації:', error)
			throw error
		}
	}

	// 4. Відправляємо локальні дані на Google Drive
	public async pushToCloud(localData: any): Promise<void> {
		try {
			const token = await this.getAuthToken(true)
			let fileId = await this.getFileId(token)

			const metadata = {
				name: this.FILENAME,
				parents: ['appDataFolder'],
			}

			const form = new FormData()
			form.append(
				'metadata',
				new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
			)
			form.append(
				'file',
				new Blob([JSON.stringify(localData)], { type: 'application/json' }),
			)

			let url =
				'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
			let method = 'POST'

			if (fileId) {
				// Якщо файл вже є, оновлюємо його
				url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
				method = 'PATCH'
			}

			const response = await fetch(url, {
				method: method,
				headers: { Authorization: `Bearer ${token}` },
				body: form,
			})

			if (!response.ok) throw new Error('Помилка збереження на GDrive')
			console.log('Дані успішно збережено в хмару!')
		} catch (error) {
			console.error('Помилка Push-синхронізації:', error)
			throw error
		}
	}
}
