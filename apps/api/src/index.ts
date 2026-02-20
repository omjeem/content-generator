import 'dotenv/config'
import './config/env' // Validate env vars on startup — exits if invalid
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { connectDB } from './config/db'
import { errorHandler } from './middleware/errorHandler'

// Routes
import authRoutes from './routes/auth'
import personaRoutes from './routes/persona'
import onboardingRoutes from './routes/onboarding'
import trendsRoutes from './routes/trends'
import suggestionsRoutes from './routes/suggestions'

const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/persona', personaRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/trends', trendsRoutes)
app.use('/api/suggestions', suggestionsRoutes)

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`[api] Server running on http://localhost:${PORT}`)
    console.log(`[api] Health: http://localhost:${PORT}/api/health`)
    console.log(`[api] Docs:   http://localhost:${PORT}/api/docs  (Phase 4)`)
  })
}

start().catch((err) => {
  console.error('[api] Failed to start:', err)
  process.exit(1)
})

export default app
