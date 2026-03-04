/**
 * scoring.ts
 *
 * Trend-persona relevance scoring — deterministic, zero-LLM-cost.
 *
 * Scores each raw trend item against the user's persona before passing
 * to the LLM, so the agent receives pre-ranked input and needs to do
 * less filtering work (saving tokens + improving consistency).
 *
 * Scoring signals (additive):
 *   +3  topic/keyword exact match in trend title
 *   +2  industry match in trend title
 *   +1  content pillar match
 *   +1  source is premium (Tavily or HN with score > 50)
 *  -1   off-topic signal detected (title has no keyword overlap at all)
 *  -2   recently shown trend (Phase 3 #6 — stale penalty)
 *
 * After scoring, `selectBalancedTrends()` ensures each content pillar
 * is represented where possible.
 */

import type { RawTrendItem } from "../services/trends";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredTrendItem extends RawTrendItem {
  relevanceScore: number;
  matchedKeywords: string[];
}

export interface PersonaSignals {
  topics: string[];
  contentPillars: string[];
  industry?: string;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Normalise a string for keyword comparison.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phase 3 #6: Fuzzy title match — checks if two normalised titles have
 * ≥60% word overlap. Used to detect recently shown trends even when
 * titles have minor wording differences.
 */
function fuzzyTitleMatch(a: string, b: string): boolean {
  const wordsA = a.split(" ").filter((w) => w.length > 2);
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.length === 0 || wordsB.size === 0) return false;
  const overlap = wordsA.filter((w) => wordsB.has(w)).length;
  return overlap / Math.min(wordsA.length, wordsB.size) >= 0.6;
}

/**
 * Score a single raw trend item against persona signals.
 *
 * Phase 3 #6: Accepts optional recentTrends set. If the item's title
 * fuzzy-matches a recently shown trend, applies a -2 stale penalty
 * to deprioritize (but not hard-exclude) repeat trends.
 */
export function scoreTrendRelevance(
  item: RawTrendItem,
  persona: PersonaSignals,
  recentTrends?: Set<string>,
): ScoredTrendItem {
  const titleNorm = normalise(item.title);
  const matchedKeywords: string[] = [];
  let score = 0;

  // Score: topic / keyword matches in title (+3 each, capped)
  const allKeywords = [
    ...persona.topics,
    ...(persona.contentPillars ?? []),
  ].filter(Boolean);

  for (const kw of allKeywords) {
    const kwNorm = normalise(kw);
    if (kwNorm && titleNorm.includes(kwNorm)) {
      score += 3;
      matchedKeywords.push(kw);
    } else {
      // Partial match: any word from a multi-word keyword
      const words = kwNorm.split(" ").filter((w) => w.length > 3);
      const anyWordMatch = words.some((w) => titleNorm.includes(w));
      if (anyWordMatch) {
        score += 1;
        matchedKeywords.push(kw);
      }
    }
  }

  // Score: industry match (+2)
  if (persona.industry) {
    const industryNorm = normalise(persona.industry);
    if (industryNorm && titleNorm.includes(industryNorm)) {
      score += 2;
      matchedKeywords.push(persona.industry);
    }
  }

  // Score: premium source bonus
  if (item.source === "tavily") {
    score += 1;
  } else if (item.source === "hackernews" && (item.score ?? 0) > 50) {
    score += 1;
  }

  // Penalty: no keyword overlap at all (likely off-topic)
  if (matchedKeywords.length === 0) {
    score -= 1;
  }

  // #6: Stale trend penalty — deprioritize recently shown trends
  if (recentTrends && recentTrends.size > 0) {
    for (const recentTitle of recentTrends) {
      const recentNorm = normalise(recentTitle);
      if (recentNorm && fuzzyTitleMatch(titleNorm, recentNorm)) {
        score -= 2;
        break; // one penalty is enough
      }
    }
  }

  return {
    ...item,
    relevanceScore: Math.max(0, score),
    matchedKeywords: [...new Set(matchedKeywords)],
  };
}

/**
 * Score all raw trend items and return sorted by relevance (highest first).
 *
 * Phase 3 #6: Accepts optional recentTrends to penalize previously shown trends.
 */
export function scoreAndRankTrends(
  items: RawTrendItem[],
  persona: PersonaSignals,
  recentTrends?: Set<string>,
): ScoredTrendItem[] {
  return items
    .map((item) => scoreTrendRelevance(item, persona, recentTrends))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ── Balanced selection ────────────────────────────────────────────────────────

/**
 * Select a balanced set of trends ensuring each content pillar is represented.
 *
 * Strategy:
 * 1. For each content pillar, pick the highest-scoring trend that mentions it
 * 2. Fill remaining slots from the top-scored unselected items
 * 3. Return at most `maxItems` total (default: 15 to stay under LLM context)
 */
export function selectBalancedTrends(
  scored: ScoredTrendItem[],
  contentPillars: string[],
  maxItems = 15,
): ScoredTrendItem[] {
  const selected: ScoredTrendItem[] = [];
  const usedIndexes = new Set<number>();

  // Pass 1: one representative item per content pillar
  for (const pillar of contentPillars) {
    if (selected.length >= maxItems) break;
    const pillarNorm = normalise(pillar);
    const bestIdx = scored.findIndex(
      (item, idx) =>
        !usedIndexes.has(idx) &&
        (normalise(item.title).includes(pillarNorm) ||
          item.matchedKeywords.some((kw) =>
            normalise(kw).includes(pillarNorm),
          )),
    );
    if (bestIdx !== -1) {
      const item = scored[bestIdx];
      if (item) {
        selected.push(item);
        usedIndexes.add(bestIdx);
      }
    }
  }

  // Pass 2: fill remaining slots with top-scored items not yet selected
  for (let i = 0; i < scored.length && selected.length < maxItems; i++) {
    if (!usedIndexes.has(i)) {
      const item = scored[i];
      if (item) {
        selected.push(item);
        usedIndexes.add(i);
      }
    }
  }

  return selected;
}
