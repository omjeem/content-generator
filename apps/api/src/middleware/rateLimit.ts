/**
 * Rate Limiting Middleware — Phase 4 #11
 *
 * Three limiters keyed by authenticated userId:
 *   generationLimiter — 5 req/min  (content generation endpoints)
 *   chatLimiter       — 20 req/min (chat/refine endpoints)
 *   aiCheckLimiter    — 10 req/min (AI detection + humanization)
 */

import rateLimit from "express-rate-limit";
import type { AuthRequest } from "./auth";

const keyGenerator = (req: AuthRequest): string => req.userId ?? req.ip ?? "anon";

/** 5 requests per minute — content generation endpoints */
export const generationLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many generation requests. Please wait a minute before trying again." },
});

/** 20 requests per minute — chat and refine-context endpoints */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please slow down." },
});

/** 10 requests per minute — AI detection and humanization */
export const aiCheckLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI check requests. Please wait a moment." },
});
