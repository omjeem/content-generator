import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

const app = express()
const PORT = process.env.PORT || 3001

// --- Middleware ---
app.use(cors({
  origin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// --- Health Check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// --- Routes will be added in Phase 2/3/4 ---
// import authRoutes from './routes/auth'
// import personaRoutes from './routes/persona'
// import onboardingRoutes from './routes/onboarding'
// import trendsRoutes from './routes/trends'
// import suggestionsRoutes from './routes/suggestions'
// app.use('/api/auth', authRoutes)
// app.use('/api/persona', personaRoutes)
// app.use('/api/onboarding', onboardingRoutes)
// app.use('/api/trends', trendsRoutes)
// app.use('/api/suggestions', suggestionsRoutes)

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`)
  console.log(`[api] Health check: http://localhost:${PORT}/api/health`)
})

export default app
