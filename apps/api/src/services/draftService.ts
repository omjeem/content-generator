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
import { PostDraft } from "../models/PostDraft";
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
