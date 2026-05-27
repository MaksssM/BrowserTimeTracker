export class GDriveSyncService {
	private readonly FILENAME = 'zenith_time_tracker_backup.json'

	private async getAuthToken(interactive: boolean = true): Promise<string> {
		return new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive }, token => {
				if (chrome.runtime.lastError || !token) {
					reject(
						chrome.runtime.lastError?.message ||
							'Could not get a Google access token',
					)
				} else {
					resolve(token)
				}
			})
		})
	}

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

	public async pullFromCloud(): Promise<any> {
		try {
			const token = await this.getAuthToken(true)
			const fileId = await this.getFileId(token)

			if (!fileId) return null

			const response = await fetch(
				`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			)

			if (!response.ok) throw new Error('Failed to download from Google Drive')
			return await response.json()
		} catch (error) {
			console.error('Google Drive pull sync failed:', error)
			throw error
		}
	}

	public async pushToCloud(localData: any): Promise<void> {
		try {
			const token = await this.getAuthToken(true)
			const fileId = await this.getFileId(token)

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
				url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
				method = 'PATCH'
			}

			const response = await fetch(url, {
				method,
				headers: { Authorization: `Bearer ${token}` },
				body: form,
			})

			if (!response.ok) throw new Error('Failed to save to Google Drive')
			console.log('Data saved to Google Drive successfully')
		} catch (error) {
			console.error('Google Drive push sync failed:', error)
			throw error
		}
	}
}
