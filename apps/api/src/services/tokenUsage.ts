import mongoose from 'mongoose'
import { User } from '../models/User'
import { TokenUsageLog, type AgentName, type OperationType } from '../models/TokenUsageLog'
import { SystemConfig, CONFIG_KEYS } from '../models/SystemConfig'

// ── Constants ─────────────────────────────────────────────────────────────────

/** 10% grace buffer: users are hard-blocked at 110% of their limit */
const GRACE_MULTIPLIER = 1.1

/** Hard-coded fallback if SystemConfig row is somehow missing */
const FALLBACK_DEFAULT_LIMIT = 100_000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean
  tokensUsed: number
  tokenLimit: number
  percentUsed: number
  tokensRemaining: number
}

export interface TrackTokenUsageParams {
  userId: string
  agent: AgentName
  operation: OperationType
  inputTokens: number
  outputTokens: number
  totalTokens: number
  metadata?: {
    suggestionId?: string
    sessionId?: string
  }
}

// ── Seed default token limit ──────────────────────────────────────────────────

/**
 * Called once at server startup.
 * Uses $setOnInsert so it only sets the value on first creation —
 * subsequent admin changes to the value are preserved.
 */
export async function seedDefaultTokenLimit(): Promise<void> {
  try {
    await SystemConfig.updateOne(
      { key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT },
      {
        $setOnInsert: {
          key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT,
          value: FALLBACK_DEFAULT_LIMIT,
          description: 'Default lifetime token quota per user account',
        },
      },
      { upsert: true }
    )
    console.log('[tokenUsage] SystemConfig seeded: default_token_limit =', FALLBACK_DEFAULT_LIMIT)
  } catch (err) {
    console.error('[tokenUsage] Failed to seed default token limit:', (err as Error).message)
  }
}

// ── Get effective limit for a user ───────────────────────────────────────────

async function getEffectiveLimit(
  userTokenLimit: number | null | undefined
): Promise<number> {
  // Per-user override takes priority
  if (typeof userTokenLimit === 'number' && userTokenLimit > 0) {
    return userTokenLimit
  }

  // Read from SystemConfig
  try {
    const config = await SystemConfig.findOne({
      key: CONFIG_KEYS.DEFAULT_TOKEN_LIMIT,
    }).lean()
    if (config && typeof config.value === 'number' && config.value > 0) {
      return config.value
    }
  } catch (err) {
    console.warn('[tokenUsage] Could not read SystemConfig, using fallback:', (err as Error).message)
  }

  return FALLBACK_DEFAULT_LIMIT
}

// ── Check quota ───────────────────────────────────────────────────────────────

/**
 * Pre-flight quota check — MUST be awaited before any AI call.
 * Returns allowed=false when tokensUsed >= tokenLimit * GRACE_MULTIPLIER.
 */
export async function checkTokenQuota(userId: string): Promise<QuotaCheckResult> {
  const user = await User.findById(userId)
    .select('tokensUsed tokenLimit')
    .lean()

  const tokensUsed = (user?.tokensUsed ?? 0)
  const tokenLimit = await getEffectiveLimit(user?.tokenLimit ?? null)

  const percentUsed = tokenLimit > 0 ? Math.round((tokensUsed / tokenLimit) * 100) : 0
  const tokensRemaining = Math.max(0, tokenLimit - tokensUsed)
  const allowed = tokensUsed < tokenLimit * GRACE_MULTIPLIER

  return { allowed, tokensUsed, tokenLimit, percentUsed, tokensRemaining }
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
  } = params

  const userObjectId = new mongoose.Types.ObjectId(userId)

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
      { $inc: { tokensUsed: totalTokens } }
    ),
  ]).catch((err: Error) => {
    console.error('[tokenUsage] Tracking error (non-fatal):', err.message)
  })
}
