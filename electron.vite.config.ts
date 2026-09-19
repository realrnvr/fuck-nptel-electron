import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // MAIN_VITE_* is intentionally defined only for Electron's main bundle. Do not
  // use VITE_* for API keys: Vite exposes that prefix to renderer/browser code.
  const env = loadEnv(mode, process.cwd(), [
    'MAIN_VITE_GROQ_API_KEY',
    // Keep existing local .env files working while they are renamed.
    'GROQ_API_KEY'
  ])

  return {
    main: {
      define: {
        'process.env.GROQ_API_KEY': JSON.stringify(env.MAIN_VITE_GROQ_API_KEY || env.GROQ_API_KEY || '')
      }
    },
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})
