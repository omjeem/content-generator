/**
 * Content Continuity / Series Detection — Phase 4 #33
 *
 * Scans recent published drafts for topic clusters. If 2+ posts share
 * significant keyword overlap → flag as a potential content series.
 *
 * Pure keyword-based (no LLM, no embeddings). Fast and free.
 * Threshold: 2+ posts with ≥50% keyword overlap.
 */

import mongoose from "mongoose";
import { PostDraft } from "../models/PostDraft";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IContentSeries {
  seriesName: string;
  postCount: number;
  previousTitles: string[];
}

// ── Keyword extraction ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "it", "this", "that", "are", "was", "be", "has",
  "had", "have", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "can", "not", "no", "just", "about", "up", "out", "so", "if", "my",
  "your", "you", "i", "we", "they", "he", "she", "how", "what", "why", "when",
  "where", "which", "who", "all", "each", "every", "both", "more", "most",
  "other", "some", "such", "than", "too", "very", "also", "into", "over",
  "after", "before", "between", "through", "during", "its", "own", "being",
  "here", "there", "then", "now", "only", "still", "even", "because", "as",
  "like", "get", "got", "make", "made", "one", "two", "new", "first", "last",
  "long", "great", "little", "right", "big", "high", "small", "old", "good",
  "bad", "best", "worst", "need", "want", "know", "think", "see", "look",
  "come", "go", "take", "give", "use", "work", "try",
]);

/** Extract meaningful keywords from a title/content string */
function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Calculate keyword overlap ratio between two keyword sets */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) overlap++;
  }
  const smaller = Math.min(a.size, b.size);
  return smaller > 0 ? overlap / smaller : 0;
}

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Detect content series from recent published/ready drafts.
 * Groups by keyword overlap ≥50%. Returns series with 2+ posts.
 */
export async function detectContentSeries(
  userId: string,
): Promise<IContentSeries[]> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Fetch recent drafts (published or ready) — up to 30
  const drafts = await PostDraft.find({
    userId: userObjectId,
    status: { $in: ["published", "ready"] },
  })
    .sort({ updatedAt: -1 })
    .limit(30)
    .select("title content brief")
    .lean();

  if (drafts.length < 2) return [];

  // Build keyword sets per draft
  const draftKeywords: { title: string; keywords: Set<string> }[] = drafts.map(
    (d) => {
      const titleText = d.title ?? "";
      const topicText = (d.brief as { topic?: string })?.topic ?? "";
      return {
        title: titleText || topicText || "Untitled",
        keywords: extractKeywords(`${titleText} ${topicText}`),
      };
    },
  );

  // Group drafts into clusters using simple greedy clustering
  const used = new Set<number>();
  const series: IContentSeries[] = [];

  for (let i = 0; i < draftKeywords.length; i++) {
    if (used.has(i)) continue;

    const cluster: number[] = [i];
    used.add(i);

    for (let j = i + 1; j < draftKeywords.length; j++) {
      if (used.has(j)) continue;

      // Check overlap with ALL members of the current cluster
      // Require overlap with at least one cluster member
      const jEntry = draftKeywords[j]!;
      const hasOverlap = cluster.some(
        (ci) => overlapRatio(draftKeywords[ci]!.keywords, jEntry.keywords) >= 0.5,
      );

      if (hasOverlap) {
        cluster.push(j);
        used.add(j);
      }
    }

    // Only report clusters with 2+ posts
    if (cluster.length >= 2) {
      // Derive series name from the most common keywords across cluster
      const wordCounts = new Map<string, number>();
      for (const idx of cluster) {
        const entry = draftKeywords[idx];
        if (!entry) continue;
        for (const word of entry.keywords) {
          wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
        }
      }
      const topWords = [...wordCounts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word);

      const firstEntry = draftKeywords[cluster[0]!];
      const seriesName =
        topWords.length > 0
          ? topWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" & ")
          : firstEntry?.title ?? "Series";

      series.push({
        seriesName,
        postCount: cluster.length,
        previousTitles: cluster.map((idx) => draftKeywords[idx]?.title ?? "Untitled"),
      });
    }
  }

  return series;
}
