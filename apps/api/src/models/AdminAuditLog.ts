import mongoose, { Schema, Document, Model } from "mongoose";

// ── Document interface ────────────────────────────────────────────────────────

export interface IAdminAuditLogDocument extends Document {
  adminId: mongoose.Types.ObjectId; // ref User (admin)
  action: string; // e.g. 'approve_token_request', 'update_user', 'reject_token_request'
  targetUserId?: mongoose.Types.ObjectId; // ref User (the affected user, if applicable)
  details: Record<string, unknown>; // what was changed (before/after values)
  ip: string; // client IP address
  userAgent: string; // client user-agent string
  createdAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const adminAuditLogSchema = new Schema<IAdminAuditLogDocument>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: "unknown",
    },
    userAgent: {
      type: String,
      default: "unknown",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // audit logs are immutable
  },
);

// Index for admin action history queries
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
adminAuditLogSchema.index({ createdAt: -1 }); // for system-wide timeline

export const AdminAuditLog: Model<IAdminAuditLogDocument> =
  mongoose.model<IAdminAuditLogDocument>("AdminAuditLog", adminAuditLogSchema);
