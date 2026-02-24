import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { runPersonaChat, applyPersonaChanges } from "../agents/personaChat";
import { getSessionHistory } from "../services/chatSessionService";
import { findPersonaByUserIdLean } from "../services/userPersonaService";

const router = Router();
router.use(authenticate);

// ── POST /api/persona-chat/chat ───────────────────────────────────────────────
/**
 * @swagger
 * /api/persona-chat/chat:
 *   post:
 *     tags: [PersonaChat]
 *     summary: Chat with AI to update your content persona
 *     description: |
 *       Send a message and receive an AI reply. If the AI proposes persona changes,
 *       they are returned in pendingChanges. Call /apply-changes to commit them.
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
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: AI reply with optional pending changes
 */
const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

router.post(
  "/chat",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { message, sessionId } = chatSchema.parse(req.body);

      const result = await runPersonaChat({
        userId: req.userId!,
        message,
        sessionId,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/persona-chat/apply-changes ─────────────────────────────────────
/**
 * @swagger
 * /api/persona-chat/apply-changes:
 *   post:
 *     tags: [PersonaChat]
 *     summary: Apply pending persona changes proposed by the AI
 *     description: |
 *       Commits the pending changes from the last chat turn to the user's persona.
 *       Only include fields that are actually changing.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [changes]
 *             properties:
 *               changes:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated persona
 */
const platformGoalEnum = z.enum([
  "thought-leadership",
  "lead-generation",
  "personal-brand",
  "hiring",
  "community-building",
]);

const applyChangesSchema = z.object({
  changes: z.object({
    goals: z.string().optional(),
    targetAudience: z.string().optional(),
    industry: z.string().optional(),
    contentPillars: z.array(z.string()).optional(),
    postingFrequency: z.string().optional(),
    topics: z.array(z.string()).optional(),
    tone: z.string().optional(),
    writingStyle: z.string().optional(),
    platformGoal: platformGoalEnum.optional(),
  }),
});

router.post(
  "/apply-changes",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { changes } = applyChangesSchema.parse(req.body);

      const persona = await applyPersonaChanges(req.userId!, changes);

      res.json({
        persona,
        message: "Persona updated successfully.",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/persona-chat/history ─────────────────────────────────────────────
/**
 * @swagger
 * /api/persona-chat/history:
 *   get:
 *     tags: [PersonaChat]
 *     summary: Get the persona chat session history for the current user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat session messages
 */
router.get(
  "/history",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const history = await getSessionHistory(req.userId!, "persona-chat");
      res.json({ messages: history.messages, sessionId: history.sessionId });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/persona-chat/persona ─────────────────────────────────────────────
/**
 * @swagger
 * /api/persona-chat/persona:
 *   get:
 *     tags: [PersonaChat]
 *     summary: Get the current user's full persona for display on the profile page
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User persona
 */
router.get(
  "/persona",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const persona = await findPersonaByUserIdLean(req.userId!);

      if (!persona) {
        res
          .status(404)
          .json({ error: "Persona not found. Complete onboarding first." });
        return;
      }

      res.json({ persona });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
