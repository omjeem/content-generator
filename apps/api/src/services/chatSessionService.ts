/**
 * ChatSessionService
 *
 * Centralises all ChatSession Mongoose operations so that agents and routes
 * never touch the model directly. This keeps agents as pure orchestration
 * (parse LLM → call service → return) and routes as thin wrappers
 * (validate → call agent/service → respond).
 */

import mongoose from "mongoose";
import { ChatSession } from "../models/ChatSession";
import type { IChatSessionDocument } from "../models/ChatSession";

// ── Agent type alias ─────────────────────────────────────────────────────────

export type AgentType = "onboarding" | "persona-chat" | "post-editor";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionHistory {
  messages: ChatMessage[];
  sessionId: string | null;
}

// ── findOrCreate ──────────────────────────────────────────────────────────────

/**
 * Load the chat session for a user+agent pair, or create a new one atomically.
 *
 * Uses findOneAndUpdate with upsert=true to prevent duplicate sessions under
 * concurrent requests (#56). $setOnInsert only runs on document creation.
 *
 * @param userId      The user's string ID
 * @param agentType   The agent type key
 * @param sessionIdOverride  Optional custom sessionId (used for post-editor per-draft sessions)
 */
export async function findOrCreateSession(
  userId: string,
  agentType: AgentType,
  sessionIdOverride?: string,
): Promise<IChatSessionDocument> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const sessionId = sessionIdOverride ?? `${agentType}-${userId}`;

  const session = await ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: {
        userId: userObjectId,
        sessionId,
        agentType,
        messages: [],
      },
    },
    { upsert: true, new: true },
  );

  return session;
}

// ── findOrCreateEditorSession ─────────────────────────────────────────────────

/**
 * Load or create a post-editor chat session scoped to a specific draft.
 * Each draft gets its own isolated session so conversations don't bleed
 * between different posts.
 */
export async function findOrCreateEditorSession(
  userId: string,
  draftId: string,
): Promise<IChatSessionDocument> {
  return findOrCreateSession(userId, "post-editor", `post-editor-${draftId}`);
}

// ── persistMessages ───────────────────────────────────────────────────────────

/**
 * Append a user message and an assistant reply to an existing session and save.
 * Both messages get the current timestamp.
 */
export async function persistMessages(
  session: IChatSessionDocument,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const now = new Date();
  session.messages.push({ role: "user", content: userMessage, timestamp: now });
  session.messages.push({
    role: "assistant",
    content: assistantReply,
    timestamp: now,
  });
  await session.save();
}

// ── getHistory ────────────────────────────────────────────────────────────────

/**
 * Return the message history for a user+agent pair without creating a session.
 * Used by GET /history and GET /session route handlers.
 * Returns null if no session exists.
 */
export async function getSessionHistory(
  userId: string,
  agentType: AgentType,
): Promise<SessionHistory> {
  const session = await ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    agentType,
  }).lean();

  if (!session) {
    return { messages: [], sessionId: null };
  }

  return {
    messages: session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    sessionId: session.sessionId,
  };
}

/**
 * Return the full session document (with all Mongoose fields) for a
 * user+agent pair. Returns null if no session exists.
 * Used by onboarding GET /session route to access full message objects.
 */
export async function findSession(
  userId: string,
  agentType: AgentType,
): Promise<IChatSessionDocument | null> {
  return ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    agentType,
  });
}
