import "./config/env"; // Validate env vars — .env loaded via nodemon --require ../../load-env.cjs
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { connectDB } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import { createSwaggerRouter } from "./swagger/setup";

// Routes
import authRoutes from "./routes/auth";
import personaRoutes from "./routes/persona";
import onboardingRoutes from "./routes/onboarding";
import trendsRoutes from "./routes/trends";
import suggestionsRoutes from "./routes/suggestions";
import personaChatRoutes from "./routes/personaChat";
import tokenUsageRoutes from "./routes/tokenUsage";

// Services
import { seedDefaultTokenLimit } from "./services/tokenUsage";
import { getHealthStatus } from "./services/healthCheck";

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ─────────────────────────────────────────────────────────────────────
// Explicit allowlist — never reflect arbitrary request origins (CSRF risk)
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl (no Origin header) in non-production
      if (!origin) {
        return callback(null, process.env.NODE_ENV !== "production");
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  }),
);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Auth-specific limiters live in routes/auth.ts (per endpoint).
// General API limiter covers all /api/* routes.
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.path.startsWith("/docs"), // skip Swagger UI
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Health Check ─────────────────────────────────────────────────────────────
// Returns detailed degradation status — no auth required (used by monitoring)
app.get("/api/health", async (_req, res) => {
  try {
    const report = await getHealthStatus();
    const httpStatus = report.status === "down" ? 503 : 200;
    res.status(httpStatus).json({
      ...report,
      docs: `http://localhost:${PORT}/api/docs`,
    });
  } catch {
    res
      .status(500)
      .json({ status: "down", timestamp: new Date().toISOString() });
  }
});

// ── API Routes ────────────────────────────────────────────────────────────────
// General limiter applied first (covers all /api/* routes)
app.use("/api", generalApiLimiter);

// Auth routes with per-endpoint limiters applied in auth.ts (mounted here)
app.use("/api/auth", authRoutes);
app.use("/api/persona", personaRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/trends", trendsRoutes);
app.use("/api/suggestions", suggestionsRoutes);
app.use("/api/persona-chat", personaChatRoutes);
app.use("/api/tokens", tokenUsageRoutes);

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use("/api/docs", createSwaggerRouter());

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await seedDefaultTokenLimit();
  app.listen(PORT, () => {
    console.log(`[api] Server running on  http://localhost:${PORT}`);
    console.log(`[api] Health check:      http://localhost:${PORT}/api/health`);
    console.log(`[api] Swagger UI:        http://localhost:${PORT}/api/docs`);
    console.log(
      `[api] OpenAPI JSON:      http://localhost:${PORT}/api/docs/openapi.json`,
    );
  });
}

start().catch((err) => {
  console.error("[api] Failed to start:", err);
  process.exit(1);
});

export default app;
