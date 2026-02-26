import mongoose, { Schema, Document, Model } from "mongoose";
import type { PostFormat, SuggestionPlatform, IGenerateContextOptions } from "@repo/shared-types";

export type GenerationMode = "profile" | "topic-focus" | "chat-refined";

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

export interface IContentSuggestionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  generatedAt: Date;
  trendsUsed: string[];
  suggestions: ISuggestionItem[];
  // Generation metadata (#17)
  generationMode: GenerationMode;
  contextOptions?: IGenerateContextOptions;
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
    suggestions: { type: [suggestionItemSchema], required: true },
    // Generation metadata (#17) — defaults to 'profile' for backward-compat
    generationMode: {
      type: String,
      enum: ["profile", "topic-focus", "chat-refined"],
      default: "profile",
    },
    contextOptions: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

contentSuggestionSchema.index({ userId: 1, createdAt: -1 });

export const ContentSuggestion: Model<IContentSuggestionDocument> =
  mongoose.model<IContentSuggestionDocument>(
    "ContentSuggestion",
    contentSuggestionSchema,
  );
