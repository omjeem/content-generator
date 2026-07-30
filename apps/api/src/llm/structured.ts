/**
 * Structured-output helpers — ONE path for every JSON-producing model call.
 *
 * No AI-SDK structured output, no `generateObject`, no response schema handed to
 * the provider: models that do not implement schema-constrained decoding fail
 * hard and unpredictably when you do that (the classic
 * `Expected object, received string` at the root). Instead, structure is
 * enforced in three cheap layers, each one designed to avoid a model call:
 *
 *   1. TRANSPORT — the provider's native JSON mode (`getJsonModel()`), which
 *      constrains the decoder to emit syntactically valid JSON. Costs nothing,
 *      catches almost everything.
 *   2. PROMPT    — every JSON agent appends `JSON_OUTPUT_RULE`, so the shape is
 *      described in words rather than as a machine schema.
 *   3. LOCAL     — `extractJSON()` unwraps fences/reasoning/double-encoding and
 *      repairs or salvages malformed or truncated JSON in-process, then an
 *      optional `normalize` hook coerces near-misses (extra array entries,
 *      missing optional fields) before Zod validation.
 *
 * Only if all three fail does a FOURTH layer run: exactly one schema-free
 * "repair" model call. In practice that is now rare — which is the point, since
 * the repair round-trip was what pushed slow local models past the step timeout.
 *
 * Call sites use `generateJSON()` (plain prompt) or `generateAgentJSON()`
 * (Mastra agent). Neither ever needs its own parse/retry logic.
 */

import { generateText } from "ai";
import type { z } from "zod";
import { env } from "../config/env";
import {
  disableJsonMode,
  getJsonModel,
  getModel,
  isJsonModeActive,
  isJsonModeRejection,
} from "./provider";
import { extractJSON } from "../utils/extractJSON";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Appended to every JSON agent's instructions. Kept short on purpose — with
 * native JSON mode on, this is a hint, not the enforcement mechanism.
 */
export const JSON_OUTPUT_RULE = `OUTPUT FORMAT — STRICT:
- Reply with ONE valid JSON value and NOTHING else.
- No markdown, no code fences, no commentary, no explanation before or after.
- Do not wrap the JSON in quotes and do not escape it as a string.
- Use double quotes for all keys and string values. No trailing commas, no comments.
- Keep string values on a single line and escape any inner quotes.
- If you are unsure about a value, use a sensible default rather than omitting the key.`;

export interface ParseJsonOptions {
  /** Label used in logs and error messages. */
  context?: string;
  /**
   * Coerce the parsed value before Zod validation — drop invalid array items,
   * trim over-long arrays, fill defaults. Turns "almost right" output into a
   * pass instead of a full regeneration.
   */
  normalize?: (value: unknown) => unknown;
  /** Allow the single model-driven repair call. Defaults to LLM_JSON_REPAIR. */
  allowRepair?: boolean;
  abortSignal?: AbortSignal;
}

/** Max characters of raw text sent into a repair call — keeps it fast. */
const REPAIR_INPUT_LIMIT = 24_000;

// ── Parse ────────────────────────────────────────────────────────────────────

/**
 * Extract + validate JSON from raw LLM text, repairing locally first and falling
 * back to at most ONE model repair call.
 *
 * @throws if the output cannot be coerced into the schema even after repair.
 */
export async function parseLLMJson<S extends z.ZodTypeAny>(
  rawText: string,
  schema: S,
  optionsOrContext: string | ParseJsonOptions = {},
): Promise<z.infer<S>> {
  const options: ParseJsonOptions =
    typeof optionsOrContext === "string"
      ? { context: optionsOrContext }
      : optionsOrContext;

  const context = options.context ?? "LLM response";
  const allowRepair = options.allowRepair ?? env.LLM_JSON_REPAIR === "on";

  // ── Layer 3: local extraction + normalisation + validation ────────────────
  const local = validateLocally(rawText, schema, options.normalize);
  if (local.ok) return local.data;

  if (!allowRepair || options.abortSignal?.aborted || !rawText.trim()) {
    throw new Error(`[structured] ${context}: ${local.reason}`);
  }

  // ── Layer 4: one schema-free repair call ──────────────────────────────────
  console.warn(
    `[structured] ${context}: local parse failed — attempting one repair call. Reason: ${local.reason}`,
  );

  const repaired = await repairJSON(rawText, local.reason, context, {
    abortSignal: options.abortSignal,
  });

  const second = validateLocally(repaired, schema, options.normalize);
  if (second.ok) {
    console.log(`[structured] ${context}: repair call succeeded.`);
    return second.data;
  }

  throw new Error(
    `[structured] ${context}: unusable output after repair. ${second.reason}`,
  );
}

type LocalResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

function validateLocally<S extends z.ZodTypeAny>(
  rawText: string,
  schema: S,
  normalize?: (value: unknown) => unknown,
): LocalResult<z.infer<S>> {
  let value: unknown;
  try {
    value = extractJSON(rawText, "model output");
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (normalize) {
    try {
      value = normalize(value);
    } catch (err) {
      console.warn(
        "[structured] normalize hook threw — validating raw value instead:",
        (err as Error).message,
      );
    }
  }

  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, reason: describeIssues(result.error) };
}

/** Compact, model-readable summary of Zod issues (paths + messages). */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// ── Repair ───────────────────────────────────────────────────────────────────

/**
 * Schema-free repair call: hands the model its own malformed text plus the
 * validation error and asks for corrected JSON. Provider-agnostic — it needs no
 * structured-output support, only JSON mode (when available).
 */
export async function repairJSON(
  rawText: string,
  reason: string,
  context = "LLM response",
  opts: { abortSignal?: AbortSignal } = {},
): Promise<string> {
  const input =
    rawText.length > REPAIR_INPUT_LIMIT
      ? rawText.slice(0, REPAIR_INPUT_LIMIT)
      : rawText;

  const prompt = `The text below was supposed to be a single valid JSON value but it is malformed, truncated, wrapped in prose, or missing required fields.

Problem: ${reason}

Return ONLY the corrected JSON value — no markdown, no code fences, no commentary.
Preserve all of the original data. Fix structural problems (quotes, commas, brackets, escaping), strip any non-JSON text, and add any missing required fields using sensible values derived from the content that is already there. If the text is cut off, complete it minimally or drop the incomplete trailing element.

TEXT TO REPAIR:
${input}`;

  const { text } = await callModel({ prompt, abortSignal: opts.abortSignal });
  return text;
}

// ── Generation ───────────────────────────────────────────────────────────────

interface ModelCallOptions {
  prompt?: string;
  system?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}

/**
 * Single `generateText` wrapper for JSON calls. Uses the JSON-mode model and,
 * if the provider rejects that flag, disables JSON mode process-wide and retries
 * once in plain text mode (local parsing still applies).
 */
async function callModel(
  opts: ModelCallOptions,
): Promise<{ text: string; usage: LLMUsage }> {
  const run = async (model: ReturnType<typeof getModel>) => {
    const result = await generateText({
      model,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.messages
        ? { messages: opts.messages }
        : { prompt: opts.prompt ?? "" }),
      ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    });
    return {
      text: result.text ?? "",
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
    };
  };

  try {
    return await run(getJsonModel());
  } catch (err) {
    if (isJsonModeActive() && isJsonModeRejection(err)) {
      disableJsonMode((err as Error).message);
      return run(getModel());
    }
    throw err;
  }
}

/**
 * One-shot structured generation for plain (non-agent) call sites: calls the
 * model in JSON mode and validates the output against a schema.
 */
export async function generateJSON<S extends z.ZodTypeAny>(opts: {
  schema: S;
  prompt?: string;
  system?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  context?: string;
  normalize?: (value: unknown) => unknown;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
  /** Fires as soon as usage is known — before parsing can throw. */
  onUsage?: (usage: LLMUsage) => void;
}): Promise<{ data: z.infer<S>; usage: LLMUsage }> {
  const { text, usage } = await callModel(opts);
  opts.onUsage?.(usage);

  const data = await parseLLMJson(text, opts.schema, {
    ...(opts.context ? { context: opts.context } : {}),
    ...(opts.normalize ? { normalize: opts.normalize } : {}),
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  return { data, usage };
}

/** Backwards-compatible alias — `generateJSON` is the preferred name. */
export const generateStructured = generateJSON;

// ── Mastra agents ────────────────────────────────────────────────────────────

/** Minimal shape of a Mastra agent, so this module stays framework-agnostic. */
interface TextGeneratingAgent {
  generate(
    prompt: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<{
    text?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}

/**
 * The agent-side twin of `generateJSON`: runs a Mastra agent and returns parsed,
 * schema-valid JSON. Agents that use this MUST be declared with
 * `model: () => getJsonModel()` so JSON mode (and the runtime kill-switch)
 * applies to their calls too.
 */
export async function generateAgentJSON<S extends z.ZodTypeAny>(
  agent: TextGeneratingAgent,
  prompt: string,
  schema: S,
  opts: {
    context?: string;
    normalize?: (value: unknown) => unknown;
    abortSignal?: AbortSignal;
    allowRepair?: boolean;
    /**
     * Fires as soon as usage is known — before parsing can throw — so callers
     * that fall back on a parse failure still bill the tokens they spent.
     */
    onUsage?: (usage: LLMUsage) => void;
  } = {},
): Promise<{ data: z.infer<S>; usage: LLMUsage; text: string }> {
  let result;
  try {
    result = await agent.generate(prompt, {
      ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
    });
  } catch (err) {
    // The agent resolves its model lazily, so disabling JSON mode and retrying
    // is enough to recover from a provider that rejects the flag.
    if (isJsonModeActive() && isJsonModeRejection(err)) {
      disableJsonMode((err as Error).message);
      result = await agent.generate(prompt, {
        ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
      });
    } else {
      throw err;
    }
  }

  const text = result.text ?? "";
  const usage = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
  opts.onUsage?.(usage);

  const data = await parseLLMJson(text, schema, {
    ...(opts.context ? { context: opts.context } : {}),
    ...(opts.normalize ? { normalize: opts.normalize } : {}),
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
    ...(opts.allowRepair !== undefined ? { allowRepair: opts.allowRepair } : {}),
  });

  return { data, usage, text };
}
