/**
 * ChatSessionService
 *
 * Centralises all ChatSession Mongoose operations so that agents and routes
 * never touch the model directly. This keeps agents as pure orchestration
 * (parse LLM → call service → return) and routes as thin wrappers
 * (validate → call agent/service → respond).
 */

import mongoose from 'mongoose'
import { ChatSession } from '../models/ChatSession'
import type { IChatSessionDocument } from '../models/ChatSession'

// ── Agent type alias ─────────────────────────────────────────────────────────

export type AgentType = 'onboarding' | 'persona-chat'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SessionHistory {
  messages: ChatMessage[]
  sessionId: string | null
}

// ── findOrCreate ──────────────────────────────────────────────────────────────

/**
 * Load the chat session for a user+agent pair, or create a new one if it
 * doesn't exist yet. This is the primary entry point used by both agents.
 */
export async function findOrCreateSession(
  userId: string,
  agentType: AgentType
): Promise<IChatSessionDocument> {
  const userObjectId = new mongoose.Types.ObjectId(userId)

  let session = await ChatSession.findOne({ userId: userObjectId, agentType })

  if (!session) {
    session = await ChatSession.create({
      userId: userObjectId,
      sessionId: `${agentType}-${userId}`,
      agentType,
      messages: [],
    })
  }

  return session
}

// ── persistMessages ───────────────────────────────────────────────────────────

/**
 * Append a user message and an assistant reply to an existing session and save.
 * Both messages get the current timestamp.
 */
export async function persistMessages(
  session: IChatSessionDocument,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const now = new Date()
  session.messages.push({ role: 'user', content: userMessage, timestamp: now })
  session.messages.push({ role: 'assistant', content: assistantReply, timestamp: now })
  await session.save()
}

// ── getHistory ────────────────────────────────────────────────────────────────

/**
 * Return the message history for a user+agent pair without creating a session.
 * Used by GET /history and GET /session route handlers.
 * Returns null if no session exists.
 */
export async function getSessionHistory(
  userId: string,
  agentType: AgentType
): Promise<SessionHistory> {
  const session = await ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    agentType,
  }).lean()

  if (!session) {
    return { messages: [], sessionId: null }
  }

  return {
    messages: session.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    sessionId: session.sessionId,
  }
}

/**
 * Return the full session document (with all Mongoose fields) for a
 * user+agent pair. Returns null if no session exists.
 * Used by onboarding GET /session route to access full message objects.
 */
export async function findSession(
  userId: string,
  agentType: AgentType
): Promise<IChatSessionDocument | null> {
  return ChatSession.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    agentType,
  })
}
