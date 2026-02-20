import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import { runOnboardingChat, getInterviewStatus } from '../agents/onboarding'
import { ChatSession } from '../models/ChatSession'
import mongoose from 'mongoose'

const router = Router()
router.use(authenticate)

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000),
  sessionId: z.string().optional(),
})

// ── POST /api/onboarding/chat ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/onboarding/chat:
 *   post:
 *     tags: [Onboarding]
 *     summary: Send a message to the interview agent (Agent 2)
 *     description: |
 *       Persistent working memory — chat history is stored in MongoDB and
 *       restored on every request so the interview continues across sessions.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Hello, I'm ready to start!"
 *               sessionId:
 *                 type: string
 *                 description: Optional — previous session ID to continue
 *     responses:
 *       200:
 *         description: Agent reply with interview progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 sessionId:
 *                   type: string
 *                 interviewComplete:
 *                   type: boolean
 *                 questionsAnswered:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 5
 */
router.post('/chat', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = chatSchema.parse(req.body)

    const result = await runOnboardingChat({
      userId: req.userId!,
      message: body.message,
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ── GET /api/onboarding/session ───────────────────────────────────────────────
/**
 * @swagger
 * /api/onboarding/session:
 *   get:
 *     tags: [Onboarding]
 *     summary: Get the full chat session history for the current user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat session with message history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                       content:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                 interviewComplete:
 *                   type: boolean
 *                 sessionId:
 *                   type: string
 */
router.get('/session', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await ChatSession.findOne({
      userId: new mongoose.Types.ObjectId(req.userId!),
      agentType: 'onboarding',
    })

    if (!session) {
      res.json({
        messages: [],
        interviewComplete: false,
        sessionId: null,
      })
      return
    }

    const { complete } = await getInterviewStatus(req.userId!)

    res.json({
      messages: session.messages,
      interviewComplete: complete,
      sessionId: session.sessionId,
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/onboarding/status ────────────────────────────────────────────────
/**
 * @swagger
 * /api/onboarding/status:
 *   get:
 *     tags: [Onboarding]
 *     summary: Check if the onboarding interview is complete
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Interview completion status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 complete:
 *                   type: boolean
 *                 missingFields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["industry", "contentPillars"]
 */
router.get('/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = await getInterviewStatus(req.userId!)
    res.json(status)
  } catch (err) {
    next(err)
  }
})

export default router
