# Audit Implementation Action Tracker

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase1/improvement.md`
**Started**: 2026-02-23
**Last Updated**: 2026-02-23

---

## How to Resume

If context runs out, come back here and:
1. Read this file to see what is done and what is next
2. Start from the first unchecked `[ ]` item
3. Do NOT redo completed `[x]` items

---

## P0 — Critical (Do Before Production)

- [x] **#1 — Fix CORS** (`index.ts`): Replace `origin: true` with explicit allowlist using `FRONTEND_URL` env var + localhost:3000 fallback. ✅ DONE
- [x] **#2 — Rate limiting on auth endpoints**: Install `express-rate-limit` — 5 attempts/min on login, 3/hour on register. ✅ DONE (in `routes/auth.ts` + general 60/min on `/api`)
- [x] **#3 — Robust JSON extractor**: Created `apps/api/src/utils/extractJSON.ts`. Replaced greedy regex in `personaAnalyst.ts`, `trendResearch.ts`, `contentGenerator.ts`. ✅ DONE
- [x] **#4 — Deterministic interview completeness check**: In `agents/onboarding.ts` — after ≥12 messages, if LLM hasn't set flag but fields are filled, force-set `interviewComplete: true`. ✅ DONE
- [x] **#5 — Fix project-context.md Hono references**: Updated `.claude/project-context.md` to replace all 4 "Hono" references with "Express". ✅ DONE

---

## P1 — High Impact

- [x] **#11 — Extend UserPersona schema**: Added `postMetadata[]`, `totalPostsAnalyzed`, `lastPostAddedAt`, `personaVersion`, `analysisHistory[]` to `models/UserPersona.ts` and `shared-types/index.ts`. ✅ DONE
- [x] **#8 — Add `postsArray` to analyze schema**: Updated `routes/persona.ts` analyzeSchema + `shared-types` `IPersonaAnalysisInput`. ✅ DONE
- [x] **#10 — Create `personaMerge.ts` service**: `mergePersonaAnalysis()`, `computePersonaDiff()`, `deduplicateStrings()`, `normalizeForDedup()`, `deduplicatePosts()`, `createPersonaSnapshot()`. ✅ DONE
- [x] **#9 — `POST /api/persona/add-posts` endpoint**: Incremental post addition with dedup, quota check, snapshot, full/incremental modes. ✅ DONE
- [x] **#18 — `GET /api/persona/posts` endpoint**: Returns batches with counts and dates. ✅ DONE
- [x] **#19 — Update personaApi client**: Added `addPosts()` and `getPosts()` to `apps/web/src/lib/api.ts`. ✅ DONE
- [x] **#6 — Build `PostInputCards.tsx` component**: Multi-post card UI with +/- buttons, char count, bulk paste mode, validation, split preview. ✅ DONE
- [x] **#7 — Replace `<Textarea>` in onboarding with `PostInputCards`**: Updated `apps/web/src/app/onboarding/page.tsx` paste tab. ✅ DONE
- [x] **#12 — Add "Add More Posts" section to profile page**: Updated `apps/web/src/app/dashboard/profile/page.tsx`. ✅ DONE
- [x] **#13 — Trend response cache (30-min TTL)**: Added in-memory cache with sorted keyword+industry+geo hash key in `services/trends.ts`. ✅ DONE
- [x] **#14 — Chat history sliding window** (`onboarding.ts`, `personaChat.ts`): Created `utils/chatHistory.ts` with `applyHistorySlidingWindow()` + `historyToText()`. Keeps last 10 verbatim; older messages become a deterministic summary prefix. Applied to both agents. ✅ DONE
- [ ] **#15 — Trend-persona relevance scoring** (new `scoring.ts` + `trendResearch.ts`): `scoreTrendRelevance()`, `selectBalancedTrends()`. ⏳ PENDING (deferred)
- [x] **#16 — Granular retry on content generator**: Retry only the LLM call (not whole pipeline), simplified prompt on retry. MAX_ATTEMPTS = 2. ✅ DONE
- [x] **#17 — Store generation mode in ContentSuggestion**: Added `generationMode` + `contextOptions` fields to `ContentSuggestion` model + `mastra.ts` pipeline. ✅ DONE

---

## P2 — Medium Impact

- [ ] **#20 — Build `PostBatchHistory.tsx` component**: Batch timeline with post count + date grouping. ⏳ PENDING
- [ ] **#21 — Pillar-balanced trend selection**: Part of #15 — `selectBalancedTrends()` ensures each content pillar is covered. ⏳ PENDING
- [ ] **#22 — Post-generation diversity validation** (`contentGenerator.ts`): Check ≥3 formats, no topic repeated >2x. ⏳ PENDING
- [ ] **#23 — Compress persona prompt** (`contentGenerator.ts`): 5-bullet summary instead of every field. ⏳ PENDING
- [ ] **#24 — Degradation tracking / health endpoint**: `services/healthCheck.ts` + expose via `GET /api/health`. ⏳ PENDING
- [ ] **#25 — Extract ChatSessionService + PersonaService**: Refactor agents. ⏳ PENDING (architectural, low urgency)
- [ ] **#26 — Cache SystemConfig token limit in-memory**: 5-min cache in `services/tokenUsage.ts`. ⏳ PENDING

---

## P3 — Polish / Backlog

- [ ] **#27 — Persona version display on profile page**: Show `Persona v3 · Updated Feb 15`. ⏳ PENDING
- [ ] **#28 — Persona diff visualization**: `PersonaDiffCard.tsx` before/after on post addition. ⏳ PENDING
- [ ] **#29 — Bulk paste preview**: Auto-split preview in `PostInputCards.tsx`. ⏳ PENDING
- [ ] **#30 — Unique compound index on ChatSession(userId, agentType)**: `ChatSession.ts` schema. ⏳ PENDING
- [ ] **#31 — Parallelize persona fetch + trend fetch**: `mastra.ts` for returning users. ⏳ PENDING
- [ ] **#32 — Make trend research LLM call optional**: Heuristic-only mode in `trendResearch.ts`. ⏳ PENDING
- [ ] **#33 — Refresh token mechanism**: New model + endpoint. ⏳ PENDING
- [ ] **#34 — `trendSource` indicator on frontend**: Show live vs fallback in UI. ⏳ PENDING
- [ ] **#35 — Remove dead `linkedinScrapeTool`** from persona analyst agent registration. ⏳ PENDING
- [ ] **#36 — Fix HN query construction**: Limit to 3-5 terms in `trends.ts`. ⏳ PENDING
- [ ] **#37 — Replace RSS keyword matching**: Word-boundary check in `trends.ts`. ⏳ PENDING

---

## Files To Create / Modify

### NEW files (to be created)
- `apps/api/src/utils/extractJSON.ts` — robust JSON extraction utility
- `apps/api/src/services/personaMerge.ts` — merge strategy, diff, dedup
- `apps/web/src/components/persona/PostInputCards.tsx` — multi-post card input UI
- `apps/web/src/components/persona/PostBatchHistory.tsx` — batch timeline component

### MODIFIED files (pending)
- `apps/api/src/index.ts` — CORS allowlist + rate limiting
- `apps/api/src/agents/personaAnalyst.ts` — use extractJSON util
- `apps/api/src/agents/trendResearch.ts` — use extractJSON util + trend cache
- `apps/api/src/agents/contentGenerator.ts` — use extractJSON util
- `apps/api/src/agents/onboarding.ts` — deterministic interview escape hatch
- `apps/api/src/models/UserPersona.ts` — new fields
- `apps/api/src/routes/persona.ts` — postsArray + add-posts + get-posts
- `apps/api/src/services/trends.ts` — 30-min in-memory trend cache
- `apps/web/src/app/onboarding/page.tsx` — PostInputCards replaces Textarea
- `apps/web/src/app/dashboard/profile/page.tsx` — Add More Posts section
- `apps/web/src/lib/api.ts` — addPosts() + getPosts() client methods
- `packages/shared-types/src/index.ts` — new interfaces for post management + persona fields

---

## Key Notes for Next Session

- Install `express-rate-limit`: run `npm install express-rate-limit` in `apps/api/`
- Also install `@types/express-rate-limit` if needed
- CORS fix reads `process.env.FRONTEND_URL` — add to `.env.example`
- `PostInputCards` submits `postsArray: string[]` to API (not raw joined string)
- `normalizeForDedup()` from `personaMerge.ts` also used in add-posts route handler
- Trend cache key = sorted keywords + industry + geo (deterministic hash)
- Chat sliding window: MAX_HISTORY = 10 messages kept verbatim; older = prefix summary
- `extractJSON()` tries: (1) direct parse, (2) code block, (3) balanced brace scan
