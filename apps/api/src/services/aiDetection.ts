/**
 * AI Detection & Humanization Service — Phase 3 #36, #38
 *
 * Encapsulates prompt construction for:
 *   1. AI Detection: Evaluates text for AI-written patterns (7-signal analysis)
 *   2. Humanization: Rewrites AI text to match the user's natural voice
 *
 * Uses Gemini via the Vercel AI SDK — same pattern as other agents.
 */

import { z } from "zod";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { IUserPersonaDocument } from "../models/UserPersona";
import { buildPersonaSummary } from "../agents/contentGenerator";

// ── Schemas ──────────────────────────────────────────────────────────────────

export const AiCheckResultSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["human", "mixed", "likely-ai"]),
  signals: z.array(z.string()).min(1).max(10),
  suggestions: z.array(z.string()).min(1).max(10),
});

export type AiCheckResult = z.infer<typeof AiCheckResultSchema>;

export const HumanizeResultSchema = z.object({
  humanizedContent: z.string(),
  changesSummary: z.string(),
  estimatedScore: z.number().min(0).max(100),
});

export type HumanizeResult = z.infer<typeof HumanizeResultSchema>;

// ── AI Detection (#36) ──────────────────────────────────────────────────────

export async function runAiDetection(content: string): Promise<{
  result: AiCheckResult;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const prompt = `Analyze this text for AI-written patterns. Score 0-100 where 0 = definitively human-written, 100 = definitively AI-generated.

Evaluate these 7 specific signals:
1. SENTENCE LENGTH VARIANCE: AI text has unnaturally uniform sentence lengths. Measure the standard deviation.
2. TRANSITIONAL PHRASE PATTERNS: AI overuses "Furthermore", "Moreover", "Additionally", "In conclusion".
3. PERSONAL SPECIFICITY: Human text includes concrete personal details, names, dates, and specific anecdotes. AI text is vague.
4. TONAL CONSISTENCY: Human text has natural register shifts (formal to casual). AI maintains a single consistent register.
5. VOCABULARY DIVERSITY: AI uses a narrower, more "polished" vocabulary range than natural writing.
6. OPENING PATTERNS: AI posts often start with a question, a bold statement, or "I've been thinking about...".
7. PARAGRAPH STRUCTURE: AI uses unnaturally consistent paragraph lengths and structure.

Return ONLY valid JSON (no markdown, no extra text):
{
  "score": <number 0-100>,
  "verdict": "<human|mixed|likely-ai>",
  "signals": ["<specific observation about each detected signal>"],
  "suggestions": ["<specific actionable fix for each signal>"]
}

Rules for verdict:
- score 0-30: "human"
- score 31-60: "mixed"
- score 61-100: "likely-ai"

TEXT TO ANALYZE:
${content}`;

  const { text, usage: genUsage } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
  });

  // Parse response
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const result = AiCheckResultSchema.parse(parsed);

  return {
    result,
    usage: {
      inputTokens: genUsage?.inputTokens ?? 0,
      outputTokens: genUsage?.outputTokens ?? 0,
    },
  };
}

// ── Humanization (#38) ──────────────────────────────────────────────────────

export async function runHumanizer(
  content: string,
  persona: IUserPersonaDocument,
  intensity: "light" | "moderate" | "aggressive",
): Promise<{
  result: HumanizeResult;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const intensityRules: Record<string, string> = {
    light:
      "Fix only the most obvious AI patterns. Keep 80% of the original wording. Minimal changes.",
    moderate:
      "Rewrite significantly. Add personal touches, vary rhythm, change 50% of phrasing. Make it sound natural.",
    aggressive:
      "Complete rewrite. Same core message but entirely new delivery, as if the person wrote it from scratch while talking to a friend.",
  };

  const prompt = `You are rewriting an AI-generated text to sound like it was written by this specific person.

CREATOR VOICE:
${buildPersonaSummary(persona)}
Writing style: ${persona.writingStyle ?? "natural and direct"}
Tone: ${persona.tone ?? "Professional"}

INTENSITY: ${intensity}
${intensityRules[intensity]}

HUMANIZATION RULES:
1. Add at least one specific personal detail (even if invented — the user can replace it)
2. Vary sentence length dramatically: 3-word punches mixed with 25-word explanations
3. Replace ALL transitional phrases (Furthermore, Moreover, Additionally) with natural connectors (But here's the thing, Look, So, And honestly)
4. Add 1-2 incomplete sentences or fragments (humans don't always finish thoughts)
5. Use contractions (don't, can't, shouldn't)
6. Add at least one colloquial expression
7. Break the formal register at least twice
8. Make the CTA sound like a real question, not a marketing prompt

ORIGINAL TEXT:
${content}

Return ONLY valid JSON (no markdown, no extra text):
{
  "humanizedContent": "<the fully rewritten text>",
  "changesSummary": "<1-2 sentence summary of what changed>",
  "estimatedScore": <estimated AI detection score after humanization, 0-100>
}`;

  const { text, usage: genUsage } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
  });

  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const result = HumanizeResultSchema.parse(parsed);

  return {
    result,
    usage: {
      inputTokens: genUsage?.inputTokens ?? 0,
      outputTokens: genUsage?.outputTokens ?? 0,
    },
  };
}
