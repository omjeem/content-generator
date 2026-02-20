import { Router, Response, NextFunction } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { researchTrendsForUser } from '../agents/trendResearch'
import { UserPersona } from '../models/UserPersona'
import mongoose from 'mongoose'

const router = Router()
router.use(authenticate)

// ── GET /api/trends ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/trends:
 *   get:
 *     tags: [Trends]
 *     summary: Get trending topics tailored to the user's niche (Agent 3)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: geo
 *         schema:
 *           type: string
 *           default: US
 *         description: Country code for geo-specific trends (e.g. US, GB, IN)
 *     responses:
 *       200:
 *         description: Trending topics relevant to the user's niche
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       topic:
 *                         type: string
 *                       relevanceReason:
 *                         type: string
 *                       contentAngle:
 *                         type: string
 *                 rawTrends:
 *                   type: array
 *                   items:
 *                     type: string
 *                 fetchedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Persona not found — complete analysis first
 */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const geo = (req.query.geo as string | undefined) ?? 'US'

    const persona = await UserPersona.findOne({
      userId: new mongoose.Types.ObjectId(req.userId!),
    })

    if (!persona) {
      res.status(400).json({
        error: 'No persona found. Complete POST /api/persona/analyze first.',
      })
      return
    }

    const result = await researchTrendsForUser({
      industry: persona.industry ?? 'business',
      topics: persona.topics.length ? persona.topics : persona.contentPillars,
      geo,
    })

    res.json({
      ...result,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

export default router
