import mongoose, { Schema, Document, Model } from "mongoose";

// ── Post metadata — one entry per analysis batch ──────────────────────────────

export interface IPostBatchMetadata {
  batchId: string; // unique ID for this batch (UUID or timestamp-based)
  addedAt: Date;
  postCount: number;
  source: "manual" | "linkedin-scrape" | "add-posts";
}

// ── Persona snapshot — saved before each incremental update ───────────────────

export interface IPersonaSnapshot {
  snapshotAt: Date;
  personaVersion: number;
  writingStyle?: string;
  tone?: string;
  topics: string[];
  postFormats: string[];
  summary?: string;
}

// ── Feedback profile — auto-updated by personaLearning service ───────────────

export interface IFeedbackProfile {
  preferredTopics: string[]; // topics rated 'loved' or 'good'
  avoidTopics: string[]; // topics rated 'bad' multiple times
  formatPreferences: Record<string, number>; // percentage distribution e.g. {carousel: 0.4}
  tonePreference?: string; // extracted from feedback patterns
  averageRating: number; // rolling average of last 20 ratings (1-4)
  totalFeedbackCount: number;
  lastFeedbackAt?: Date;
  averageContentLength?: number; // avg char count from published drafts
}

export interface IUserPersonaDocument extends Document {
  userId: mongoose.Types.ObjectId;
  linkedinUrl?: string;
  scrapedPosts: string[];

  // ── Post tracking (new — #11) ──────────────────────────────────────────────
  postMetadata: IPostBatchMetadata[]; // history of all batches added
  totalPostsAnalyzed: number; // running total across all batches
  lastPostAddedAt?: Date; // timestamp of most recent batch
  personaVersion: number; // increments on each analysis
  analysisHistory: IPersonaSnapshot[]; // snapshots before each update

  // Derived from scraping + Gemini analysis
  writingStyle?: string;
  tone?: string;
  topics: string[];
  postFormats: string[];
  // Interview answers (from Agent 2)
  goals?: string;
  targetAudience?: string;
  industry?: string;
  contentPillars: string[];
  postingFrequency?: string;
  platformGoal?:
    | "thought-leadership"
    | "lead-generation"
    | "personal-brand"
    | "hiring"
    | "community-building";
  interviewComplete: boolean;

  // ── Continuous learning signals (Phase B #10) ──────────────────────────────
  feedbackProfile?: IFeedbackProfile; // auto-updated by personaLearning service
  lastLearningUpdate?: Date; // when feedbackProfile was last aggregated

  // ── Writing DNA — deterministic voice fingerprint (Phase 4 #17/18) ────
  writingDNA?: {
    avgSentenceLength: number;
    sentenceLengthVariance: number;
    avgParagraphLength: number;
    openingPatterns: { question: number; story: number; statistic: number; boldClaim: number; other: number };
    emojiFrequency: number;
    emojiTypes: string[];
    hashtagFrequency: number;
    hashtagPlacement: string;
    avgPostLength: number;
    postLengthRange: [number, number];
    usesListFormat: boolean;
    usesBulletPoints: boolean;
    lineBreakFrequency: number;
    readingLevel: string;
    firstPersonRatio: number;
    ctaPatterns: string[];
  };

  // ── Confidence score (Phase 4 #22/23) ─────────────────────────────────
  confidenceScore?: {
    overall: number;
    breakdown: {
      postVolume: number;
      interviewComplete: number;
      feedbackVolume: number;
      performanceData: number;
      recency: number;
    };
  };

  createdAt: Date;
  updatedAt: Date;
}

const postBatchMetadataSchema = new Schema<IPostBatchMetadata>(
  {
    batchId: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
    postCount: { type: Number, required: true },
    source: {
      type: String,
      enum: ["manual", "linkedin-scrape", "add-posts"],
      default: "manual",
    },
  },
  { _id: false },
);

const personaSnapshotSchema = new Schema<IPersonaSnapshot>(
  {
    snapshotAt: { type: Date, default: Date.now },
    personaVersion: { type: Number, required: true },
    writingStyle: { type: String },
    tone: { type: String },
    topics: { type: [String], default: [] },
    postFormats: { type: [String], default: [] },
    summary: { type: String },
  },
  { _id: false },
);

const userPersonaSchema = new Schema<IUserPersonaDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    linkedinUrl: { type: String, trim: true },
    // Phase 4 #6: Cap scrapedPosts at 500 entries
    scrapedPosts: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 500,
        message: "scrapedPosts cannot exceed 500 entries",
      },
    },

    // Post tracking
    postMetadata: { type: [postBatchMetadataSchema], default: [] },
    totalPostsAnalyzed: { type: Number, default: 0 },
    lastPostAddedAt: { type: Date },
    personaVersion: { type: Number, default: 0 },
    // Phase 4 #6: Cap analysisHistory at 20 snapshots
    analysisHistory: {
      type: [personaSnapshotSchema],
      default: [],
      validate: {
        validator: (v: IPersonaSnapshot[]) => v.length <= 20,
        message: "analysisHistory cannot exceed 20 snapshots",
      },
    },

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
    platformGoal: {
      type: String,
      enum: [
        "thought-leadership",
        "lead-generation",
        "personal-brand",
        "hiring",
        "community-building",
      ],
    },
    interviewComplete: { type: Boolean, default: false },

    // Continuous learning — updated by personaLearning service (#10)
    feedbackProfile: {
      type: new Schema(
        {
          preferredTopics: { type: [String], default: [] },
          avoidTopics: { type: [String], default: [] },
          // Phase 4 #4: Hardened from Schema.Types.Mixed to explicit typed sub-schema
          formatPreferences: {
            type: new Schema(
              {
                carousel: { type: Number, default: 0 },
                "text-post": { type: Number, default: 0 },
                poll: { type: Number, default: 0 },
                "video-script": { type: Number, default: 0 },
                list: { type: Number, default: 0 },
                tweet: { type: Number, default: 0 },
                thread: { type: Number, default: 0 },
              },
              { _id: false, strict: false }, // strict:false for backward compat
            ),
            default: {},
          },
          tonePreference: { type: String },
          averageRating: { type: Number, default: 0 },
          totalFeedbackCount: { type: Number, default: 0 },
          lastFeedbackAt: { type: Date },
          averageContentLength: { type: Number },
        },
        { _id: false },
      ),
    },
    lastLearningUpdate: { type: Date },

    // Writing DNA — Phase 4 #18
    writingDNA: {
      type: new Schema(
        {
          avgSentenceLength: { type: Number, default: 0 },
          sentenceLengthVariance: { type: Number, default: 0 },
          avgParagraphLength: { type: Number, default: 0 },
          openingPatterns: {
            type: new Schema(
              {
                question: { type: Number, default: 0 },
                story: { type: Number, default: 0 },
                statistic: { type: Number, default: 0 },
                boldClaim: { type: Number, default: 0 },
                other: { type: Number, default: 0 },
              },
              { _id: false },
            ),
            default: {},
          },
          emojiFrequency: { type: Number, default: 0 },
          emojiTypes: { type: [String], default: [] },
          hashtagFrequency: { type: Number, default: 0 },
          hashtagPlacement: { type: String, enum: ["inline", "end", "mixed", "none"], default: "none" },
          avgPostLength: { type: Number, default: 0 },
          postLengthRange: { type: [Number], default: [0, 0] },
          usesListFormat: { type: Boolean, default: false },
          usesBulletPoints: { type: Boolean, default: false },
          lineBreakFrequency: { type: Number, default: 0 },
          readingLevel: { type: String, enum: ["simple", "moderate", "advanced"], default: "moderate" },
          firstPersonRatio: { type: Number, default: 0 },
          ctaPatterns: { type: [String], default: [] },
        },
        { _id: false },
      ),
    },

    // Confidence score — Phase 4 #23
    confidenceScore: {
      type: new Schema(
        {
          overall: { type: Number, default: 0 },
          breakdown: {
            type: new Schema(
              {
                postVolume: { type: Number, default: 0 },
                interviewComplete: { type: Number, default: 0 },
                feedbackVolume: { type: Number, default: 0 },
                performanceData: { type: Number, default: 0 },
                recency: { type: Number, default: 0 },
              },
              { _id: false },
            ),
            default: {},
          },
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

export const UserPersona: Model<IUserPersonaDocument> =
  mongoose.model<IUserPersonaDocument>("UserPersona", userPersonaSchema);
