import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { User } from '../models/User'
import { authenticate, AuthRequest } from '../middleware/auth'
import { env } from '../config/env'

const router = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: '7d' })
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

// ── POST /api/auth/register ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body)

    const existing = await User.findOne({ email: body.email })
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' })
      return
    }

    const user = await User.create(body)
    const token = signToken(String(user._id), user.email)

    res.cookie('token', token, COOKIE_OPTIONS)
    res.status(201).json({
      message: 'Account created successfully',
      user: { id: user._id, email: user.email, name: user.name },
      token,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body)

    const user = await User.findOne({ email: body.email }).select('+password')
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    const isMatch = await user.comparePassword(body.password)
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' })
      return
    }

    const token = signToken(String(user._id), user.email)

    res.cookie('token', token, COOKIE_OPTIONS)
    res.json({
      message: 'Login successful',
      user: { id: user._id, email: user.email, name: user.name },
      token,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/auth/logout ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (clears auth cookie)
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token')
  res.json({ message: 'Logged out successfully' })
})

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.userId)
    if (!user) {
      res.status(404).json({ error: 'User not found.' })
      return
    }
    res.json({ user: { id: user._id, email: user.email, name: user.name } })
  } catch (err) {
    next(err)
  }
})

export default router
