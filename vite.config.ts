import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    // Écoute toutes les interfaces : l'application sera disponible sur
    // 172.16.6.100:5174 dès que cette adresse est attribuée à la machine.
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    // Autorise les URL temporaires Cloudflare Tunnel (ex. *.trycloudflare.com).
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/data/**', '**/accounts.json'],
    },
  },
})
