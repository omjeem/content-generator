import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminAuth";
import { checkTokenQuota } from "../services/tokenUsage";
import { TokenUsageLog } from "../models/TokenUsageLog";
import { TokenRequest } from "../models/TokenRequest";
import { User } from "../models/User";
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

// ── GET /api/tokens/admin/requests ────────────────────────────────────────────
// Admin-only: list all token increase requests across all users.
// Protected by requireAdmin — only users with role='admin' can access this.
/**
 * @swagger
 * /api/tokens/admin/requests:
 *   get:
 *     tags: [Tokens]
 *     summary: "[Admin] List all token increase requests"
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by status (default shows all)
 *     responses:
 *       200:
 *         description: List of all token increase requests with user info
 *       403:
 *         description: Admin access required
 */
router.get(
  "/admin/requests",
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const status = req.query["status"] as string | undefined;
      const filter: Record<string, string> = {};
      if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter["status"] = status;
      }

      const requests = await TokenRequest.find(filter)
        .sort({ createdAt: -1 })
        .populate<{ userId: { _id: string; email: string; name: string; tokensUsed: number; tokenLimit: number | null } }>(
          "userId",
          "email name tokensUsed tokenLimit",
        )
        .select("-__v")
        .lean();

      res.json({ requests, total: requests.length });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/tokens/admin/requests/:id ─────────────────────────────────────
// Admin-only: approve or reject a token increase request.
// On approval, automatically updates User.tokenLimit to newLimit.
// Protected by requireAdmin — only users with role='admin' can access this.
/**
 * @swagger
 * /api/tokens/admin/requests/{id}:
 *   patch:
 *     tags: [Tokens]
 *     summary: "[Admin] Approve or reject a token increase request"
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
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               newLimit:
 *                 type: integer
 *                 description: Required when action=approve. New token limit for the user.
 *               adminNote:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Request updated and user limit changed if approved
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Request not found
 */
const adminResolveSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    newLimit: z.number().int().positive("New limit must be a positive integer"),
    adminNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    adminNote: z.string().max(500).optional(),
  }),
]);

router.patch(
  "/admin/requests/:id",
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params["id"] ?? "")) {
        res.status(400).json({ error: "Invalid request ID" });
        return;
      }

      const body = adminResolveSchema.parse(req.body);
      const tokenReq = await TokenRequest.findById(req.params["id"]);

      if (!tokenReq) {
        res.status(404).json({ error: "Token request not found." });
        return;
      }
      if (tokenReq.status !== "pending") {
        res
          .status(409)
          .json({ error: `Request already ${tokenReq.status}.` });
        return;
      }

      if (body.action === "approve") {
        // Update the user's token limit directly in the users collection
        await User.updateOne(
          { _id: tokenReq.userId },
          { $set: { tokenLimit: body.newLimit } },
        );
        tokenReq.status = "approved";
        tokenReq.newLimit = body.newLimit;
        tokenReq.adminNote = body.adminNote?.trim();
        tokenReq.resolvedAt = new Date();
      } else {
        tokenReq.status = "rejected";
        tokenReq.adminNote = body.adminNote?.trim();
        tokenReq.resolvedAt = new Date();
      }

      await tokenReq.save();

      res.json({
        message:
          body.action === "approve"
            ? `Request approved. User limit updated to ${body.newLimit.toLocaleString()} tokens.`
            : "Request rejected.",
        request: tokenReq.toObject(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
