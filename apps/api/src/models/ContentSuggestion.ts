import mongoose, { Schema, Document, Model } from 'mongoose'
import type { PostFormat, IGenerateContextOptions } from '@repo/shared-types'

export type GenerationMode = 'profile' | 'topic-focus' | 'chat-refined'

export interface ISuggestionItem {
  topic: string
  angle: string
  format: PostFormat
  hook: string
  whyItFits: string
  // Rich content brief fields
  seoKeywords: string[]
  clickbaitHooks: string[]
  postPointers: string[]
  callToAction: string
}

export interface IContentSuggestionDocument extends Document {
  userId: mongoose.Types.ObjectId
  generatedAt: Date
  trendsUsed: string[]
  suggestions: ISuggestionItem[]
  // Generation metadata (#17)
  generationMode: GenerationMode
  contextOptions?: IGenerateContextOptions
  createdAt: Date
}

const suggestionItemSchema = new Schema<ISuggestionItem>(
  {
    topic: { type: String, required: true },
    angle: { type: String, required: true },
    format: {
      type: String,
      enum: ['carousel', 'text-post', 'poll', 'video-script', 'list'],
      required: true,
    },
    hook: { type: String, required: true },
    whyItFits: { type: String, required: true },
    // Rich fields — default to [] / '' for backward-compat with old documents
    seoKeywords: { type: [String], default: [] },
    clickbaitHooks: { type: [String], default: [] },
    postPointers: { type: [String], default: [] },
    callToAction: { type: String, default: '' },
  },
  { _id: false }
)

const contentSuggestionSchema = new Schema<IContentSuggestionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    trendsUsed: { type: [String], default: [] },
    suggestions: { type: [suggestionItemSchema], required: true },
    // Generation metadata (#17) — defaults to 'profile' for backward-compat
    generationMode: {
      type: String,
      enum: ['profile', 'topic-focus', 'chat-refined'],
      default: 'profile',
    },
    contextOptions: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)

contentSuggestionSchema.index({ userId: 1, createdAt: -1 })

export const ContentSuggestion: Model<IContentSuggestionDocument> =
  mongoose.model<IContentSuggestionDocument>('ContentSuggestion', contentSuggestionSchema)
