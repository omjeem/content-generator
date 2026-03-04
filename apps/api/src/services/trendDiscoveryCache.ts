/**
 * Trend Discovery Cache — Phase 3 #19
 *
 * Short-lived per-user in-memory cache for the two-step generation flow:
 *   1. GET /api/trends/discover → fetches + caches trends
 *   2. POST /api/suggestions/generate-from-trends → looks up selected trends
 *
 * Also reused by Phase D topic suggestions (#30).
 *
 * 30-minute TTL per entry. Stale entries are lazily pruned on read.
 */

import type { TrendResult } from "../agents/trendResearch";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveryTrend {
  id: string;
  topic: string;
  source?: string;
  url?: string;
  relevanceScore: number;
  relevanceReason: string;
  contentAngle: string;
  category: string;
  publishedAt?: string;
}

export interface TrendDiscoveryEntry {
  userId: string;
  trends: DiscoveryTrend[];
  categories: string[];
  fetchedAt: string;
  expiresAt: string;
  isLive: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DISCOVERY_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Cache store ──────────────────────────────────────────────────────────────

const discoveryCache = new Map<string, TrendDiscoveryEntry>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a deterministic trend ID from topic + source */
export function generateTrendId(topic: string, source?: string): string {
  const input = `${topic}:${source ?? "unknown"}`.toLowerCase().trim();
  // Simple hash — DJB2
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `trend_${Math.abs(hash).toString(36)}`;
}

/** Map a trend topic to a category based on content pillar matching */
function categoriseTrend(
  topic: string,
  contentPillars: string[],
): string {
  const lower = topic.toLowerCase();
  for (const pillar of contentPillars) {
    const pillarWords = pillar.toLowerCase().split(/\s+/);
    if (pillarWords.some((w) => w.length > 3 && lower.includes(w))) {
      return pillar.toLowerCase().replace(/\s+/g, "-");
    }
  }
  return "general";
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Store discovered trends for a user. Overwrites any previous entry.
 */
export function storeTrendDiscovery(
  userId: string,
  trendResult: TrendResult,
  contentPillars: string[],
  isLive: boolean,
): TrendDiscoveryEntry {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DISCOVERY_TTL_MS);

  const trends: DiscoveryTrend[] = trendResult.trends.map((t) => ({
    id: generateTrendId(t.topic, t.source),
    topic: t.topic,
    source: t.source,
    relevanceScore: 0, // will be enriched if available
    relevanceReason: t.relevanceReason,
    contentAngle: t.contentAngle,
    category: categoriseTrend(t.topic, contentPillars),
  }));

  // Deduplicate by ID (in case hash collisions)
  const seen = new Set<string>();
  const uniqueTrends = trends.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const categories = [...new Set(uniqueTrends.map((t) => t.category))].sort();

  const entry: TrendDiscoveryEntry = {
    userId,
    trends: uniqueTrends,
    categories,
    fetchedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isLive,
  };

  discoveryCache.set(userId, entry);
  return entry;
}

/**
 * Retrieve cached trend discovery for a user. Returns null if expired or missing.
 */
export function getTrendDiscovery(
  userId: string,
): TrendDiscoveryEntry | null {
  const entry = discoveryCache.get(userId);
  if (!entry) return null;

  // Check TTL
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    discoveryCache.delete(userId);
    return null;
  }

  return entry;
}

/**
 * Look up specific trends by IDs from the user's cached discovery.
 * Returns only the matched trends in a TrendResult-compatible format.
 */
export function getSelectedTrends(
  userId: string,
  ids: string[],
): TrendResult["trends"] | null {
  const entry = getTrendDiscovery(userId);
  if (!entry) return null;

  const idSet = new Set(ids);
  const selected = entry.trends.filter((t) => idSet.has(t.id));

  if (selected.length === 0) return null;

  return selected.map((t) => ({
    topic: t.topic,
    relevanceReason: t.relevanceReason,
    contentAngle: t.contentAngle,
    source: t.source,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Topic Discovery Cache — Phase 3 #30
// Reuses the same pattern as trend discovery for AI-suggested topics.
// ═══════════════════════════════════════════════════════════════════════════════

export interface TopicDiscoveryItem {
  id: string;
  title: string;
  category: string;
  reasoning: string;
  suggestedFormat: string;
  confidence: number;
}

interface TopicDiscoveryEntry {
  userId: string;
  topics: TopicDiscoveryItem[];
  expiresAt: number;
}

const topicCache = new Map<string, TopicDiscoveryEntry>();

/** Generate a deterministic topic ID from title */
export function generateTopicId(title: string): string {
  const input = title.toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `topic_${Math.abs(hash).toString(36)}`;
}

/** Store AI-suggested topics for a user (30-min TTL). */
export function storeTopicDiscovery(
  userId: string,
  topics: TopicDiscoveryItem[],
): void {
  topicCache.set(userId, {
    userId,
    topics,
    expiresAt: Date.now() + DISCOVERY_TTL_MS,
  });
}

/** Retrieve cached topic discovery for a user. */
export function getTopicDiscovery(
  userId: string,
): TopicDiscoveryItem[] | null {
  const entry = topicCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    topicCache.delete(userId);
    return null;
  }
  return entry.topics;
}

/** Look up a single topic by ID from the user's cache. */
export function getSelectedTopic(
  userId: string,
  topicId: string,
): TopicDiscoveryItem | null {
  const topics = getTopicDiscovery(userId);
  if (!topics) return null;
  return topics.find((t) => t.id === topicId) ?? null;
}
