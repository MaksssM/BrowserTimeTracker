import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				popup: resolve(__dirname, 'src/popup.ts'),
				background: resolve(__dirname, 'src/background.ts'),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: '[name].js',
				assetFileNames: '[name].[ext]',
			},
		},
	},
	publicDir: 'public',
})
