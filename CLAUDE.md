# LinkedIn AI Content Suggestion Agent

# Source of Truth — Read this on every session resume

---

## Project Overview

A full-stack Applied AI application that analyzes a user's LinkedIn presence and
generates personalized content ideas using a 6-agent Mastra AI pipeline with
domain-aware trend fetching, feedback learning, and AI co-writing.

**Working Directory**: `/Users/hexahealth/Documents/PP/content-generator/`
**Monorepo**: Turborepo | **Backend**: Express + TypeScript | **Frontend**: Next.js 14
**AI**: Mastra AI + Gemini 2.5 Flash | **DB**: MongoDB (13 collections) | **Auth**: JWT (httpOnly cookies)

> For quick project context → `.claude/project-context.md`
> For full architecture + flow diagrams → `.claude/architecture.md`
> For tech decisions → `.claude/decisions.md`
> For development rules + patterns → `.claude/rules.md`
> For resume instructions → `.claude/resume-guide.md`

---

## Folder Structure

```
content-generator/
├── CLAUDE.md                          ← You are here
├── .claude/                           ← Claude context (read on resume)
│   ├── project-context.md             ← Quick reference: tech stack, agents, routes, models
│   ├── architecture.md                ← Full LLD with ASCII flow diagrams
│   ├── decisions.md                   ← All 20 tech decisions with reasons
│   ├── rules.md                       ← Development conventions + code patterns
│   ├── resume-guide.md                ← Step-by-step resume instructions
│   └── audits/                        ← Phase improvement audits (historical)
│       ├── phase1/                    ← Phase 1 audit
│       ├── phase2/                    ← Phase 2 audit
│       └── phase3/                    ← Phase 3 audit
├── .env                               ← Local secrets (gitignored)
├── .env.example                       ← Documented env variable keys
├── turbo.json                         ← Turborepo pipeline (build/dev/lint)
├── package.json                       ← Root workspace (npm workspaces)
├── tsconfig.base.json                 ← Shared TypeScript config
├── apps/
│   ├── api/                           ← Express + TypeScript backend (port 5006)
│   │   └── src/
│   │       ├── index.ts               ← App entry + route registration
│   │       ├── config/                ← db.ts (MongoDB), env.ts (Zod validation)
│   │       ├── models/                ← 13 Mongoose models
│   │       │   ├── User.ts            ← Auth accounts
│   │       │   ├── UserPersona.ts     ← Profile analysis + feedback profile
│   │       │   ├── ChatSession.ts     ← Conversation history
│   │       │   ├── ContentSuggestion.ts ← Generated suggestion sets
│   │       │   ├── SuggestionFeedback.ts ← Per-suggestion ratings
│   │       │   ├── PostDraft.ts       ← Co-writing drafts
│   │       │   ├── TokenUsageLog.ts   ← Per-agent token tracking
│   │       │   ├── TokenRequest.ts    ← Token increase requests
│   │       │   ├── AdminAuditLog.ts   ← Admin action audit trail
│   │       │   ├── SystemConfig.ts    ← Platform config
│   │       │   ├── RefreshToken.ts    ← JWT refresh tokens
│   │       │   ├── TrendCache.ts      ← Persistent L2 trend cache
│   │       │   └── AudienceInsight.ts ← Audience engagement records
│   │       ├── routes/                ← 11 route files
│   │       │   ├── auth.ts            ← register, login, logout, me, refresh
│   │       │   ├── persona.ts         ← analyze, get, add-posts, posts, history, peers
│   │       │   ├── onboarding.ts      ← chat, session, status
│   │       │   ├── trends.ts          ← get trends, discover
│   │       │   ├── suggestions.ts     ← generate, refine-context, list, topic-ideas, regenerate
│   │       │   ├── personaChat.ts     ← chat, apply-changes, history
│   │       │   ├── feedback.ts        ← submit rating, get feedback, implicit, reset
│   │       │   ├── drafts.ts          ← CRUD, editor-chat, ai-check, humanize, performance
│   │       │   ├── tokenUsage.ts      ← summary, request-increase
│   │       │   ├── admin.ts           ← users, analytics, token-requests, audit
│   │       │   └── audience.ts        ← record engagement, get insights
│   │       ├── middleware/            ← auth.ts, adminAuth.ts, errorHandler.ts
│   │       ├── agents/                ← 6 agents + orchestrator
│   │       │   ├── mastra.ts          ← Orchestrator (sequences agents 1→2→3→4)
│   │       │   ├── personaAnalyst.ts  ← Agent 1: LinkedIn analysis
│   │       │   ├── onboarding.ts      ← Agent 2: Interview chat
│   │       │   ├── trendResearch.ts   ← Agent 3: Domain-aware trend enrichment
│   │       │   ├── contentGenerator.ts← Agent 4: Suggestion brief generation
│   │       │   ├── personaChat.ts     ← Agent 5: Live persona editor
│   │       │   └── postEditor.ts      ← Agent 6: AI co-writing assistant
│   │       ├── services/              ← 19 service files
│   │       │   ├── trends.ts          ← Multi-tier domain-aware trend fetching
│   │       │   ├── trendCache.ts      ← Two-tier cache (L1 memory + L2 MongoDB)
│   │       │   ├── trendDiscoveryCache.ts ← Per-user discovery session cache
│   │       │   ├── linkedin.ts        ← Manual post parser (Puppeteer removed)
│   │       │   ├── feedbackProcessor.ts ← Fire-and-forget signal extraction
│   │       │   ├── personaLearning.ts ← Feedback → persona profile updates
│   │       │   ├── personaMerge.ts    ← Incremental post analysis
│   │       │   ├── draftService.ts    ← Draft CRUD + version history
│   │       │   ├── aiDetection.ts     ← AI content scoring + humanization
│   │       │   ├── tokenUsage.ts      ← Token tracking + limit enforcement
│   │       │   ├── chatSessionService.ts ← Chat persistence
│   │       │   ├── userPersonaService.ts ← Persona queries
│   │       │   ├── healthCheck.ts     ← Health monitoring
│   │       │   ├── adminSeed.ts       ← First-run admin creation
│   │       │   ├── writingDNA.ts      ← Deterministic voice fingerprint
│   │       │   ├── personaConfidence.ts ← 5-dimension confidence scorer
│   │       │   ├── schedulingHints.ts ← Domain posting time lookup
│   │       │   ├── contentContinuity.ts ← Content series detection
│   │       │   ├── audienceTracker.ts ← Audience engagement tracking
│   │       │   ├── performanceTracker.ts ← Performance-weighted learning
│   │       │   └── abTest.ts         ← A/B test framework
│   │       ├── llm/                   ← provider.ts (model factory: text + JSON mode), structured.ts (the ONE JSON path)
│   │       ├── utils/                 ← scoring.ts, extractJSON.ts, sanitizeInput.ts, fireAndForget.ts, circuitBreaker.ts
│   │       ├── middleware/            ← auth.ts, adminAuth.ts, errorHandler.ts, rateLimit.ts
│   │       └── swagger/setup.ts       ← Swagger UI at /api/docs
│   │
│   └── web/                           ← Next.js 14 App Router (port 3000)
│       ├── middleware.ts              ← Route protection
│       └── src/
│           ├── app/
│           │   ├── (auth)/login, register
│           │   ├── onboarding/        ← 2-step: URL/paste + interview
│           │   ├── dashboard/         ← Main app (generate, profile, history, editor)
│           │   └── admin/             ← Admin dashboard
│           ├── components/
│           │   ├── chat/              ← ChatInterface.tsx
│           │   ├── suggestions/       ← SuggestionCard, GenerateOptionsPanel, TopicBrowser
│           │   ├── trends/            ← TrendBrowser, TrendCard
│           │   ├── editor/            ← PostEditorPane, EditorChatPane, AiDetectorPanel
│           │   ├── persona/           ← PendingChangesCard, PersonaDiffCard
│           │   ├── posts/             ← PostListItem
│           │   ├── landing/            ← SystemDiagram (interactive architecture)
│           │   ├── layout/            ← Navbar, FeatureTour
│           │   └── ui/               ← shadcn/ui (button, card, input, textarea, badge)
│           └── lib/
│               ├── api.ts             ← Full API client (all endpoints)
│               └── auth.ts            ← Token/cookie helpers
│
└── packages/
    ├── shared-types/                  ← 40+ shared TypeScript interfaces
    │   └── src/index.ts               ← IUser, IUserPersona, ISuggestion, IPostDraft, ...
    └── eslint-config/                 ← Shared ESLint config
```

---

## Build Phase History (all complete)

- [x] Phase 1: Turborepo scaffold + shared packages + environment setup
- [x] Phase 2: MongoDB connection + all schema models + JWT auth
- [x] Phase 3: Mastra AI setup + all agents + orchestrator pipeline
- [x] Phase 4: All backend API routes + Swagger/OpenAPI documentation
- [x] Phase 5: Next.js frontend — auth + onboarding + chat UI + dashboard
- [x] Phase 6: Wire frontend to backend + end-to-end testing
- [x] Phase 7: Flexible generation (3 modes), Persona Chat, Rich Content Briefs (2026-02-21)
- [x] Post-Phase: Domain-aware trends, trend anchoring, feedback loop, AI detector, admin (2026-03)
- [x] Phase 4 Audit: Code quality, reliability, Writing DNA, confidence scoring, scheduling hints, content series, implicit feedback, performance tracking, audience resonance, A/B testing, peer awareness, UX polish (2026-03-05 to 2026-03-06) — 54 items across 8 sub-phases
- [x] UX Polish: Docker optimization (2.66GB→338MB), Puppeteer removal, landing page system diagram, feature tour, smart navigation, mobile editor fix, AI detector scroll fix (2026-03-10)

---

## How to Resume After Session Reset

1. Read `.claude/resume-guide.md` for step-by-step instructions
2. Read `.claude/project-context.md` for current architecture overview
3. Read `.claude/architecture.md` for detailed flow diagrams
4. Read `.claude/rules.md` for development conventions and pitfalls
5. Check what files exist before creating anything new
6. Continue — do NOT redo completed work

---

## Key Rules (Never Break These)

- Backend: **Express** (user requested on 2026-02-20 — was originally Hono)
- LLM: **Gemini 2.5 Flash** via `@ai-sdk/google` (not OpenAI, not Claude API)
- Post Input: **Manual paste only** (Puppeteer removed 2026-03-10 for Docker size)
- Trends: **Multi-tier real APIs** — Tavily, HN Algolia (tech only), Domain RSS, Google News
- Auth: **JWT in httpOnly cookies**
- Ports: API=**5006**, Web=**3000**
- Secrets: Always via `process.env.VAR` — never hardcoded
- Domain-aware: `classifyDomain()` routes trends to appropriate RSS pools per industry
- Models: resolve ONLY through `llm/provider.ts` — `getModel()` for prose agents,
  `getJsonModel()` for JSON agents (declare as `model: () => getJsonModel()` so the
  JSON-mode kill-switch applies). Never construct a provider inline.
- Structured output: NEVER pass a response schema to the SDK (`generateObject`/
  `output`) — models without constrained decoding fail unpredictably. Every JSON
  call goes through `generateJSON()` / `generateAgentJSON()` in `llm/structured.ts`:
  native JSON mode → prompt rule → local extract/repair/normalize → at most one
  repair call → retry last. New JSON agents add a `normalize` hook rather than
  tightening the parse-time schema.
- Trend anchoring: Content ideas MUST connect to provided trends (not general expertise)
