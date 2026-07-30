/**
 * LLM Provider Factory — single source of truth for the model used everywhere.
 *
 * The whole application is provider-agnostic: every agent and service obtains
 * its model exclusively through `getModel()` / `getJsonModel()`. Switching
 * providers is a pure configuration change in `.env` — no code edits required:
 *
 *   MODEL_PROVIDER=gemini   GEMINI_MODEL=gemini-2.5-flash   GEMINI_API_KEY=...
 *   MODEL_PROVIDER=ollama   OLLAMA_MODEL=gpt-oss:120b       OLLAMA_API_KEY=...
 *
 * Both providers return an AI-SDK `LanguageModelV2`, so they are fully
 * interchangeable in Mastra `Agent` definitions and `generateText()` calls.
 *
 * Ollama is reached through its OpenAI-compatible endpoint, which works for
 * Ollama Cloud (https://ollama.com/v1 + API key) and self-hosted servers
 * (http://localhost:11434/v1, no key) alike.
 *
 * ── Two model flavours ──────────────────────────────────────────────────────
 *   getModel()     → free-form text. Used by conversational agents whose replies
 *                    are prose (onboarding, persona chat, post editor).
 *   getJsonModel() → the SAME model with the provider's *native JSON mode*
 *                    switched on at the transport layer. Used by every agent or
 *                    service that parses the reply as JSON.
 *
 * JSON mode is grammar/decoder-level enforcement, NOT a schema handed to the
 * SDK: no `generateObject`, no response schema, no tool-calling. The prompt
 * still describes the shape; the provider merely guarantees the bytes are
 * syntactically valid JSON. That single flag removes nearly all parse failures
 * — and therefore the retry + repair round-trips they used to cost.
 *
 *   Ollama (OpenAI-compatible): response_format = { type: "json_object" }
 *   Gemini:                     generationConfig.responseMimeType = application/json
 *
 * If a model or endpoint rejects the flag, `disableJsonMode()` flips the process
 * back to plain text mode permanently (see llm/structured.ts) so a single 400
 * degrades quality-of-parse rather than breaking generation.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../config/env";

export type ModelProvider = "gemini" | "ollama";

// Concrete model types are inferred from the SDK factories (not the abstract
// `LanguageModelV2` interface) so they stay structurally compatible with both
// Mastra `Agent` definitions and AI-SDK `generateText()` across provider versions.
type ProviderModel = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

const cache = new Map<"text" | "json", ProviderModel>();

/** Runtime kill-switch — set when the provider rejects the JSON-mode flag. */
let jsonModeDisabled = env.LLM_JSON_MODE === "off";

// ── Ollama ────────────────────────────────────────────────────────────────────

function buildOllama(json: boolean): ProviderModel {
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: env.OLLAMA_BASE_URL,
    // A local Ollama server needs no key; Ollama Cloud does.
    ...(env.OLLAMA_API_KEY ? { apiKey: env.OLLAMA_API_KEY } : {}),
    // Body-level flags the AI SDK does not model. `transformRequestBody` runs on
    // EVERY request this provider instance makes — agents included — so there is
    // no per-call-site wiring to forget.
    transformRequestBody: (body) => ({
      ...body,
      // Reasoning models (gpt-oss, deepseek-r1, …) spend most of their latency
      // in the hidden reasoning channel. These are extraction/formatting tasks,
      // so a low budget is both faster and less likely to blow the step timeout.
      ...(env.OLLAMA_REASONING_EFFORT !== "default" && body.reasoning_effort == null
        ? { reasoning_effort: env.OLLAMA_REASONING_EFFORT }
        : {}),
      ...(json && body.response_format == null
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });
  return ollama(env.OLLAMA_MODEL) as unknown as ProviderModel;
}

// ── Gemini ────────────────────────────────────────────────────────────────────

/**
 * Gemini's provider has no request-body hook, so JSON mode is injected through a
 * custom `fetch`: parse the outgoing body, set `responseMimeType`, re-serialise.
 * Anything unexpected is passed through untouched.
 */
const jsonModeFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as {
        generationConfig?: Record<string, unknown>;
      };
      body.generationConfig = {
        ...body.generationConfig,
        responseMimeType: "application/json",
      };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // Not JSON (or not the shape we expect) — send the original body.
    }
  }
  return globalThis.fetch(input, init);
};

function buildGemini(json: boolean): ProviderModel {
  // Accept GEMINI_API_KEY or the GOOGLE_GENERATIVE_AI_API_KEY alias.
  const google = createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY,
    ...(json ? { fetch: jsonModeFetch } : {}),
  });
  return google(env.GEMINI_MODEL);
}

// ── Public API ────────────────────────────────────────────────────────────────

function build(mode: "text" | "json"): ProviderModel {
  const json = mode === "json" && !jsonModeDisabled;
  const model =
    env.MODEL_PROVIDER === "ollama" ? buildOllama(json) : buildGemini(json);

  console.log(
    `[llm] Provider=${env.MODEL_PROVIDER} model=${getModelId()} mode=${mode}` +
      (mode === "json" ? ` nativeJson=${json}` : ""),
  );
  return model;
}

/** The configured language model in free-form text mode. */
export function getModel(): ProviderModel {
  let model = cache.get("text");
  if (!model) {
    model = build("text");
    cache.set("text", model);
  }
  return model;
}

/**
 * The configured language model with the provider's native JSON mode enabled.
 * Every JSON-producing agent and service must use this — it is what keeps the
 * parse-repair path (and its extra model call) from ever being needed.
 *
 * Falls back transparently to the text model once `disableJsonMode()` is called.
 */
export function getJsonModel(): ProviderModel {
  if (jsonModeDisabled) return getModel();
  let model = cache.get("json");
  if (!model) {
    model = build("json");
    cache.set("json", model);
  }
  return model;
}

/** Whether native JSON mode is currently active. */
export function isJsonModeActive(): boolean {
  return !jsonModeDisabled;
}

/**
 * Permanently disable native JSON mode for this process. Called when the
 * provider rejects the flag, so subsequent calls degrade to prompt-level JSON
 * (still parsed + repaired locally) instead of failing outright.
 */
export function disableJsonMode(reason: string): void {
  if (jsonModeDisabled) return;
  jsonModeDisabled = true;
  cache.delete("json");
  console.warn(
    `[llm] Native JSON mode disabled for this process — falling back to prompt-only JSON. Reason: ${reason}`,
  );
}

/**
 * Heuristic: does this provider error look like a rejection of the JSON-mode
 * flag (unsupported `response_format` / `responseMimeType`) rather than a real
 * generation failure?
 */
export function isJsonModeRejection(err: unknown): boolean {
  const message = (
    err instanceof Error ? err.message : String(err ?? "")
  ).toLowerCase();
  return (
    message.includes("response_format") ||
    message.includes("responsemimetype") ||
    message.includes("json_object") ||
    message.includes("json mode")
  );
}

/** Active provider name — "gemini" | "ollama". */
export function getProviderName(): ModelProvider {
  return env.MODEL_PROVIDER;
}

/** Human-readable id of the active model — used for analytics/generationMeta. */
export function getModelId(): string {
  return env.MODEL_PROVIDER === "ollama" ? env.OLLAMA_MODEL : env.GEMINI_MODEL;
}
