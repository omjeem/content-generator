/**
 * trendCache.ts — Two-tier trend cache (#16)
 *
 * L1: In-memory Map with 5-min TTL (fast, process-local)
 * L2: MongoDB TrendCache collection with 30-min TTL (persistent, survives restarts)
 *
 * Lookup order: L1 → L2 → miss (caller fetches from APIs → stores in both)
 *
 * Cache key: `trends:{industry}:{sorted_keywords}:{geo}:{timeBucket}`
 * Time bucket: 6-hour rotation ensures freshness even for same-key queries.
 */

import type { RawTrendItem } from "./trends";
import { TrendCache } from "../models/TrendCache";
import { CACHE } from "../config/constants";

// ── L1: In-memory cache ─────────────────────────────────────────────────────

interface L1Entry {
  items: RawTrendItem[];
  expiresAt: number;
}

const l1Cache = new Map<string, L1Entry>();

// ── Cache key ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from the parameters used to fetch trends.
 * Keywords are sorted so that different orderings produce the same key.
 *
 * Phase 3 #2: Added 6-hour time-bucket so cache keys auto-rotate.
 * This ensures even the same user with the same persona gets fresh trends
 * every 6 hours instead of hitting the same stale cache entry indefinitely.
 */
export function buildTrendCacheKey(
  keywords: string[],
  industry: string,
  geo: string,
): string {
  const sortedKeywords = [...keywords]
    .map((k) => k.toLowerCase().trim())
    .sort()
    .join(",");
  const normalizedIndustry = industry.toLowerCase().trim();
  const normalizedGeo = geo.toUpperCase().trim();
  // #2: 6-hour time-bucket rotation — cache key changes every 6 hours
  const timeBucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  return `trends:${normalizedIndustry}:${sortedKeywords}:${normalizedGeo}:${timeBucket}`;
}

// ── Get (L1 → L2) ──────────────────────────────────────────────────────────

/**
 * Return cached trend items for the given key.
 * Checks L1 (memory) first, then L2 (MongoDB).
 * Returns undefined on complete cache miss.
 */
export async function getCachedTrends(
  key: string,
): Promise<RawTrendItem[] | undefined> {
  // L1 check — fast, in-process
  const l1 = l1Cache.get(key);
  if (l1) {
    if (Date.now() <= l1.expiresAt) {
      return l1.items;
    }
    l1Cache.delete(key); // expired
  }

  // L2 check — MongoDB (TTL-managed, survives restarts)
  try {
    const doc = await TrendCache.findOne({ cacheKey: key }).lean();
    if (doc) {
      const items = doc.items as RawTrendItem[];
      // Promote to L1 for subsequent fast access
      l1Cache.set(key, {
        items,
        expiresAt: Date.now() + CACHE.L1_CACHE_TTL_MS,
      });
      return items;
    }
  } catch (err) {
    // L2 failure is non-fatal — treat as cache miss
    console.warn("[trendCache] L2 read error (non-fatal):", err);
  }

  return undefined;
}

// ── Set (L1 + L2) ──────────────────────────────────────────────────────────

/**
 * Store trend items in both L1 (memory) and L2 (MongoDB) caches.
 * L1 TTL: 5 minutes | L2 TTL: 30 minutes (via MongoDB TTL index)
 */
export async function setCachedTrends(
  key: string,
  items: RawTrendItem[],
): Promise<void> {
  // L1 — always succeeds
  l1Cache.set(key, {
    items,
    expiresAt: Date.now() + CACHE.L1_CACHE_TTL_MS,
  });

  // L2 — fire-and-forget (non-blocking)
  try {
    await TrendCache.findOneAndUpdate(
      { cacheKey: key },
      { $set: { items, createdAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    // L2 write failure is non-fatal — L1 still serves
    console.warn("[trendCache] L2 write error (non-fatal):", err);
  }
}

// ── Cache stats (for health check / debugging) ────────────────────────────

export async function getTrendCacheStats(): Promise<{
  l1Size: number;
  l1TtlMinutes: number;
  l2Size: number;
  l2TtlMinutes: number;
}> {
  // Prune expired L1 entries before reporting
  for (const [key, entry] of l1Cache.entries()) {
    if (Date.now() > entry.expiresAt) l1Cache.delete(key);
  }

  let l2Size = 0;
  try {
    l2Size = await TrendCache.countDocuments();
  } catch {
    // non-fatal
  }

  return {
    l1Size: l1Cache.size,
    l1TtlMinutes: CACHE.L1_CACHE_TTL_MS / 60_000,
    l2Size,
    l2TtlMinutes: CACHE.TREND_TTL_MS / 60_000,
  };
}
