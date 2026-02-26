/**
 * Persona Learning Service — Phase H #50
 *
 * `aggregateAndUpdatePersona(userId)` — the central learning function.
 *
 * Fetches in parallel:
 *   - Last 50 SuggestionFeedback records (last 30 days preferred)
 *   - Published PostDrafts (for averageContentLength signal)
 *
 * Computes:
 *   1. topicScores map → preferredTopics (score ≥ 0.75) + avoidTopics (score < 0)
 *   2. formatPreferences — normalised % distribution from loved/good feedback
 *   3. averageRating — rolling average of last ratings (1-4 scale)
 *   4. averageContentLength — avg char count of published drafts
 *
 * Writes all to UserPersona.feedbackProfile via $set (atomic, non-destructive).
 *
 * ALL callers must use fire-and-forget:
 *   void aggregateAndUpdatePersona(userId).catch(err => console.error(...))
 */

import mongoose from "mongoose";
import { SuggestionFeedback } from "../models/SuggestionFeedback";
import { UserPersona } from "../models/UserPersona";
import { PostDraft } from "../models/PostDraft";

// ── Signal weights ────────────────────────────────────────────────────────────

export const SIGNAL_WEIGHTS = {
  loved: 1.0,
  good: 0.75,
  meh: 0.0, // neutral — no positive or negative signal
  bad: -1.0, // strong negative signal
} as const;

// Numeric rating values (for averageRating calculation)
const RATING_NUMERIC: Record<string, number> = {
  loved: 4,
  good: 3,
  meh: 2,
  bad: 1,
};

// ── Main function ─────────────────────────────────────────────────────────────

export async function aggregateAndUpdatePersona(userId: string): Promise<{
  signalsProcessed: number;
  updated: boolean;
}> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch feedback + published drafts in parallel
  const [feedbacks, publishedDrafts] = await Promise.all([
    SuggestionFeedback.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    PostDraft.find({
      userId: userObjectId,
      status: "published",
      // Only use drafts published in last 30 days for recency
      publishedAt: { $gte: thirtyDaysAgo },
    })
      .select("content charCount")
      .limit(30)
      .lean(),
  ]);

  if (feedbacks.length === 0 && publishedDrafts.length === 0) {
    return { signalsProcessed: 0, updated: false };
  }

  // ── 1. Topic scoring ───────────────────────────────────────────────────────
  const topicScores = new Map<string, number>();
  const formatScores = new Map<string, number>();
  let ratingSum = 0;
  let ratingCount = 0;

  for (const fb of feedbacks) {
    const topic = fb.suggestionSnapshot?.topic;
    const format = fb.suggestionSnapshot?.format;
    const weight = fb.rating
      ? (SIGNAL_WEIGHTS[fb.rating as keyof typeof SIGNAL_WEIGHTS] ?? 0)
      : 0;

    if (topic) {
      topicScores.set(topic, (topicScores.get(topic) ?? 0) + weight);
    }

    // Format scoring — only count positive signals (loved/good)
    if (format && (fb.rating === "loved" || fb.rating === "good")) {
      const fmtWeight = SIGNAL_WEIGHTS[fb.rating as keyof typeof SIGNAL_WEIGHTS];
      formatScores.set(format, (formatScores.get(format) ?? 0) + fmtWeight);
    }

    if (fb.rating) {
      ratingSum += RATING_NUMERIC[fb.rating] ?? 2;
      ratingCount++;
    }
  }

  // ── 2. Derive preferred / avoid topic lists ────────────────────────────────
  // preferredTopics: score > 0.5 (at least one "loved" or two "good")
  // avoidTopics: score < -0.3 (at least one clear "bad")
  const preferredTopics: string[] = [];
  const avoidTopics: string[] = [];

  for (const [topic, score] of topicScores.entries()) {
    if (score > 0.5) preferredTopics.push(topic);
    else if (score < -0.3) avoidTopics.push(topic);
  }

  // Sort by score magnitude — most preferred / most avoided first
  preferredTopics.sort((a, b) => (topicScores.get(b) ?? 0) - (topicScores.get(a) ?? 0));
  avoidTopics.sort((a, b) => (topicScores.get(a) ?? 0) - (topicScores.get(b) ?? 0));

  // ── 3. Normalise format preferences ───────────────────────────────────────
  const totalFormatSignal = [...formatScores.values()].reduce((a, b) => a + b, 0);
  const formatPreferences: Record<string, number> = {};
  if (totalFormatSignal > 0) {
    for (const [fmt, score] of formatScores.entries()) {
      formatPreferences[fmt] = Math.round((score / totalFormatSignal) * 100) / 100;
    }
  }

  const averageRating =
    ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0;

  // ── 4. Average content length from published drafts ────────────────────────
  let averageContentLength: number | undefined;
  if (publishedDrafts.length > 0) {
    const totalChars = publishedDrafts.reduce((sum, d) => {
      // prefer charCount field if stored, fall back to content.length
      const len =
        (d as { charCount?: number }).charCount ?? d.content?.length ?? 0;
      return sum + len;
    }, 0);
    averageContentLength = Math.round(totalChars / publishedDrafts.length);
  }

  // ── 5. Persist to UserPersona.feedbackProfile ──────────────────────────────
  const setPayload: Record<string, unknown> = {
    "feedbackProfile.preferredTopics": preferredTopics.slice(0, 10),
    "feedbackProfile.avoidTopics": avoidTopics.slice(0, 10),
    "feedbackProfile.formatPreferences": formatPreferences,
    "feedbackProfile.averageRating": averageRating,
    "feedbackProfile.totalFeedbackCount": feedbacks.length,
    "feedbackProfile.lastFeedbackAt": new Date(),
    lastLearningUpdate: new Date(),
  };

  if (averageContentLength !== undefined) {
    setPayload["feedbackProfile.averageContentLength"] = averageContentLength;
  }

  await UserPersona.updateOne({ userId: userObjectId }, { $set: setPayload });

  console.log(
    `[personaLearning] Updated feedbackProfile for user ${userId}: ` +
      `${preferredTopics.length} preferred topics, ${avoidTopics.length} avoid topics, ` +
      `avg rating ${averageRating}, avg content length ${averageContentLength ?? "N/A"}`,
  );

  return { signalsProcessed: feedbacks.length, updated: true };
}
