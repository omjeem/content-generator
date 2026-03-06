import mongoose from "mongoose";
import { PostDraft } from "../models/PostDraft";
import { ContentSuggestion } from "../models/ContentSuggestion";
import { SuggestionFeedback } from "../models/SuggestionFeedback";
import { aggregateAndUpdatePersona } from "./personaLearning";
import { fireAndForget } from "../utils/fireAndForget";

/**
 * Performance Tracker — Phase 4 #49
 *
 * Links published draft performance back to the original suggestion and
 * triggers weighted learning updates via the existing persona learning pipeline.
 *
 * Flow:
 *   1. Look up the draft and its performance data
 *   2. Compute engagement score and compare to median across user's posts
 *   3. Create a SuggestionFeedback record with performance-based rating
 *   4. Fire-and-forget aggregateAndUpdatePersona() to re-learn from new signal
 *
 * Weight: high-engagement = "loved" rating with "published" action,
 *         low-engagement  = "good" rating with "published" action.
 * The existing personaLearning service handles action multipliers and decay.
 */
export async function processPerformanceData(
  userId: string,
  draftId: string,
): Promise<void> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const draft = await PostDraft.findOne({ _id: draftId, userId: userObjectId }).lean();
  if (!draft?.performanceData || !draft.sourceSuggestionSetId) return;

  const { likes = 0, comments = 0, reposts = 0 } = draft.performanceData;
  const engagementScore = likes + comments * 2 + reposts * 3;

  // Compute median engagement from all user's reported posts
  const allReportedDrafts = await PostDraft.find({
    userId: userObjectId,
    "performanceData.reportedAt": { $exists: true },
  }).select("performanceData").lean();

  const scores = allReportedDrafts
    .map((d) => {
      const pd = d.performanceData;
      if (!pd) return 0;
      return (pd.likes ?? 0) + (pd.comments ?? 0) * 2 + (pd.reposts ?? 0) * 3;
    })
    .sort((a, b) => a - b);

  const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)]! : 0;

  const isHighEngagement = engagementScore > median && scores.length >= 3;

  // Find original suggestion
  const suggestionSet = await ContentSuggestion.findById(draft.sourceSuggestionSetId).lean();
  if (!suggestionSet) return;

  const suggestionIndex = draft.sourceSuggestionIndex ?? 0;
  const suggestion = suggestionSet.suggestions[suggestionIndex];
  if (!suggestion) return;

  // Create a SuggestionFeedback record so the existing personaLearning
  // pipeline picks up this performance signal on next aggregation.
  // Rating: "loved" for high-engagement, "good" for normal.
  // Action: "published" — the strongest action multiplier (2.0x).
  try {
    await SuggestionFeedback.create({
      userId: userObjectId,
      suggestionSetId: draft.sourceSuggestionSetId,
      suggestionIndex,
      rating: isHighEngagement ? "loved" : "good",
      action: "published",
      suggestionSnapshot: {
        topic: suggestion.topic,
        format: suggestion.format,
        angle: suggestion.angle,
        hook: suggestion.hook,
      },
      feedbackText: `[auto:performance] engagement=${engagementScore} median=${median} high=${isHighEngagement}`,
    });
  } catch (err) {
    console.error("[performanceTracker] Failed to create feedback record:", err);
    return;
  }

  // Fire-and-forget: re-aggregate persona learning with the new feedback signal
  fireAndForget(async () => {
    await aggregateAndUpdatePersona(userId);
  }, "performanceTracker:learn");
}
