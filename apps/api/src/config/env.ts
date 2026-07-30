import { z } from "zod";

const envSchema = z
  .object({
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),

    // ── LLM provider selection (single source of truth) ──────────────────────
    // Switch the entire app between model providers by changing ONE variable.
    //   MODEL_PROVIDER=gemini → Google Gemini via @ai-sdk/google
    //   MODEL_PROVIDER=ollama → Ollama Cloud (or self-hosted) via OpenAI-compatible API
    // The matching API key + model name below are picked up automatically.
    MODEL_PROVIDER: z.enum(["gemini", "ollama"]).default("gemini"),

    // ── Gemini ────────────────────────────────────────────────────────────────
    // GEMINI_API_KEY is the canonical name; GOOGLE_GENERATIVE_AI_API_KEY is
    // accepted as an alias for backwards compatibility.
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

    // ── Ollama (Cloud or self-hosted) ────────────────────────────────────────
    // Ollama exposes an OpenAI-compatible endpoint. For Ollama Cloud use
    // https://ollama.com/v1 + an API key; for a local server use
    // http://localhost:11434/v1 (no key required).
    OLLAMA_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().default("https://ollama.com/v1"),
    OLLAMA_MODEL: z.string().default("gpt-oss:120b"),

    // Reasoning budget for reasoning models (gpt-oss, deepseek-r1, …). The
    // agents do extraction/formatting work, so "low" cuts latency sharply with
    // no quality loss. Use "default" to send nothing and let the model decide.
    OLLAMA_REASONING_EFFORT: z
      .enum(["low", "medium", "high", "default"])
      .default("low"),

    // ── Structured output ────────────────────────────────────────────────────
    // "on"  → JSON-producing calls use the provider's native JSON mode
    //         (Ollama response_format=json_object / Gemini responseMimeType),
    //         which makes malformed JSON — and the repair call it costs —
    //         effectively impossible.
    // "off" → prompt-level JSON only; the local parser + repair pass handles it.
    LLM_JSON_MODE: z.enum(["on", "off"]).default("on"),

    // Allow ONE model-driven repair call when local parsing/validation fails.
    // Set to "off" to never spend a second call (the pipeline retries instead).
    LLM_JSON_REPAIR: z.enum(["on", "off"]).default("on"),

    // Multiplier applied to every pipeline step timeout. Local/large Ollama
    // models are far slower than Gemini, so the default scales automatically —
    // set this only to override.
    LLM_TIMEOUT_SCALE: z.coerce.number().positive().optional(),

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
  })
  .superRefine((data, ctx) => {
    // Provider-specific credential checks — only the active provider is enforced.
    if (data.MODEL_PROVIDER === "gemini") {
      if (!data.GEMINI_API_KEY && !data.GOOGLE_GENERATIVE_AI_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GEMINI_API_KEY"],
          message:
            "GEMINI_API_KEY is required when MODEL_PROVIDER=gemini (get one free at https://ai.google.dev)",
        });
      }
    } else if (data.MODEL_PROVIDER === "ollama") {
      const isLocal =
        data.OLLAMA_BASE_URL.includes("localhost") ||
        data.OLLAMA_BASE_URL.includes("127.0.0.1");
      if (!data.OLLAMA_API_KEY && !isLocal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OLLAMA_API_KEY"],
          message:
            "OLLAMA_API_KEY is required when MODEL_PROVIDER=ollama (get one at https://ollama.com/settings/keys), unless OLLAMA_BASE_URL points at a local server",
        });
      }
    }
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
