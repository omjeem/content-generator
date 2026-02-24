/**
 * UserPersonaService
 *
 * Centralises all UserPersona Mongoose operations so agents and routes
 * never need to import the model directly. Agents stay focused on LLM
 * orchestration; routes stay focused on HTTP handling.
 */

import mongoose from "mongoose";
import { UserPersona } from "../models/UserPersona";
import type { IUserPersonaDocument } from "../models/UserPersona";
import type { IPersonaPendingChanges } from "@repo/shared-types";

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Find the UserPersona for a given userId.
 * Returns null if none exists.
 *
 * Pass `lean: true` for read-only consumers that don't need the Mongoose document
 * (e.g. route GET handlers, context building).
 */
export async function findPersonaByUserId(
  userId: string,
): Promise<IUserPersonaDocument | null> {
  return UserPersona.findOne({ userId: new mongoose.Types.ObjectId(userId) });
}

export async function findPersonaByUserIdLean(
  userId: string,
): Promise<IUserPersonaDocument | null> {
  return UserPersona.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  }).lean() as Promise<IUserPersonaDocument | null>;
}

// ── Update arbitrary fields ───────────────────────────────────────────────────

/**
 * Update (or create) the UserPersona for a user by setting only the
 * non-undefined values from `changes`. Used by `applyPersonaChanges` and
 * the onboarding completion step.
 *
 * Returns the updated document.
 */
export async function updatePersonaFields(
  userId: string,
  changes: Partial<Record<string, unknown>>,
): Promise<IUserPersonaDocument> {
  // Filter out undefined values — only set fields that are explicitly provided
  const updateSet: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) updateSet[key] = value;
  }

  const updated = await UserPersona.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $set: updateSet },
    { new: true, upsert: true },
  );

  if (!updated) {
    throw new Error("Failed to update persona");
  }

  return updated;
}

// ── Apply persona changes (from personaChat agent) ────────────────────────────

/**
 * Commit AI-proposed persona changes to the DB. Equivalent to the
 * `applyPersonaChanges()` function that was previously inline in personaChat.ts.
 */
export async function applyPersonaChanges(
  userId: string,
  changes: IPersonaPendingChanges,
): Promise<IUserPersonaDocument> {
  const updateSet: Record<string, unknown> = {};

  if (changes.goals !== undefined) updateSet["goals"] = changes.goals;
  if (changes.targetAudience !== undefined)
    updateSet["targetAudience"] = changes.targetAudience;
  if (changes.industry !== undefined) updateSet["industry"] = changes.industry;
  if (changes.contentPillars !== undefined)
    updateSet["contentPillars"] = changes.contentPillars;
  if (changes.postingFrequency !== undefined)
    updateSet["postingFrequency"] = changes.postingFrequency;
  if (changes.topics !== undefined) updateSet["topics"] = changes.topics;
  if (changes.tone !== undefined) updateSet["tone"] = changes.tone;
  if (changes.writingStyle !== undefined)
    updateSet["writingStyle"] = changes.writingStyle;
  if (changes.platformGoal !== undefined)
    updateSet["platformGoal"] = changes.platformGoal;

  return updatePersonaFields(userId, updateSet);
}

// ── Onboarding completion ─────────────────────────────────────────────────────

/**
 * Upsert interview answers into UserPersona after the onboarding interview
 * completes. Only called once per user (when `interviewComplete` becomes true).
 */
export async function saveInterviewAnswers(
  userId: string,
  answers: {
    goals?: string | null;
    targetAudience?: string | null;
    industry?: string | null;
    contentPillars?: string[] | null;
    postingFrequency?: string | null;
  },
): Promise<IUserPersonaDocument> {
  return updatePersonaFields(userId, {
    goals: answers.goals,
    targetAudience: answers.targetAudience,
    industry: answers.industry,
    contentPillars: answers.contentPillars ?? [],
    postingFrequency: answers.postingFrequency,
    interviewComplete: true,
  });
}

// ── Interview status check ────────────────────────────────────────────────────

/**
 * Check how complete the onboarding interview is for a user.
 * Returns `complete` flag + list of any missing required fields.
 */
export async function getInterviewStatus(userId: string): Promise<{
  complete: boolean;
  missingFields: string[];
}> {
  const persona = await findPersonaByUserId(userId);

  if (!persona) {
    return {
      complete: false,
      missingFields: [
        "goals",
        "targetAudience",
        "industry",
        "contentPillars",
        "postingFrequency",
      ],
    };
  }

  const missingFields: string[] = [];
  if (!persona.goals) missingFields.push("goals");
  if (!persona.targetAudience) missingFields.push("targetAudience");
  if (!persona.industry) missingFields.push("industry");
  if (!persona.contentPillars?.length) missingFields.push("contentPillars");
  if (!persona.postingFrequency) missingFields.push("postingFrequency");

  return { complete: persona.interviewComplete, missingFields };
}
