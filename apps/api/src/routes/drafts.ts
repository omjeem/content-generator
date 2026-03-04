/**
 * Drafts Routes — Phase D #22
 *
 * POST   /api/drafts                  Create a new draft
 * GET    /api/drafts                  List drafts (paginated, optional ?status=)
 * GET    /api/drafts/:id              Get a single draft
 * PATCH  /api/drafts/:id              Update draft content/status
 * DELETE /api/drafts/:id              Delete a draft
 * POST   /api/drafts/:id/chat         Chat with AI about this draft
 * GET    /api/drafts/:id/chat/history  Get chat history for this draft
 * POST   /api/drafts/:id/publish      Publish a draft (feeds back to persona)
 */

import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  createDraft,
  getDraft,
  listDrafts,
  updateDraft,
  applyAiContent,
  deleteDraft,
  publishDraft,
  feedPublishedDraftToPersona,
} from "../services/draftService";
import { runPostEditor } from "../agents/postEditor";
import { findPersonaByUserId } from "../services/userPersonaService";
import { ChatSession } from "../models/ChatSession";
import { SuggestionFeedback } from "../models/SuggestionFeedback";
import { aggregateAndUpdatePersona } from "../services/personaLearning";
import { runAiDetection, runHumanizer } from "../services/aiDetection";
import { checkTokenQuota, trackTokenUsage } from "../services/tokenUsage";

const router = Router();
router.use(authenticate);

// ── Write-intent detector ─────────────────────────────────────────────────────
/**
 * Returns true if the message looks like a write/edit/refine intent.
 * Used as a heuristic for the inline-fallback: when the LLM puts the post
 * text directly in the reply (skipping the POST_CONTENT block), we detect it
 * and rescue the content rather than showing a wall of text in the chat.
 */
function isWriteIntent(message: string): boolean {
  if (message === "__INIT__") return true;
  const lower = message.toLowerCase();
  return (
    lower.includes("write") ||
    lower.includes("draft") ||
    lower.includes("generate") ||
    lower.includes("create") ||
    lower.includes("article") ||
    lower.includes("post") ||
    lower.includes("help me") ||
    lower.includes("shorten") ||
    lower.includes("shorter") ||
    lower.includes("refine") ||
    lower.includes("improve") ||
    lower.includes("edit") ||
    lower.includes("rewrite") ||
    lower.includes("hook") ||
    lower.includes("punch") ||
    lower.includes("update")
  );
}

// ── Validation schemas ────────────────────────────────────────────────────────

const briefSchema = z.object({
  topic: z.string(),
  angle: z.string().default(""),
  format: z.string().default(""),
  hook: z.string().default(""),
  postPointers: z.array(z.string()).default([]),
  callToAction: z.string().default(""),
  seoKeywords: z.array(z.string()).default([]),
});

const createDraftSchema = z.object({
  sourceSuggestionSetId: z.string().optional(),
  sourceSuggestionIndex: z.number().int().min(0).optional(),
  platform: z.enum(["linkedin", "twitter"]).default("linkedin"),
  title: z.string().min(1).max(300),
  content: z.string().optional(),
  brief: briefSchema.optional(),
});

const updateDraftSchema = z.object({
  content: z.string().optional(),
  title: z.string().min(1).max(300).optional(),
  status: z.enum(["drafting", "ready", "published"]).optional(),
  changeNote: z.string().max(200).optional(),
});

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

// ── POST /api/drafts ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts:
 *   post:
 *     tags: [Drafts]
 *     summary: Create a new post draft
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [linkedin, twitter]
 *               sourceSuggestionSetId:
 *                 type: string
 *               sourceSuggestionIndex:
 *                 type: integer
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Draft created
 */
router.post(
  "/",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = createDraftSchema.parse(req.body);
      const draft = await createDraft(req.userId!, body);
      res.status(201).json({ draft });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/drafts ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts:
 *   get:
 *     tags: [Drafts]
 *     summary: List drafts (paginated)
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [drafting, ready, published]
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
 *     responses:
 *       200:
 *         description: Paginated list of drafts
 */
router.get(
  "/",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as "drafting" | "ready" | "published" | undefined;

      const result = await listDrafts(req.userId!, { status, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/drafts/:id ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}:
 *   get:
 *     tags: [Drafts]
 *     summary: Get a single draft by ID
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Draft document
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const draft = await getDraft(req.userId!, req.params.id!);
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/drafts/:id ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}:
 *   patch:
 *     tags: [Drafts]
 *     summary: Update draft content or status
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               title:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [drafting, ready, published]
 *               changeNote:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated draft
 *       404:
 *         description: Not found
 */
router.patch(
  "/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = updateDraftSchema.parse(req.body);
      const draft = await updateDraft(req.userId!, req.params.id!, {
        ...body,
        editedBy: "user",
      });
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/drafts/:id ────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}:
 *   delete:
 *     tags: [Drafts]
 *     summary: Delete a draft
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const deleted = await deleteDraft(req.userId!, req.params.id!);
      if (!deleted) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }
      res.json({ message: "Draft deleted." });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/drafts/:id/chat ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}/chat:
 *   post:
 *     tags: [Drafts]
 *     summary: Chat with AI about this draft
 *     description: |
 *       Sends a message to the Post Editor AI agent (Agent 6).
 *       If the AI modifies the post body, the response includes `postContent`
 *       with the new text and `charCount`.
 *       The AI response is persisted to the draft's chat session.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *                 description: |
 *                   User's message. Use "__INIT__" for the first auto-generated draft.
 *               applyContent:
 *                 type: boolean
 *                 description: If true and postContent is present, auto-apply to draft
 *                 default: false
 *     responses:
 *       200:
 *         description: AI reply + optional new post content
 *       404:
 *         description: Draft not found
 *       429:
 *         description: Token quota exceeded
 */
router.post(
  "/:id/chat",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = chatSchema.parse(req.body);
      // applyContent flag is no longer needed — AI content is always auto-applied server-side

      // Load draft and persona in parallel
      const [draft, persona] = await Promise.all([
        getDraft(req.userId!, req.params.id!),
        findPersonaByUserId(req.userId!),
      ]);

      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }

      // Handle __INIT__ message — replace with a write instruction
      const userMessage =
        body.message === "__INIT__"
          ? `Please write the first draft of this post based on the content brief. Make it publish-ready and true to my voice.`
          : body.message;

      const editorOutput = await runPostEditor({
        userId: req.userId!,
        draftId: req.params.id!,
        message: userMessage,
        draft,
        persona,
      });

      // ── Inline-content fallback ──────────────────────────────────────────────
      // If the LLM ignored the POST_CONTENT block instruction and wrote the
      // post directly in the chat reply (a known Gemini failure mode), we
      // detect it via: no postContent + long reply + write-intent message.
      // We rescue the content and replace the reply with a short synthetic one.
      const INLINE_FALLBACK_MIN_CHARS = 300;
      if (
        !editorOutput.postContent &&
        editorOutput.reply.length > INLINE_FALLBACK_MIN_CHARS &&
        isWriteIntent(body.message)
      ) {
        const rescued = editorOutput.reply;
        editorOutput.postContent = rescued;
        editorOutput.charCount = rescued.length;
        editorOutput.changeExplanation = "Post written by AI";
        editorOutput.reply =
          "Done! Your post is ready in the editor — let me know if you'd like any changes.";
        console.log(
          `[drafts/chat] Inline-fallback: rescued ${rescued.length}-char reply as post content (no POST_CONTENT block found).`,
        );
      }

      // ── Always persist AI content to the draft ──────────────────────────────
      // Auto-apply whenever the AI produced content — frontend will also reflect
      // the change immediately. Removes the need for applyContent flag.
      if (editorOutput.postContent) {
        await applyAiContent(
          req.userId!,
          req.params.id!,
          editorOutput.postContent,
          editorOutput.charCount ?? editorOutput.postContent.length,
          editorOutput.changeExplanation,
        );
      }

      res.json({
        reply: editorOutput.reply,
        sessionId: editorOutput.sessionId,
        postContent: editorOutput.postContent,
        charCount: editorOutput.charCount,
        changeExplanation: editorOutput.changeExplanation,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 429) {
        res.status(429).json({ error: e.message });
        return;
      }
      next(err);
    }
  },
);

// ── GET /api/drafts/:id/chat/history ──────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}/chat/history:
 *   get:
 *     tags: [Drafts]
 *     summary: Get chat history for this draft
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat messages
 */
router.get(
  "/:id/chat/history",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const draft = await getDraft(req.userId!, req.params.id!);
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }

      const sessionId = `post-editor-${req.params.id}`;
      const session = await ChatSession.findOne({ sessionId }).lean();

      res.json({
        messages: session?.messages ?? [],
        sessionId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/drafts/:id/publish ──────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}/publish:
 *   post:
 *     tags: [Drafts]
 *     summary: Publish a draft and feed it back to the persona pipeline
 *     description: |
 *       Sets status to 'published'. If the draft came from a suggestion,
 *       upserts a 'published' feedback record (strong positive signal).
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Draft published
 *       404:
 *         description: Not found
 */
router.post(
  "/:id/publish",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const draft = await publishDraft(req.userId!, req.params.id!);
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }

      // Upsert a 'published' feedback record for the source suggestion (strong signal)
      if (draft.sourceSuggestionSetId && draft.sourceSuggestionIndex !== undefined) {
        void SuggestionFeedback.findOneAndUpdate(
          {
            userId: new mongoose.Types.ObjectId(req.userId!),
            suggestionSetId: draft.sourceSuggestionSetId,
            suggestionIndex: draft.sourceSuggestionIndex,
          },
          {
            $set: {
              action: "published",
              rating: "loved",
              suggestionSnapshot: {
                topic: draft.brief?.topic ?? draft.title,
                angle: draft.brief?.angle ?? "",
                format: draft.brief?.format ?? "text-post",
                hook: draft.brief?.hook ?? "",
              },
            },
          },
          { upsert: true },
        ).catch((err) => {
          console.error("[drafts] Failed to upsert publish feedback:", err);
        });
      }

      // Feed published post content back into persona pipeline — fire-and-forget (#31)
      // Strengthens the persona with the user's own published writing style.
      feedPublishedDraftToPersona(req.userId!, draft);

      // A published post is the strongest learning signal — trigger immediate
      // persona aggregation (includes averageContentLength from published drafts).
      // Fire-and-forget (#52).
      void aggregateAndUpdatePersona(req.userId!).catch((err) => {
        console.error("[drafts] aggregateAndUpdatePersona failed (non-fatal):", err);
      });

      res.json({
        message: "Draft published.",
        draft,
        personaFeed: "queued", // signals to frontend that persona update is in progress
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/drafts/:id/ai-check ────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}/ai-check:
 *   post:
 *     tags: [Drafts]
 *     summary: Check if draft content reads as AI-written (Phase 3 #35)
 *     description: |
 *       Runs a 7-signal AI detection analysis on the draft content.
 *       Returns a score (0-100), verdict, detected signals, and actionable suggestions.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Optional — if omitted, uses draft.content
 *     responses:
 *       200:
 *         description: AI detection result
 *       400:
 *         description: Draft has no content to check
 *       404:
 *         description: Draft not found
 *       429:
 *         description: Token quota exceeded
 */
const aiCheckSchema = z.object({
  content: z.string().min(50).max(20000).optional(),
});

router.post(
  "/:id/ai-check",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = aiCheckSchema.parse(req.body);

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

      // Load draft
      const draft = await getDraft(req.userId!, req.params.id!);
      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }

      const contentToCheck = body.content ?? draft.content;
      if (!contentToCheck || contentToCheck.trim().length < 50) {
        res.status(400).json({
          error: "Draft content is too short for AI detection (minimum 50 characters).",
        });
        return;
      }

      // Run AI detection
      const { result, usage } = await runAiDetection(contentToCheck);

      // Track token usage — fire-and-forget
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      });

      res.json({
        score: result.score,
        verdict: result.verdict,
        signals: result.signals,
        suggestions: result.suggestions,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/drafts/:id/humanize ────────────────────────────────────────────
/**
 * @swagger
 * /api/drafts/{id}/humanize:
 *   post:
 *     tags: [Drafts]
 *     summary: Humanize AI-generated draft content (Phase 3 #37)
 *     description: |
 *       Rewrites the draft content to match the user's natural voice using
 *       their persona data. Three intensity levels: light, moderate, aggressive.
 *       Auto-applies the humanized content to the draft.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               intensity:
 *                 type: string
 *                 enum: [light, moderate, aggressive]
 *                 default: moderate
 *     responses:
 *       200:
 *         description: Humanized content
 *       400:
 *         description: Draft has no content
 *       404:
 *         description: Draft not found
 *       429:
 *         description: Token quota exceeded
 */
const humanizeSchema = z.object({
  intensity: z.enum(["light", "moderate", "aggressive"]).default("moderate"),
});

router.post(
  "/:id/humanize",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = humanizeSchema.parse(req.body);

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

      // Load draft + persona in parallel
      const [draft, persona] = await Promise.all([
        getDraft(req.userId!, req.params.id!),
        findPersonaByUserId(req.userId!),
      ]);

      if (!draft) {
        res.status(404).json({ error: "Draft not found." });
        return;
      }

      if (!draft.content || draft.content.trim().length < 50) {
        res.status(400).json({
          error: "Draft content is too short for humanization (minimum 50 characters).",
        });
        return;
      }

      if (!persona) {
        res.status(400).json({
          error: "No persona found. Complete persona analysis first.",
        });
        return;
      }

      // Run AI detection on original content first (for beforeScore)
      const [detectionResult, humanizeResult] = await Promise.all([
        runAiDetection(draft.content),
        runHumanizer(draft.content, persona, body.intensity),
      ]);

      // Auto-apply humanized content to the draft
      await applyAiContent(
        req.userId!,
        req.params.id!,
        humanizeResult.result.humanizedContent,
        humanizeResult.result.humanizedContent.length,
        `Humanized (${body.intensity})`,
      );

      // Track token usage — fire-and-forget (both calls)
      const totalInput =
        detectionResult.usage.inputTokens + humanizeResult.usage.inputTokens;
      const totalOutput =
        detectionResult.usage.outputTokens + humanizeResult.usage.outputTokens;
      trackTokenUsage({
        userId: req.userId!,
        agent: "content-generator",
        operation: "content_generation",
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
      });

      res.json({
        humanizedContent: humanizeResult.result.humanizedContent,
        charCount: humanizeResult.result.humanizedContent.length,
        changesSummary: humanizeResult.result.changesSummary,
        beforeScore: detectionResult.result.score,
        afterScore: humanizeResult.result.estimatedScore,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
