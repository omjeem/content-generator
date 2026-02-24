/**
 * RefreshToken model
 *
 * Stores long-lived (30-day) opaque refresh tokens.
 * Used to issue new short-lived (15-min) access tokens without re-login.
 *
 * Each token is single-use — after redemption it is deleted and a new one issued.
 * This is a rotation strategy: prevents replay attacks while keeping sessions alive.
 *
 * Cleanup: TTL index automatically removes expired tokens from MongoDB.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRefreshTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string; // SHA-256 hash of the raw token (never store plaintext)
  expiresAt: Date;
  createdAt: Date;
  ip?: string; // request IP at creation time (for audit logging)
  userAgent?: string; // user agent at creation time (for audit logging)
}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// TTL index: MongoDB automatically removes expired documents
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<IRefreshTokenDocument> =
  mongoose.model<IRefreshTokenDocument>("RefreshToken", refreshTokenSchema);
