import mongoose, { Schema, Document } from "mongoose";

export interface IAudienceInsightDocument extends Document {
  userId: mongoose.Types.ObjectId;
  postDraftId?: mongoose.Types.ObjectId;
  postContent: string;
  engagement: {
    likes: number;
    comments: number;
    reposts: number;
    impressions?: number;
  };
  topics: string[];
  format: string;
  dayOfWeek: string;
  timeOfDay: string;
  audienceQuestions: string[];
  recordedAt: Date;
}

const AudienceInsightSchema = new Schema<IAudienceInsightDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    postDraftId: { type: Schema.Types.ObjectId, ref: "PostDraft" },
    postContent: { type: String, required: true, maxlength: 5000 },
    engagement: {
      likes: { type: Number, required: true, min: 0, default: 0 },
      comments: { type: Number, required: true, min: 0, default: 0 },
      reposts: { type: Number, required: true, min: 0, default: 0 },
      impressions: { type: Number, min: 0 },
    },
    topics: [{ type: String, trim: true }],
    format: { type: String, required: true },
    dayOfWeek: { type: String, required: true },
    timeOfDay: { type: String, required: true },
    audienceQuestions: [{ type: String }],
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Index for analytics queries
AudienceInsightSchema.index({ userId: 1, recordedAt: -1 });

export const AudienceInsight = mongoose.model<IAudienceInsightDocument>(
  "AudienceInsight",
  AudienceInsightSchema
);
