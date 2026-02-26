import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { authenticate, AuthRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminAuth";
import { User } from "../models/User";
import { UserPersona } from "../models/UserPersona";
import { TokenRequest } from "../models/TokenRequest";
import { TokenUsageLog } from "../models/TokenUsageLog";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { AdminAuditLog } from "../models/AdminAuditLog";
import { SystemConfig } from "../models/SystemConfig";
import { ADMIN_CONFIG_KEYS } from "../services/adminSeed";

const router = Router();

// All admin routes require both auth + admin role
router.use(authenticate, requireAdmin);

// ── Helper ─────────────────────────────────────────────────────────────────────

function logAudit(
  req: AuthRequest,
  action: string,
  targetUserId?: mongoose.Types.ObjectId | string,
  details?: Record<string, unknown>,
) {
  const entry = {
    adminId: new mongoose.Types.ObjectId(req.userId!),
    action,
    targetUserId: targetUserId
      ? new mongoose.Types.ObjectId(String(targetUserId))
      : undefined,
    details: details ?? {},
    ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
    userAgent: req.headers["user-agent"] ?? "unknown",
  };
  void AdminAuditLog.create(entry).catch((err) =>
    console.error("[admin] audit log error (non-fatal):", err),
  );
}

// ── GET /api/admin/users ───────────────────────────────────────────────────────

router.get(
  "/users",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query["limit"] as string) || 20),
      );
      const skip = (page - 1) * limit;
      const search = (req.query["search"] as string | undefined)?.trim();

      const filter: Record<string, unknown> = {};
      if (search) {
        filter["$or"] = [
          { email: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      const [users, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select("email name role tokensUsed tokenLimit requiresSetup createdAt")
          .lean(),
        User.countDocuments(filter),
      ]);

      res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/admin/users/:id ───────────────────────────────────────────────────

router.get(
  "/users/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params["id"] ?? "")) {
        res.status(400).json({ error: "Invalid user ID" });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.params["id"]!);

      const [user, persona, recentLogs] = await Promise.all([
        User.findById(userId)
          .select("-password")
          .lean(),
        UserPersona.findOne({ userId })
          .select("industry goals contentPillars topics writingStyle tone interviewComplete feedbackProfile lastLearningUpdate updatedAt")
          .lean(),
        TokenUsageLog.find({ userId })
          .sort({ createdAt: -1 })
          .limit(20)
          .select("agent operation totalTokens createdAt")
          .lean(),
      ]);

      if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      res.json({ user, persona, recentLogs });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/admin/users/:id ─────────────────────────────────────────────────

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["user", "admin"]).optional(),
  tokenLimit: z.number().int().min(0).nullable().optional(),
});

router.patch(
  "/users/:id",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params["id"] ?? "")) {
        res.status(400).json({ error: "Invalid user ID" });
        return;
      }

      const body = updateUserSchema.parse(req.body);
      const userId = req.params["id"]!;

      // Prevent admin from demoting themselves
      if (body.role && body.role !== "admin" && userId === req.userId) {
        res.status(400).json({ error: "You cannot change your own role." });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates["name"] = body.name;
      if (body.role !== undefined) updates["role"] = body.role;
      if (body.tokenLimit !== undefined) updates["tokenLimit"] = body.tokenLimit;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No valid fields provided for update." });
        return;
      }

      const updated = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true },
      ).select("-password");

      if (!updated) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      logAudit(req, "update_user", userId, { changes: updates });

      res.json({ user: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/admin/analytics/overview ─────────────────────────────────────────

router.get(
  "/analytics/overview",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeThisWeek,
        activeThisMonth,
        pendingRequests,
        totalSuggestions,
        tokenAgg,
        recentActivity,
      ] = await Promise.all([
        User.countDocuments({}),
        // Users who have token usage in the last 7 days
        TokenUsageLog.distinct("userId", { createdAt: { $gte: oneWeekAgo } }).then(
          (ids) => ids.length,
        ),
        TokenUsageLog.distinct("userId", {
          createdAt: { $gte: oneMonthAgo },
        }).then((ids) => ids.length),
        TokenRequest.countDocuments({ status: "pending" }),
        ContentSuggestion.countDocuments(),
        // Total tokens used across all users
        User.aggregate<{ total: number }>([
          { $group: { _id: null, total: { $sum: "$tokensUsed" } } },
        ]),
        // Last 10 token usage log entries (system-wide)
        TokenUsageLog.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .populate<{ userId: { email: string; name: string } }>(
            "userId",
            "email name",
          )
          .select("userId agent operation totalTokens createdAt")
          .lean(),
      ]);

      const totalTokensUsed: number = tokenAgg[0]?.total ?? 0;

      res.json({
        totalUsers,
        activeThisWeek,
        activeThisMonth,
        pendingRequests,
        totalSuggestions,
        totalTokensUsed,
        recentActivity,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/admin/analytics/tokens-over-time ─────────────────────────────────
// Aggregate token usage by day for the last 30 days

router.get(
  "/analytics/tokens-over-time",
  async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      );

      const daily = await TokenUsageLog.aggregate<{
        _id: string;
        totalTokens: number;
        count: number;
      }>([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            totalTokens: { $sum: "$totalTokens" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({ daily });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/admin/config ──────────────────────────────────────────────────────

router.get(
  "/config",
  async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const configs = await SystemConfig.find()
        .select("-__v")
        .lean();
      res.json({ configs });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/admin/config/:key ───────────────────────────────────────────────

const updateConfigSchema = z.object({
  value: z.unknown(),
  description: z.string().optional(),
});

router.patch(
  "/config/:key",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const key = req.params["key"];
      if (!key) {
        res.status(400).json({ error: "Config key is required." });
        return;
      }

      const body = updateConfigSchema.parse(req.body);

      const existing = await SystemConfig.findOne({ key }).lean();
      if (!existing) {
        res.status(404).json({ error: `Config key '${key}' not found.` });
        return;
      }

      const updated = await SystemConfig.findOneAndUpdate(
        { key },
        {
          $set: {
            value: body.value,
            ...(body.description ? { description: body.description } : {}),
          },
        },
        { new: true },
      );

      logAudit(req, "update_config", undefined, {
        key,
        oldValue: existing.value,
        newValue: body.value,
      });

      res.json({ config: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/admin/profile ─────────────────────────────────────────────────────

router.get(
  "/profile",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const admin = await User.findById(req.userId!)
        .select("-password")
        .lean();
      if (!admin) {
        res.status(404).json({ error: "Admin profile not found." });
        return;
      }
      res.json({ admin });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/admin/profile ───────────────────────────────────────────────────

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(12, "New password must be at least 12 characters")
    .optional(),
});

router.patch(
  "/profile",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = updateProfileSchema.parse(req.body);

      const admin = await User.findById(req.userId!);
      if (!admin) {
        res.status(404).json({ error: "Admin not found." });
        return;
      }

      if (body.name) admin.name = body.name;
      if (body.email) admin.email = body.email;

      if (body.newPassword) {
        if (!body.currentPassword) {
          res
            .status(400)
            .json({ error: "Current password required to set a new password." });
          return;
        }
        const valid = await admin.comparePassword(body.currentPassword);
        if (!valid) {
          res.status(401).json({ error: "Current password is incorrect." });
          return;
        }
        admin.password = body.newPassword; // pre-save hook hashes it
      }

      await admin.save();

      logAudit(req, "update_profile", req.userId, {
        fields: Object.keys(body).filter((k) => k !== "currentPassword"),
      });

      const result = admin.toJSON();
      res.json({ admin: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/admin/setup ──────────────────────────────────────────────────────
// One-time setup endpoint. Does NOT require requireAdmin (admin can't log in yet).
// Override the requireAdmin middleware by injecting this BEFORE the middleware check.

const setupSchema = z.object({
  setupToken: z.string().min(1),
  email: z.string().email("Valid email is required"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters"),
  name: z.string().trim().min(1).max(100).optional(),
});

// NOTE: This route is registered on the admin router but we need it accessible
// without requireAdmin. We'll export a separate setup handler and register it
// before the requireAdmin middleware at the router level. Since router.use() above
// applies requireAdmin to all routes, we handle this via a separate export.
// For now we keep it here with a note — the actual un-guarded route is registered
// in the setup sub-router at the bottom of this file.

// ── Token Requests (moved from tokenUsage.ts — #41) ───────────────────────────

// ── GET /api/admin/token-requests ─────────────────────────────────────────────

router.get(
  "/token-requests",
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const status = req.query["status"] as string | undefined;
      const filter: Record<string, string> = {};
      if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter["status"] = status;
      }

      const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query["limit"] as string) || 20),
      );
      const skip = (page - 1) * limit;

      const [requests, total] = await Promise.all([
        TokenRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate<{
            userId: {
              _id: string;
              email: string;
              name: string;
              tokensUsed: number;
              tokenLimit: number | null;
            };
          }>("userId", "email name tokensUsed tokenLimit")
          .select("-__v")
          .lean(),
        TokenRequest.countDocuments(filter),
      ]);

      res.json({ requests, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /api/admin/token-requests/:id ───────────────────────────────────────

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
  "/token-requests/:id",
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
        res.status(409).json({ error: `Request already ${tokenReq.status}.` });
        return;
      }

      if (body.action === "approve") {
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

      // Audit log
      logAudit(
        req,
        body.action === "approve"
          ? "approve_token_request"
          : "reject_token_request",
        tokenReq.userId as unknown as string,
        {
          requestId: tokenReq._id,
          action: body.action,
          ...(body.action === "approve" ? { newLimit: body.newLimit } : {}),
          ...(body.adminNote ? { adminNote: body.adminNote } : {}),
        },
      );

      res.json({
        message:
          body.action === "approve"
            ? `Request approved. User limit updated to ${body.newLimit!.toLocaleString()} tokens.`
            : "Request rejected.",
        request: tokenReq.toObject(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

// ── Separate un-guarded setup router ─────────────────────────────────────────
// The /api/admin/setup route must be accessible BEFORE the admin has credentials,
// so it bypasses requireAdmin. We export it as a separate router and register it
// on a different path in index.ts.

export const adminSetupRouter = Router();

adminSetupRouter.post(
  "/",
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = setupSchema.parse(req.body);

      // Look up the stored setup token
      const storedConfig = await SystemConfig.findOne({
        key: ADMIN_CONFIG_KEYS.SETUP_TOKEN,
      }).lean();

      if (!storedConfig) {
        res.status(400).json({
          error:
            "Setup is already complete or setup token has been consumed. Please log in.",
        });
        return;
      }

      if (storedConfig.value !== body.setupToken) {
        res.status(401).json({ error: "Invalid setup token." });
        return;
      }

      // Update the admin's email + password
      const admin = await User.findOne({ role: "admin", requiresSetup: true });
      if (!admin) {
        res.status(400).json({
          error: "No admin account pending setup.",
        });
        return;
      }

      admin.email = body.email;
      admin.password = body.password; // hashed by pre-save hook
      admin.requiresSetup = false;
      if (body.name) admin.name = body.name;
      await admin.save();

      // Consume (delete) the setup token so it can't be reused
      await SystemConfig.deleteOne({ key: ADMIN_CONFIG_KEYS.SETUP_TOKEN });

      console.log(
        `[adminSeed] Admin setup complete for ${body.email}. Setup token consumed.`,
      );

      res.json({
        message:
          "Admin setup complete. You can now log in at /login with your new credentials.",
        email: body.email,
      });
    } catch (err) {
      next(err);
    }
  },
);
