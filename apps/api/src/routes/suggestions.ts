import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import { runContentPipelineWithRetry } from '../agents/mastra'
import { ContentSuggestion } from '../models/ContentSuggestion'
import mongoose from 'mongoose'

const router = Router()
router.use(authenticate)

const generateSchema = z.object({
  linkedinUrl: z.string().url().optional(),
  manualPosts: z.string().optional(),
  forceReanalyze: z.boolean().optional().default(false),
})

// ── POST /api/suggestions/generate ───────────────────────────────────────────
/**
 * @swagger
 * /api/suggestions/generate:
 *   post:
 *     tags: [Suggestions]
 *     summary: Run the full 4-agent pipeline and generate LinkedIn content ideas
 *     description: |
 *       Orchestrates all 4 agents in sequence:
 *       1. Persona Analyst (if not done or forceReanalyze=true)
 *       2. Checks interview is complete (returns error if not)
 *       3. Trend Research
 *       4. Content Generator
 *       Results are saved to the database.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               linkedinUrl:
 *                 type: string
 *                 description: Optional — re-analyze from URL
 *               manualPosts:
 *                 type: string
 *                 description: Optional — re-analyze from pasted posts
 *               forceReanalyze:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Content ideas generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Suggestion'
 *                 id:
 *                   type: string
 *                 trendsUsed:
 *                   type: array
 *                   items:
 *                     type: string
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Interview not complete or persona missing
 *       422:
 *         description: LinkedIn scraping blocked
 *       503:
 *         description: AI generation failed
 */
router.post('/generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = generateSchema.parse(req.body)

    const result = await runContentPipelineWithRetry({
      userId: req.userId!,
      linkedinUrl: body.linkedinUrl,
      manualPosts: body.manualPosts,
      forceReanalyze: body.forceReanalyze,
    })

    switch (result.status) {
      case 'success':
        res.json({
          suggestions: result.suggestions,
          id: result.suggestionId,
          trendsUsed: result.trendsUsed,
          generatedAt: new Date().toISOString(),
        })
        break

      case 'interview_required':
        res.status(400).json({
          error: result.message,
          action: 'Complete the onboarding interview at POST /api/onboarding/chat',
        })
        break

      case 'persona_required':
        res.status(400).json({
          error: result.message,
          action: 'Analyze your profile first at POST /api/persona/analyze',
        })
        break

      case 'scraping_blocked':
        res.status(422).json({
          error: result.message,
          scrapingError: result.scrapingError,
          fallback: 'Use the manualPosts field to paste your LinkedIn posts directly.',
        })
        break

      default:
        res.status(503).json({
          error: result.message ?? 'Content generation failed. Please try again.',
        })
    }
  } catch (err) {
    next(err)
  }
})

// ── GET /api/suggestions ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/suggestions:
 *   get:
 *     tags: [Suggestions]
 *     summary: Get paginated history of all generated suggestion sets
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
 *           default: 10
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated suggestion sets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ContentSuggestion'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10))
    const skip = (page - 1) * limit

    const userId = new mongoose.Types.ObjectId(req.userId!)

    const [data, total] = await Promise.all([
      ContentSuggestion.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ContentSuggestion.countDocuments({ userId }),
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

// ── GET /api/suggestions/:id ──────────────────────────────────────────────────
/**
 * @swagger
 * /api/suggestions/{id}:
 *   get:
 *     tags: [Suggestions]
 *     summary: Get a specific suggestion set by ID
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the suggestion set
 *     responses:
 *       200:
 *         description: Suggestion set
 *       404:
 *         description: Not found
 */
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params['id'] ?? '')) {
      res.status(400).json({ error: 'Invalid suggestion ID' })
      return
    }

    const suggestion = await ContentSuggestion.findOne({
      _id: req.params['id'],
      userId: new mongoose.Types.ObjectId(req.userId!),
    }).lean()

    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion set not found.' })
      return
    }

    res.json({ suggestion })
  } catch (err) {
    next(err)
  }
})

export default router
