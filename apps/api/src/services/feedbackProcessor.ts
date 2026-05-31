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
 *
 * Phase H #51: aggregateAndUpdatePersona is now imported from personaLearning.ts
 * (canonical implementation) instead of being defined locally.
 */

import { z } from "zod";
import { generateText } from "ai";
import { getModel } from "../llm/provider";
import { parseLLMJson } from "../llm/structured";
import {
  SuggestionFeedback,
  type ISuggestionFeedbackDocument,
} from "../models/SuggestionFeedback";
import mongoose from "mongoose";
import { aggregateAndUpdatePersona } from "./personaLearning";

// Structured shape extracted from free-text feedback.
const FeedbackSignalsSchema = z.object({
  topicRelevance: z.enum(["on-brand", "off-brand", "neutral"]),
  toneMatch: z.enum(["perfect", "close", "mismatch"]),
  formatPreference: z.enum(["liked-format", "disliked-format", "neutral"]),
  specificNotes: z.string().nullable().optional(),
});

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
  await _maybeTriggerLearning(feedback.userId.toString());
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
      model: getModel(),
      prompt,
    });

    // Extract + validate JSON, with model-driven repair on malformed output.
    const signals = await parseLLMJson(
      text,
      FeedbackSignalsSchema,
      "feedback signal parsing",
    );

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
 * Phase 3 #13: Reduced learning trigger interval.
 *
 * For the first 3 feedbacks, trigger on EVERY single one (immediate effect).
 * After that, trigger every 3rd feedback (was every 5th — too infrequent).
 *
 * Uses canonical aggregateAndUpdatePersona from personaLearning.ts (#51).
 */
async function _maybeTriggerLearning(userId: string): Promise<void> {
  try {
    const count = await SuggestionFeedback.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
    });

    // #13: First 3 feedbacks → trigger on every one; after that → every 3rd
    const shouldTrigger = count > 0 && (count <= 3 || count % 3 === 0);

    if (shouldTrigger) {
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
