# LinkedIn AI Content Suggestion Agent
# Source of Truth — Read this on every session resume

---

## Project Overview
A full-stack Applied AI application that analyzes a user's LinkedIn presence and
generates personalized content ideas using a 4-agent Mastra AI pipeline.

**Working Directory**: `/Users/hexahealth/Documents/PP/content-generator/`
**Monorepo**: Turborepo | **Backend**: Express + TypeScript | **Frontend**: Next.js 14
**AI**: Mastra AI + Gemini | **DB**: MongoDB | **Auth**: JWT (httpOnly cookies)

> For full architecture details → `.claude/project-context.md`
> For tech decisions → `.claude/decisions.md`
> For resume instructions → `.claude/resume-guide.md`
> For current phase details → `.claude/phase-notes/phase-N.md`

---

## Folder Structure

```
content-generator/
├── CLAUDE.md                          ← You are here
├── .claude/                           ← Claude context (read on resume)
│   ├── project-context.md             ← Full architecture + DB schemas + agent design
│   ├── decisions.md                   ← All tech decisions with reasons
│   ├── resume-guide.md                ← Step-by-step resume instructions
│   └── phase-notes/
│       ├── phase-1.md                 ← Detailed plan for Phase 1
│       ├── phase-2.md                 ← Detailed plan for Phase 2
│       ├── phase-3.md                 ← Detailed plan for Phase 3
│       ├── phase-4.md                 ← Detailed plan for Phase 4
│       ├── phase-5.md                 ← Detailed plan for Phase 5
│       └── phase-6.md                 ← Detailed plan for Phase 6
├── .env                               ← Local secrets (gitignored)
├── .env.example                       ← Documented env variable keys
├── .gitignore
├── turbo.json                         ← Turborepo pipeline (build/dev/lint)
├── package.json                       ← Root workspace (npm workspaces)
├── tsconfig.base.json                 ← Shared TypeScript config
├── apps/
│   ├── api/                           ← Express + TypeScript backend (port 3001)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nodemon.json
│   │   └── src/
│   │       ├── index.ts               ← App entry + route registration
│   │       ├── config/
│   │       │   ├── db.ts              ← MongoDB connection
│   │       │   └── env.ts             ← Zod-validated env vars
│   │       ├── models/
│   │       │   ├── User.ts
│   │       │   ├── UserPersona.ts
│   │       │   ├── ChatSession.ts
│   │       │   └── ContentSuggestion.ts
│   │       ├── routes/
│   │       │   ├── auth.ts            ← register, login, logout, me
│   │       │   ├── persona.ts         ← analyze, get persona
│   │       │   ├── onboarding.ts      ← chat, session, status
│   │       │   ├── trends.ts          ← get trends
│   │       │   └── suggestions.ts     ← generate, list, get by id
│   │       ├── middleware/
│   │       │   ├── auth.ts            ← JWT verification
│   │       │   └── errorHandler.ts
│   │       ├── agents/
│   │       │   ├── mastra.ts          ← Mastra instance + orchestrator
│   │       │   ├── personaAnalyst.ts  ← Agent 1
│   │       │   ├── onboarding.ts      ← Agent 2
│   │       │   ├── trendResearch.ts   ← Agent 3
│   │       │   └── contentGenerator.ts← Agent 4
│   │       ├── services/
│   │       │   ├── linkedin.ts        ← Puppeteer scraper
│   │       │   └── trends.ts          ← google-trends-api wrapper
│   │       └── swagger/
│   │           └── setup.ts           ← Swagger UI at /api/docs
│   │
│   └── web/                           ← Next.js 14 App Router (port 3000)
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── middleware.ts              ← Route protection
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx           ← Root redirect
│           │   ├── (auth)/
│           │   │   ├── login/page.tsx
│           │   │   └── register/page.tsx
│           │   ├── onboarding/
│           │   │   └── page.tsx       ← 2-step: URL/paste + interview chat
│           │   └── dashboard/
│           │       ├── layout.tsx     ← Protected layout with sidebar
│           │       ├── page.tsx       ← Generate + latest suggestions
│           │       └── suggestions/page.tsx ← History
│           ├── components/
│           │   ├── ui/                ← shadcn/ui components
│           │   ├── chat/              ← ChatInterface.tsx
│           │   ├── suggestions/       ← SuggestionCard.tsx
│           │   └── layout/            ← Navbar.tsx, Sidebar.tsx
│           ├── lib/
│           │   ├── api.ts             ← API client functions
│           │   └── auth.ts            ← Token/cookie helpers
│           └── types/
│               └── index.ts           ← Re-exports from @repo/shared-types
│
└── packages/
    ├── shared-types/                  ← Shared TypeScript interfaces
    │   ├── package.json               ← name: @repo/shared-types
    │   ├── tsconfig.json
    │   └── src/index.ts               ← IUser, IUserPersona, ISuggestion, etc.
    └── eslint-config/                 ← Shared ESLint config
        ├── package.json               ← name: @repo/eslint-config
        └── index.js
```

---

## Phase Checklist

- [x] Phase 1: Turborepo scaffold + shared packages + environment setup + CLAUDE.md
- [ ] Phase 2: MongoDB connection + all schema models + JWT auth (register/login)
- [ ] Phase 3: Mastra AI setup + all 4 agents + orchestrator pipeline
- [ ] Phase 4: All backend API routes + Swagger/OpenAPI documentation
- [ ] Phase 5: Next.js frontend — auth + onboarding + chat UI + dashboard
- [ ] Phase 6: Wire frontend to backend + end-to-end testing guide

---

## How to Resume After Session Reset

1. Read `.claude/resume-guide.md` for step-by-step instructions
2. Find the first unchecked box above
3. Open `.claude/phase-notes/phase-N.md` for that phase
4. Check what files already exist before creating anything new
5. Continue — do NOT redo completed work

---

## Key Rules (Never Break These)

- Backend: **Express** (user requested on 2026-02-20 — was originally Hono)
- LLM: **Gemini** (not OpenAI, not Claude API)
- Scraper: **Puppeteer** (with manual paste fallback)
- Trends: **google-trends-api** (no API key needed)
- Auth: **JWT in httpOnly cookies**
- Ports: API=**3001**, Web=**3000**
- Secrets: Always via `process.env.VAR` — never hardcoded
- MongoDB collections: `users`, `user_personas`, `chat_sessions`, `content_suggestions`
