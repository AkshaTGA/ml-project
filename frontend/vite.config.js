import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:lan` serves over HTTPS on the local network so phones can connect.
// HTTPS is required for the microphone (voice) on any host other than localhost.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'lan' ? [basicSsl()] : [])],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_BACKEND_URL || 'http://localhost:8000', changeOrigin: true },
    },
  },
}))
