/**
 * trendCache.ts
 *
 * In-memory TTL cache for raw trend API results.
 *
 * Motivation: Every generation call currently makes fresh network requests to
 * Tavily, Hacker News, and RSS feeds. Two generations 30 seconds apart for the
 * same user produce identical network traffic. This cache de-dupes those calls.
 *
 * Cache key: `trends:{industry}:{sorted_keywords}:{geo}`
 * TTL:       30 minutes (1,800 seconds)
 *
 * Uses a simple Map with expiry timestamps — no external dependencies required.
 */

import type { RawTrendItem } from "./trends";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  items: RawTrendItem[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

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

// ── Get / Set ─────────────────────────────────────────────────────────────────

/**
 * Return cached trend items for the given key, or undefined if not cached / expired.
 */
export function getCachedTrends(key: string): RawTrendItem[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key); // clean up expired entry
    return undefined;
  }

  return entry.items;
}

/**
 * Store trend items in the cache with a 30-minute TTL.
 */
export function setCachedTrends(key: string, items: RawTrendItem[]): void {
  cache.set(key, {
    items,
    expiresAt: Date.now() + TTL_MS,
  });
}

// ── Cache stats (for health check / debugging) ────────────────────────────────

export function getTrendCacheStats(): { size: number; ttlMinutes: number } {
  // Prune expired entries before reporting
  for (const [key, entry] of cache.entries()) {
    if (Date.now() > entry.expiresAt) cache.delete(key);
  }
  return { size: cache.size, ttlMinutes: TTL_MS / 60_000 };
}
