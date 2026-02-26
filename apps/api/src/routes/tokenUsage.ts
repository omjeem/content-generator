import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { checkTokenQuota } from "../services/tokenUsage";
import { TokenUsageLog } from "../models/TokenUsageLog";
import { TokenRequest } from "../models/TokenRequest";
import mongoose from "mongoose";

const router = Router();
router.use(authenticate);

// ── GET /api/tokens/usage ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/usage:
 *   get:
 *     tags: [Tokens]
 *     summary: Get the current user's token usage summary
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token usage summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokensUsed:
 *                   type: integer
 *                 tokenLimit:
 *                   type: integer
 *                 percentUsed:
 *                   type: integer
 *                 tokensRemaining:
 *                   type: integer
 *                 allowed:
 *                   type: boolean
 */
router.get(
  "/usage",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const summary = await checkTokenQuota(req.userId!);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/tokens/logs ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/logs:
 *   get:
 *     tags: [Tokens]
 *     summary: Get paginated token usage log for the current user
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
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated token usage log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       agent:
 *                         type: string
 *                       operation:
 *                         type: string
 *                       inputTokens:
 *                         type: integer
 *                       outputTokens:
 *                         type: integer
 *                       totalTokens:
 *                         type: integer
 *                       metadata:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get(
  "/logs",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query["limit"] as string) || 20),
      );
      const skip = (page - 1) * limit;

      const userId = new mongoose.Types.ObjectId(req.userId!);

      const [data, total] = await Promise.all([
        TokenUsageLog.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select("-userId -__v")
          .lean(),
        TokenUsageLog.countDocuments({ userId }),
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
  },
);

// ── POST /api/tokens/request-increase ────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/request-increase:
 *   post:
 *     tags: [Tokens]
 *     summary: Submit a request to increase the token limit
 *     description: |
 *       User can submit one pending request at a time.
 *       An optional message explains the reason for needing more tokens.
 *       The admin can see all requests and approve/reject them.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional reason for the increase request
 *     responses:
 *       201:
 *         description: Request submitted successfully
 *       409:
 *         description: A pending request already exists
 */
const requestIncreaseSchema = z.object({
  message: z.string().max(500).optional(),
});

router.post(
  "/request-increase",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { message } = requestIncreaseSchema.parse(req.body);
      const userId = new mongoose.Types.ObjectId(req.userId!);

      // Prevent duplicate pending requests
      const existing = await TokenRequest.findOne({
        userId,
        status: "pending",
      }).lean();
      if (existing) {
        res.status(409).json({
          error:
            "You already have a pending token increase request. Please wait for it to be reviewed.",
        });
        return;
      }

      // Snapshot current usage
      const quota = await checkTokenQuota(req.userId!);

      const request = await TokenRequest.create({
        userId,
        message: message?.trim() || undefined,
        status: "pending",
        tokensUsed: quota.tokensUsed,
        tokenLimit: quota.tokenLimit,
      });

      res.status(201).json({
        message: "Token increase request submitted successfully.",
        request: {
          _id: request._id,
          status: request.status,
          tokensUsed: request.tokensUsed,
          tokenLimit: request.tokenLimit,
          message: request.message,
          createdAt: request.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/tokens/my-requests ───────────────────────────────────────────────
/**
 * @swagger
 * /api/tokens/my-requests:
 *   get:
 *     tags: [Tokens]
 *     summary: Get the current user's token increase requests
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of token increase requests for this user
 */
router.get(
  "/my-requests",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.userId!);
      const requests = await TokenRequest.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("-userId -__v")
        .lean();

      res.json({ requests });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

// NOTE: Admin token request endpoints (approve/reject) have been moved to
// /api/admin/token-requests in routes/admin.ts (#41).
