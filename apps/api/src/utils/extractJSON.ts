/**
 * extractJSON.ts
 *
 * Robustly extracts a JSON object or array from LLM output that may contain:
 *   - Markdown code fences (```json ... ``` or ``` ... ```)
 *   - Explanatory text before/after the JSON
 *   - Mixed prose + JSON in the same response
 *
 * Strategy (in order):
 *   1. Direct JSON.parse — handles clean responses instantly
 *   2. Strip code fences — handles ```json ... ``` wrapping
 *   3. Balanced brace/bracket scan — handles JSON embedded in prose
 *
 * Returns the parsed value or throws an error with a diagnostic message.
 */

export function extractJSON<T = unknown>(raw: string, context = 'LLM response'): T {
  const text = raw.trim()

  // ── Strategy 1: Direct parse ───────────────────────────────────────────────
  try {
    return JSON.parse(text) as T
  } catch {
    // fall through
  }

  // ── Strategy 2: Strip markdown code fences ────────────────────────────────
  // Matches: ```json\n...\n``` OR ```\n...\n``` OR `...`
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch && fenceMatch[1] !== undefined) {
    const fenceContent = fenceMatch[1].trim()
    try {
      return JSON.parse(fenceContent) as T
    } catch {
      // fall through — try balanced scan on the fenced content first
      const innerResult = balancedScan<T>(fenceContent)
      if (innerResult !== null) return innerResult
    }
  }

  // ── Strategy 3: Balanced brace/bracket scan ───────────────────────────────
  // Find the first complete JSON object `{...}` or array `[...]` in the text.
  const result = balancedScan<T>(text)
  if (result !== null) return result

  // ── All strategies failed ─────────────────────────────────────────────────
  const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
  throw new Error(
    `[extractJSON] Could not find valid JSON in ${context}.\nPreview: ${preview}`
  )
}

/**
 * Scans `text` for the first complete JSON object or array using a
 * balanced-bracket counter. More reliable than a greedy `\{[\s\S]*\}` regex
 * because it stops at the matching closing brace rather than the last one.
 */
function balancedScan<T>(text: string): T | null {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '{' && ch !== '[') continue

    const opener = ch
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false

    for (let j = i; j < text.length; j++) {
      const c = text[j]

      if (escape) {
        escape = false
        continue
      }

      if (c === '\\' && inString) {
        escape = true
        continue
      }

      if (c === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (c === opener) depth++
      else if (c === closer) {
        depth--
        if (depth === 0) {
          const candidate = text.slice(i, j + 1)
          try {
            return JSON.parse(candidate) as T
          } catch {
            // Not valid JSON — keep scanning from next position
            break
          }
        }
      }
    }
  }

  return null
}
