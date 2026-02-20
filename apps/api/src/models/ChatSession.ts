import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IMessageDocument {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface IChatSessionDocument extends Document {
  userId: mongoose.Types.ObjectId
  sessionId: string
  agentType: 'onboarding' | 'orchestrator' | 'persona-chat'
  messages: IMessageDocument[]
  contextSummary?: string
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new Schema<IMessageDocument>(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
)

const chatSessionSchema = new Schema<IChatSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    agentType: {
      type: String,
      enum: ['onboarding', 'orchestrator', 'persona-chat'],
      required: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    contextSummary: { type: String },
  },
  { timestamps: true }
)

// Compound index: one session per user per agent type
chatSessionSchema.index({ userId: 1, agentType: 1 })
chatSessionSchema.index({ sessionId: 1 })

export const ChatSession: Model<IChatSessionDocument> = mongoose.model<IChatSessionDocument>(
  'ChatSession',
  chatSessionSchema
)
