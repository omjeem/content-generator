import { Router, Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { checkTokenQuota } from '../services/tokenUsage'
import { TokenUsageLog } from '../models/TokenUsageLog'
import mongoose from 'mongoose'

const router = Router()
router.use(authenticate)

// ── GET /api/tokens/usage ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/usage:
 *   get:
 *     tags: [Tokens]
 *     summary: Get the current user's token usage summary
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token usage summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokensUsed:
 *                   type: integer
 *                 tokenLimit:
 *                   type: integer
 *                 percentUsed:
 *                   type: integer
 *                 tokensRemaining:
 *                   type: integer
 *                 allowed:
 *                   type: boolean
 */
router.get('/usage', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await checkTokenQuota(req.userId!)
    res.json(summary)
  } catch (err) {
    next(err)
  }
})

// ── GET /api/tokens/logs ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/logs:
 *   get:
 *     tags: [Tokens]
 *     summary: Get paginated token usage log for the current user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated token usage log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       agent:
 *                         type: string
 *                       operation:
 *                         type: string
 *                       inputTokens:
 *                         type: integer
 *                       outputTokens:
 *                         type: integer
 *                       totalTokens:
 *                         type: integer
 *                       metadata:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 20))
    const skip = (page - 1) * limit

    const userId = new mongoose.Types.ObjectId(req.userId!)

    const [data, total] = await Promise.all([
      TokenUsageLog.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-userId -__v')
        .lean(),
      TokenUsageLog.countDocuments({ userId }),
    ])

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

export default router
