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
 * Phase 3 Audit:
 *   #15 — Action weight multiplier (published=2x, draft=1.5x)
 *   #16 — Recency decay weighting (14-day half-life)
 *   #18 — Populate tonePreference from parsedSignals
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

// #15: Action weight multipliers — behavioral signal strength
const ACTION_MULTIPLIER: Record<string, number> = {
  published: 2.0, // strongest — user actually used this
  draft: 1.5, // strong — user invested time writing
  saved: 1.2, // moderate — user bookmarked for later
  dismissed: 1.0, // base — explicit rejection (combined with rating)
};

// Numeric rating values (for averageRating calculation)
const RATING_NUMERIC: Record<string, number> = {
  loved: 4,
  good: 3,
  meh: 2,
  bad: 1,
};

// #16: Recency decay constants
const DECAY_HALF_LIFE_DAYS = 14; // signal halves in importance every 2 weeks

// ── Main function ─────────────────────────────────────────────────────────────

export async function aggregateAndUpdatePersona(userId: string): Promise<{
  signalsProcessed: number;
  updated: boolean;
}> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch feedback + published drafts + persona in parallel
  const [feedbacks, publishedDrafts, persona] = await Promise.all([
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
    UserPersona.findOne({ userId: userObjectId }).lean(),
  ]);

  if (feedbacks.length === 0 && publishedDrafts.length === 0) {
    return { signalsProcessed: 0, updated: false };
  }

  // ── 1. Topic + format scoring (#15 action weights, #16 recency decay) ─────
  const topicScores = new Map<string, number>();
  const formatScores = new Map<string, number>();
  let ratingSum = 0;
  let ratingCount = 0;
  const now = Date.now();

  for (const fb of feedbacks) {
    const topic = fb.suggestionSnapshot?.topic;
    const format = fb.suggestionSnapshot?.format;

    // Base rating weight
    const ratingWeight = fb.rating
      ? (SIGNAL_WEIGHTS[fb.rating as keyof typeof SIGNAL_WEIGHTS] ?? 0)
      : 0;

    // #15: Action weight multiplier
    const actionMultiplier = ACTION_MULTIPLIER[fb.action] ?? 1.0;

    // #16: Recency decay — exponential decay with 14-day half-life
    const ageMs = now - new Date(fb.createdAt).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recencyMultiplier = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);

    // Combined weight
    let weight: number;
    if (fb.rating) {
      weight = ratingWeight * actionMultiplier * recencyMultiplier;
    } else {
      // #15: Implicit action signal when no rating is given
      const implicitSignal =
        fb.action === "published"
          ? 1.5
          : fb.action === "draft"
            ? 0.5
            : fb.action === "dismissed"
              ? -0.5
              : 0;
      weight = implicitSignal * recencyMultiplier;
    }

    if (topic) {
      topicScores.set(topic, (topicScores.get(topic) ?? 0) + weight);
    }

    // Format scoring — count positive signals (loved/good) and implicit positive actions
    const isPositiveSignal =
      fb.rating === "loved" ||
      fb.rating === "good" ||
      (!fb.rating && (fb.action === "published" || fb.action === "draft"));

    if (format && isPositiveSignal) {
      const fmtWeight = Math.abs(weight); // use absolute value for format distribution
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

  // ── 5. Derive tonePreference (#18) ────────────────────────────────────────
  // If 2+ feedbacks have parsedSignals.toneMatch === "perfect", set tone preference
  let tonePreference: string | undefined;
  const perfectToneCount = feedbacks.filter(
    (fb) =>
      fb.parsedSignals?.toneMatch === "perfect" &&
      (fb.rating === "loved" || fb.rating === "good"),
  ).length;

  if (perfectToneCount >= 2 && persona) {
    tonePreference =
      (persona as { tone?: string }).tone ?? "Professional";
  }

  // ── 6. Persist to UserPersona.feedbackProfile ──────────────────────────────
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

  // #18: Populate tonePreference
  if (tonePreference) {
    setPayload["feedbackProfile.tonePreference"] = tonePreference;
  }

  await UserPersona.updateOne({ userId: userObjectId }, { $set: setPayload });

  console.log(
    `[personaLearning] Updated feedbackProfile for user ${userId}: ` +
      `${preferredTopics.length} preferred topics, ${avoidTopics.length} avoid topics, ` +
      `avg rating ${averageRating}, avg content length ${averageContentLength ?? "N/A"}` +
      (tonePreference ? `, tone: ${tonePreference}` : ""),
  );

  return { signalsProcessed: feedbacks.length, updated: true };
}
