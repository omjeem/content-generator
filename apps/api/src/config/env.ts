import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),

  // ── Ports & URLs (single source of truth) ────────────────────────────────
  // To change the API port: update PORT in the root .env file.
  // To change the frontend origin: update FRONTEND_URL in the root .env file.
  // All runtime code reads from these — nothing is hardcoded elsewhere.

  /** Port the Express API server listens on. */
  PORT: z.string().default("5006"),

  /** Origin the Next.js frontend is served from — used for CORS allowlist. */
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  /** Full API base URL — used by the Next.js build (NEXT_PUBLIC_ prefix). */
  NEXT_PUBLIC_API_URL: z.string().optional(),

  // Optional — fallback for trend research
  TAVILY_API_KEY: z.string().optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    });
    console.error(
      "\nCopy .env.example to .env and fill in the required values.",
    );
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
