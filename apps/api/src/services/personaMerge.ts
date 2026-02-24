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
 * Merge a new analysis result into an existing persona document.
 *
 * Strategy:
 * - topics: union of existing + new, deduplicated, capped at 15
 * - postFormats: union, deduplicated
 * - writingStyle / tone / summary: replace with new (more data = better signal)
 * - estimatedPostFrequency → postingFrequency: only update if currently empty
 */
export function mergePersonaAnalysis(
  existing: IUserPersonaDocument,
  newAnalysis: PersonaAnalysis,
): Partial<IUserPersonaDocument> {
  const mergedTopics = deduplicateStrings([
    ...(existing.topics ?? []),
    ...(newAnalysis.topics ?? []),
  ]).slice(0, 15);

  const mergedFormats = deduplicateStrings([
    ...(existing.postFormats ?? []),
    ...(newAnalysis.postFormats ?? []),
  ]);

  return {
    writingStyle: newAnalysis.writingStyle,
    tone: newAnalysis.tone,
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
