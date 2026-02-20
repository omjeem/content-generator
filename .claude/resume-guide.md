# HOW TO RESUME THIS PROJECT
# Read this FIRST if you are starting a new Claude session

---

## Step-by-Step Resume Process

### Step 1: Read context files (in this order)
1. `.claude/project-context.md` — Full architecture, tech stack, DB schemas, agent design
2. `CLAUDE.md` (root) — Phase checklist with current completion status
3. `.claude/decisions.md` — All tech decisions and why (consult if confused)
4. `.claude/phase-notes/phase-N.md` — Detailed plan for the CURRENT phase

### Step 2: Check current phase
Look at CLAUDE.md in the root. Find the first unchecked box:
```
- [x] Phase 1: Complete ✓
- [ ] Phase 2: ← START HERE if this is unchecked
```

### Step 3: Read that phase's notes
Open `.claude/phase-notes/phase-N.md` for the current phase.
Check which items within that file are NOT yet completed.

### Step 4: Check existing file structure
```bash
ls -la apps/api/src/
ls -la apps/web/src/
ls -la packages/
```
This tells you what has already been created.

### Step 5: Continue where left off
- Do NOT redo work that's already done
- Do NOT move to next phase until current phase is complete
- Update CLAUDE.md checkbox when phase completes
- Update phase-notes file as you complete individual items

---

## Quick Reference

### Working Directory
```
/Users/hexahealth/Documents/PP/content-generator/
```

### Start Dev Servers
```bash
cd /Users/hexahealth/Documents/PP/content-generator
npm run dev
# API → http://localhost:3001
# Web → http://localhost:3000
# Swagger → http://localhost:3001/api/docs
```

### Key Port Numbers
- API (Hono): 3001
- Web (Next.js): 3000

### Key Technologies (DO NOT change these)
- Backend: Hono (NOT Express)
- LLM: Gemini (NOT OpenAI, NOT Claude)
- Scraper: Puppeteer (NOT linkedin-api)
- Trends: google-trends-api (NOT Twitter API)
- Auth: JWT in httpOnly cookies
- DB: MongoDB via Mongoose

### MongoDB Collections
- `users`
- `user_personas`
- `chat_sessions`
- `content_suggestions`

### Agent Files
- Agent 1: `apps/api/src/agents/personaAnalyst.ts`
- Agent 2: `apps/api/src/agents/onboarding.ts`
- Agent 3: `apps/api/src/agents/trendResearch.ts`
- Agent 4: `apps/api/src/agents/contentGenerator.ts`
- Orchestrator: `apps/api/src/agents/mastra.ts`

### Service Files
- LinkedIn scraper: `apps/api/src/services/linkedin.ts`
- Trends fetcher: `apps/api/src/services/trends.ts`

---

## Phase Summary (for quick orientation)

| Phase | What it builds | Key files |
|---|---|---|
| 1 | Turborepo + skeleton apps + env | package.json, turbo.json, apps/api skeleton, apps/web skeleton |
| 2 | MongoDB + models + JWT auth | models/, config/, routes/auth.ts, middleware/ |
| 3 | Mastra agents + orchestrator | agents/, services/ |
| 4 | All API routes + Swagger | routes/persona.ts, routes/onboarding.ts, routes/suggestions.ts, swagger/ |
| 5 | Next.js UI | apps/web/src/app/, components/ |
| 6 | Integration + testing | TESTING.md, CORS fixes, end-to-end verification |

---

## If Something is Broken

1. Check `.claude/phase-notes/phase-N.md` "Completion Criteria" section
2. Check `.claude/decisions.md` for the correct tech choice
3. Check existing file content before overwriting anything
4. Never delete models/ or agents/ — always fix in place

---

## Environment Variables Needed
All values must be in `.env` (gitignored). See `.env.example` for where to get each:
- `GEMINI_API_KEY` → https://ai.google.dev (free, no credit card)
- `MONGODB_URI` → https://cloud.mongodb.com (free M0 cluster)
- `JWT_SECRET` → Any 64-char random string
- `TAVILY_API_KEY` → https://tavily.com (free tier, optional)
- `PORT` → 3001
- `NEXT_PUBLIC_API_URL` → http://localhost:3001
