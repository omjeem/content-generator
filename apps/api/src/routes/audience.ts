import { Router, Response } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { recordEngagement, getAudienceInsights } from "../services/audienceTracker";

const router = Router();

// ── POST /api/audience/record ────────────────────────────────────────────────
const recordSchema = z.object({
  postDraftId: z.string().optional(),
  postContent: z.string().min(1).max(5000),
  engagement: z.object({
    likes: z.number().min(0),
    comments: z.number().min(0),
    reposts: z.number().min(0),
    impressions: z.number().min(0).optional(),
  }),
  topics: z.array(z.string()).min(1).max(10),
  format: z.string(),
  dayOfWeek: z.string(),
  timeOfDay: z.string(),
  audienceQuestions: z.array(z.string()).optional(),
});

router.post(
  "/record",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const body = recordSchema.parse(req.body);
      const record = await recordEngagement({
        userId: req.userId!,
        ...body,
      });
      res.status(201).json({ message: "Engagement recorded.", id: record._id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      console.error("[audience] Record error:", err);
      res.status(500).json({ error: "Failed to record engagement." });
    }
  }
);

// ── GET /api/audience/insights ───────────────────────────────────────────────
router.get(
  "/insights",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const insights = await getAudienceInsights(req.userId!);
      res.json(insights);
    } catch (err) {
      console.error("[audience] Insights error:", err);
      res.status(500).json({ error: "Failed to compute insights." });
    }
  }
);

export default router;
