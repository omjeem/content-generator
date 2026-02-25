/**
 * Feedback Processor Service — Phase C #16
 *
 * Handles two jobs after a SuggestionFeedback document is created:
 *
 * 1. LLM signal parsing — if the user wrote free-text feedback, call Gemini
 *    to extract structured signals (topicRelevance, toneMatch, formatPreference,
 *    specificNotes) and persist them on the document via $set.
 *
 * 2. Persona learning trigger — every 5th feedback submission for a user,
 *    trigger aggregateAndUpdatePersona() as a fire-and-forget background job.
 *
 * ALL work is fire-and-forget. processFeedback() never throws — any error is
 * logged and swallowed so the API response is never blocked.
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import {
  SuggestionFeedback,
  type ISuggestionFeedbackDocument,
} from "../models/SuggestionFeedback";
import { UserPersona } from "../models/UserPersona";
import mongoose from "mongoose";

// ── Signal strength map ───────────────────────────────────────────────────────
// Maps rating → a numeric weight used by the learning aggregation.
const SIGNAL_STRENGTH: Record<string, number> = {
  loved: 1.0,
  good: 0.75,
  meh: 0.5,
  bad: 0.25,
};

// ── processFeedback ───────────────────────────────────────────────────────────

/**
 * Fire-and-forget: parse LLM signals from free-text and maybe trigger learning.
 * Returns void immediately — all async work runs in the background.
 */
export function processFeedback(
  feedback: ISuggestionFeedbackDocument,
): void {
  // Run everything in a background promise — never await
  void _runBackgroundProcessing(feedback).catch((err) => {
    console.error("[feedbackProcessor] Unhandled background error:", err);
  });
}

async function _runBackgroundProcessing(
  feedback: ISuggestionFeedbackDocument,
): Promise<void> {
  // Step 1: parse free-text if present
  if (feedback.feedbackText?.trim()) {
    await _parseFeedbackText(feedback);
  }

  // Step 2: check if we should trigger persona learning
  await _maybeTrigerLearning(feedback.userId.toString());
}

// ── Step 1: LLM signal parsing ────────────────────────────────────────────────

async function _parseFeedbackText(
  feedback: ISuggestionFeedbackDocument,
): Promise<void> {
  try {
    const prompt = `You are analyzing user feedback on a LinkedIn content suggestion.

Suggestion details:
- Topic: ${feedback.suggestionSnapshot.topic}
- Format: ${feedback.suggestionSnapshot.format}
- Rating: ${feedback.rating ?? "not given"}
- Action taken: ${feedback.action}

User's written feedback:
"${feedback.feedbackText}"

Analyze this feedback and return ONLY a valid JSON object:
{
  "topicRelevance": "on-brand" | "off-brand" | "neutral",
  "toneMatch": "perfect" | "close" | "mismatch",
  "formatPreference": "liked-format" | "disliked-format" | "neutral",
  "specificNotes": "1-2 sentence summary of the user's key point (or null if nothing specific)"
}`;

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt,
    });

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[feedbackProcessor] Could not extract JSON from LLM response");
      return;
    }

    const signals = JSON.parse(jsonMatch[0]);

    // Persist parsed signals on the feedback document
    await SuggestionFeedback.updateOne(
      { _id: feedback._id },
      { $set: { parsedSignals: signals } },
    );

    console.log(
      `[feedbackProcessor] Parsed signals for feedback ${String(feedback._id)}`,
    );
  } catch (err) {
    // Non-fatal — just log
    console.error("[feedbackProcessor] Signal parsing failed:", err);
  }
}

// ── Step 2: Persona learning trigger ─────────────────────────────────────────

/**
 * Every 5th feedback from a user, run the learning aggregation.
 * Checks the total feedback count for this user and triggers if divisible by 5.
 */
async function _maybeTrigerLearning(userId: string): Promise<void> {
  try {
    const count = await SuggestionFeedback.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (count > 0 && count % 5 === 0) {
      console.log(
        `[feedbackProcessor] Triggering persona learning for user ${userId} (${count} total feedbacks)`,
      );
      // Fire-and-forget — don't await
      void aggregateAndUpdatePersona(userId).catch((err) => {
        console.error("[feedbackProcessor] Learning aggregation failed:", err);
      });
    }
  } catch (err) {
    console.error("[feedbackProcessor] Learning trigger check failed:", err);
  }
}

// ── aggregateAndUpdatePersona ─────────────────────────────────────────────────

/**
 * Aggregate all recent feedback signals for a user and update their
 * UserPersona.feedbackProfile. Uses the last 50 feedback documents.
 *
 * This is also called directly by Phase H (persona learning service).
 */
export async function aggregateAndUpdatePersona(userId: string): Promise<{
  signalsProcessed: number;
  updated: boolean;
}> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Fetch the last 50 feedback records for this user
  const feedbacks = await SuggestionFeedback.find({ userId: userObjectId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (feedbacks.length === 0) {
    return { signalsProcessed: 0, updated: false };
  }

  // ── Tally preferred and avoided topics ───────────────────────────────────
  const topicScores = new Map<string, number>();
  const formatScores = new Map<string, number>();
  let ratingSum = 0;
  let ratingCount = 0;

  const RATING_NUMERIC: Record<string, number> = {
    loved: 4,
    good: 3,
    meh: 2,
    bad: 1,
  };

  for (const fb of feedbacks) {
    const topic = fb.suggestionSnapshot?.topic;
    const format = fb.suggestionSnapshot?.format;
    const signalStrength = fb.rating
      ? (SIGNAL_STRENGTH[fb.rating] ?? 0.5)
      : 0.5;

    // Topic scoring: loved/good → positive, bad → strongly negative
    if (topic) {
      const existing = topicScores.get(topic) ?? 0;
      const delta =
        fb.rating === "bad"
          ? -1
          : fb.rating === "meh"
            ? 0
            : signalStrength;
      topicScores.set(topic, existing + delta);
    }

    // Format scoring: accumulate signal strength
    if (format) {
      formatScores.set(format, (formatScores.get(format) ?? 0) + signalStrength);
    }

    // Average rating
    if (fb.rating) {
      ratingSum += RATING_NUMERIC[fb.rating] ?? 2;
      ratingCount++;
    }
  }

  // ── Derive preferred / avoid topic lists ─────────────────────────────────
  const preferredTopics: string[] = [];
  const avoidTopics: string[] = [];

  for (const [topic, score] of topicScores.entries()) {
    if (score >= 0.75) preferredTopics.push(topic);
    else if (score < 0) avoidTopics.push(topic);
  }

  // ── Normalise format preferences to percentages ───────────────────────────
  const totalFormatSignal = [...formatScores.values()].reduce(
    (a, b) => a + b,
    0,
  );
  const formatPreferences: Record<string, number> = {};
  if (totalFormatSignal > 0) {
    for (const [fmt, score] of formatScores.entries()) {
      formatPreferences[fmt] = Math.round((score / totalFormatSignal) * 100) / 100;
    }
  }

  const averageRating =
    ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0;

  // ── Update persona feedbackProfile ────────────────────────────────────────
  await UserPersona.updateOne(
    { userId: userObjectId },
    {
      $set: {
        "feedbackProfile.preferredTopics": preferredTopics.slice(0, 10),
        "feedbackProfile.avoidTopics": avoidTopics.slice(0, 10),
        "feedbackProfile.formatPreferences": formatPreferences,
        "feedbackProfile.averageRating": averageRating,
        "feedbackProfile.totalFeedbackCount": feedbacks.length,
        "feedbackProfile.lastFeedbackAt": new Date(),
        lastLearningUpdate: new Date(),
      },
    },
  );

  console.log(
    `[feedbackProcessor] Updated feedbackProfile for user ${userId}: ` +
      `${preferredTopics.length} preferred, ${avoidTopics.length} avoid, avg rating ${averageRating}`,
  );

  return { signalsProcessed: feedbacks.length, updated: true };
}
