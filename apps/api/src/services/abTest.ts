/**
 * A/B Test Framework — Phase 4 #50
 *
 * For 10% of generation requests, stores shadow results alongside served results.
 * Future: compare engagement rates between approaches.
 */

import { ContentSuggestion } from "../models/ContentSuggestion";
import mongoose from "mongoose";

export interface IAbTestData {
  servedPath: "default" | "experimental";
  shadowResult?: {
    suggestions: unknown[];
    generatedAt: Date;
  };
  enrolledAt: Date;
}

const AB_TEST_ENROLLMENT_RATE = 0.10; // 10%

/**
 * Determine if this request should be enrolled in A/B testing.
 */
export function shouldEnrollInAbTest(): boolean {
  return Math.random() < AB_TEST_ENROLLMENT_RATE;
}

/**
 * Store shadow (experimental) results alongside the served suggestion set.
 */
export async function storeShadowResult(
  suggestionSetId: string,
  shadowSuggestions: unknown[],
): Promise<void> {
  try {
    await ContentSuggestion.updateOne(
      { _id: new mongoose.Types.ObjectId(suggestionSetId) },
      {
        $set: {
          "abTestData.shadowResult": {
            suggestions: shadowSuggestions,
            generatedAt: new Date(),
          },
        },
      }
    );
  } catch (err) {
    console.error("[abTest] Failed to store shadow result:", err);
  }
}

/**
 * Mark a suggestion set as enrolled in A/B testing with the served path.
 */
export async function markAbTestEnrollment(
  suggestionSetId: string,
  servedPath: "default" | "experimental" = "default",
): Promise<void> {
  try {
    await ContentSuggestion.updateOne(
      { _id: new mongoose.Types.ObjectId(suggestionSetId) },
      {
        $set: {
          "abTestData.servedPath": servedPath,
          "abTestData.enrolledAt": new Date(),
        },
      }
    );
  } catch (err) {
    console.error("[abTest] Failed to mark enrollment:", err);
  }
}

/**
 * Get A/B test comparison stats (engagement rates per path).
 */
export async function getAbTestStats(): Promise<{
  defaultPath: { count: number; avgFeedbackRate: number };
  experimentalPath: { count: number; avgFeedbackRate: number };
  totalEnrolled: number;
}> {
  const pipeline = [
    { $match: { "abTestData.servedPath": { $exists: true } } },
    {
      $group: {
        _id: "$abTestData.servedPath",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await ContentSuggestion.aggregate(pipeline);

  const defaultResult = results.find((r) => r._id === "default");
  const experimentalResult = results.find((r) => r._id === "experimental");

  return {
    defaultPath: { count: defaultResult?.count ?? 0, avgFeedbackRate: 0 },
    experimentalPath: { count: experimentalResult?.count ?? 0, avgFeedbackRate: 0 },
    totalEnrolled: (defaultResult?.count ?? 0) + (experimentalResult?.count ?? 0),
  };
}
