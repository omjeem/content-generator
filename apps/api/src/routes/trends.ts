import { Router, Response, NextFunction } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { researchTrendsForUser } from "../agents/trendResearch";
import { UserPersona } from "../models/UserPersona";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { storeTrendDiscovery } from "../services/trendDiscoveryCache";
import { trackTokenUsage } from "../services/tokenUsage";
import mongoose from "mongoose";

const router = Router();
router.use(authenticate);

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
router.get("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const geo = (req.query.geo as string | undefined) ?? "US";

    const persona = await UserPersona.findOne({
      userId: new mongoose.Types.ObjectId(req.userId!),
    });

    if (!persona) {
      res.status(400).json({
        error: "No persona found. Complete POST /api/persona/analyze first.",
      });
      return;
    }

    const result = await researchTrendsForUser({
      industry: persona.industry ?? "business",
      topics: persona.topics.length ? persona.topics : persona.contentPillars,
      geo,
    });

    res.json({
      ...result,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/trends/discover ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/trends/discover:
 *   get:
 *     tags: [Trends]
 *     summary: Discover curated trends for user to browse and select (Phase 3 #20)
 *     description: |
 *       Step 1 of the two-step generation flow. Returns enriched trends
 *       cached for 30 minutes so the user can browse and select before generating.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: geo
 *         schema:
 *           type: string
 *           default: US
 *     responses:
 *       200:
 *         description: Curated trend list for user selection
 *       400:
 *         description: Persona not found
 */
router.get(
  "/discover",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const geo = (req.query.geo as string | undefined) ?? "US";
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      const persona = await UserPersona.findOne({ userId: userObjectId });
      if (!persona) {
        res.status(400).json({
          error:
            "No persona found. Complete POST /api/persona/analyze first.",
        });
        return;
      }

      // Load recent trends for stale penalty (same as pipeline Step 3)
      let recentTrends: string[] = [];
      try {
        const recentSets = await ContentSuggestion.find({
          userId: userObjectId,
        })
          .sort({ createdAt: -1 })
          .limit(3)
          .select("trendsUsed")
          .lean();
        recentTrends = recentSets.flatMap(
          (s) => (s as { trendsUsed?: string[] }).trendsUsed ?? [],
        );
      } catch {
        // non-fatal
      }

      const {
        result: trendResult,
        usage: trendUsage,
        isLive,
      } = await researchTrendsForUser({
        industry: persona.industry ?? "business",
        topics: persona.topics.length ? persona.topics : persona.contentPillars,
        contentPillars: persona.contentPillars,
        geo,
        recentTrends: recentTrends.length > 0 ? recentTrends : undefined,
      });

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "trend-research",
        operation: "trend_research",
        inputTokens: trendUsage.inputTokens,
        outputTokens: trendUsage.outputTokens,
        totalTokens: trendUsage.inputTokens + trendUsage.outputTokens,
      });

      // Store in discovery cache for subsequent generate-from-trends call
      const entry = storeTrendDiscovery(
        req.userId!,
        trendResult,
        persona.contentPillars,
        isLive,
      );

      res.json(entry);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
