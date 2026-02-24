import { env } from "./config/env"; // Validate env vars — .env loaded via nodemon --require ../../load-env.cjs
import express, { type Request, type Response, type NextFunction } from "express";
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
// Single source of truth: PORT and FRONTEND_URL come from env (validated in config/env.ts).
// To change the API port → edit PORT in .env
// To change the allowed frontend origin → edit FRONTEND_URL in .env
const PORT = env.PORT;

// ── Trust Proxy ───────────────────────────────────────────────────────────────
// REQUIRED when the server runs behind a reverse proxy (Nginx, AWS ALB, Railway,
// Render, Fly.io, etc.) that sets the X-Forwarded-For header.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// and cannot determine the real client IP.
// '1' means trust the first hop (the immediate proxy) — correct for most setups.
app.set("trust proxy", 1);

// ── CORS ─────────────────────────────────────────────────────────────────────
// credentials:true + wildcard '*' is rejected by all browsers — we must echo
// back the exact requesting origin instead. This allows any origin while still
// supporting cookies/Authorization headers from the browser.
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl requests (no Origin header)
      if (!origin) return callback(null, true);
      // Echo back whatever origin the browser sent — allows all origins
      // while staying compatible with credentials:true
      return callback(null, origin);
    },
    credentials: true,
    // Expose headers needed by the frontend
    exposedHeaders: ["Set-Cookie"],
  })
);

// ── Body parsing & cookies ────────────────────────────────────────────────────
// Must come BEFORE routes so req.body and req.cookies are populated.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Request timeout middleware ────────────────────────────────────────────────
// Prevents the Next.js rewrite proxy (or any upstream load balancer) from killing
// long-running AI requests mid-flight by ensuring Express always sends a response
// before the proxy's own timeout fires.
//
// AI pipeline (steps 3+4: trend research + content generation) can take 30–90s.
// Without an explicit timeout the connection is held open until the proxy's
// default timeout (~60s on most platforms) drops it — producing a 500 "Internal
// Server Error" on the browser even though the backend finished successfully.
//
// Timeout values (conservative — AI generation can be slow):
//   AI endpoints  (/generate, /persona/analyze, /onboarding/chat, /persona-chat/chat): 180 s
//   Everything else: 30 s
function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          error: "Request timed out. The AI pipeline took too long. Please try again.",
        });
      }
    }, ms);

    // Clear the timer once the response is finished (success or error)
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}

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

// Long timeout (180 s) for AI-heavy endpoints that run multi-step LLM pipelines.
// Must be registered BEFORE the route handlers so it fires first.
const AI_TIMEOUT_MS = 180_000; // 3 minutes — well beyond any LLM pipeline duration
const DEFAULT_TIMEOUT_MS = 180_000; // 30 s for all other routes

app.use("/api/suggestions/generate", requestTimeout(AI_TIMEOUT_MS));
app.use("/api/persona/analyze", requestTimeout(AI_TIMEOUT_MS));
app.use("/api/onboarding/chat", requestTimeout(AI_TIMEOUT_MS));
app.use("/api/persona-chat/chat", requestTimeout(AI_TIMEOUT_MS));
// All other routes get the short timeout
app.use("/api", requestTimeout(DEFAULT_TIMEOUT_MS));

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
