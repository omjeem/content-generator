/**
 * TrendCache Model — Phase 4 #16
 *
 * Persistent L2 cache for raw trend API results (MongoDB with TTL index).
 * Works alongside the in-memory L1 cache in trendCache.ts.
 *
 * TTL: 30 minutes — MongoDB auto-deletes expired documents via the TTL index.
 * This means we never need manual cleanup code.
 */

import mongoose, { Schema, Document } from "mongoose";

export interface ITrendCacheEntry {
  cacheKey: string;
  items: Array<{
    title: string;
    url?: string;
    source: string;
    score?: number;
    publishedAt?: string;
    alternateUrls?: string[];
  }>;
  createdAt: Date;
}

export interface ITrendCacheDocument extends ITrendCacheEntry, Document {}

const trendCacheSchema = new Schema<ITrendCacheDocument>(
  {
    cacheKey: { type: String, required: true, unique: true, index: true },
    items: [
      {
        title: { type: String, required: true },
        url: { type: String },
        source: { type: String, required: true },
        score: { type: Number },
        publishedAt: { type: String },
        alternateUrls: [{ type: String }],
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false, // we manage createdAt manually for TTL precision
  },
);

// TTL index — MongoDB auto-deletes documents 1800 seconds (30 min) after createdAt
trendCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

export const TrendCache = mongoose.model<ITrendCacheDocument>(
  "TrendCache",
  trendCacheSchema,
);
