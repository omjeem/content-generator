import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IUserPersonaDocument extends Document {
  userId: mongoose.Types.ObjectId
  linkedinUrl?: string
  scrapedPosts: string[]
  // Derived from scraping + Gemini analysis
  writingStyle?: string
  tone?: string
  topics: string[]
  postFormats: string[]
  // Interview answers (from Agent 2)
  goals?: string
  targetAudience?: string
  industry?: string
  contentPillars: string[]
  postingFrequency?: string
  interviewComplete: boolean
  createdAt: Date
  updatedAt: Date
}

const userPersonaSchema = new Schema<IUserPersonaDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    linkedinUrl: { type: String, trim: true },
    scrapedPosts: { type: [String], default: [] },
    // Gemini-derived analysis
    writingStyle: { type: String },
    tone: { type: String },
    topics: { type: [String], default: [] },
    postFormats: { type: [String], default: [] },
    // Interview fields
    goals: { type: String },
    targetAudience: { type: String },
    industry: { type: String },
    contentPillars: { type: [String], default: [] },
    postingFrequency: { type: String },
    interviewComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const UserPersona: Model<IUserPersonaDocument> = mongoose.model<IUserPersonaDocument>(
  'UserPersona',
  userPersonaSchema
)
