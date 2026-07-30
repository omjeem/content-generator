/**
 * extractJSON.ts
 *
 * Turns whatever an LLM actually returned into parsed JSON — locally, with zero
 * extra model calls. Every model call in the app funnels its text through here
 * before schema validation, so each failure mode fixed here is a repair call
 * (and often a whole regeneration) that never happens.
 *
 * Handles:
 *   - Clean JSON                              → direct parse
 *   - Markdown code fences (```json … ```)    → fence unwrap
 *   - Prose before/after the JSON             → balanced brace/bracket scan
 *   - Reasoning-model preambles               → <think>…</think> / harmony
 *                                               <|channel|>…<|message|> strip
 *   - Double-encoded JSON ("{\"a\":1}")       → recursive unwrap
 *   - Trailing commas, comments, single quotes, unquoted keys, Python literals,
 *     smart quotes, raw newlines inside strings → contextual repair pass
 *   - Truncated output (hit the token cap)    → close open brackets, or cut back
 *                                               to the last complete element
 *
 * Returns the parsed value or throws with a diagnostic preview.
 */

export function extractJSON<T = unknown>(
  raw: string,
  context = "LLM response",
): T {
  const text = stripReasoning(raw).trim();

  for (const candidate of buildCandidates(text)) {
    const parsed = tryParseCandidate(candidate);
    if (parsed !== undefined) return unwrapDoubleEncoded(parsed) as T;
  }

  const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;
  throw new Error(
    `[extractJSON] Could not find valid JSON in ${context}.\nPreview: ${preview}`,
  );
}

// ── Step 1: strip reasoning-model scaffolding ────────────────────────────────

/**
 * Reasoning models (gpt-oss, deepseek-r1, qwq…) can leak their thinking channel
 * into the content field. The final answer is always the last channel, so keep
 * that and drop the rest.
 */
function stripReasoning(raw: string): string {
  let text = raw ?? "";

  // Harmony format: <|start|>assistant<|channel|>final<|message|>…<|end|>
  const lastMessage = text.lastIndexOf("<|message|>");
  if (lastMessage !== -1) {
    text = text.slice(lastMessage + "<|message|>".length);
  }
  text = text.replace(/<\|[a-z_]+\|>/g, "");

  // XML-ish thinking tags — both closed and unterminated.
  text = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/^[\s\S]*?<\/(think|thinking|reasoning)>/i, "");

  return text;
}

// ── Step 2: build parse candidates, best-first ───────────────────────────────

function buildCandidates(text: string): string[] {
  const candidates: string[] = [text];

  // Every fenced block (```json … ``` or ``` … ```), including an unterminated
  // final fence — a truncated response often ends mid-block.
  const fenceRe = /```(?:json|javascript)?\s*\n?([\s\S]*?)(?:\n?```|$)/gi;
  for (const match of text.matchAll(fenceRe)) {
    const inner = match[1]?.trim();
    if (inner) candidates.push(inner);
  }

  // Balanced object/array regions embedded in prose.
  candidates.push(...balancedRegions(text));

  // Last resort for truncated output: everything from the first opener to the
  // end of the text, so the salvage pass has something to close.
  const firstOpener = text.search(/[{[]/);
  if (firstOpener !== -1) candidates.push(text.slice(firstOpener));

  // De-duplicate while preserving order.
  return [...new Set(candidates.filter((c) => c.length > 1))];
}

/**
 * Scans for complete `{…}` / `[…]` regions using a balanced-bracket counter.
 * More reliable than a greedy `\{[\s\S]*\}` regex because it stops at the
 * matching closing brace rather than the last one in the document.
 */
function balancedRegions(text: string): string[] {
  const regions: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const opener = text[i];
    if (opener !== "{" && opener !== "[") continue;

    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let j = i; j < text.length; j++) {
      const c = text[j];

      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\" && inString) {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (c === opener) depth++;
      else if (c === closer) {
        depth--;
        if (depth === 0) {
          regions.push(text.slice(i, j + 1));
          i = j; // continue scanning after this region
          break;
        }
      }
    }

    // Only the outermost region matters most of the time — cap the work.
    if (regions.length >= 5) break;
  }

  return regions;
}

// ── Step 3: parse a candidate (direct → repaired → salvaged) ────────────────

function tryParseCandidate(candidate: string): unknown {
  const direct = tryParse(candidate);
  if (direct !== undefined) return direct;

  const repaired = tryParse(repairJsonText(candidate));
  if (repaired !== undefined) return repaired;

  return salvageTruncated(candidate);
}

function tryParse(text: string): unknown {
  try {
    const value = JSON.parse(text) as unknown;
    return value === null ? undefined : value;
  } catch {
    return undefined;
  }
}

/** `"{\"ideas\":[…]}"` — a JSON string whose content is itself JSON. */
function unwrapDoubleEncoded(value: unknown, depth = 0): unknown {
  if (typeof value !== "string" || depth >= 3) return value;
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return value;
  const inner = tryParseCandidate(trimmed);
  return inner === undefined ? value : unwrapDoubleEncoded(inner, depth + 1);
}

// ── Step 4: contextual repair ────────────────────────────────────────────────

/**
 * Single-pass repair that respects string boundaries — it only rewrites syntax
 * OUTSIDE string literals, so post content is never altered.
 *
 * Fixes: // and /* *\/ comments, single-quoted strings, unquoted keys, Python
 * literals (True/False/None), NaN/Infinity, smart quotes, trailing commas, and
 * raw newlines/tabs inside strings.
 */
export function repairJsonText(input: string): string {
  const wordRe = /[A-Za-z_$][\w$-]*/y;
  const parts: string[] = [];
  let inString = false;
  let escape = false;
  /** Which character opened the current string — `"` or a smart quote. */
  let openQuote = '"';

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;

    // ── Inside a string literal ──────────────────────────────────────────────
    if (inString) {
      if (escape) {
        parts.push(c);
        escape = false;
        continue;
      }
      if (c === "\\") {
        parts.push(c);
        escape = true;
        continue;
      }
      if (c === openQuote) {
        inString = false;
        parts.push('"');
        continue;
      }
      // A straight quote inside a smart-quoted string must be escaped.
      if (c === '"') {
        parts.push('\\"');
        continue;
      }
      // Raw control characters are illegal in JSON strings — escape them.
      if (c === "\n") parts.push("\\n");
      else if (c === "\r") parts.push("\\r");
      else if (c === "\t") parts.push("\\t");
      else parts.push(c);
      continue;
    }

    // ── Outside strings ──────────────────────────────────────────────────────
    if (c === '"' || c === "“" || c === "”") {
      inString = true;
      openQuote = c === '"' ? '"' : "”";
      parts.push('"');
      continue;
    }

    // Single-quoted string → double-quoted.
    if (c === "'") {
      const { text, next } = readSingleQuoted(input, i);
      parts.push(text);
      i = next;
      continue;
    }

    // Comments.
    if (c === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    // Trailing comma before a closer.
    if (c === ",") {
      const next = input[nextNonSpace(input, i + 1)];
      if (next === "}" || next === "]") continue;
      parts.push(c);
      continue;
    }

    // Bare literals and unquoted keys.
    wordRe.lastIndex = i;
    const word = wordRe.exec(input);
    if (word) {
      const token = word[0];
      const lower = token.toLowerCase();

      if (token === "None" || token === "NaN" || token === "Infinity") {
        parts.push("null");
      } else if (lower === "true" || lower === "false" || lower === "null") {
        parts.push(lower);
      } else if (input[nextNonSpace(input, i + token.length)] === ":") {
        parts.push(`"${token}"`); // unquoted object key
      } else {
        parts.push(token);
      }
      i += token.length - 1;
      continue;
    }

    parts.push(c);
  }

  return parts.join("");
}

/** Index of the first non-whitespace character at or after `from`. */
function nextNonSpace(input: string, from: number): number {
  let i = from;
  while (i < input.length && /\s/.test(input[i]!)) i++;
  return i;
}

/** Reads a single-quoted literal starting at `start` and returns it double-quoted. */
function readSingleQuoted(
  input: string,
  start: number,
): { text: string; next: number } {
  let out = '"';
  let i = start + 1;

  for (; i < input.length; i++) {
    const c = input[i]!;
    if (c === "\\") {
      out += c + (input[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "'") break;
    if (c === '"') out += '\\"';
    else if (c === "\n") out += "\\n";
    else out += c;
  }

  return { text: out + '"', next: i };
}

// ── Step 5: truncation salvage ───────────────────────────────────────────────

/**
 * The model hit its output cap mid-answer. Rather than throwing away a nearly
 * complete response (and paying for a full regeneration), close what is open —
 * and if the tail is unusable, cut back to the last complete element and close
 * there. A brief with 7 of 8 ideas is worth far more than a retry.
 */
function salvageTruncated(candidate: string): unknown {
  const repaired = repairJsonText(candidate);

  const closed = tryParse(closeOpenStructures(repaired));
  if (closed !== undefined) return closed;

  // Walk backwards through complete-element boundaries.
  let attempts = 0;
  for (let i = repaired.length - 1; i >= 0 && attempts < 200; i--) {
    const c = repaired[i];
    if (c !== "}" && c !== "]") continue;
    attempts++;
    const parsed = tryParse(closeOpenStructures(repaired.slice(0, i + 1)));
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}

/**
 * Terminates any open string and appends the closing brackets needed to balance
 * the text, dropping a dangling `,` / `"key":` tail first.
 */
function closeOpenStructures(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") stack.pop();
  }

  let out = text;
  if (inString) out += '"';

  // Drop an incomplete tail: `…, ` or `…"key":` or `…"key": `.
  out = out.replace(/,\s*$/, "");
  out = out.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  out = out.replace(/,\s*$/, "");

  while (stack.length) out += stack.pop();
  return out;
}
