/**
 * Centralized Constants — Phase 4 #1
 *
 * All magic numbers extracted from across the codebase into a single
 * source of truth. Grouped by domain.
 */

import { env } from "./env";

// ── Scoring (trend relevance scoring in trendResearch.ts) ────────────────────

export const SCORING = {
  EXACT_MATCH: 3,
  PARTIAL_MATCH: 1,
  INDUSTRY_MATCH: 2,
  SOURCE_BONUS: 1,
  OFF_TOPIC_PENALTY: -1,
  STALE_PENALTY: -2,
  FUZZY_MATCH_THRESHOLD: 0.6,
  HEURISTIC_MIN_SCORE: 3,
  HEURISTIC_MIN_ITEMS: 4,
} as const;

// ── Learning (persona feedback loop in personaLearning.ts) ───────────────────

export const LEARNING = {
  ACTION_WEIGHTS: {
    published: 2.0,
    draft: 1.5,
    saved: 1.2,
    dismissed: 1.0,
  } as Record<string, number>,
  SIGNAL_WEIGHTS: {
    loved: 1.0,
    good: 0.75,
    meh: 0.0,
    bad: -1.0,
  } as Record<string, number>,
  RATING_NUMERIC: {
    loved: 4,
    good: 3,
    meh: 2,
    bad: 1,
  } as Record<string, number>,
  DECAY_HALF_LIFE_DAYS: 14,
  FEEDBACK_FETCH_LIMIT: 50,
  TOPIC_PREFERRED_THRESHOLD: 0.5,
  TOPIC_AVOID_THRESHOLD: -0.3,
  MAX_TOPICS: 10,
  FIRST_TRIGGER_THRESHOLD: 3,
  REPEAT_TRIGGER_INTERVAL: 3,
} as const;

// ── Pipeline (orchestrator timeouts & retries in mastra.ts) ──────────────────

// Self-hosted / large open models (gpt-oss:120b and friends) are several times
// slower than a hosted flash model — especially when they emit a reasoning
// channel before the answer. Scale every step budget by provider so a slow model
// runs to completion instead of tripping the timeout mid-answer.
// Override with LLM_TIMEOUT_SCALE when your deployment is faster/slower.
const TIMEOUT_SCALE =
  env.LLM_TIMEOUT_SCALE ?? (env.MODEL_PROVIDER === "ollama" ? 3 : 1);

const scaled = (ms: number) => Math.round(ms * TIMEOUT_SCALE);

export const PIPELINE = {
  STEP_TIMEOUTS: {
    persona: scaled(30_000),
    // Trend research is mostly HTTP fetches — only the enrichment call is LLM.
    trends: scaled(15_000),
    content: scaled(45_000),
    overall: scaled(90_000),
  },
  /**
   * A retry is only worth starting if this much of the step budget is left.
   * Prevents the "retry, then time out anyway" pattern that wasted a full
   * model call on every slow generation.
   */
  MIN_RETRY_BUDGET_MS: scaled(20_000),
  MAX_RETRY_ATTEMPTS: 2,
  CIRCUIT_BREAKER: {
    failureThreshold: 5,
    cooldownMs: 60_000,
    halfOpenRequests: 1,
  },
} as const;

// ── Generation (content idea parameters in contentGenerator.ts) ──────────────

export const GENERATION = {
  MIN_VALID_IDEAS: 3,
  MAX_IDEAS: 20,
  HOOK_MAX_CHARS: 200,
  HOOK_MAX_WORDS: 15,
  KEYWORDS_RANGE: [3, 5] as readonly [number, number],
  HOOKS_RANGE: [2, 5] as readonly [number, number],
  POINTERS_RANGE: [4, 10] as readonly [number, number],
} as const;

// ── Cache (TTLs for in-memory caches) ────────────────────────────────────────

export const CACHE = {
  TREND_TTL_MS: 30 * 60 * 1000, // 30 minutes
  TOPIC_CACHE_TTL_MS: 30 * 60 * 1000, // 30 minutes
  L1_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes (future L1 for persistent cache)
} as const;

// ── Limits (schema and array bounds) ─────────────────────────────────────────

export const LIMITS = {
  MAX_POSTS_PER_PERSONA: 500,
  MAX_SNAPSHOTS_PER_PERSONA: 20,
  INLINE_FALLBACK_MIN_CHARS: 300,
  PERSONA_DEDUP_KEY_LENGTH: 100,
  MAX_TOPICS_PER_PERSONA: 15,
} as const;
