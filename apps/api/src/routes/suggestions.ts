import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { runContentPipelineWithRetry } from "../agents/mastra";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";
import mongoose from "mongoose";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMessage } from "../utils/sanitizeInput";

const router = Router();
router.use(authenticate);

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
    mode: z.enum(["profile", "topic-focus", "chat-refined"]),
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
        model: google("gemini-2.5-flash"),
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

export default router;
