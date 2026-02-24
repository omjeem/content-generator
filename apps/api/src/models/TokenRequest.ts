import mongoose, { Schema, Document, Model } from "mongoose";

// ── Status lifecycle ──────────────────────────────────────────────────────────
// pending → approved (admin increases User.tokenLimit + sets newLimit)
//         → rejected (admin rejects with optional reason)

export type TokenRequestStatus = "pending" | "approved" | "rejected";

// ── Document interface ────────────────────────────────────────────────────────

export interface ITokenRequestDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** Optional message from the user explaining why they need more tokens */
  message?: string;
  status: TokenRequestStatus;
  /** Current usage snapshot captured at time of request */
  tokensUsed: number;
  tokenLimit: number;
  /** Admin-set new limit when approving */
  newLimit?: number;
  /** Admin note (reason for rejection or approval note) */
  adminNote?: string;
  /** When an admin last acted on this request */
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const tokenRequestSchema = new Schema<ITokenRequestDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    tokensUsed: { type: Number, required: true, min: 0 },
    tokenLimit: { type: Number, required: true, min: 0 },
    newLimit: { type: Number, min: 0 },
    adminNote: { type: String, trim: true, maxlength: 500 },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

// Fast lookup by user (list own requests) and by status (admin dashboard)
tokenRequestSchema.index({ userId: 1, createdAt: -1 });
tokenRequestSchema.index({ status: 1, createdAt: -1 });

export const TokenRequest: Model<ITokenRequestDocument> =
  mongoose.model<ITokenRequestDocument>("TokenRequest", tokenRequestSchema);
