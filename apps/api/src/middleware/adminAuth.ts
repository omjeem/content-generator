import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { User } from "../models/User";

/**
 * Middleware that requires the authenticated user to have role='admin'.
 * Must be used AFTER the standard `authenticate` middleware.
 *
 * Flow: authenticate → requireAdmin → route handler
 *
 * Usage:
 *   router.use(authenticate, requireAdmin);
 *   // or on individual routes:
 *   router.get('/protected', authenticate, requireAdmin, handler);
 */
export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await User.findById(req.userId).select("role").lean();

    if (!user || (user as { role?: string }).role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Authorization check failed." });
  }
}
