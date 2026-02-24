# LinkedIn AI Content Suggestion Agent — Full Project Context

# This file is the MASTER CONTEXT for Claude. Read this first on every session resume.

---

## PROJECT IDENTITY

- **Name**: LinkedIn AI Content Suggestion Agent
- **Type**: Full-stack Applied AI — Multi-Agent Pipeline
- **Working Directory**: `/Users/hexahealth/Documents/PP/content-generator/`
- **Monorepo Tool**: Turborepo
- **Status File**: Always check `CLAUDE.md` in root for phase completion status

---

## ARCHITECTURE OVERVIEW

```
content-generator/          ← ROOT (Turborepo workspace)
├── apps/
│   ├── api/                ← Express + TypeScript backend (Node.js)
│   └── web/                ← Next.js 14 App Router frontend
├── packages/
│   ├── shared-types/       ← Shared TypeScript interfaces used by both apps
│   └── eslint-config/      ← Shared ESLint configuration
├── .claude/                ← Claude context files (this folder)
├── CLAUDE.md               ← Phase checklist + resume guide
├── .env                    ← Local secrets (gitignored)
├── .env.example            ← Documented env template
├── turbo.json              ← Turborepo pipeline config
├── package.json            ← Root workspace package.json
└── tsconfig.base.json      ← Shared TypeScript base config
```

---

## TECH STACK DECISIONS (with reasons)

| Layer             | Technology                           | Why                                                           |
| ----------------- | ------------------------------------ | ------------------------------------------------------------- |
| Monorepo          | Turborepo                            | Fast build caching, simple workspace, industry standard       |
| Backend           | Express + TypeScript                 | Battle-tested, rich middleware ecosystem, widely supported    |
| AI Framework      | Mastra AI                            | Native multi-agent, built-in working memory, tool use support |
| LLM               | Gemini API (google/gemini-2.5-flash) | Free tier, generous limits, strong reasoning                  |
| LinkedIn Scraping | Puppeteer                            | No API key needed, most reliable headless scraper             |
| Trend Data        | google-trends-api npm                | Completely free, no signup, no key                            |
| Database          | MongoDB + Mongoose                   | Flexible schema for evolving persona/chat data                |
| Auth              | JWT (jsonwebtoken + bcrypt)          | Stateless, simple cross-monorepo auth                         |
| Frontend          | Next.js 14 App Router                | Modern React, SSR, easy API routes                            |
| Styling           | Tailwind CSS + shadcn/ui             | Fast UI, accessible components                                |
| API Docs          | swagger-ui-express                   | Industry standard, integrates with Express                    |

---

## ENVIRONMENT VARIABLES

File: `.env` (gitignored) and `.env.example` (committed)

```
GEMINI_API_KEY=          # https://ai.google.dev — free, no credit card
MONGODB_URI=             # https://cloud.mongodb.com — Atlas free M0 cluster
JWT_SECRET=              # Any 64-char random string: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
TAVILY_API_KEY=          # https://tavily.com — free tier, 1000 searches/month
PORT=3001                # Backend port
NEXT_PUBLIC_API_URL=http://localhost:3001  # Frontend → Backend URL
```

---

## MULTI-AGENT PIPELINE DETAIL

### Agent 1 — Persona Analyst Agent

- **File**: `apps/api/src/agents/personaAnalyst.ts`
- **Input**: LinkedIn profile URL OR manually pasted post text
- **Tools**: Puppeteer scraper (`apps/api/src/services/linkedin.ts`)
- **Output**: Persona object saved to MongoDB `user_personas` collection
- **Extracts**: writing style, tone, topics, post formats, engagement patterns
- **Fallback**: If scraping blocked → accepts manual post paste

### Agent 2 — Onboarding/Interview Agent

- **File**: `apps/api/src/agents/onboarding.ts`
- **Input**: User chat messages
- **Tools**: MongoDB working memory via `chat_sessions` collection
- **Output**: Structured interview answers merged into `user_personas`
- **Questions cover**: goals, target audience, industry, content pillars, posting frequency
- **Memory**: Mastra working memory persists across sessions via MongoDB

### Agent 3 — Trend Research Agent

- **File**: `apps/api/src/agents/trendResearch.ts`
- **Input**: User's industry/niche (from persona)
- **Tools**: google-trends-api (`apps/api/src/services/trends.ts`)
- **Output**: Top 5-10 trending topics relevant to the user's niche
- **Fallback**: Tavily web search if google-trends returns no results

### Agent 4 — Content Idea Generator Agent

- **File**: `apps/api/src/agents/contentGenerator.ts`
- **Input**: Persona + interview answers + trending topics (all from MongoDB)
- **Output**: 5-10 LinkedIn post ideas, each with:
  - `topic`: What the post is about
  - `angle`: Unique perspective/hook
  - `format`: carousel | text-post | poll | video-script | list
  - `hook`: Opening line (the scroll-stopper)
  - `whyItFits`: Why this matches the user's voice
- **Saved to**: `content_suggestions` MongoDB collection

### Mastra Orchestrator

- **File**: `apps/api/src/agents/mastra.ts`
- **Role**: Supervisor — sequences Agent 1 → 2 → 3 → 4
- **Handles**: Retry logic, error propagation, partial failure recovery
- **Exposed via**: REST API route `POST /api/suggestions/generate`

---

## DATABASE SCHEMAS

### Collection: `users`

```typescript
{
  _id: ObjectId,
  email: string,          // unique
  password: string,       // bcrypt hashed
  name: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Collection: `user_personas`

```typescript
{
  _id: ObjectId,
  userId: ObjectId,       // ref: users
  linkedinUrl: string,
  scrapedPosts: string[], // raw post texts
  writingStyle: string,   // e.g., "conversational, story-driven"
  tone: string,           // e.g., "professional yet approachable"
  topics: string[],       // e.g., ["AI", "leadership", "startups"]
  postFormats: string[],  // e.g., ["carousel", "text-post"]
  // Interview answers:
  goals: string,
  targetAudience: string,
  industry: string,
  contentPillars: string[],
  postingFrequency: string,
  interviewComplete: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Collection: `chat_sessions`

```typescript
{
  _id: ObjectId,
  userId: ObjectId,       // ref: users
  sessionId: string,      // Mastra session identifier
  agentType: string,      // "onboarding" | "orchestrator"
  messages: [
    { role: "user" | "assistant", content: string, timestamp: Date }
  ],
  contextSummary: string, // Mastra working memory summary
  createdAt: Date,
  updatedAt: Date
}
```

### Collection: `content_suggestions`

```typescript
{
  _id: ObjectId,
  userId: ObjectId,       // ref: users
  generatedAt: Date,
  trendsUsed: string[],
  suggestions: [
    {
      topic: string,
      angle: string,
      format: string,
      hook: string,
      whyItFits: string
    }
  ],
  createdAt: Date
}
```

---

## API ROUTES PLAN

### Auth Routes (no auth required)

- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Get JWT token

### Persona Routes (JWT required)

- `POST /api/persona/analyze` — Trigger Agent 1 (LinkedIn URL or paste)
- `GET /api/persona` — Get current user's persona

### Onboarding Routes (JWT required)

- `POST /api/onboarding/chat` — Send message to Agent 2
- `GET /api/onboarding/session` — Get current chat session history
- `GET /api/onboarding/status` — Check if interview is complete

### Trends Routes (JWT required)

- `GET /api/trends` — Get trends for user's niche (Agent 3)

### Suggestions Routes (JWT required)

- `POST /api/suggestions/generate` — Run full pipeline → generate ideas
- `GET /api/suggestions` — Get history of generated suggestions
- `GET /api/suggestions/:id` — Get specific suggestion set

### Docs

- `GET /api/docs` — Swagger UI

---

## FRONTEND PAGES PLAN

```
/ (root)                → Redirect to /dashboard if logged in, else /login
/login                  → Login form
/register               → Register form
/onboarding             → Step 1: LinkedIn URL or paste posts
                          Step 2: Chat interview with Agent 2
/dashboard              → Shows latest content suggestions + generate button
/dashboard/suggestions  → Full history of all suggestion sets
```

---

## PHASE COMPLETION CHECKLIST

- [ ] Phase 1: Turborepo scaffold + shared packages + environment setup + CLAUDE.md
- [ ] Phase 2: MongoDB connection + all schema models + JWT auth (register/login)
- [ ] Phase 3: Mastra AI setup + all 4 agents + orchestrator pipeline
- [ ] Phase 4: All backend API routes + Swagger/OpenAPI documentation
- [ ] Phase 5: Next.js frontend — auth + onboarding + chat UI + dashboard
- [ ] Phase 6: Wire frontend to backend + end-to-end testing guide

---

## HOW TO RESUME A SESSION

1. Read this file: `.claude/project-context.md`
2. Read: `CLAUDE.md` in project root for current phase status
3. Read: `.claude/phase-notes/phase-N.md` for the current phase details
4. Check which checkbox is NOT marked `[x]` in CLAUDE.md
5. Continue from that phase — do NOT redo completed phases
6. Use `.claude/decisions.md` if unsure about any tech/architecture choice

---

## CRITICAL RULES FOR CLAUDE

1. **Never touch files outside the working directory**
2. **Never hardcode API keys** — always use `process.env.VAR_NAME`
3. **Always update CLAUDE.md** checkbox when a phase completes
4. **Always update phase notes** in `.claude/phase-notes/phase-N.md`
5. **Express not Hono** — switched to Express on 2026-02-20 for richer middleware support
6. **Gemini not OpenAI** — the LLM is Gemini via Mastra
7. **Puppeteer for LinkedIn** — with fallback to manual paste
8. **MongoDB collection names**: `users`, `user_personas`, `chat_sessions`, `content_suggestions`
9. **JWT stored in httpOnly cookies** on frontend for security
10. **All ports**: API=3001, Web=3000
