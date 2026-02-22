import mongoose, { Schema, Document, Model } from 'mongoose'

// ── Agent & operation type enums ──────────────────────────────────────────────

export type AgentName =
  | 'persona-analyst'
  | 'onboarding'
  | 'trend-research'
  | 'content-generator'
  | 'persona-chat'
  | 'refine-context'

export type OperationType =
  | 'persona_analysis'
  | 'onboarding_chat'
  | 'trend_research'
  | 'content_generation'
  | 'persona_chat'
  | 'refine_context'

// ── Document interface ─────────────────────────────────────────────────────────

export interface ITokenUsageLogDocument extends Document {
  userId: mongoose.Types.ObjectId
  agent: AgentName
  operation: OperationType
  inputTokens: number
  outputTokens: number
  totalTokens: number
  metadata: {
    suggestionId?: string
    sessionId?: string
  }
  createdAt: Date
}

// ── Schema ────────────────────────────────────────────────────────────────────

const tokenUsageLogSchema = new Schema<ITokenUsageLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agent: {
      type: String,
      required: true,
      enum: [
        'persona-analyst',
        'onboarding',
        'trend-research',
        'content-generator',
        'persona-chat',
        'refine-context',
      ],
    },
    operation: {
      type: String,
      required: true,
      enum: [
        'persona_analysis',
        'onboarding_chat',
        'trend_research',
        'content_generation',
        'persona_chat',
        'refine_context',
      ],
    },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, required: true, min: 0 },
    metadata: {
      suggestionId: { type: String },
      sessionId: { type: String },
    },
  },
  {
    // Only createdAt — no updatedAt needed for immutable log entries
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// Compound index: fast per-user log lookups sorted by date (most common query)
tokenUsageLogSchema.index({ userId: 1, createdAt: -1 })

export const TokenUsageLog: Model<ITokenUsageLogDocument> =
  mongoose.model<ITokenUsageLogDocument>('TokenUsageLog', tokenUsageLogSchema)
