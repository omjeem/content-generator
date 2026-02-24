import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/auth'
import { resolvePostsFromInput, analyzePersona } from '../agents/personaAnalyst'
import { checkTokenQuota, trackTokenUsage } from '../services/tokenUsage'
import { UserPersona } from '../models/UserPersona'
import {
  deduplicatePosts,
  mergePersonaAnalysis,
  createPersonaSnapshot,
  computePersonaDiff,
} from '../services/personaMerge'
import mongoose from 'mongoose'
import crypto from 'crypto'

const router = Router()
router.use(authenticate)

// ── Schemas ───────────────────────────────────────────────────────────────────

const analyzeSchema = z.object({
  linkedinUrl: z.string().url('Must be a valid URL').optional(),
  manualPosts: z.string().min(30, 'Please provide at least one post').optional(),
  postsArray: z.array(z.string().min(10)).min(1).optional(),
}).refine((d) => d.linkedinUrl ?? d.manualPosts ?? d.postsArray, {
  message: 'Provide either linkedinUrl, manualPosts, or postsArray',
})

const addPostsSchema = z.object({
  postsArray: z.array(z.string().min(10, 'Each post must be at least 10 characters')).min(1, 'At least 1 post required'),
  mode: z.enum(['incremental', 'full']).default('incremental'),
  source: z.enum(['manual', 'linkedin-scrape', 'add-posts']).default('add-posts'),
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

    // Resolve posts from postsArray, manualPosts, or linkedinUrl
    let posts: string[]
    let scrapingBlocked = false
    let errorMessage: string | undefined

    if (body.postsArray && body.postsArray.length > 0) {
      posts = body.postsArray
    } else {
      const resolved = await resolvePostsFromInput(body)
      posts = resolved.posts
      scrapingBlocked = resolved.scrapingBlocked
      errorMessage = resolved.errorMessage
    }

    if (scrapingBlocked) {
      res.status(422).json({
        error: 'LinkedIn scraping was blocked.',
        details: errorMessage,
        fallback: 'Please paste your LinkedIn posts manually using the manualPosts or postsArray field.',
      })
      return
    }

    if (posts.length === 0) {
      res.status(400).json({ error: 'No posts found to analyze. Please provide more content.' })
      return
    }

    // Pre-flight quota check
    const quota = await checkTokenQuota(req.userId!)
    if (!quota.allowed) {
      res.status(429).json({
        error: 'Token quota exceeded',
        message: `You have used ${quota.tokensUsed.toLocaleString()} of your ${quota.tokenLimit.toLocaleString()} token limit.`,
        tokensUsed: quota.tokensUsed,
        tokenLimit: quota.tokenLimit,
      })
      return
    }

    const { analysis, usage } = await analyzePersona(posts)

    // Track persona analysis token usage — fire-and-forget
    trackTokenUsage({
      userId: req.userId!,
      agent: 'persona-analyst',
      operation: 'persona_analysis',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    })

    const batchId = crypto.randomUUID()
    const source = body.linkedinUrl ? 'linkedin-scrape' : 'manual'
    const now = new Date()

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
          totalPostsAnalyzed: posts.length,
          lastPostAddedAt: now,
        },
        $inc: { personaVersion: 1 },
        $push: {
          postMetadata: {
            batchId,
            addedAt: now,
            postCount: posts.length,
            source,
          },
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

// ── POST /api/persona/add-posts ───────────────────────────────────────────────
/**
 * Incrementally add new posts to an existing persona.
 * Deduplicates against existing posts, re-analyses, and merges results.
 *
 * @swagger
 * /api/persona/add-posts:
 *   post:
 *     tags: [Persona]
 *     summary: Add more posts to existing persona (incremental update)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [postsArray]
 *             properties:
 *               postsArray:
 *                 type: array
 *                 items: { type: string }
 *               mode:
 *                 type: string
 *                 enum: [incremental, full]
 *                 default: incremental
 *     responses:
 *       200:
 *         description: Posts added and persona updated
 *       400:
 *         description: No new unique posts
 *       404:
 *         description: No existing persona — run /analyze first
 *       429:
 *         description: Token quota exceeded
 */
router.post('/add-posts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = addPostsSchema.parse(req.body)
    const userId = new mongoose.Types.ObjectId(req.userId!)

    // Load existing persona
    const existing = await UserPersona.findOne({ userId })
    if (!existing) {
      res.status(404).json({
        error: 'No existing persona found. Please run POST /api/persona/analyze first.',
      })
      return
    }

    // Deduplicate new posts against existing ones
    const uniqueNewPosts = deduplicatePosts(existing.scrapedPosts ?? [], body.postsArray)
    if (uniqueNewPosts.length === 0) {
      res.status(400).json({
        error: 'All provided posts are duplicates of existing posts. No new posts to add.',
        duplicatesSkipped: body.postsArray.length,
      })
      return
    }

    // Quota check
    const quota = await checkTokenQuota(req.userId!)
    if (!quota.allowed) {
      res.status(429).json({
        error: 'Token quota exceeded',
        message: `You have used ${quota.tokensUsed.toLocaleString()} of your ${quota.tokenLimit.toLocaleString()} token limit.`,
        tokensUsed: quota.tokensUsed,
        tokenLimit: quota.tokenLimit,
      })
      return
    }

    // Analyse only the new posts
    const { analysis, usage } = await analyzePersona(uniqueNewPosts)

    trackTokenUsage({
      userId: req.userId!,
      agent: 'persona-analyst',
      operation: 'persona_analysis',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    })

    // Snapshot before update
    const snapshot = createPersonaSnapshot(existing)

    // Merge new analysis into existing persona
    const mergedFields = mergePersonaAnalysis(existing, analysis)

    const batchId = crypto.randomUUID()
    const now = new Date()

    let postsUpdate: Record<string, unknown>
    if (body.mode === 'full') {
      // Full mode: replace all posts
      postsUpdate = { scrapedPosts: body.postsArray }
    } else {
      // Incremental: append unique new posts
      postsUpdate = { $each: uniqueNewPosts }
    }

    const updateQuery =
      body.mode === 'full'
        ? {
            $set: {
              ...mergedFields,
              scrapedPosts: body.postsArray,
              totalPostsAnalyzed: body.postsArray.length,
              lastPostAddedAt: now,
            },
            $inc: { personaVersion: 1 },
            $push: {
              analysisHistory: snapshot,
              postMetadata: {
                batchId,
                addedAt: now,
                postCount: uniqueNewPosts.length,
                source: body.source,
              },
            },
          }
        : {
            $set: {
              ...mergedFields,
              lastPostAddedAt: now,
            },
            $inc: {
              personaVersion: 1,
              totalPostsAnalyzed: uniqueNewPosts.length,
            },
            $push: {
              scrapedPosts: { $each: uniqueNewPosts },
              analysisHistory: snapshot,
              postMetadata: {
                batchId,
                addedAt: now,
                postCount: uniqueNewPosts.length,
                source: body.source,
              },
            },
          }

    const updatedPersona = await UserPersona.findOneAndUpdate({ userId }, updateQuery, { new: true })

    // Compute diff for display in the frontend (#28)
    const diff = updatedPersona ? computePersonaDiff(snapshot, updatedPersona) : null

    res.json({
      message: `Successfully added ${uniqueNewPosts.length} new post${uniqueNewPosts.length !== 1 ? 's' : ''} to your persona.`,
      postsAdded: uniqueNewPosts.length,
      duplicatesSkipped: body.postsArray.length - uniqueNewPosts.length,
      persona: updatedPersona,
      batchId,
      diff,
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/persona/posts ─────────────────────────────────────────────────────
/**
 * Returns the user's posts grouped by batch with metadata.
 *
 * @swagger
 * /api/persona/posts:
 *   get:
 *     tags: [Persona]
 *     summary: Get posts grouped by batch with metadata
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Posts grouped by batchId
 *       404:
 *         description: No persona found
 */
router.get('/posts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const persona = await UserPersona.findOne({
      userId: new mongoose.Types.ObjectId(req.userId!),
    }).select('scrapedPosts postMetadata totalPostsAnalyzed')

    if (!persona) {
      res.status(404).json({ error: 'No persona found.' })
      return
    }

    // Group posts by batch — we only have the flat scrapedPosts array so we
    // return batch metadata with counts; post content is not split per batch
    // (that would require storing per-batch arrays which adds complexity).
    const batches = persona.postMetadata.map((meta) => ({
      batchId: meta.batchId,
      addedAt: meta.addedAt,
      postCount: meta.postCount,
      source: meta.source,
    }))

    res.json({
      batches,
      totalPostsAnalyzed: persona.totalPostsAnalyzed,
      totalStoredPosts: persona.scrapedPosts.length,
    })
  } catch (err) {
    next(err)
  }
})

export { router as personaRouter }
export default router
