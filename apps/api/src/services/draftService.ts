/**
 * Draft Service — Phase D #23
 *
 * Business logic layer for post drafts. Keeps the route handlers thin.
 *
 * Functions:
 *   createDraft(userId, input)           — create a new draft
 *   getDraft(userId, draftId)            — get a single draft (user-scoped)
 *   listDrafts(userId, options)          — paginated list with optional status filter
 *   updateDraft(userId, draftId, changes) — update content/status, append to history
 *   deleteDraft(userId, draftId)         — hard delete
 *   buildEditorPromptContext(draft)      — returns plain-text brief for the editor agent
 */

import mongoose from "mongoose";
import crypto from "crypto";
import { PostDraft } from "../models/PostDraft";
import { UserPersona } from "../models/UserPersona";
import { analyzePersona } from "../agents/personaAnalyst";
import {
  deduplicatePosts,
  mergePersonaAnalysis,
  createPersonaSnapshot,
} from "./personaMerge";
import { checkTokenQuota, trackTokenUsage } from "./tokenUsage";
import type {
  IPostDraftDocument,
  IDraftBrief,
  DraftStatus,
  DraftPlatform,
} from "../models/PostDraft";

// ── createDraft ───────────────────────────────────────────────────────────────

export interface CreateDraftInput {
  sourceSuggestionSetId?: string;
  sourceSuggestionIndex?: number;
  platform?: DraftPlatform;
  title: string;
  content?: string;
  brief?: IDraftBrief;
}

export async function createDraft(
  userId: string,
  input: CreateDraftInput,
): Promise<IPostDraftDocument> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const content = input.content ?? "";
  const charCount = content.length;

  const draft = await PostDraft.create({
    userId: userObjectId,
    sourceSuggestionSetId: input.sourceSuggestionSetId
      ? new mongoose.Types.ObjectId(input.sourceSuggestionSetId)
      : undefined,
    sourceSuggestionIndex: input.sourceSuggestionIndex,
    platform: input.platform ?? "linkedin",
    title: input.title,
    content,
    charCount,
    brief: input.brief,
    status: "drafting",
    contentHistory:
      content.length > 0
        ? [{ content, editedAt: new Date(), editedBy: "user" }]
        : [],
  });

  return draft;
}

// ── getDraft ──────────────────────────────────────────────────────────────────

export async function getDraft(
  userId: string,
  draftId: string,
): Promise<IPostDraftDocument | null> {
  if (!mongoose.Types.ObjectId.isValid(draftId)) return null;

  return PostDraft.findOne({
    _id: draftId,
    userId: new mongoose.Types.ObjectId(userId),
  });
}

// ── listDrafts ────────────────────────────────────────────────────────────────

export interface ListDraftsOptions {
  status?: DraftStatus;
  page?: number;
  limit?: number;
}

export interface DraftListResult {
  data: IPostDraftDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listDrafts(
  userId: string,
  options: ListDraftsOptions = {},
): Promise<DraftListResult> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const skip = (page - 1) * limit;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const filter: Record<string, unknown> = { userId: userObjectId };
  if (options.status) filter["status"] = options.status;

  const [data, total] = await Promise.all([
    PostDraft.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PostDraft.countDocuments(filter),
  ]);

  return {
    data: data as IPostDraftDocument[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ── updateDraft ───────────────────────────────────────────────────────────────

export interface UpdateDraftInput {
  content?: string;
  title?: string;
  status?: DraftStatus;
  editedBy?: "user" | "ai";
  changeNote?: string;
}

export async function updateDraft(
  userId: string,
  draftId: string,
  changes: UpdateDraftInput,
): Promise<IPostDraftDocument | null> {
  const draft = await getDraft(userId, draftId);
  if (!draft) return null;

  // If content changed, append a history entry
  if (
    changes.content !== undefined &&
    changes.content !== draft.content
  ) {
    draft.contentHistory.push({
      content: changes.content,
      editedAt: new Date(),
      editedBy: changes.editedBy ?? "user",
      changeNote: changes.changeNote,
    });
    draft.content = changes.content;
    draft.charCount = changes.content.length;
  }

  if (changes.title !== undefined) draft.title = changes.title;
  if (changes.status !== undefined) draft.status = changes.status;

  await draft.save();
  return draft;
}

// ── applyAiContent ────────────────────────────────────────────────────────────

/**
 * Apply AI-generated content to a draft — records editedBy: 'ai' in history.
 * Called from the drafts route after the post editor agent responds.
 */
export async function applyAiContent(
  userId: string,
  draftId: string,
  content: string,
  charCount: number,
  changeNote?: string,
): Promise<IPostDraftDocument | null> {
  return updateDraft(userId, draftId, {
    content,
    editedBy: "ai",
    changeNote: changeNote ?? "AI edit",
  });
}

// ── deleteDraft ───────────────────────────────────────────────────────────────

export async function deleteDraft(
  userId: string,
  draftId: string,
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(draftId)) return false;

  const result = await PostDraft.deleteOne({
    _id: draftId,
    userId: new mongoose.Types.ObjectId(userId),
  });

  return result.deletedCount > 0;
}

// ── publishDraft ──────────────────────────────────────────────────────────────

export async function publishDraft(
  userId: string,
  draftId: string,
): Promise<IPostDraftDocument | null> {
  const draft = await getDraft(userId, draftId);
  if (!draft) return null;

  draft.status = "published";
  draft.publishedAt = new Date();
  await draft.save();
  return draft;
}

// ── feedPublishedDraftToPersona ───────────────────────────────────────────────

/**
 * Fire-and-forget: feeds the published draft's content back into the persona
 * pipeline as a new post sample. This reinforces the user's voice with their
 * own published writing.
 *
 * Only runs when:
 * - Draft content is ≥100 chars (enough signal for the persona analyser)
 * - The user has an existing persona to update (no-op if first-time)
 * - Token quota is not exceeded (silently skips if over limit)
 */
export function feedPublishedDraftToPersona(
  userId: string,
  draft: IPostDraftDocument,
): void {
  void _runFeedToPersona(userId, draft).catch((err) => {
    console.error("[draftService] feedPublishedDraftToPersona error:", err);
  });
}

async function _runFeedToPersona(
  userId: string,
  draft: IPostDraftDocument,
): Promise<void> {
  // Only feed posts with enough content to be meaningful
  const content = draft.content?.trim() ?? "";
  if (content.length < 100) return;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Load existing persona — skip if none (user hasn't completed onboarding)
  const existing = await UserPersona.findOne({ userId: userObjectId });
  if (!existing) return;

  // Deduplicate against existing posts
  const uniqueNewPosts = deduplicatePosts(existing.scrapedPosts ?? [], [content]);
  if (uniqueNewPosts.length === 0) return; // already in persona

  // Respect token quota — silently skip if exceeded
  const quota = await checkTokenQuota(userId);
  if (!quota.allowed) return;

  // Run persona analysis on the single published post
  const { analysis, usage } = await analyzePersona(uniqueNewPosts);

  // Track token usage — fire-and-forget
  trackTokenUsage({
    userId,
    agent: "persona-analyst",
    operation: "persona_analysis",
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
  });

  // Snapshot before update (for history)
  const snapshot = createPersonaSnapshot(existing);

  // Merge new analysis into existing persona
  const mergedFields = mergePersonaAnalysis(existing, analysis, uniqueNewPosts.length);

  const batchId = crypto.randomUUID();
  const now = new Date();

  await UserPersona.findOneAndUpdate(
    { userId: userObjectId },
    {
      $set: {
        ...mergedFields,
        lastPostAddedAt: now,
        totalPostsAnalyzed: (existing.totalPostsAnalyzed ?? 0) + uniqueNewPosts.length,
      },
      $inc: { personaVersion: 1 },
      $push: {
        scrapedPosts: { $each: uniqueNewPosts },
        analysisHistory: snapshot,
        postMetadata: {
          batchId,
          addedAt: now,
          postCount: uniqueNewPosts.length,
          source: "add-posts", // closest valid enum value for published drafts
        },
      },
    },
    { new: true },
  );

  console.log(
    `[draftService] Fed published draft ${draft._id} to persona for user ${userId}`,
  );
}
