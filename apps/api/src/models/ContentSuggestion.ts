import mongoose, { Schema, Document, Model } from "mongoose";
import type { PostFormat, SuggestionPlatform, IGenerateContextOptions } from "@repo/shared-types";

export type GenerationMode = "profile" | "topic-focus" | "chat-refined" | "trend-selected" | "persona-topics";

export interface ISuggestionItem {
  topic: string;
  angle: string;
  format: PostFormat;
  hook: string;
  whyItFits: string;
  // Rich content brief fields
  seoKeywords: string[];
  clickbaitHooks: string[];
  postPointers: string[];
  callToAction: string;
  /** Platform this suggestion targets — defaults to 'linkedin' (#33) */
  platform: SuggestionPlatform;
  /** Individual tweets for thread format — Twitter only (#33) */
  threadContent?: { tweetIndex: number; content: string; charCount: number }[];
}

/** Performance + cost metadata captured during runContentPipeline() (#54) */
export interface IGenerationMeta {
  pipelineDurationMs: number;
  trendFetchDurationMs: number;
  llmDurationMs: number;
  tokenCost: { input: number; output: number; total: number };
  trendSource: "live" | "fallback";
  modelId: string;
}

export interface IContentSuggestionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  generatedAt: Date;
  trendsUsed: string[];
  /** Top-level trendSource for fast querying in admin analytics (#57) */
  trendSource?: "live" | "fallback";
  suggestions: ISuggestionItem[];
  // Generation metadata (#17)
  generationMode: GenerationMode;
  contextOptions?: IGenerateContextOptions;
  // Generation analytics (#54)
  generationMeta?: IGenerationMeta;
  createdAt: Date;
}

const suggestionItemSchema = new Schema<ISuggestionItem>(
  {
    topic: { type: String, required: true },
    angle: { type: String, required: true },
    format: {
      type: String,
      enum: ["carousel", "text-post", "poll", "video-script", "list", "tweet", "thread", "quote-tweet", "image-tweet"],
      required: true,
    },
    hook: { type: String, required: true },
    whyItFits: { type: String, required: true },
    // Rich fields — default to [] / '' for backward-compat with old documents
    seoKeywords: { type: [String], default: [] },
    clickbaitHooks: { type: [String], default: [] },
    postPointers: { type: [String], default: [] },
    callToAction: { type: String, default: "" },
    // Platform targeting (#33) — defaults to 'linkedin' for backward-compat
    platform: {
      type: String,
      enum: ["linkedin", "twitter"],
      default: "linkedin",
    },
    // Twitter thread content — only populated for thread-format suggestions (#33)
    threadContent: {
      type: [
        new Schema(
          {
            tweetIndex: { type: Number, required: true },
            content: { type: String, required: true },
            charCount: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const contentSuggestionSchema = new Schema<IContentSuggestionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    trendsUsed: { type: [String], default: [] },
    /** Top-level trendSource — duplicates generationMeta.trendSource for fast analytics queries (#57) */
    trendSource: {
      type: String,
      enum: ["live", "fallback"],
    },
    // Phase 4 #6: Require at least 1 suggestion
    suggestions: {
      type: [suggestionItemSchema],
      required: true,
      validate: {
        validator: (v: ISuggestionItem[]) => v.length >= 1,
        message: "suggestions must contain at least 1 item",
      },
    },
    // Generation metadata (#17) — defaults to 'profile' for backward-compat
    generationMode: {
      type: String,
      enum: ["profile", "topic-focus", "chat-refined", "trend-selected", "persona-topics"],
      default: "profile",
    },
    // Phase 4 #5: Hardened from Schema.Types.Mixed to explicit typed sub-schema
    contextOptions: {
      type: new Schema(
        {
          mode: { type: String },
          topicFocus: { type: String },
          targetAudienceOverride: { type: String },
          platformGoal: { type: String },
          contentMix: { type: String },
          chatRefinementContext: { type: String },
          platforms: { type: [String], default: undefined },
          selectedTrendIds: { type: [String], default: undefined },
        },
        { _id: false, strict: false }, // strict:false for backward compat
      ),
      default: undefined,
    },
    // Generation analytics (#54) — optional, populated by runContentPipeline()
    generationMeta: {
      type: new Schema(
        {
          pipelineDurationMs: { type: Number },
          trendFetchDurationMs: { type: Number },
          llmDurationMs: { type: Number },
          tokenCost: {
            type: new Schema(
              {
                input: { type: Number, default: 0 },
                output: { type: Number, default: 0 },
                total: { type: Number, default: 0 },
              },
              { _id: false },
            ),
          },
          trendSource: { type: String, enum: ["live", "fallback"] },
          modelId: { type: String },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

contentSuggestionSchema.index({ userId: 1, createdAt: -1 });

export const ContentSuggestion: Model<IContentSuggestionDocument> =
  mongoose.model<IContentSuggestionDocument>(
    "ContentSuggestion",
    contentSuggestionSchema,
  );
