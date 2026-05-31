import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { runContentPipelineWithRetry } from "../agents/mastra";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { UserPersona } from "../models/UserPersona";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";
import type { PostFormat } from "@repo/shared-types";
import {
  getSelectedTrends,
  storeTopicDiscovery,
  getTopicDiscovery,
  getSelectedTopic,
  generateTopicId,
} from "../services/trendDiscoveryCache";
import type { TopicDiscoveryItem } from "../services/trendDiscoveryCache";
import {
  generateContentIdeas,
  buildPersonaSummary,
} from "../agents/contentGenerator";
import { PostDraft } from "../models/PostDraft";
import mongoose from "mongoose";
import { generateText } from "ai";
import { getModel, getModelId } from "../llm/provider";
import { parseLLMJson } from "../llm/structured";
import { sanitizeMessage } from "../utils/sanitizeInput";
import { generationLimiter, chatLimiter } from "../middleware/rateLimit";
import type { ISuggestion } from "@repo/shared-types";

const router = Router();
router.use(authenticate);

// Shape of the AI topic-discovery response (id is assigned after parsing).
const TopicIdeasSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      category: z.string(),
      reasoning: z.string(),
      suggestedFormat: z.string(),
      confidence: z.number(),
    }),
  ),
});

const platformGoalEnum = z.enum([
  "thought-leadership",
  "lead-generation",
  "personal-brand",
  "hiring",
  "community-building",
]);

const contentMixEnum = z.enum([
  "more-carousels",
  "more-text-posts",
  "more-polls",
  "balanced",
]);

const generateContextSchema = z
  .object({
    mode: z.enum(["profile", "topic-focus", "chat-refined", "trend-selected", "persona-topics"]),
    topicFocus: z.string().optional(),
    targetAudienceOverride: z.string().optional(),
    platformGoal: platformGoalEnum.optional(),
    contentMix: contentMixEnum.optional(),
    chatRefinementContext: z.string().optional(),
    /** Target platforms for this generation run (#38) */
    platforms: z
      .array(z.enum(["linkedin", "twitter"]))
      .max(2)
      .optional(),
  })
  .optional();

const generateSchema = z.object({
  linkedinUrl: z.string().url().optional(),
  manualPosts: z.string().optional(),
  forceReanalyze: z.boolean().optional().default(false),
  context: generateContextSchema,
  /** Top-level platforms shortcut — passed directly to PipelineInput (#38) */
  platforms: z.array(z.enum(["linkedin", "twitter"])).max(2).optional(),
});

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
router.post(
  "/generate",
  generationLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = generateSchema.parse(req.body);

      // Merge top-level platforms + context.platforms (top-level wins)
      const effectivePlatforms =
        body.platforms ?? body.context?.platforms?.map(String);

      const result = await runContentPipelineWithRetry({
        userId: req.userId!,
        linkedinUrl: body.linkedinUrl,
        manualPosts: body.manualPosts,
        forceReanalyze: body.forceReanalyze,
        context: body.context,
        platforms: effectivePlatforms,
      });

      switch (result.status) {
        case "success":
          res.json({
            suggestions: result.suggestions,
            id: result.suggestionId,
            trendsUsed: result.trendsUsed,
            trendSource: result.trendSource ?? "live",
            generatedAt: new Date().toISOString(),
          });
          break;

        case "interview_required":
          res.status(400).json({
            error: result.message,
            action:
              "Complete the onboarding interview at POST /api/onboarding/chat",
          });
          break;

        case "persona_required":
          res.status(400).json({
            error: result.message,
            action: "Analyze your profile first at POST /api/persona/analyze",
          });
          break;

        case "scraping_blocked":
          res.status(422).json({
            error: result.message,
            scrapingError: result.scrapingError,
            fallback:
              "Use the manualPosts field to paste your LinkedIn posts directly.",
          });
          break;

        case "quota_exceeded":
          res.status(429).json({
            error: result.message ?? "Token quota exceeded.",
          });
          break;

        default:
          res.status(503).json({
            error:
              result.message ?? "Content generation failed. Please try again.",
          });
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/suggestions/generate-from-trends ──────────────────────────────
/**
 * @swagger
 * /api/suggestions/generate-from-trends:
 *   post:
 *     tags: [Suggestions]
 *     summary: Generate content ideas from user-selected trends (Phase 3 #21)
 *     description: |
 *       Step 2 of the two-step generation flow. Accepts trend IDs from
 *       the discovery cache, skips pipeline Steps 1-3, and calls the
 *       content generator directly with only the selected trends.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [selectedTrendIds]
 *             properties:
 *               selectedTrendIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 5
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Content ideas generated from selected trends
 *       400:
 *         description: Invalid trend IDs or expired cache
 *       429:
 *         description: Token quota exceeded
 */
const generateFromTrendsSchema = z.object({
  selectedTrendIds: z.array(z.string()).min(1).max(5),
  context: generateContextSchema,
});

router.post(
  "/generate-from-trends",
  generationLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = generateFromTrendsSchema.parse(req.body);
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      // Quota check
      const quota = await checkTokenQuota(req.userId!);
      if (!quota.allowed) {
        res.status(429).json({
          error: "Token quota exceeded",
          tokensUsed: quota.tokensUsed,
          tokenLimit: quota.tokenLimit,
        });
        return;
      }

      // Look up selected trends from discovery cache
      const selectedTrends = getSelectedTrends(
        req.userId!,
        body.selectedTrendIds,
      );

      if (!selectedTrends || selectedTrends.length === 0) {
        res.status(400).json({
          error:
            "Selected trends not found or expired. Please refresh trends and try again.",
        });
        return;
      }

      // Load persona for content generation
      const persona = await UserPersona.findOne({ userId: userObjectId });
      if (!persona) {
        res.status(400).json({
          error: "No persona found. Complete persona analysis first.",
        });
        return;
      }

      if (!persona.interviewComplete) {
        res.status(400).json({
          error: "Please complete the onboarding interview first.",
        });
        return;
      }

      // Build trend result with only the selected trends
      const filteredTrendResult = {
        trends: selectedTrends,
        rawTrends: selectedTrends.map((t) => t.topic),
      };

      // Generate content ideas directly (skip pipeline Steps 1-3)
      const pipelineStart = Date.now();
      const { ideas: contentIdeas, usage: contentUsage } =
        await generateContentIdeas({
          persona,
          trends: filteredTrendResult,
          context: body.context
            ? { ...body.context, mode: "trend-selected" as const }
            : undefined,
          platforms: body.context?.platforms?.map(String),
        });
      const llmDurationMs = Date.now() - pipelineStart;

      // Persist results
      const acceptedTrendTopics = selectedTrends.map((t) => t.topic);

      const saved = await ContentSuggestion.create({
        userId: userObjectId,
        generatedAt: new Date(),
        trendsUsed: acceptedTrendTopics,
        trendSource: "live",
        generationMode: "trend-selected",
        contextOptions: body.context
          ? {
              ...body.context,
              mode: "trend-selected",
              selectedTrendIds: body.selectedTrendIds,
            }
          : { mode: "trend-selected", selectedTrendIds: body.selectedTrendIds },
        generationMeta: {
          pipelineDurationMs: llmDurationMs,
          trendFetchDurationMs: 0, // trends were pre-fetched
          llmDurationMs,
          tokenCost: {
            input: contentUsage.inputTokens,
            output: contentUsage.outputTokens,
            total: contentUsage.inputTokens + contentUsage.outputTokens,
          },
          trendSource: "live",
          modelId: getModelId(),
        },
        suggestions: contentIdeas.ideas.map((idea) => ({
          topic: idea.topic,
          angle: idea.angle,
          format: idea.format,
          hook: idea.hook,
          whyItFits: idea.whyItFits,
          seoKeywords: idea.seoKeywords ?? [],
          clickbaitHooks: idea.clickbaitHooks ?? [],
          postPointers: idea.postPointers ?? [],
          callToAction: idea.callToAction ?? "",
          platform: idea.platform ?? "linkedin",
        })),
      });

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: contentUsage.inputTokens,
        outputTokens: contentUsage.outputTokens,
        totalTokens: contentUsage.inputTokens + contentUsage.outputTokens,
        metadata: { suggestionId: String(saved._id) },
      });

      res.json({
        suggestions: contentIdeas.ideas as ISuggestion[],
        id: String(saved._id),
        trendsUsed: acceptedTrendTopics,
        trendSource: "live" as const,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/suggestions/topic-ideas ──────────────────────────────────────────
/**
 * @swagger
 * /api/suggestions/topic-ideas:
 *   get:
 *     tags: [Suggestions]
 *     summary: Get AI-suggested topics from the user's persona (Phase 3 #28)
 *     description: |
 *       Generates 8-12 post topic ideas purely from the user's persona data —
 *       content pillars, industry, feedback profile, and audience. No external
 *       trends are used. Results are cached for 30 minutes.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI-suggested topics from persona
 *       400:
 *         description: Persona or interview incomplete
 *       429:
 *         description: Token quota exceeded
 */
router.get(
  "/topic-ideas",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      // Check for cached topics first
      const cached = getTopicDiscovery(req.userId!);
      if (cached) {
        res.json({
          topics: cached,
          basedOn: { contentPillars: [], topTopics: [], preferredFormats: [], avoidTopics: [] },
          cached: true,
        });
        return;
      }

      // Quota check
      const quota = await checkTokenQuota(req.userId!);
      if (!quota.allowed) {
        res.status(429).json({
          error: "Token quota exceeded",
          tokensUsed: quota.tokensUsed,
          tokenLimit: quota.tokenLimit,
        });
        return;
      }

      // Load persona
      const persona = await UserPersona.findOne({ userId: userObjectId });
      if (!persona) {
        res.status(400).json({ error: "No persona found. Complete persona analysis first." });
        return;
      }
      if (!persona.interviewComplete) {
        res.status(400).json({ error: "Please complete the onboarding interview first." });
        return;
      }

      // Load recently published draft topics to avoid repeats
      const recentDrafts = await PostDraft.find({
        userId: userObjectId,
        status: "published",
        publishedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      })
        .select("title brief.topic")
        .lean();

      const recentTopics = recentDrafts
        .map((d) => {
          const doc = d as unknown as { title?: string; brief?: { topic?: string } };
          return doc.title || doc.brief?.topic;
        })
        .filter(Boolean)
        .slice(0, 10);

      // Build feedback section
      const fp = persona.feedbackProfile;
      const feedbackLines: string[] = [];
      if (fp && fp.totalFeedbackCount > 0) {
        if (fp.preferredTopics.length > 0) {
          feedbackLines.push(`Topics user loves: ${fp.preferredTopics.join(", ")}`);
        }
        if (fp.avoidTopics.length > 0) {
          feedbackLines.push(`Topics user DISLIKES (avoid completely): ${fp.avoidTopics.join(", ")}`);
        }
        const preferredFormats = Object.entries(fp.formatPreferences)
          .filter(([, pct]) => pct >= 0.1)
          .sort((a, b) => b[1] - a[1])
          .map(([fmt, pct]) => `${fmt} (${Math.round(pct * 100)}%)`);
        if (preferredFormats.length > 0) {
          feedbackLines.push(`Format preferences: ${preferredFormats.join(", ")}`);
        }
      }

      const prompt = `Suggest 8-12 post TOPICS for this creator. Each topic should be a specific, actionable post idea — not a vague category.

CREATOR PROFILE:
${buildPersonaSummary(persona)}

${feedbackLines.length > 0 ? `USER FEEDBACK SIGNALS:\n${feedbackLines.join("\n")}` : ""}

${recentTopics.length > 0 ? `RECENTLY PUBLISHED (avoid repeating):\n${recentTopics.map((t) => `- ${t}`).join("\n")}` : ""}

INSTRUCTIONS:
- Base topics ONLY on this creator's expertise, audience, content pillars, and industry
- Do NOT reference external trends — these should come from their knowledge domain
- Each topic must be specific enough to write a post about immediately
- Include variety: different angles, different content pillars, different formats
- Assign a confidence score (0.0-1.0) based on how well it fits their profile

Return ONLY valid JSON (no markdown):
{
  "topics": [
    {
      "title": "The 3 biggest mistakes first-time engineering managers make",
      "category": "Leadership",
      "reasoning": "Your audience is engineering leaders — this hits a common pain point",
      "suggestedFormat": "carousel",
      "confidence": 0.92
    }
  ]
}`;

      const { text, usage: genUsage } = await generateText({
        model: getModel(),
        prompt,
      });

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: genUsage?.inputTokens ?? 0,
        outputTokens: genUsage?.outputTokens ?? 0,
        totalTokens: (genUsage?.inputTokens ?? 0) + (genUsage?.outputTokens ?? 0),
      });

      // Parse response (with model-driven JSON repair on malformed output)
      const raw = await parseLLMJson(text, TopicIdeasSchema, "topic-ideas");
      const topics: TopicDiscoveryItem[] = raw.topics.map((t) => ({
        ...t,
        id: generateTopicId(t.title),
      }));

      // Cache for 30 minutes
      storeTopicDiscovery(req.userId!, topics);

      res.json({
        topics,
        basedOn: {
          contentPillars: persona.contentPillars.slice(0, 5),
          topTopics: persona.topics.slice(0, 5),
          preferredFormats: persona.postFormats.slice(0, 4),
          avoidTopics: fp?.avoidTopics?.slice(0, 5) ?? [],
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/suggestions/generate-from-topic ────────────────────────────────
/**
 * @swagger
 * /api/suggestions/generate-from-topic:
 *   post:
 *     tags: [Suggestions]
 *     summary: Generate content ideas from a single AI-suggested topic (Phase 3 #29)
 *     description: |
 *       Generates 5-7 content ideas focused on a single topic selected from
 *       the /topic-ideas response. Bypasses trend research and uses the topic
 *       as a synthetic "trend" to drive the content generator.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topicId, topicTitle]
 *             properties:
 *               topicId:
 *                 type: string
 *               topicTitle:
 *                 type: string
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Content ideas generated from selected topic
 *       400:
 *         description: Invalid topic or persona missing
 *       429:
 *         description: Token quota exceeded
 */
const generateFromTopicSchema = z.object({
  topicId: z.string().min(1),
  topicTitle: z.string().min(1).max(500),
  context: generateContextSchema,
});

router.post(
  "/generate-from-topic",
  generationLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = generateFromTopicSchema.parse(req.body);
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      // Quota check
      const quota = await checkTokenQuota(req.userId!);
      if (!quota.allowed) {
        res.status(429).json({
          error: "Token quota exceeded",
          tokensUsed: quota.tokensUsed,
          tokenLimit: quota.tokenLimit,
        });
        return;
      }

      // Try to look up the topic from cache (resilient — fallback to topicTitle)
      const cachedTopic = getSelectedTopic(req.userId!, body.topicId);
      const topicTitle = cachedTopic?.title ?? body.topicTitle;
      const topicCategory = cachedTopic?.category ?? "general";

      // Load persona
      const persona = await UserPersona.findOne({ userId: userObjectId });
      if (!persona) {
        res.status(400).json({ error: "No persona found. Complete persona analysis first." });
        return;
      }
      if (!persona.interviewComplete) {
        res.status(400).json({ error: "Please complete the onboarding interview first." });
        return;
      }

      // Build a synthetic TrendResult from the topic
      const syntheticTrend = {
        trends: [
          {
            topic: topicTitle,
            relevanceReason: `Selected by user from AI-suggested topics (${topicCategory})`,
            contentAngle: `Multiple angles on: ${topicTitle}`,
            source: "persona-topics",
          },
        ],
        rawTrends: [topicTitle],
      };

      // Generate content ideas directly
      const pipelineStart = Date.now();
      const { ideas: contentIdeas, usage: contentUsage } =
        await generateContentIdeas({
          persona,
          trends: syntheticTrend,
          context: body.context
            ? { ...body.context, mode: "persona-topics" as const }
            : { mode: "persona-topics" as const },
          platforms: body.context?.platforms?.map(String),
        });
      const llmDurationMs = Date.now() - pipelineStart;

      // Persist results
      const saved = await ContentSuggestion.create({
        userId: userObjectId,
        generatedAt: new Date(),
        trendsUsed: [topicTitle],
        trendSource: "fallback",
        generationMode: "persona-topics",
        contextOptions: {
          ...(body.context ?? {}),
          mode: "persona-topics",
          topicFocus: topicTitle,
        },
        generationMeta: {
          pipelineDurationMs: llmDurationMs,
          trendFetchDurationMs: 0,
          llmDurationMs,
          tokenCost: {
            input: contentUsage.inputTokens,
            output: contentUsage.outputTokens,
            total: contentUsage.inputTokens + contentUsage.outputTokens,
          },
          trendSource: "fallback",
          modelId: getModelId(),
        },
        suggestions: contentIdeas.ideas.map((idea) => ({
          topic: idea.topic,
          angle: idea.angle,
          format: idea.format,
          hook: idea.hook,
          whyItFits: idea.whyItFits,
          seoKeywords: idea.seoKeywords ?? [],
          clickbaitHooks: idea.clickbaitHooks ?? [],
          postPointers: idea.postPointers ?? [],
          callToAction: idea.callToAction ?? "",
          platform: idea.platform ?? "linkedin",
        })),
      });

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: contentUsage.inputTokens,
        outputTokens: contentUsage.outputTokens,
        totalTokens: contentUsage.inputTokens + contentUsage.outputTokens,
        metadata: { suggestionId: String(saved._id) },
      });

      res.json({
        suggestions: contentIdeas.ideas as ISuggestion[],
        id: String(saved._id),
        trendsUsed: [topicTitle],
        trendSource: "fallback" as const,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

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
router.get("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const userId = new mongoose.Types.ObjectId(req.userId!);

    const [data, total] = await Promise.all([
      ContentSuggestion.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ContentSuggestion.countDocuments({ userId }),
    ]);

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

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
router.get(
  "/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params["id"] ?? "")) {
        res.status(400).json({ error: "Invalid suggestion ID" });
        return;
      }

      const suggestion = await ContentSuggestion.findOne({
        _id: req.params["id"],
        userId: new mongoose.Types.ObjectId(req.userId!),
      }).lean();

      if (!suggestion) {
        res.status(404).json({ error: "Suggestion set not found." });
        return;
      }

      res.json({ suggestion });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/suggestions/refine-context ─────────────────────────────────────
// Stateless single-turn chat to refine content generation context before generating.
// Frontend sends growing messages array; backend replies with AI message + extracted summary.
/**
 * @swagger
 * /api/suggestions/refine-context:
 *   post:
 *     tags: [Suggestions]
 *     summary: Chat to refine generation context before calling /generate
 *     description: |
 *       Stateless endpoint. Send the full messages array each call.
 *       The AI assistant asks clarifying questions about topic focus, audience, goals.
 *       When context is clear, it returns a summary to pass to /generate as chatRefinementContext.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: AI reply + optional summary when context is gathered
 */
const refineContextSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

router.post(
  "/refine-context",
  chatLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { messages: rawMessages } = refineContextSchema.parse(req.body);
      // Sanitize user messages before sending to LLM
      const messages = rawMessages.map((m) => ({
        role: m.role,
        content: m.role === "user" ? sanitizeMessage(m.content) : m.content,
      }));

      // Pre-flight quota check
      const quota = await checkTokenQuota(req.userId!);
      if (!quota.allowed) {
        res.status(429).json({
          error: "Token quota exceeded",
          message: `You have used ${quota.tokensUsed.toLocaleString()} of your ${quota.tokenLimit.toLocaleString()} token limit.`,
          tokensUsed: quota.tokensUsed,
          tokenLimit: quota.tokenLimit,
        });
        return;
      }

      const systemPrompt = `You are a content strategy assistant helping a LinkedIn creator define the perfect angle for their next batch of content ideas.

Your job: ask 2-3 focused questions to understand:
1. What specific topic or niche they want to focus on (if any)
2. Who exactly they want to reach with this batch
3. What outcome they want (leads, engagement, brand awareness, etc.)

Keep replies SHORT (2-4 sentences). Ask ONE question at a time.

When you have enough context (after 2-3 exchanges), output a special block at the END of your reply:
<!--CONTEXT_SUMMARY
{
  "summary": "A 2-3 sentence brief describing: topic focus, target audience, and desired outcome",
  "topicFocus": "The main topic/niche focus (or null if not specified)",
  "targetAudienceOverride": "Specific audience description (or null)",
  "platformGoal": "Pick EXACTLY ONE value from this list that best matches the creator's primary goal, or null if unclear: thought-leadership, lead-generation, personal-brand, hiring, community-building. Output only the single chosen value — never combine values with | or commas."
}
CONTEXT_SUMMARY-->

If you don't have enough context yet, do NOT include the summary block — just continue the conversation.`;

      const aiMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const { text, usage: genUsage } = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages: aiMessages,
      });

      // Track refine-context token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "refine-context",
        operation: "refine_context",
        inputTokens: genUsage?.inputTokens ?? 0,
        outputTokens: genUsage?.outputTokens ?? 0,
        totalTokens:
          (genUsage?.inputTokens ?? 0) + (genUsage?.outputTokens ?? 0),
      });

      // Extract structured summary if present
      const summaryMatch = text.match(
        /<!--CONTEXT_SUMMARY\s*([\s\S]*?)\s*CONTEXT_SUMMARY-->/,
      );
      let summary: string | undefined;
      let topicFocus: string | undefined;
      let targetAudienceOverride: string | undefined;
      let platformGoal: string | undefined;

      // Valid values that the Zod enum on /generate accepts
      const VALID_PLATFORM_GOALS = [
        "thought-leadership",
        "lead-generation",
        "personal-brand",
        "hiring",
        "community-building",
      ] as const;

      if (summaryMatch) {
        try {
          const parsed = JSON.parse(summaryMatch[1]!);
          summary = parsed.summary;
          topicFocus = parsed.topicFocus ?? undefined;
          targetAudienceOverride = parsed.targetAudienceOverride ?? undefined;

          // Gemini sometimes outputs a pipe/comma-joined value like
          // "lead-generation|thought-leadership" even when instructed not to.
          // Sanitise: split on any separator, take the first token that is a
          // valid enum value. This means a malformed AI response never reaches
          // the Zod validator on /generate and causes a 422.
          const rawGoal: string | undefined = parsed.platformGoal ?? undefined;
          if (rawGoal) {
            const tokens = rawGoal.split(/[|,\s]+/).map((t: string) => t.trim());
            const validToken = tokens.find((t: string) =>
              (VALID_PLATFORM_GOALS as readonly string[]).includes(t),
            );
            platformGoal = validToken ?? undefined;
          }
        } catch {
          // ignore parse error, just return the reply without structured context
        }
      }

      // Strip the summary block from the visible reply
      const visibleReply = text
        .replace(/<!--CONTEXT_SUMMARY[\s\S]*?CONTEXT_SUMMARY-->/g, "")
        .trim();

      res.json({
        reply: visibleReply,
        summary,
        topicFocus,
        targetAudienceOverride,
        platformGoal,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/suggestions/:setId/regenerate — Phase 4 #43 ───────────────────
/**
 * @swagger
 * /api/suggestions/{setId}/regenerate:
 *   post:
 *     tags: [Suggestions]
 *     summary: Regenerate content ideas with refinements (Phase 4 #43)
 *     description: |
 *       Loads the original suggestion set's trends + context, applies user
 *       refinement instructions, and generates a new set linked via parentSetId.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               moreLike:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Indices of suggestions to generate more like
 *               differentAngle:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Indices to rethink with a different angle
 *               avoid:
 *                 type: string
 *                 description: Topics/angles to avoid
 *               preferredFormats:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Regenerated content ideas
 *       400:
 *         description: Original set not found
 *       429:
 *         description: Token quota exceeded
 */
const regenerateSchema = z.object({
  moreLike: z.array(z.number().int().min(0)).max(10).optional(),
  differentAngle: z.array(z.number().int().min(0)).max(10).optional(),
  avoid: z.string().max(500).optional(),
  preferredFormats: z.array(z.string()).max(5).optional(),
});

router.post(
  "/:setId/regenerate",
  generationLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { setId } = req.params as { setId: string };
      if (!mongoose.Types.ObjectId.isValid(setId)) {
        res.status(400).json({ error: "Invalid suggestion set ID" });
        return;
      }

      const body = regenerateSchema.parse(req.body);
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      // Quota check
      const quota = await checkTokenQuota(req.userId!);
      if (!quota.allowed) {
        res.status(429).json({
          error: "Token quota exceeded",
          tokensUsed: quota.tokensUsed,
          tokenLimit: quota.tokenLimit,
        });
        return;
      }

      // Load the original suggestion set
      const original = await ContentSuggestion.findOne({
        _id: setId,
        userId: userObjectId,
      }).lean();

      if (!original) {
        res.status(404).json({ error: "Original suggestion set not found." });
        return;
      }

      // Load persona
      const persona = await UserPersona.findOne({ userId: userObjectId });
      if (!persona) {
        res.status(400).json({ error: "No persona found." });
        return;
      }

      // Build refinement context from user selections
      const refinementParts: string[] = [];

      if (body.moreLike && body.moreLike.length > 0) {
        const liked = body.moreLike
          .map((i) => original.suggestions[i])
          .filter((s): s is (typeof original.suggestions)[number] => !!s)
          .map((s) => `"${s.topic}" (${s.format}, angle: ${s.angle})`);
        if (liked.length > 0) {
          refinementParts.push(`GENERATE MORE ideas like these (user loved them): ${liked.join("; ")}`);
        }
      }

      if (body.differentAngle && body.differentAngle.length > 0) {
        const rethink = body.differentAngle
          .map((i) => original.suggestions[i])
          .filter((s): s is (typeof original.suggestions)[number] => !!s)
          .map((s) => `"${s.topic}"`);
        if (rethink.length > 0) {
          refinementParts.push(`RETHINK these topics with COMPLETELY DIFFERENT angles: ${rethink.join(", ")}`);
        }
      }

      if (body.avoid) {
        refinementParts.push(`AVOID these topics/angles entirely: ${body.avoid}`);
      }

      const refinementContext = refinementParts.length > 0
        ? refinementParts.join("\n")
        : "Generate fresh alternatives to the previous batch.";

      // Build a trend result from the original's trends
      const trendResult = {
        trends: original.trendsUsed.map((t) => ({
          topic: t,
          relevanceReason: "Reused from previous generation",
          contentAngle: "",
          source: "regenerated",
        })),
        rawTrends: original.trendsUsed,
      };

      // Generate new content ideas
      const pipelineStart = Date.now();
      const { ideas: contentIdeas, usage: contentUsage } =
        await generateContentIdeas({
          persona,
          trends: trendResult,
          context: {
            mode: "chat-refined" as const,
            chatRefinementContext: refinementContext,
            preferredFormats: body.preferredFormats as PostFormat[] | undefined,
          },
          platforms: original.contextOptions?.platforms?.map(String),
        });
      const llmDurationMs = Date.now() - pipelineStart;

      // Persist results with parentSetId reference
      const saved = await ContentSuggestion.create({
        userId: userObjectId,
        generatedAt: new Date(),
        trendsUsed: original.trendsUsed,
        trendSource: original.trendSource ?? "live",
        generationMode: "chat-refined",
        contextOptions: {
          mode: "chat-refined",
          chatRefinementContext: refinementContext,
          preferredFormats: body.preferredFormats,
          parentSetId: setId,
        },
        generationMeta: {
          pipelineDurationMs: llmDurationMs,
          trendFetchDurationMs: 0,
          llmDurationMs,
          tokenCost: {
            input: contentUsage.inputTokens,
            output: contentUsage.outputTokens,
            total: contentUsage.inputTokens + contentUsage.outputTokens,
          },
          trendSource: original.trendSource ?? "live",
          modelId: getModelId(),
        },
        suggestions: contentIdeas.ideas.map((idea) => ({
          topic: idea.topic,
          angle: idea.angle,
          format: idea.format,
          hook: idea.hook,
          whyItFits: idea.whyItFits,
          seoKeywords: idea.seoKeywords ?? [],
          clickbaitHooks: idea.clickbaitHooks ?? [],
          postPointers: idea.postPointers ?? [],
          callToAction: idea.callToAction ?? "",
          platform: idea.platform ?? "linkedin",
        })),
      });

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: contentUsage.inputTokens,
        outputTokens: contentUsage.outputTokens,
        totalTokens: contentUsage.inputTokens + contentUsage.outputTokens,
        metadata: { suggestionId: String(saved._id) },
      });

      res.json({
        suggestions: contentIdeas.ideas as ISuggestion[],
        id: String(saved._id),
        parentSetId: setId,
        trendsUsed: original.trendsUsed,
        trendSource: original.trendSource ?? "live",
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
