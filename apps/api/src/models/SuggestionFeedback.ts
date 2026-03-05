import mongoose, { Schema, Document, Model } from "mongoose";

// ── Feedback enums ────────────────────────────────────────────────────────────

export type FeedbackRating = "loved" | "good" | "meh" | "bad";
export type FeedbackAction = "saved" | "draft" | "published" | "dismissed";

// ── Parsed signals — extracted from feedbackText by LLM or rules ──────────────

export interface IParsedFeedbackSignals {
  topicRelevance: "on-brand" | "off-brand" | "neutral";
  toneMatch: "perfect" | "close" | "mismatch";
  formatPreference: "liked-format" | "disliked-format" | "neutral";
  specificNotes?: string; // LLM-summarized key point from free-text
}

// ── Document interface ────────────────────────────────────────────────────────

export interface ISuggestionFeedbackDocument extends Document {
  userId: mongoose.Types.ObjectId;
  suggestionSetId: mongoose.Types.ObjectId; // ref to ContentSuggestion._id
  suggestionIndex: number; // which idea in the set (0-indexed)

  // Feedback signals
  rating?: FeedbackRating; // explicit quality signal
  action?: FeedbackAction; // what the user did with it
  feedbackText?: string; // optional free-text

  // Parsed signals (extracted from feedbackText by feedbackProcessor)
  parsedSignals?: IParsedFeedbackSignals;

  // Phase 4 #36: Implicit signal fields
  isImplicit?: boolean;
  implicitType?: string; // hook_copied, brief_copied, write_clicked, etc.
  implicitWeight?: number; // equivalent feedback weight (0.5× multiplier applied during learning)

  // Snapshot of the suggestion for historical reference
  suggestionSnapshot: {
    topic: string;
    angle: string;
    format: string;
    hook: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const suggestionFeedbackSchema = new Schema<ISuggestionFeedbackDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    suggestionSetId: {
      type: Schema.Types.ObjectId,
      ref: "ContentSuggestion",
      required: true,
    },
    suggestionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    rating: {
      type: String,
      enum: ["loved", "good", "meh", "bad"],
    },
    action: {
      type: String,
      enum: ["saved", "draft", "published", "dismissed"],
    },
    feedbackText: {
      type: String,
      maxlength: 1000,
    },
    parsedSignals: {
      type: Schema.Types.Mixed,
    },
    // Phase 4 #36: Implicit signal fields
    isImplicit: { type: Boolean, default: false },
    implicitType: { type: String },
    implicitWeight: { type: Number },
    suggestionSnapshot: {
      topic: { type: String, required: true },
      angle: { type: String, required: true },
      format: { type: String, required: true },
      hook: { type: String, required: true },
    },
  },
  { timestamps: true },
);

// Indexes
suggestionFeedbackSchema.index({ userId: 1, createdAt: -1 });
// Unique: one feedback record per user per suggestion per type
// Phase 4 #36: Added implicitType to allow both explicit + multiple implicit records
suggestionFeedbackSchema.index(
  { userId: 1, suggestionSetId: 1, suggestionIndex: 1, isImplicit: 1, implicitType: 1 },
  { unique: true },
);

export const SuggestionFeedback: Model<ISuggestionFeedbackDocument> =
  mongoose.model<ISuggestionFeedbackDocument>(
    "SuggestionFeedback",
    suggestionFeedbackSchema,
  );
