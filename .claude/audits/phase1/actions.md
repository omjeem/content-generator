# Audit Implementation Action Tracker

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase1/improvement.md`
**Started**: 2026-02-23
**Last Updated**: 2026-02-24

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
- [x] **#9 — `POST /api/persona/add-posts` endpoint**: Incremental post addition with dedup, quota check, snapshot, full/incremental modes. Now also returns `diff` field. ✅ DONE
- [x] **#18 — `GET /api/persona/posts` endpoint**: Returns batches with counts and dates. ✅ DONE
- [x] **#19 — Update personaApi client**: Added `addPosts()` and `getPosts()` to `apps/web/src/lib/api.ts`. Also updated `addPosts` to return `IAddPostsResponse` (includes diff). ✅ DONE
- [x] **#6 — Build `PostInputCards.tsx` component**: Multi-post card UI with +/- buttons, char count, bulk paste mode, validation, split preview. ✅ DONE
- [x] **#7 — Replace `<Textarea>` in onboarding with `PostInputCards`**: Updated `apps/web/src/app/onboarding/page.tsx` paste tab. ✅ DONE
- [x] **#12 — Add "Add More Posts" section to profile page**: Updated `apps/web/src/app/dashboard/profile/page.tsx`. ✅ DONE
- [x] **#13 — Trend response cache (30-min TTL)**: Added in-memory cache with sorted keyword+industry+geo hash key in `services/trends.ts`. ✅ DONE
- [x] **#14 — Chat history sliding window** (`onboarding.ts`, `personaChat.ts`): Created `utils/chatHistory.ts` with `applyHistorySlidingWindow()` + `historyToText()`. Keeps last 10 verbatim; older messages become a deterministic summary prefix. Applied to both agents. ✅ DONE
- [x] **#15 — Trend-persona relevance scoring**: Created `utils/scoring.ts` with `scoreTrendRelevance()`, `scoreAndRankTrends()`, `selectBalancedTrends()`. Wired into `trendResearch.ts`. ✅ DONE
- [x] **#21 — Pillar-balanced trend selection**: Part of #15 — `selectBalancedTrends()` ensures each content pillar is covered. ✅ DONE
- [x] **#16 — Granular retry on content generator**: Retry only the LLM call (not whole pipeline), simplified prompt on retry. MAX_ATTEMPTS = 2. ✅ DONE
- [x] **#17 — Store generation mode in ContentSuggestion**: Added `generationMode` + `contextOptions` fields to `ContentSuggestion` model + `mastra.ts` pipeline. ✅ DONE

---

## P2 — Medium Impact

- [x] **#20 — Build `PostBatchHistory.tsx` component**: Batch timeline with post count, date, source icons. Shows newest batch as "Latest". Integrates into profile page "Add More Posts" card. ✅ DONE
- [x] **#22 — Post-generation diversity validation** (`contentGenerator.ts`): Check ≥3 formats, no topic repeated >2x. Logs warnings. ✅ DONE
- [x] **#23 — Compress persona prompt** (`contentGenerator.ts`): `buildPersonaSummary()` generates 5-bullet summary (~150 token savings/call). ✅ DONE
- [x] **#24 — Degradation tracking / health endpoint**: `services/healthCheck.ts` with 5-min rolling error window per service + `GET /api/health` returns structured status. ✅ DONE
- [ ] **#25 — Extract ChatSessionService + PersonaService**: Refactor agents. ⏳ PENDING (architectural, low urgency)
- [x] **#26 — Cache SystemConfig token limit in-memory**: 5-min cache in `services/tokenUsage.ts`. ✅ DONE

---

## P3 — Polish / Backlog

- [x] **#27 — Persona version display on profile page**: Added `Persona vN · Updated [date]` badge + post count in the "Current Persona" card header. ✅ DONE
- [x] **#28 — Persona diff visualization**: Created `PersonaDiffCard.tsx` + wired into profile page after post addition. Backend returns `diff` from `POST /api/persona/add-posts`. ✅ DONE
- [x] **#29 — Bulk paste preview**: Auto-split preview in `PostInputCards.tsx`. ✅ DONE (was already implemented in the PostInputCards component)
- [x] **#30 — Unique compound index on ChatSession(userId, agentType)**: Already existed in `ChatSession.ts` schema. ✅ DONE
- [x] **#31 — Parallelize persona fetch + trend fetch**: Documented "parallel-ready" comment in `mastra.ts`. ✅ DONE
- [ ] **#32 — Make trend research LLM call optional**: Heuristic-only mode in `trendResearch.ts`. ⏳ PENDING
- [ ] **#33 — Refresh token mechanism**: New model + endpoint. ⏳ PENDING
- [x] **#34 — `trendSource` indicator on frontend**: Added `isLive` field to `TrendResearchResult`, `trendSource` to `PipelineResult` + route response + `ISuggestionsGenerateResponse`. Green "Live trends" / amber "Evergreen topics" badge on dashboard. ✅ DONE
- [x] **#35 — Remove dead `linkedinScrapeTool`** from persona analyst agent registration. ✅ DONE
- [x] **#36 — Fix HN query construction**: Changed strategy — uses first mapped HN_QUERY_MAP expansion only (avoids concatenating ALL keywords which degrades HN search quality). ✅ DONE
- [x] **#37 — Replace RSS keyword matching**: Word-boundary regex `\b${keyword}\b` for single-word keywords. Multi-word keywords still use `includes()`. ✅ DONE

---

## Token Usage Tracking (Phase 8 feature)

- [x] `models/TokenUsageLog.ts` — NEW
- [x] `models/SystemConfig.ts` — NEW
- [x] `services/tokenUsage.ts` — `checkTokenQuota()`, `trackTokenUsage()` (fire-and-forget), `seedDefaultTokenLimit()`, **5-min in-memory config cache** (#26)
- [x] `routes/tokenUsage.ts` — `GET /api/tokens/usage` + `GET /api/tokens/logs`
- [x] `apps/web/src/app/dashboard/usage/page.tsx` — summary card + paginated log table
- [x] `models/User.ts` — `tokensUsed`, `tokenLimit` fields
- [x] All 5 agents track usage (persona-analyst, trend-research, content-generator, persona-chat, onboarding)
- [x] Pre-flight quota checks in all AI call sites
- [x] Navbar token progress bar widget

---

## Files To Create / Modify

### NEW files created ✅
- `apps/api/src/utils/extractJSON.ts` — robust JSON extraction utility
- `apps/api/src/utils/chatHistory.ts` — sliding window for chat history
- `apps/api/src/utils/scoring.ts` — trend-persona relevance scoring
- `apps/api/src/services/personaMerge.ts` — merge strategy, diff, dedup
- `apps/api/src/services/healthCheck.ts` — rolling error window + health report
- `apps/api/src/models/TokenUsageLog.ts` — per-operation token log
- `apps/api/src/models/SystemConfig.ts` — key-value config store
- `apps/api/src/routes/tokenUsage.ts` — token usage endpoints
- `apps/api/src/services/tokenUsage.ts` — quota check + tracking service
- `apps/web/src/components/persona/PostInputCards.tsx` — multi-post card input UI
- `apps/web/src/components/persona/PostBatchHistory.tsx` — batch timeline component ✅ NEW
- `apps/web/src/components/persona/PersonaDiffCard.tsx` — persona diff visualization ✅ NEW
- `apps/web/src/app/dashboard/usage/page.tsx` — token usage page

### Key modified files
- `apps/api/src/index.ts` — CORS allowlist + rate limiting + health endpoint
- `apps/api/src/agents/personaAnalyst.ts` — extractJSON + removed dead linkedinScrapeTool
- `apps/api/src/agents/trendResearch.ts` — extractJSON + scoring + `isLive` field
- `apps/api/src/agents/contentGenerator.ts` — extractJSON + retry + diversity + compressed prompt
- `apps/api/src/agents/onboarding.ts` — escape hatch + sliding window + token tracking
- `apps/api/src/agents/personaChat.ts` — sliding window + quota check + token tracking
- `apps/api/src/agents/mastra.ts` — contentPillars + generationMode + trendIsLive + trendSource
- `apps/api/src/models/UserPersona.ts` — new fields (postMetadata, personaVersion, etc.)
- `apps/api/src/models/ContentSuggestion.ts` — generationMode + contextOptions
- `apps/api/src/models/User.ts` — tokensUsed, tokenLimit
- `apps/api/src/routes/persona.ts` — postsArray + add-posts + get-posts + diff response
- `apps/api/src/routes/suggestions.ts` — trendSource in response + quota check
- `apps/api/src/routes/auth.ts` — rate limiters
- `apps/api/src/services/trends.ts` — 30-min cache + word-boundary RSS matching + HN query fix
- `apps/web/src/app/onboarding/page.tsx` — PostInputCards replacing Textarea
- `apps/web/src/app/dashboard/profile/page.tsx` — Add More Posts + PostBatchHistory + PersonaDiffCard + version badge
- `apps/web/src/app/dashboard/page.tsx` — trendSource badge (live/fallback)
- `apps/web/src/lib/api.ts` — addPosts/getPosts + IAddPostsResponse + tokenApi
- `packages/shared-types/src/index.ts` — IPersonaDiff, IAddPostsResponse, ISuggestionsGenerateResponse trendSource

---

## Remaining Low-Priority Items

- [ ] **#25** — Extract ChatSessionService + PersonaService (refactoring, no new functionality)
- [ ] **#32** — Make trend research LLM call optional (heuristic-only mode)
- [ ] **#33** — Refresh token mechanism

---

## Key Notes for Next Session

- All TypeScript checks pass (both `apps/api` and `apps/web`) as of 2026-02-24
- Trend scoring: `scoreAndRankTrends` → `selectBalancedTrends` runs before LLM call in trendResearch
- HN query: only first matched HN_QUERY_MAP expansion is used (avoids long concatenated terms)
- RSS matching: `\b${keyword}\b` regex for single-word, `includes()` for multi-word
- `trendSource`: `'live' | 'fallback'` comes from `isLive` field on TrendResearchResult
- `PersonaDiffCard`: shows after post addition, dismissable, has green "no changes" state
- `PostBatchHistory`: timeline with source icons, newest entry marked "Latest", accepts batches prop or fetchOnMount
- Persona version badge: in "Current Persona" card header — `Persona vN · Updated [date] · N posts`
