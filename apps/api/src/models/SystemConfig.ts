import mongoose, { Schema, Document, Model } from 'mongoose'

// ── Config key constants ───────────────────────────────────────────────────────

export const CONFIG_KEYS = {
  DEFAULT_TOKEN_LIMIT: 'default_token_limit',
} as const

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS]

// ── Document interface ─────────────────────────────────────────────────────────

export interface ISystemConfigDocument extends Document {
  key: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  description?: string
  createdAt: Date
  updatedAt: Date
}

// ── Schema ────────────────────────────────────────────────────────────────────

const systemConfigSchema = new Schema<ISystemConfigDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
)

export const SystemConfig: Model<ISystemConfigDocument> =
  mongoose.model<ISystemConfigDocument>('SystemConfig', systemConfigSchema)
