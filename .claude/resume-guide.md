# How to Resume This Project

> Read this FIRST when starting a new Claude session.
> Last synced: 2026-03-04

---

## Step 1: Understand the project (read in order)

1. **`CLAUDE.md`** (root) — Project overview, folder structure, key rules
2. **`.claude/project-context.md`** — Tech stack, all agents, all routes, all models
3. **`.claude/architecture.md`** — Full low-level design with flow diagrams
4. **`.claude/rules.md`** — Development conventions, code patterns, pitfalls
5. **`.claude/decisions.md`** — Why each technology was chosen

## Step 2: Check what exists

```bash
# Verify the codebase structure
ls apps/api/src/agents/     # 7 files: 6 agents + orchestrator
ls apps/api/src/services/   # 16 files: all backend services
ls apps/api/src/routes/     # 10 files: all API route groups
ls apps/api/src/models/     # 11 files: all MongoDB models
ls apps/web/src/components/  # 8 dirs: chat, editor, layout, persona, posts, suggestions, trends, ui
```

## Step 3: Start dev servers

```bash
# From project root:
npm run dev
# API → http://localhost:5006  (Express)
# Web → http://localhost:3000  (Next.js)
# Swagger → http://localhost:5006/api/docs
```

Or via `.claude/launch.json` preview configs:
- `api` → port 5006
- `web` → port 3000

---

## Quick Reference

### Tech Stack (DO NOT change)

- **Backend**: Express + TypeScript (NOT Hono)
- **LLM**: Gemini 2.5 Flash via `@ai-sdk/google` (NOT OpenAI, NOT Claude API)
- **AI Framework**: Mastra AI (`@mastra/core`)
- **Scraper**: Puppeteer (with manual paste fallback)
- **Trends**: Multi-tier real APIs (Tavily → HN → Domain RSS → Google News → Evergreen)
- **Auth**: JWT in httpOnly cookies
- **DB**: MongoDB via Mongoose (Atlas free M0)
- **Frontend**: Next.js 14 App Router + Tailwind + shadcn/ui

### Ports

- API (Express): **5006**
- Web (Next.js): **3000**

### Agent Files

| # | Agent | File |
|---|---|---|
| 1 | Persona Analyst | `apps/api/src/agents/personaAnalyst.ts` |
| 2 | Onboarding | `apps/api/src/agents/onboarding.ts` |
| 3 | Trend Research | `apps/api/src/agents/trendResearch.ts` |
| 4 | Content Generator | `apps/api/src/agents/contentGenerator.ts` |
| 5 | Persona Chat | `apps/api/src/agents/personaChat.ts` |
| 6 | Post Editor | `apps/api/src/agents/postEditor.ts` |
| — | Orchestrator | `apps/api/src/agents/mastra.ts` |

### Environment Variables

```env
GEMINI_API_KEY=          # https://ai.google.dev (free)
MONGODB_URI=             # Atlas M0 cluster
JWT_SECRET=              # 64-char random string
TAVILY_API_KEY=          # https://tavily.com (optional, free 1000/mo)
PORT=5006
NEXT_PUBLIC_API_URL=http://localhost:5006
```

### MongoDB Collections (11)

`users`, `user_personas`, `chat_sessions`, `content_suggestions`,
`suggestion_feedbacks`, `post_drafts`, `token_usage_logs`, `token_requests`,
`admin_audit_logs`, `system_configs`, `refresh_tokens`

---

## If Something Is Broken

1. Check `.claude/decisions.md` for the correct tech choice
2. Check `.claude/rules.md` for code patterns and conventions
3. Check existing file content before overwriting anything
4. Run `npx tsc --noEmit --project apps/api/tsconfig.json` to verify types
5. Never delete models/ or agents/ — always fix in place

---

## Build Phases (all complete)

| Phase | What it built | Completed |
|---|---|---|
| 1 | Turborepo scaffold + shared packages + env setup | ✓ |
| 2 | MongoDB + all schema models + JWT auth | ✓ |
| 3 | Mastra AI + 6 agents + orchestrator pipeline | ✓ |
| 4 | All backend API routes + Swagger docs | ✓ |
| 5 | Next.js frontend — auth + onboarding + dashboard | ✓ |
| 6 | Frontend-backend wiring + e2e testing guide | ✓ |
| 7 | Flexible generation, persona chat, rich content briefs | ✓ |

**Post-Phase 7 improvements** (2026-03): Domain-aware trends, trend-content anchoring,
scoring system, feedback learning loop, AI detector, post editor, admin dashboard.
