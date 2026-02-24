import mongoose from "mongoose";
import { User } from "../models/User";
import {
  TokenUsageLog,
  type AgentName,
  type OperationType,
} from "../models/TokenUsageLog";
import { SystemConfig, CONFIG_KEYS } from "../models/SystemConfig";

// ── Constants ─────────────────────────────────────────────────────────────────

/** 10% grace buffer: users are hard-blocked at 110% of their limit */
const GRACE_MULTIPLIER = 1.1;

/** Hard-coded fallback if SystemConfig row is somehow missing */
const FALLBACK_DEFAULT_LIMIT = 300_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  tokensUsed: number;
  tokenLimit: number;
  percentUsed: number;
  tokensRemaining: number;
}

export interface TrackTokenUsageParams {
  userId: string;
  agent: AgentName;
  operation: OperationType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  metadata?: {
    suggestionId?: string;
    sessionId?: string;
  };
}

// ── Seed default token limit ──────────────────────────────────────────────────

/**
 * Called once at server startup.
 * Uses $setOnInsert so it only sets the value on first creation —
 * subsequent admin changes to the value are preserved.
 */
export async function seedDefaultTokenLimit(): Promise<void> {
  try {
    // First attempt: insert if the key doesn't exist yet
    await SystemConfig.updateOne(
      { key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT },
      {
        $setOnInsert: {
          key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT,
          value: FALLBACK_DEFAULT_LIMIT,
          description: "Default lifetime token quota per user account",
        },
      },
      { upsert: true },
    );

    // Migration: if the stored value is still the old 100K default, bump it to 300K.
    // This runs safely on existing deployments without overwriting intentional admin edits.
    await SystemConfig.updateOne(
      { key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT, value: 100_000 },
      { $set: { value: FALLBACK_DEFAULT_LIMIT } },
    );

    console.log(
      "[tokenUsage] SystemConfig seeded: default_token_limit =",
      FALLBACK_DEFAULT_LIMIT,
    );
  } catch (err) {
    console.error(
      "[tokenUsage] Failed to seed default token limit:",
      (err as Error).message,
    );
  }
}

// ── In-memory cache for SystemConfig token limit (#26) ───────────────────────
// Avoids a DB round-trip on every quota check (called before every AI operation).
// 5-minute TTL — short enough to pick up admin changes within a reasonable window.

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

interface ConfigCacheEntry {
  value: number;
  cachedAt: number;
}

let _configCache: ConfigCacheEntry | null = null;

function getCachedDefaultLimit(): number | null {
  if (!_configCache) return null;
  if (Date.now() - _configCache.cachedAt > CONFIG_CACHE_TTL_MS) {
    _configCache = null;
    return null;
  }
  return _configCache.value;
}

function setCachedDefaultLimit(value: number): void {
  _configCache = { value, cachedAt: Date.now() };
}

// ── Get effective limit for a user ───────────────────────────────────────────

async function getEffectiveLimit(
  userTokenLimit: number | null | undefined,
): Promise<number> {
  // Per-user override takes priority (no cache needed — per-user)
  if (typeof userTokenLimit === "number" && userTokenLimit > 0) {
    return userTokenLimit;
  }

  // Check in-memory cache first
  const cached = getCachedDefaultLimit();
  if (cached !== null) return cached;

  // Read from SystemConfig and populate cache
  try {
    const config = await SystemConfig.findOne({
      key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT,
    }).lean();
    if (config && typeof config.value === "number" && config.value > 0) {
      setCachedDefaultLimit(config.value);
      return config.value;
    }
  } catch (err) {
    console.warn(
      "[tokenUsage] Could not read SystemConfig, using fallback:",
      (err as Error).message,
    );
  }

  // Cache the fallback too to avoid hammering DB on repeated failures
  setCachedDefaultLimit(FALLBACK_DEFAULT_LIMIT);
  return FALLBACK_DEFAULT_LIMIT;
}

// ── Check quota ───────────────────────────────────────────────────────────────

/**
 * Pre-flight quota check — MUST be awaited before any AI call.
 * Returns allowed=false when tokensUsed >= tokenLimit * GRACE_MULTIPLIER.
 */
export async function checkTokenQuota(
  userId: string,
): Promise<QuotaCheckResult> {
  const user = await User.findById(userId)
    .select("tokensUsed tokenLimit")
    .lean();

  const tokensUsed = user?.tokensUsed ?? 0;
  const tokenLimit = await getEffectiveLimit(user?.tokenLimit ?? null);

  const percentUsed =
    tokenLimit > 0 ? Math.round((tokensUsed / tokenLimit) * 100) : 0;
  const tokensRemaining = Math.max(0, tokenLimit - tokensUsed);
  const allowed = tokensUsed < tokenLimit * GRACE_MULTIPLIER;

  return { allowed, tokensUsed, tokenLimit, percentUsed, tokensRemaining };
}

// ── Track usage (fire-and-forget) ─────────────────────────────────────────────

/**
 * Fire-and-forget token tracking — NEVER await this.
 * DB failures are logged but never surface to the caller.
 *
 * Atomically increments User.tokensUsed via $inc (no race conditions).
 */
export function trackTokenUsage(params: TrackTokenUsageParams): void {
  const {
    userId,
    agent,
    operation,
    inputTokens,
    outputTokens,
    totalTokens,
    metadata = {},
  } = params;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  Promise.all([
    TokenUsageLog.create({
      userId: userObjectId,
      agent,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      metadata,
    }),
    User.updateOne(
      { _id: userObjectId },
      { $inc: { tokensUsed: totalTokens } },
    ),
  ]).catch((err: Error) => {
    console.error("[tokenUsage] Tracking error (non-fatal):", err.message);
  });
}
