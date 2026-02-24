import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { User } from "../models/User";
import { RefreshToken } from "../models/RefreshToken";
import { authenticate, AuthRequest } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();

// ── Per-endpoint Rate Limiters ────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please wait a minute and try again.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // generous — silent background refreshes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts. Please try again later." },
});

// ── Token configuration ──────────────────────────────────────────────────────
// Access token: short-lived (15 min) — minimises exposure window if leaked
// Refresh token: long-lived (30 days) — stored in httpOnly cookie + DB
//
// On every /refresh call, the old refresh token is rotated (deleted + new issued)
// to prevent replay attacks.

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

// ── Cookie SameSite strategy ──────────────────────────────────────────────────
// The frontend proxies all /api/* calls through Next.js rewrites, so the browser
// sends requests to its own domain (same-origin). The cookie is therefore set and
// read on that same domain — no cross-origin issue.
//
// We use sameSite:"none" + secure:true in production so the cookie is also
// forwarded correctly when Next.js makes the server-side proxy request to the
// Express API (which may be on a different internal host).
const isProduction = process.env.NODE_ENV === "production";

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  maxAge: 15 * 60 * 1000, // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: "/api/auth", // only sent to auth routes (reduces exposure surface)
};

function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

/** Generate a cryptographically random opaque refresh token and store its hash in DB. */
async function issueRefreshToken(
  userId: string,
  ip?: string,
  userAgent?: string,
): Promise<string> {
  const raw = crypto.randomBytes(40).toString("hex"); // 80-char hex token
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await RefreshToken.create({
    userId,
    tokenHash: hash,
    expiresAt,
    ip,
    userAgent,
  });
  return raw;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

// ── POST /api/auth/register ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 */
router.post(
  "/register",
  registerLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = registerSchema.parse(req.body);

      const existing = await User.findOne({ email: body.email });
      if (existing) {
        res
          .status(409)
          .json({ error: "An account with this email already exists." });
        return;
      }

      const user = await User.create(body);
      const token = signAccessToken(String(user._id), user.email);
      const refreshRaw = await issueRefreshToken(
        String(user._id),
        req.ip ?? undefined,
        req.headers["user-agent"] ?? undefined,
      );

      res.cookie("token", token, ACCESS_COOKIE_OPTIONS);
      res.cookie("refreshToken", refreshRaw, REFRESH_COOKIE_OPTIONS);
      res.status(201).json({
        message: "Account created successfully",
        user: { id: user._id, email: user.email, name: user.name },
        token,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post(
  "/login",
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);

      const user = await User.findOne({ email: body.email }).select(
        "+password",
      );
      if (!user) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const isMatch = await user.comparePassword(body.password);
      if (!isMatch) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      const token = signAccessToken(String(user._id), user.email);
      const refreshRaw = await issueRefreshToken(
        String(user._id),
        req.ip ?? undefined,
        req.headers["user-agent"] ?? undefined,
      );

      res.cookie("token", token, ACCESS_COOKIE_OPTIONS);
      res.cookie("refreshToken", refreshRaw, REFRESH_COOKIE_OPTIONS);
      res.json({
        message: "Login successful",
        user: { id: user._id, email: user.email, name: user.name },
        token,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/logout ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (clears auth cookie)
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post("/logout", async (req: Request, res: Response) => {
  // Revoke the refresh token if present
  const refreshRaw = req.cookies?.refreshToken as string | undefined;
  if (refreshRaw) {
    try {
      const hash = crypto.createHash("sha256").update(refreshRaw).digest("hex");
      await RefreshToken.deleteOne({ tokenHash: hash });
    } catch {
      // Non-fatal — cookie will expire naturally via TTL index
    }
  }

  res.clearCookie("token");
  res.clearCookie("refreshToken", { path: "/api/auth" });
  res.json({ message: "Logged out successfully" });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/me",
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
      }
      res.json({ user: { id: user._id, email: user.email, name: user.name } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and issue a new access token
 *     description: |
 *       Accepts the httpOnly `refreshToken` cookie. Validates it against the DB,
 *       deletes it (rotation), issues a fresh refresh token + access token pair.
 *       Returns the new access token in both the response body and a cookie.
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Missing, invalid, or expired refresh token
 */
router.post(
  "/refresh",
  refreshLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshRaw = req.cookies?.refreshToken as string | undefined;
      if (!refreshRaw) {
        res.status(401).json({ error: "No refresh token provided." });
        return;
      }

      // Hash the raw token and look it up
      const hash = crypto.createHash("sha256").update(refreshRaw).digest("hex");
      const storedToken = await RefreshToken.findOne({ tokenHash: hash });

      if (!storedToken) {
        // Token not found — could be replay attack or already rotated
        res.status(401).json({ error: "Invalid or expired refresh token." });
        return;
      }

      if (storedToken.expiresAt < new Date()) {
        // Expired (TTL index may not have cleaned it yet)
        await storedToken.deleteOne();
        res
          .status(401)
          .json({ error: "Refresh token has expired. Please log in again." });
        return;
      }

      // Look up the user
      const user = await User.findById(storedToken.userId);
      if (!user) {
        await storedToken.deleteOne();
        res.status(401).json({ error: "User not found." });
        return;
      }

      // ── Rotate: delete old token, issue new pair ──────────────────────────
      await storedToken.deleteOne();

      const newAccessToken = signAccessToken(String(user._id), user.email);
      const newRefreshRaw = await issueRefreshToken(
        String(user._id),
        req.ip ?? undefined,
        req.headers["user-agent"] ?? undefined,
      );

      res.cookie("token", newAccessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie("refreshToken", newRefreshRaw, REFRESH_COOKIE_OPTIONS);
      res.json({
        message: "Token refreshed successfully",
        token: newAccessToken,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
