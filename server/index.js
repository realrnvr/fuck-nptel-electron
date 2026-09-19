import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'

import { authenticate } from './lib/auth.js'
import { solve } from './lib/groq.js'

const app = express()

app.use(cors())
app.use(express.json())

// Request logger middleware
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString().slice(11, 19)
  console.log(`[${timestamp}] ${req.method} ${req.url}`)
  next()
})

app.get('/', (_, res) => {
  res.send('FUCK NPTEL SERVER ONLINE')
})

// ── Health check ──────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Solve endpoint ────────────────────────────
app.post('/api/solve', authenticate, async (req, res) => {
  const { prompt, model } = req.body

  if (!prompt) {
    console.warn('[SOLVE] Rejected request — missing "prompt" in body')
    return res.status(400).json({ error: 'Missing "prompt" in request body' })
  }

  try {
    const text = await solve(prompt, model)
    console.log('[SOLVE] Solve completed successfully')
    return res.json({ text })
  } catch (err) {
    const message = err?.message || String(err)
    console.error('[SOLVE] Solve failed:', message)
    return res.status(502).json({ error: `Upstream model error: ${message}` })
  }
})

// ── Local dev server ──────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const port = process.env.PORT || 3000
  app.listen(port, () => console.log(`[SERVER] FuckNptel Server listening on http://localhost:${port}`))
}

export default app
