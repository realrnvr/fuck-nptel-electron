import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'

import { authenticate } from './lib/auth.js'
import { solve } from './lib/groq.js'

const app = express()

app.use(cors())
app.use(express.json())

// ── Health check ──────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Solve endpoint ────────────────────────────
app.post('/api/solve', authenticate, async (req, res) => {
  const { prompt, model } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'Missing "prompt" in request body' })
  }

  try {
    const text = await solve(prompt, model)
    return res.json({ text })
  } catch (err) {
    console.error('[SOLVE]', err.message || err)
    return res.status(502).json({ error: 'Upstream model error' })
  }
})

// ── Local dev server ──────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const port = process.env.PORT || 3000
  app.listen(port, () => console.log(`[SERVER] http://localhost:${port}`))
}

export default app
