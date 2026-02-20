# Phase 2: MongoDB Connection + All Schema Models + JWT Auth
# Status: PENDING (start after Phase 1 complete)

---

## Goal
Connect to MongoDB, define all 4 Mongoose schemas, and implement JWT-based
register/login endpoints with bcrypt password hashing.

## Checklist
- [ ] Install MongoDB/Mongoose + JWT + bcrypt packages in apps/api
- [ ] apps/api/src/config/db.ts — MongoDB connection with retry logic
- [ ] apps/api/src/config/env.ts — Validated env vars with Zod
- [ ] apps/api/src/models/User.ts
- [ ] apps/api/src/models/UserPersona.ts
- [ ] apps/api/src/models/ChatSession.ts
- [ ] apps/api/src/models/ContentSuggestion.ts
- [ ] apps/api/src/middleware/auth.ts — JWT verification
- [ ] apps/api/src/middleware/errorHandler.ts — Global error handler
- [ ] apps/api/src/routes/auth.ts — POST /auth/register + POST /auth/login
- [ ] Wire auth routes into apps/api/src/index.ts
- [ ] Test register and login with curl

## npm packages to install (apps/api)

### Dependencies
```
mongoose
jsonwebtoken
bcryptjs
cookie-parser
```

### DevDependencies
```
@types/jsonwebtoken
@types/bcryptjs
@types/cookie-parser
```

## File Details

### apps/api/src/config/db.ts
```typescript
// Connect to MongoDB using MONGODB_URI from env
// Retry connection up to 5 times with 3s delay
// Export connectDB() function called in index.ts
```

### apps/api/src/config/env.ts
```typescript
// Use Zod to validate all required env vars on startup
// Throw descriptive error if any required var is missing
const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(1),
  PORT: z.string().default('3001'),
  // TAVILY_API_KEY is optional (fallback for trends)
  TAVILY_API_KEY: z.string().optional(),
})
```

### apps/api/src/models/User.ts
```typescript
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },  // bcrypt hash
  name: { type: String, required: true },
}, { timestamps: true })
// Add method: comparePassword(plain) → boolean
```

### apps/api/src/models/UserPersona.ts
```typescript
const userPersonaSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  linkedinUrl: String,
  scrapedPosts: [String],
  writingStyle: String,
  tone: String,
  topics: [String],
  postFormats: [String],
  // Interview fields:
  goals: String,
  targetAudience: String,
  industry: String,
  contentPillars: [String],
  postingFrequency: String,
  interviewComplete: { type: Boolean, default: false },
}, { timestamps: true })
```

### apps/api/src/models/ChatSession.ts
```typescript
const messageSchema = new Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
})
const chatSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true },
  agentType: { type: String, enum: ['onboarding', 'orchestrator'], required: true },
  messages: [messageSchema],
  contextSummary: String,
}, { timestamps: true })
```

### apps/api/src/models/ContentSuggestion.ts
```typescript
const suggestionItemSchema = new Schema({
  topic: String,
  angle: String,
  format: { type: String, enum: ['carousel','text-post','poll','video-script','list'] },
  hook: String,
  whyItFits: String,
})
const contentSuggestionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  generatedAt: { type: Date, default: Date.now },
  trendsUsed: [String],
  suggestions: [suggestionItemSchema],
}, { timestamps: true })
```

### apps/api/src/middleware/auth.ts
```typescript
// Extract JWT from httpOnly cookie OR Authorization: Bearer header
// Verify with JWT_SECRET
// Attach decoded user to context: c.set('userId', decoded.userId)
// Return 401 if missing/invalid
```

### apps/api/src/routes/auth.ts
```
POST /api/auth/register
  Body: { email, password, name }
  - Validate with Zod
  - Check if email exists → 409 Conflict
  - Hash password with bcrypt (saltRounds=12)
  - Create User document
  - Generate JWT (expires 7d)
  - Set httpOnly cookie
  - Return: { user: { id, email, name }, token }

POST /api/auth/login
  Body: { email, password }
  - Find user by email → 401 if not found
  - Compare password → 401 if wrong
  - Generate JWT
  - Set httpOnly cookie
  - Return: { user: { id, email, name }, token }

POST /api/auth/logout
  - Clear cookie
  - Return: { message: "Logged out" }

GET /api/auth/me  (requires auth middleware)
  - Return current user info
```

## Test Commands (after Phase 2)
```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Completion Criteria
- MongoDB connects successfully on startup (log: "MongoDB connected")
- Register creates user in DB with hashed password
- Login returns JWT
- Protected route returns 401 without token
- All 4 models importable without errors
