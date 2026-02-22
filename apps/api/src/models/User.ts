import mongoose, { Schema, Document, Model } from 'mongoose'
import bcrypt from 'bcryptjs'

export interface IUserDocument extends Document {
  email: string
  password: string
  name: string
  tokensUsed: number
  tokenLimit: number | null
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
    },
    tokensUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    tokenLimit: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Strip password from all JSON responses
      transform(_doc, ret) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (ret as any).password
        return ret
      },
    },
  }
)

// Hash password before saving (Mongoose 9 compatible)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string)
}

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', userSchema)
