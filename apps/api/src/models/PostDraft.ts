import mongoose, { Schema, Document, Model } from "mongoose";

// ── Enums ─────────────────────────────────────────────────────────────────────

export type DraftStatus = "drafting" | "ready" | "published";
export type DraftPlatform = "linkedin" | "twitter";

// ── Sub-document interfaces ───────────────────────────────────────────────────

export interface IContentHistoryEntry {
  content: string;
  editedAt: Date;
  editedBy: "user" | "ai";
  changeNote?: string;
}

export interface IDraftBrief {
  topic: string;
  angle: string;
  format: string;
  hook: string;
  postPointers: string[];
  callToAction: string;
  seoKeywords: string[];
}

export interface ITwitterTweet {
  tweetIndex: number;
  content: string;
  charCount: number;
}

// ── Document interface ────────────────────────────────────────────────────────

export interface IPostDraftDocument extends Document {
  userId: mongoose.Types.ObjectId;

  // Source — which suggestion sparked this draft
  sourceSuggestionSetId?: mongoose.Types.ObjectId; // ref ContentSuggestion
  sourceSuggestionIndex?: number; // which idea in the set

  // Content
  platform: DraftPlatform;
  title: string; // user-friendly title (from suggestion topic)
  content: string; // the actual post text
  contentHistory: IContentHistoryEntry[]; // version history

  // Brief snapshot (from suggestion)
  brief?: IDraftBrief;

  // Twitter-specific (only present when platform = 'twitter')
  twitterThread?: ITwitterTweet[];

  // Metadata
  status: DraftStatus;
  charCount: number;
  chatSessionId?: string; // ref to the editor chat session key
  publishedAt?: Date;

  // Phase 4 #41: Post performance data (user-reported)
  performanceData?: {
    likes: number;
    comments: number;
    reposts: number;
    impressions?: number;
    reportedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const contentHistorySchema = new Schema<IContentHistoryEntry>(
  {
    content: { type: String, required: true },
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: String, enum: ["user", "ai"], required: true },
    changeNote: { type: String },
  },
  { _id: false },
);

const draftBriefSchema = new Schema<IDraftBrief>(
  {
    topic: { type: String, required: true },
    angle: { type: String, default: "" },
    format: { type: String, default: "" },
    hook: { type: String, default: "" },
    postPointers: { type: [String], default: [] },
    callToAction: { type: String, default: "" },
    seoKeywords: { type: [String], default: [] },
  },
  { _id: false },
);

const twitterTweetSchema = new Schema<ITwitterTweet>(
  {
    tweetIndex: { type: Number, required: true },
    content: { type: String, required: true },
    charCount: { type: Number, required: true },
  },
  { _id: false },
);

const postDraftSchema = new Schema<IPostDraftDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceSuggestionSetId: {
      type: Schema.Types.ObjectId,
      ref: "ContentSuggestion",
    },
    sourceSuggestionIndex: {
      type: Number,
      min: 0,
    },
    platform: {
      type: String,
      enum: ["linkedin", "twitter"],
      default: "linkedin",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    content: {
      type: String,
      default: "",
    },
    contentHistory: {
      type: [contentHistorySchema],
      default: [],
    },
    brief: {
      type: draftBriefSchema,
    },
    twitterThread: {
      type: [twitterTweetSchema],
      default: undefined,
    },
    status: {
      type: String,
      enum: ["drafting", "ready", "published"],
      default: "drafting",
      required: true,
    },
    charCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    chatSessionId: {
      type: String,
    },
    publishedAt: {
      type: Date,
    },
    // Phase 4 #41: Post performance data
    performanceData: {
      type: new Schema(
        {
          likes: { type: Number, default: 0, min: 0 },
          comments: { type: Number, default: 0, min: 0 },
          reposts: { type: Number, default: 0, min: 0 },
          impressions: { type: Number, min: 0 },
          reportedAt: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

// Indexes
postDraftSchema.index({ userId: 1, status: 1, createdAt: -1 });
postDraftSchema.index({ userId: 1, createdAt: -1 });

export const PostDraft: Model<IPostDraftDocument> =
  mongoose.model<IPostDraftDocument>("PostDraft", postDraftSchema);
