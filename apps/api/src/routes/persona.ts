import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import { resolvePostsFromInput, analyzePersona } from '../agents/personaAnalyst'
import { UserPersona } from '../models/UserPersona'
import mongoose from 'mongoose'

const router = Router()
router.use(authenticate)

const analyzeSchema = z.object({
  linkedinUrl: z.string().url('Must be a valid URL').optional(),
  manualPosts: z.string().min(30, 'Please provide at least one post').optional(),
}).refine((d) => d.linkedinUrl ?? d.manualPosts, {
  message: 'Provide either linkedinUrl or manualPosts',
})

// ── POST /api/persona/analyze ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/persona/analyze:
 *   post:
 *     tags: [Persona]
 *     summary: Analyze LinkedIn profile or manually pasted posts (Agent 1)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               linkedinUrl:
 *                 type: string
 *                 example: https://www.linkedin.com/in/yourprofile/
 *               manualPosts:
 *                 type: string
 *                 example: "Post 1 text...\n\n---\n\nPost 2 text..."
 *           examples:
 *             withUrl:
 *               summary: LinkedIn URL
 *               value: { linkedinUrl: "https://www.linkedin.com/in/example/" }
 *             withPaste:
 *               summary: Manual paste
 *               value: { manualPosts: "Post about AI trends...\n\n---\n\nLeadership lesson I learned..." }
 *     responses:
 *       200:
 *         description: Persona analysis complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 persona:
 *                   $ref: '#/components/schemas/UserPersona'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       422:
 *         description: LinkedIn scraping blocked — use manual paste
 */
router.post('/analyze', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = analyzeSchema.parse(req.body)
    const userId = new mongoose.Types.ObjectId(req.userId!)

    const { posts, scrapingBlocked, errorMessage } = await resolvePostsFromInput(body)

    if (scrapingBlocked) {
      res.status(422).json({
        error: 'LinkedIn scraping was blocked.',
        details: errorMessage,
        fallback: 'Please paste your LinkedIn posts manually using the manualPosts field.',
      })
      return
    }

    if (posts.length === 0) {
      res.status(400).json({ error: 'No posts found to analyze. Please provide more content.' })
      return
    }

    const analysis = await analyzePersona(posts)

    const persona = await UserPersona.findOneAndUpdate(
      { userId },
      {
        $set: {
          linkedinUrl: body.linkedinUrl,
          scrapedPosts: posts,
          writingStyle: analysis.writingStyle,
          tone: analysis.tone,
          topics: analysis.topics,
          postFormats: analysis.postFormats,
        },
      },
      { upsert: true, new: true }
    )

    res.json({
      message: 'Persona analysis complete',
      persona,
      postsAnalyzed: posts.length,
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/persona ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/persona:
 *   get:
 *     tags: [Persona]
 *     summary: Get the current user's persona
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User persona object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 persona:
 *                   $ref: '#/components/schemas/UserPersona'
 *       404:
 *         description: Persona not found
 */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const persona = await UserPersona.findOne({
      userId: new mongoose.Types.ObjectId(req.userId!),
    })

    if (!persona) {
      res.status(404).json({
        error: 'No persona found. Run POST /api/persona/analyze first.',
      })
      return
    }

    res.json({ persona })
  } catch (err) {
    next(err)
  }
})

export { router as personaRouter }
export default router
