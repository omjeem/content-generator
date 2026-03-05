/**
 * Persona Confidence Score — Phase 4 #22
 *
 * Deterministic scoring (no LLM) that measures how well we "know" a creator.
 * Score breakdown:
 *   postVolume       — max 25  (2.5 per post analyzed, up to 10 posts)
 *   interviewComplete — max 20  (4 per filled interview field, up to 5 fields)
 *   feedbackVolume   — max 25  (2.5 per feedback, up to 10 feedbacks)
 *   performanceData  — max 15  (5 per post with engagement data, up to 3)
 *   recency          — max 15  (decays 0.5/day from last activity)
 *
 * Overall: 0–100
 */

import type { IUserPersonaDocument } from "../models/UserPersona";
import { SuggestionFeedback } from "../models/SuggestionFeedback";
import { PostDraft } from "../models/PostDraft";

export interface IPersonaConfidenceScore {
  overall: number;
  breakdown: {
    postVolume: number;
    interviewComplete: number;
    feedbackVolume: number;
    performanceData: number;
    recency: number;
  };
}

/**
 * Compute a confidence score for the given persona document.
 * Performs 2 fast DB queries (feedback count, published drafts count).
 */
export async function computeConfidenceScore(
  persona: IUserPersonaDocument,
): Promise<IPersonaConfidenceScore> {
  // ── postVolume: min(25, totalPostsAnalyzed × 2.5) ─────────────────────
  const postVolume = Math.min(25, (persona.totalPostsAnalyzed ?? 0) * 2.5);

  // ── interviewComplete: 4 per filled interview field (max 20) ──────────
  const interviewFields = [
    persona.goals,
    persona.targetAudience,
    persona.industry,
    persona.contentPillars?.length ? "filled" : undefined,
    persona.platformGoal,
  ];
  const filledFields = interviewFields.filter(Boolean).length;
  const interviewComplete = Math.min(20, filledFields * 4);

  // ── feedbackVolume: min(25, totalFeedbackCount × 2.5) ─────────────────
  let totalFeedbackCount = persona.feedbackProfile?.totalFeedbackCount ?? 0;
  if (totalFeedbackCount === 0) {
    try {
      totalFeedbackCount = await SuggestionFeedback.countDocuments({
        userId: persona.userId,
      });
    } catch {
      // non-fatal
    }
  }
  const feedbackVolume = Math.min(25, totalFeedbackCount * 2.5);

  // ── performanceData: min(15, publishedDraftsCount × 5) ────────────────
  let publishedCount = 0;
  try {
    publishedCount = await PostDraft.countDocuments({
      userId: persona.userId,
      status: "published",
    });
  } catch {
    // non-fatal
  }
  const performanceData = Math.min(15, publishedCount * 5);

  // ── recency: 15 − (daysSinceLastActivity × 0.5, min 0) ───────────────
  const lastActivity = persona.lastPostAddedAt
    ?? persona.feedbackProfile?.lastFeedbackAt
    ?? persona.updatedAt;
  const daysSinceActivity = lastActivity
    ? (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    : 30;
  const recency = Math.max(0, 15 - daysSinceActivity * 0.5);

  // ── Overall ────────────────────────────────────────────────────────────
  const overall = Math.round(
    postVolume + interviewComplete + feedbackVolume + performanceData + recency,
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    breakdown: {
      postVolume: Math.round(postVolume * 10) / 10,
      interviewComplete: Math.round(interviewComplete * 10) / 10,
      feedbackVolume: Math.round(feedbackVolume * 10) / 10,
      performanceData: Math.round(performanceData * 10) / 10,
      recency: Math.round(recency * 10) / 10,
    },
  };
}
