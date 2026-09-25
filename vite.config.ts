import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const accountsApiPlugin = (): Plugin => {
  const filePath = path.resolve(__dirname, 'data/accounts.json')

  const getAccounts = () => {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
    } catch (e) {
      console.error('Error reading accounts.json:', e)
    }
    return []
  }

  const saveAccounts = (accounts: unknown) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2), 'utf-8')
      return true
    } catch (e) {
      console.error('Error saving accounts.json:', e)
      return false
    }
  }

  const setupMiddleware = (server: any) => {
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = req.url || ''
      if (url === '/api/accounts' || url.startsWith('/api/accounts?')) {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(getAccounts()))
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: any) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const newAcc = JSON.parse(body)
              const accounts = getAccounts()
              const cleanEmail = (newAcc.email || '').toLowerCase().trim()
              const cleanName = (newAcc.name || '').trim()

              const existingIdx = accounts.findIndex(
                (a: any) =>
                  (a.id && a.id === newAcc.id) ||
                  (a.email && a.email.toLowerCase().trim() === cleanEmail)
              )

              if (existingIdx >= 0) {
                accounts[existingIdx] = { ...accounts[existingIdx], ...newAcc }
              } else {
                accounts.push({
                  id: newAcc.id || `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  name: cleanName,
                  email: cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@italcar.com`,
                  password: (newAcc.password || '').trim(),
                  role: newAcc.role || 'chef_equipe',
                  assignedTeam: newAcc.assignedTeam,
                })
              }

              saveAccounts(accounts)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true, accounts }))
            } catch (err: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, error: err.message }))
            }
          })
          return
        }
      }

      if (url.startsWith('/api/accounts/') && req.method === 'DELETE') {
        const rawTarget = url.replace('/api/accounts/', '').split('?')[0]
        const targetId = decodeURIComponent(rawTarget).trim().toLowerCase()
        const accounts = getAccounts()
        const updated = accounts.filter(
          (a: any) =>
            (a.id || '').toLowerCase() !== targetId &&
            (a.email || '').toLowerCase().trim() !== targetId
        )
        saveAccounts(updated)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, accounts: updated }))
        return
      }

      next()
    })
  }

  return {
    name: 'accounts-api-plugin',
    configureServer: setupMiddleware,
    configurePreviewServer: setupMiddleware,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    accountsApiPlugin(),
  ],
  server: {
    host: true,
    port: 5174,
    watch: {
      ignored: ['**/data/**', '**/accounts.json'],
    },
  },
})
