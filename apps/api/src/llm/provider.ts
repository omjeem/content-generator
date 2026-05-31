/**
 * LLM Provider Factory — single source of truth for the model used everywhere.
 *
 * The whole application is provider-agnostic: every agent and service obtains
 * its model exclusively through `getModel()`. Switching providers is a pure
 * configuration change in `.env` — no code edits required:
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
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../config/env";

export type ModelProvider = "gemini" | "ollama";

// Concrete model types are inferred from the SDK factories (not the abstract
// `LanguageModelV2` interface) so they stay structurally compatible with both
// Mastra `Agent` definitions and AI-SDK `generateText()` across provider versions.
type ProviderModel = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

let cachedModel: ProviderModel | null = null;

function buildModel(): ProviderModel {
  if (env.MODEL_PROVIDER === "ollama") {
    const ollama = createOpenAICompatible({
      name: "ollama",
      baseURL: env.OLLAMA_BASE_URL,
      // A local Ollama server needs no key; Ollama Cloud does.
      ...(env.OLLAMA_API_KEY ? { apiKey: env.OLLAMA_API_KEY } : {}),
    });
    console.log(
      `[llm] Provider=ollama model=${env.OLLAMA_MODEL} baseURL=${env.OLLAMA_BASE_URL}`,
    );
    return ollama(env.OLLAMA_MODEL) as unknown as ProviderModel;
  }

  // Default: Gemini. Accept GEMINI_API_KEY or the GOOGLE_GENERATIVE_AI_API_KEY alias.
  const google = createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  console.log(`[llm] Provider=gemini model=${env.GEMINI_MODEL}`);
  return google(env.GEMINI_MODEL);
}

/** The configured language model. Built once and cached for the process lifetime. */
export function getModel(): ProviderModel {
  if (!cachedModel) cachedModel = buildModel();
  return cachedModel;
}

/** Active provider name — "gemini" | "ollama". */
export function getProviderName(): ModelProvider {
  return env.MODEL_PROVIDER;
}

/** Human-readable id of the active model — used for analytics/generationMeta. */
export function getModelId(): string {
  return env.MODEL_PROVIDER === "ollama" ? env.OLLAMA_MODEL : env.GEMINI_MODEL;
}
