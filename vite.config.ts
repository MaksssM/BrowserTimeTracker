import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				popup: resolve(__dirname, 'src/popup.ts'),
				background: resolve(__dirname, 'src/background.ts'),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name].js',
				assetFileNames: 'assets/[name].[ext]',
			},
		},
		outDir: 'dist',
	},
	publicDir: 'public',
})
