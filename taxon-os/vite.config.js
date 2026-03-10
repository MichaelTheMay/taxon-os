import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 5173,
    proxy: {
      '/otl-api': {
        target: 'https://api.opentreeoflife.org/v3',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/otl-api/, '')
      }
    }
  }
})
