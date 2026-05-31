/**
 * Structured-output helpers — provider-agnostic JSON extraction with repair.
 *
 * Not every model supports native structured output (response schemas / JSON
 * mode), and some ignore output-format hints entirely. To stay portable across
 * Gemini, Ollama Cloud, and any future provider, structure is requested at the
 * PROMPT level (each agent instructs "return ONLY JSON") and enforced here:
 *
 *   1. Extract the JSON from the raw text and validate it against a Zod schema.
 *   2. If that fails, make ONE generic "repair" call asking the model to fix the
 *      malformed text into valid JSON, then validate again.
 *   3. If it still fails, throw — callers decide whether to retry or fall back.
 *
 * This is the single reusable path every agent/service uses for JSON output, so
 * the parse-validate-repair logic is never duplicated.
 */

import { generateText } from "ai";
import type { z } from "zod";
import { getModel } from "./provider";
import { extractJSON } from "../utils/extractJSON";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Extract + validate JSON from raw LLM text against a Zod schema, with an
 * automatic model-driven repair pass on failure.
 *
 * @throws if the output cannot be coerced into the schema even after repair.
 */
export async function parseLLMJson<S extends z.ZodTypeAny>(
  rawText: string,
  schema: S,
  context = "LLM response",
): Promise<z.infer<S>> {
  // Attempt 1 — direct extraction + schema validation.
  try {
    return schema.parse(extractJSON(rawText, context));
  } catch (firstErr) {
    const reason =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(
      `[structured] ${context}: parse failed — attempting JSON repair. Reason: ${reason}`,
    );

    // Attempt 2 — repair the text via a generic model call, then re-validate.
    const repaired = await repairJSON(rawText, reason, context);
    return schema.parse(extractJSON(repaired, `${context} (repaired)`));
  }
}

/**
 * Generic, schema-free model call that coerces malformed text into valid JSON.
 * Works with any provider — it asks for plain JSON text, no structured-output
 * features required.
 */
export async function repairJSON(
  rawText: string,
  reason: string,
  context = "LLM response",
): Promise<string> {
  const prompt = `The text below was supposed to be a single valid JSON value but it is malformed, truncated, or wrapped in extra prose.

Validation error: ${reason}

Repair it and return ONLY the corrected JSON value — no markdown, no code fences, no commentary.
Preserve all of the original data; fix only structural issues (missing/extra quotes, commas, brackets, escaping) and strip any non-JSON text.

TEXT TO REPAIR:
${rawText}`;

  const { text } = await generateText({ model: getModel(), prompt });
  return text ?? "";
}

/**
 * One-shot structured generation: call the model and parse its output against a
 * schema (with repair). Use this for plain `generateText`-style call sites that
 * expect JSON. Mastra `Agent` callers can use `parseLLMJson` directly on the
 * agent's text output instead.
 */
export async function generateStructured<S extends z.ZodTypeAny>(opts: {
  schema: S;
  prompt?: string;
  system?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  context?: string;
}): Promise<{ data: z.infer<S>; usage: LLMUsage }> {
  const { text, usage } = await generateText({
    model: getModel(),
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.messages
      ? { messages: opts.messages }
      : { prompt: opts.prompt ?? "" }),
  });

  const data = await parseLLMJson(text ?? "", opts.schema, opts.context);
  return {
    data,
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    },
  };
}
