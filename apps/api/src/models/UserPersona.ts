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
    scrapedPosts: { type: [String], default: [] },

    // Post tracking
    postMetadata: { type: [postBatchMetadataSchema], default: [] },
    totalPostsAnalyzed: { type: Number, default: 0 },
    lastPostAddedAt: { type: Date },
    personaVersion: { type: Number, default: 0 },
    analysisHistory: { type: [personaSnapshotSchema], default: [] },

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
  },
  { timestamps: true },
);

export const UserPersona: Model<IUserPersonaDocument> =
  mongoose.model<IUserPersonaDocument>("UserPersona", userPersonaSchema);
