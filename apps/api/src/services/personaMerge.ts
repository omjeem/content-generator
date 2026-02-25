/**
 * personaMerge.ts
 *
 * Merge strategy for incrementally adding posts to an existing persona.
 * Handles: deduplication, field merging, snapshot creation, and diff computation.
 */

import type { PersonaAnalysis } from "../agents/personaAnalyst";
import type {
  IUserPersonaDocument,
  IPersonaSnapshot,
} from "../models/UserPersona";

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalise a string for deduplication comparison.
 * Strips punctuation, lowercases, collapses whitespace.
 */
export function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deduplicate an array of strings using normalised comparison.
 * Preserves the original casing of the first occurrence.
 */
export function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizeForDedup(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// ── Post deduplication ────────────────────────────────────────────────────────

/**
 * Filter newPosts to only include posts not already in existingPosts.
 * Uses first 100 chars of each post (normalised) as the dedup key.
 */
export function deduplicatePosts(
  existingPosts: string[],
  newPosts: string[],
): string[] {
  const existingKeys = new Set(
    existingPosts.map((p) => normalizeForDedup(p.slice(0, 100))),
  );
  return newPosts.filter((p) => {
    const key = normalizeForDedup(p.slice(0, 100));
    return key.length > 0 && !existingKeys.has(key);
  });
}

// ── Persona merge ─────────────────────────────────────────────────────────────

/**
 * Weighted blend for text fields (writingStyle, tone).
 *
 * When the existing persona was built from many more posts than the new batch,
 * it should dominate the merged result. A small new batch should not erase the
 * signal accumulated from 20+ posts.
 *
 * - existingWeight > 0.7: existing dominates → append new as "emerging tendencies"
 * - existingWeight ≤ 0.7: new batch is large enough to be representative → use new
 *
 * @param existing    The current field value on the persona
 * @param incoming    The value from the newly-analysed posts
 * @param existingWeight  existingPostCount / totalPostCount (0–1)
 */
function blendTextFields(
  existing: string | undefined,
  incoming: string,
  existingWeight: number,
): string {
  if (!existing) return incoming;
  if (existingWeight > 0.7) {
    // Existing signal is dominant — surface the new tendency without overwriting
    return `${existing} — with emerging ${incoming} tendencies`;
  }
  // New batch is large enough to be the primary signal
  return incoming;
}

/**
 * Merge a new analysis result into an existing persona document.
 *
 * Strategy:
 * - topics: union of existing + new, deduplicated, capped at 15
 * - postFormats: union, deduplicated
 * - writingStyle / tone: weighted blend — small new batch does not erase existing signal (#4)
 * - estimatedPostFrequency → postingFrequency: only update if currently empty
 *
 * @param existing     The current persona document
 * @param newAnalysis  The analysis of the newly-added posts
 * @param newPostCount How many new posts were just analysed (used for weight calculation)
 */
export function mergePersonaAnalysis(
  existing: IUserPersonaDocument,
  newAnalysis: PersonaAnalysis,
  newPostCount = 0,
): Partial<IUserPersonaDocument> {
  const mergedTopics = deduplicateStrings([
    ...(existing.topics ?? []),
    ...(newAnalysis.topics ?? []),
  ]).slice(0, 15);

  const mergedFormats = deduplicateStrings([
    ...(existing.postFormats ?? []),
    ...(newAnalysis.postFormats ?? []),
  ]);

  // Compute how dominant the existing persona is relative to the new batch (#4)
  const existingPostCount = existing.totalPostsAnalyzed ?? existing.scrapedPosts?.length ?? 0;
  const totalCount = existingPostCount + newPostCount;
  const existingWeight = totalCount > 0 ? existingPostCount / totalCount : 0;

  return {
    writingStyle: blendTextFields(existing.writingStyle, newAnalysis.writingStyle, existingWeight),
    tone: blendTextFields(existing.tone, newAnalysis.tone, existingWeight),
    topics: mergedTopics,
    postFormats: mergedFormats,
    // Only update postingFrequency if the persona doesn't have one yet
    ...(existing.postingFrequency
      ? {}
      : { postingFrequency: newAnalysis.estimatedPostFrequency }),
  };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Create a snapshot of the current persona state before applying an update.
 * Used for the analysis history timeline.
 */
export function createPersonaSnapshot(
  persona: IUserPersonaDocument,
): IPersonaSnapshot {
  return {
    snapshotAt: new Date(),
    personaVersion: persona.personaVersion ?? 0,
    writingStyle: persona.writingStyle,
    tone: persona.tone,
    topics: [...(persona.topics ?? [])],
    postFormats: [...(persona.postFormats ?? [])],
  };
}

// ── Diff ──────────────────────────────────────────────────────────────────────

export interface PersonaDiff {
  topicsAdded: string[];
  topicsRemoved: string[];
  formatsAdded: string[];
  writingStyleChanged: boolean;
  toneChanged: boolean;
}

/**
 * Compute a human-readable diff between old and new persona values.
 */
export function computePersonaDiff(
  before: IPersonaSnapshot,
  after: Partial<IUserPersonaDocument>,
): PersonaDiff {
  const beforeTopics = new Set(before.topics.map(normalizeForDedup));
  const afterTopics = (after.topics ?? []).map(normalizeForDedup);

  const topicsAdded = (after.topics ?? []).filter(
    (t) => !beforeTopics.has(normalizeForDedup(t)),
  );
  const topicsRemoved = before.topics.filter(
    (t) => !new Set(afterTopics).has(normalizeForDedup(t)),
  );

  const beforeFormats = new Set(before.postFormats.map(normalizeForDedup));
  const formatsAdded = (after.postFormats ?? []).filter(
    (f) => !beforeFormats.has(normalizeForDedup(f)),
  );

  return {
    topicsAdded,
    topicsRemoved,
    formatsAdded,
    writingStyleChanged: before.writingStyle !== after.writingStyle,
    toneChanged: before.tone !== after.tone,
  };
}
