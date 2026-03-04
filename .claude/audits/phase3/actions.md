# Audit Implementation Action Tracker — Phase 3

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase3/improvement.md`
**Started**: 2026-03-04
**Last Updated**: 2026-03-04 (Phase A + B + C + D + E ALL COMPLETE ✅)

---

## How to Resume

If context runs out, come back here and:

1. Read this file to see what is done and what is next
2. Start from the first unchecked `[ ]` item
3. Do NOT redo completed `[x]` items
4. Read the referenced improvement.md section (e.g. §1.2 Issue A) for full implementation details and code snippets

---

## Phase A — Trend Pipeline Reliability (Sections 1 + 2) ✅ COMPLETE (2026-03-04)

*Priority: CRITICAL — fixes user-reported trend repetition and zero-result bugs. No dependencies.*

- [x] **#1 — Remove duplicate cache from `services/trends.ts`** (`services/trends.ts` MODIFY): Removed internal `trendCache` Map, `getCachedTrends`, `setCachedTrends`, `buildCacheKey`, and `TREND_CACHE_TTL_MS` from `services/trends.ts`. The canonical cache in `services/trendCache.ts` is now the single source of truth. `fetchRealTrendingContent()` no longer has its own cache logic. ✅ DONE

- [x] **#2 — Add time-bucket to `buildTrendCacheKey()` in `trendCache.ts`** (`services/trendCache.ts` MODIFY): Added `const timeBucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000))` to cache key. Keys now auto-rotate every 6 hours. ✅ DONE

- [x] **#3 — Add `created_at_i>` time filter to HN Algolia queries** (`services/trends.ts` MODIFY): `fetchFromHackerNews()` now computes `twoDaysAgo` timestamp and passes `created_at_i>${twoDaysAgo}` in `numericFilters` for the primary `search_by_date` call. Ranked fallback intentionally skips time filter for broader results. ✅ DONE

- [x] **#4 — Add random shuffle for equally-scored RSS feeds** (`services/trends.ts` MODIFY): Added `shuffleWithinScoreTiers()` helper that groups feeds by `matchScore`, shuffles within each tier via Fisher-Yates, then reassembles in descending score order. Applied before `slice(0, 3)` selection. ✅ DONE

- [x] **#5 — Shuffle heuristic items + vary content angle templates** (`agents/trendResearch.ts` MODIFY): (1) High-relevance items are now `shuffleArray()`-ed before slicing to 8. (2) Added `ANGLE_TEMPLATES` array with 4 distinct templates. Template selection uses `(index + dayOfWeek) % 4` for day-based variety. ✅ DONE

- [x] **#6 — Implement "recently shown" trend penalty** (`utils/scoring.ts` MODIFY, `agents/trendResearch.ts` MODIFY, `agents/mastra.ts` MODIFY): `mastra.ts` Step 3 now loads last 3 `ContentSuggestion.trendsUsed` arrays before calling `researchTrendsForUser()` with `recentTrends`. `researchTrendsForUser()` accepts optional `recentTrends: string[]`, builds a `Set<string>`, and passes to `scoreAndRankTrends()`. `scoreTrendRelevance()` in `scoring.ts` accepts optional `recentTrends: Set<string>` and applies -2 stale penalty via `fuzzyTitleMatch()` (≥60% word overlap). ✅ DONE

- [x] **#7 — Expand `HN_QUERY_MAP` to 30+ industries** (`services/trends.ts` MODIFY): Expanded from 14 entries to 50+ covering: tech/software (20), business/finance (14), healthcare/science (6), education (2), legal/government (2), consumer/retail (6), industrial (7), creative/media (4), general (5). ✅ DONE

- [x] **#8 — Lower HN points threshold for raw keyword queries** (`services/trends.ts` MODIFY): `pointsMin` is now `firstMappedExpansion ? 5 : 2` for niche queries. Added broad fallback query `"technology business innovation 2026"` when raw keyword search returns 0 results. ✅ DONE

- [x] **#9 — Add RSS backup feed retry on total failure** (`services/trends.ts` MODIFY): Extracted `fetchFeedsWithParser()` helper that returns `{ items, rejectedCount }`. When all primary feeds fail (`items.length === 0 && rejectedCount > 0`), retries with `shuffledFeeds.slice(3, 5)` backup feeds. ✅ DONE

- [x] **#10 — Fix hyphen-normalized keyword matching in `isRelevant()`** (`services/trends.ts` MODIFY): Both `text` and `keyword` are now normalized with `.replace(/-/g, " ")` before comparison. "machine-learning" now correctly matches "machine learning". ✅ DONE

- [x] **#11 — Add Google News RSS as Tier 2.5 fallback** (`services/trends.ts` MODIFY): Added `fetchFromGoogleNewsRSS(keywords, industry)` using `https://news.google.com/rss/search?q={query}`. Called in `fetchRealTrendingContent()` when combined HN+RSS results < 5. Source tagged as `"google-news"` with priority 2 in ranking. ✅ DONE

- [x] **#12 — Add structured zero-result logging** (`agents/trendResearch.ts` MODIFY): Added structured JSON log on every fetch: `{ event: "trend_fetch", keywords, industry, geo, sources: { total, breakdown: { hn, tavily, rss, googleNews } }, cacheHit, durationMs }`. On zero results: `{ event: "trend_fetch_zero", keywords, industry, geo, cacheHit, error }`. ✅ DONE

---

## Phase B — Feedback Weight Amplification (Section 6) ✅ COMPLETE (2026-03-04)

*Priority: HIGH — directly improves content quality. No dependencies — can run in parallel with Phase A.*

- [x] **#13 — Reduce learning trigger interval** (`services/feedbackProcessor.ts` MODIFY): Changed `_maybeTrigerLearning()` from `count % 5 === 0` to `count <= 3 || count % 3 === 0`. First 3 feedbacks trigger learning on every single one; after that every 3rd. Closes the gap where users giving 1-4 feedbacks see zero learning effect. ✅ DONE

- [x] **#14 — Strengthen feedback section prompt language** (`agents/contentGenerator.ts` MODIFY): Changed advisory language in `buildFeedbackSection()` to directive RULES: "RULE: At least 60% of generated ideas MUST relate to these preferred topics...", "RULE: Do NOT generate ANY ideas about these topics. Zero tolerance.", "RULE: Format distribution MUST approximately match these percentages." ✅ DONE

- [x] **#15 — Add action weight multiplier** (`services/personaLearning.ts` MODIFY): Added `ACTION_MULTIPLIER` record: `{ published: 2.0, draft: 1.5, saved: 1.2, dismissed: 1.0 }`. Combined weight = `ratingWeight * actionMultiplier * recencyMultiplier`. For actions WITHOUT rating: implicit signal (published=1.5, draft=0.5, dismissed=-0.5, else 0). Makes "published" the strongest behavioral signal. ✅ DONE

- [x] **#16 — Add recency decay weighting** (`services/personaLearning.ts` MODIFY): Applied exponential decay with 14-day half-life: `DECAY_HALF_LIFE_DAYS = 14`, `recencyMultiplier = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)`. Final weight: `ratingWeight * actionMultiplier * recencyMultiplier`. Recent feedback now properly outweighs stale preferences. ✅ DONE

- [x] **#17 — Lower feedback threshold from 3 to 1 with graduated injection** (`agents/contentGenerator.ts` MODIFY): Replaced hard `totalFeedbackCount < 3` gate with two-phase approach. Phase 1 (1-2 feedbacks): lightweight "early signal" section with preferred/avoid topics only. Phase 2 (3+ feedbacks): full directive section with RULES (strengthened by #14). ✅ DONE

- [x] **#18 — Populate `tonePreference` from parsedSignals** (`services/personaLearning.ts` MODIFY): After scoring loop, counts feedbacks with `parsedSignals.toneMatch === "perfect"` and positive rating (loved/good). If ≥2 found, sets `feedbackProfile.tonePreference` to `persona.tone ?? "Professional"`. Now fetches persona alongside feedbacks/drafts via `Promise.all`. Field was defined in schema but never populated — now activated. ✅ DONE

---

## Phase C — Human-in-the-Loop Trend Selection (Section 3) ✅ COMPLETE (2026-03-04)

*Priority: HIGH — major UX improvement. Depends on Phase A (trend reliability must be fixed first).*

- [x] **#19 — Create `trendDiscoveryCache.ts` service** (`services/trendDiscoveryCache.ts` CREATE): Created in-memory per-user cache with 30-min TTL. Exports `storeTrendDiscovery()`, `getTrendDiscovery()`, `getSelectedTrends()`. Uses DJB2 hash for deterministic trend IDs (`generateTrendId()`). Categories derived from content pillar keyword matching. Deduplicates by ID. ✅ DONE

- [x] **#20 — Add `GET /api/trends/discover` endpoint** (`routes/trends.ts` MODIFY): Calls `researchTrendsForUser()` with stale trend penalty (loads last 3 `ContentSuggestion.trendsUsed`). Tracks token usage fire-and-forget. Stores result in discovery cache via `storeTrendDiscovery()`. Returns `{ trends, categories, fetchedAt, expiresAt, isLive }`. ✅ DONE

- [x] **#21 — Add `POST /api/suggestions/generate-from-trends` endpoint** (`routes/suggestions.ts` MODIFY): Accepts `{ selectedTrendIds: string[], context? }` with Zod validation (1-5 IDs). Quota check, cache lookup, persona load, then calls `generateContentIdeas()` directly (skips pipeline Steps 1-3). Persists with `generationMode = "trend-selected"`, full `generationMeta`, and tracks token usage. ✅ DONE

- [x] **#22 — Add "trend-selected" to GenerationMode enum** (`models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Added `"trend-selected"` to `GenerationMode` type and Mongoose enum. Added `selectedTrendIds?: string[]` to `IGenerateContextOptions`. Added `IDiscoveryTrend` and `ITrendDiscoveryResponse` shared types. Updated Zod `mode` enum in suggestions route. ✅ DONE

- [x] **#23 — Create `TrendCard.tsx` component** (`components/trends/TrendCard.tsx` CREATE): Compact card with left checkbox, topic title, source badge, category pill, relevance reason, and content angle. Visual states for selected (indigo ring), disabled (grayed), and hover. ✅ DONE

- [x] **#24 — Create `TrendBrowser.tsx` component** (`components/trends/TrendBrowser.tsx` CREATE): Container with category filter pills, scrollable TrendCard list (max 500px), 1-5 selection limit with counter, "Generate from N Trends" button, refresh and cancel actions. Live/evergreen badge. ✅ DONE

- [x] **#25 — Update dashboard page with "Browse Trends" flow** (`app/dashboard/page.tsx` MODIFY): Added `generateFlow` state (`"one-shot" | "browse-trends"`). Idle state now shows two buttons: "Quick Generate" (existing flow) and "Browse Trends First" (new flow). Choosing state shows either `GenerateOptionsPanel` or `TrendBrowser` based on flow. Separate loading step messages for trend-selected generation. ✅ DONE

- [x] **#26 — Add API client functions for trend discovery** (`apps/web/src/lib/api.ts` MODIFY): Added `trendsApi.discover(geo?)` → `GET /api/trends/discover` (uses AI timeout). Added `suggestionsApi.generateFromTrends(selectedTrendIds, context?)` → `POST /api/suggestions/generate-from-trends` (uses AI timeout). Imported `ITrendDiscoveryResponse` from shared types. ✅ DONE

---

## Phase D — AI-Suggested Topics from Persona (Section 4) ✅ COMPLETE (2026-03-04)

*Priority: MEDIUM — new feature, not a fix. No hard dependencies (can start after Phase B).*

- [x] **#27 — Create `TopicIdeasSchema` and topic suggestion prompt** (`routes/suggestions.ts` inline): Topic suggestion prompt built inline in the `GET /topic-ideas` handler. Instructs Gemini to suggest 8-12 post TOPICS based purely on persona expertise. Uses full persona summary + feedbackProfile signals (preferred/avoid topics, format preferences). Avoids recently published draft topics. ✅ DONE

- [x] **#28 — Add `GET /api/suggestions/topic-ideas` endpoint** (`routes/suggestions.ts` MODIFY): Loads `UserPersona` (including `feedbackProfile`), builds topic suggestion prompt with persona summary + feedback signals + recent published topics for dedup. Calls Gemini via `generateText()`, generates unique topic IDs via `generateTopicId()`, caches results via `storeTopicDiscovery()`. Returns `{ topics[], basedOn }`. Quota check + token tracking. ✅ DONE

- [x] **#29 — Add `POST /api/suggestions/generate-from-topic` endpoint** (`routes/suggestions.ts` MODIFY): Accepts `{ topicId, topicTitle, context }`. Looks up selected topic from cache (falls back to `topicTitle` if cache expired). Builds synthetic `TrendResult` with single trend. Calls `generateContentIdeas()` directly. Persists with `generationMode = "persona-topics"`. Full token tracking + quota check. ✅ DONE

- [x] **#30 — Add topic discovery cache** (`services/trendDiscoveryCache.ts` MODIFY): Added `TopicDiscoveryItem` interface, `topicCache` Map, `generateTopicId()`, `storeTopicDiscovery()`, `getTopicDiscovery()`, `getSelectedTopic()` alongside existing trend discovery functions. Same 30-min TTL. ✅ DONE

- [x] **#31 — Add "persona-topics" to GenerationMode enum** (`models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Added `"persona-topics"` to `GenerationMode` type, Mongoose enum, and shared types `IGenerateContextOptions.mode` union. Also added `ITopicIdea`, `ITopicIdeasResponse` shared types. ✅ DONE

- [x] **#32 — Create `TopicBrowser.tsx` component** (`components/suggestions/TopicBrowser.tsx` CREATE): Shows AI-suggested topics as cards with radio-style single selection. Each card: title, category pill, reasoning text, format badge with icon, confidence bar (0-100%). Category filter pills. "Generate Posts About This Topic" button. "Suggest More" to re-run. ✅ DONE

- [x] **#33 — Update dashboard with "AI Topic Suggestions" flow** (`app/dashboard/page.tsx` MODIFY): Added `"browse-topics"` to `GenerateFlow`. Three-option idle UI: "Quick Generate", "Browse Trends First", "AI Topic Suggestions". TopicBrowser shown in choosing state for browse-topics flow. `handleBrowseTopics()` + `handleGenerateFromTopic()` callbacks. Topic-specific loading step messages. ✅ DONE

- [x] **#34 — Add API client functions for topic suggestions** (`apps/web/src/lib/api.ts` MODIFY): Added `suggestionsApi.getTopicIdeas()` → `GET /api/suggestions/topic-ideas` (AI timeout). Added `suggestionsApi.generateFromTopic(topicId, topicTitle, context?)` → `POST /api/suggestions/generate-from-topic` (AI timeout). Imported `ITopicIdeasResponse`. ✅ DONE

---

## Phase E — AI Detector + Humanizer (Section 5) ✅ COMPLETE (2026-03-04)

*Priority: MEDIUM — new editor feature. Depends on Drafts/Editor system (already implemented). Can start anytime.*

- [x] **#35 — Add `POST /api/drafts/:id/ai-check` endpoint** (`routes/drafts.ts` MODIFY): Loads draft content (or accepts optional `content` in body). Validates minimum 50 chars. Calls `runAiDetection()` from `services/aiDetection.ts`. Returns `{ score, verdict, signals, suggestions }`. Quota check + token tracking. ✅ DONE

- [x] **#36 — Build AI detection prompt with 7-signal analysis** (`services/aiDetection.ts` CREATE): Created `runAiDetection()` with 7-signal prompt: sentence length variance, transitional phrases, personal specificity, tonal consistency, vocabulary diversity, opening patterns, paragraph structure. `AiCheckResultSchema` Zod validation. Returns `{ result, usage }`. ✅ DONE

- [x] **#37 — Add `POST /api/drafts/:id/humanize` endpoint** (`routes/drafts.ts` MODIFY): Loads draft + persona in parallel. Accepts `{ intensity: "light"|"moderate"|"aggressive" }`. Runs AI detection + humanization in parallel for before/after scores. Auto-applies humanized content via `applyAiContent()`. Returns `{ humanizedContent, charCount, changesSummary, beforeScore, afterScore }`. Combined token tracking. ✅ DONE

- [x] **#38 — Build humanization prompt with persona voice matching** (`services/aiDetection.ts` MODIFY): `runHumanizer()` uses `buildPersonaSummary(persona)` + writing style + tone. Three intensity levels with specific rules. 8 humanization rules: personal details, sentence variance, transitional phrases, fragments, contractions, colloquial expressions, register breaks, natural CTA. `HumanizeResultSchema` Zod validation. ✅ DONE

- [x] **#39 — Create `AiDetectorPanel.tsx` component** (`components/editor/AiDetectorPanel.tsx` CREATE): Collapsible panel with: "Run AI Detection" button, score bar (green/yellow/red), signals list with ⚠ icons, suggestions list with ✓ icons, "Humanize Post" button with intensity selector (light/moderate/aggressive), "Re-check" button. Before/after score banner after humanization. Loading states for both operations. ✅ DONE

- [x] **#40 — Integrate AI detector panel into editor page** (`app/dashboard/editor/page.tsx` MODIFY): Added `AiDetectorPanel` below `PostEditorPane` in the left pane. Receives `draftId`, `content`, `disabled` (when published), and `onContentUpdated` (reuses `handleApplyEdit` callback). Collapsible — starts collapsed as a slim button. ✅ DONE

- [x] **#41 — Add AI detection & humanizer API client functions** (`apps/web/src/lib/api.ts` MODIFY): Added `draftsApi.aiCheck(id, content?)` → `POST /api/drafts/:id/ai-check` (AI timeout). Added `draftsApi.humanize(id, intensity)` → `POST /api/drafts/:id/humanize` (AI timeout). Imported `IAiCheckResponse`, `IHumanizeResponse`, `HumanizeIntensity` from shared types. ✅ DONE

---

## Files To Create / Modify

### NEW files to create

**Backend — API**
- `apps/api/src/services/trendDiscoveryCache.ts` — Short-lived per-user cache for trend/topic selection (#19, #30)
- `apps/api/src/services/aiDetection.ts` — AI detection prompt + humanization prompt builders (optional, can inline in routes) (#36, #38)

**Frontend — Web**
- `apps/web/src/components/trends/TrendCard.tsx` — Individual trend selection card (#23)
- `apps/web/src/components/trends/TrendBrowser.tsx` — Trend browsing and selection container (#24)
- `apps/web/src/components/suggestions/TopicBrowser.tsx` — AI topic suggestion browser (#32)
- `apps/web/src/components/editor/AiDetectorPanel.tsx` — AI detection score + humanizer UI (#39)

### Key files to modify

**Backend — Services & Agents**
- `apps/api/src/services/trends.ts` — Remove duplicate cache, expand HN_QUERY_MAP, add Google News RSS, fix keyword matching, add HN time filter, RSS backup retry (#1, #3, #4, #7, #8, #9, #10, #11)
- `apps/api/src/services/trendCache.ts` — Add time-bucket to cache key (#2)
- `apps/api/src/agents/trendResearch.ts` — Shuffle heuristics, accept recentTrends, structured logging (#5, #6, #12)
- `apps/api/src/utils/scoring.ts` — Accept recentTrends parameter, add stale penalty (#6)
- `apps/api/src/agents/mastra.ts` — Load recent trendsUsed before Step 3 (#6)
- `apps/api/src/services/feedbackProcessor.ts` — Reduce learning trigger interval (#13)
- `apps/api/src/agents/contentGenerator.ts` — Strengthen feedback prompt, lower threshold, add TopicIdeasSchema (#14, #17, #27)
- `apps/api/src/services/personaLearning.ts` — Action weights, recency decay, tonePreference (#15, #16, #18)

**Backend — Routes**
- `apps/api/src/routes/trends.ts` — Add `GET /discover` endpoint (#20)
- `apps/api/src/routes/suggestions.ts` — Add `generate-from-trends`, `topic-ideas`, `generate-from-topic` endpoints (#21, #28, #29)
- `apps/api/src/routes/drafts.ts` — Add `ai-check` and `humanize` endpoints (#35, #37)

**Backend — Models**
- `apps/api/src/models/ContentSuggestion.ts` — Add "trend-selected" and "persona-topics" to GenerationMode (#22, #31)

**Shared Types**
- `packages/shared-types/src/index.ts` — Add `selectedTrendIds`, new mode types (#22, #31)

**Frontend — Pages**
- `apps/web/src/app/dashboard/page.tsx` — Add "Browse Trends" and "AI Topics" generation flows (#25, #33)
- `apps/web/src/app/dashboard/editor/page.tsx` — Integrate AI detector panel toggle (#40)

**Frontend — API Client**
- `apps/web/src/lib/api.ts` — Add trend discovery, topic suggestions, AI detection, humanizer API functions (#26, #34, #41)

---

## Dependency Graph

```
Phase A (Trend Pipeline Reliability) ──────┐
  No dependencies — DO FIRST               ├──→ Phase C (Human-in-Loop Trends)
                                            │      Depends on Phase A
Phase B (Feedback Weight Amplification) ────┤
  No dependencies — CAN PARALLEL with A     ├──→ Phase D (AI Topics)
                                            │      Can start after Phase B
                                            │
Phase E (AI Detector + Humanizer) ──────────┘
  Independent — can start ANYTIME
  Only needs existing Drafts/Editor system
```

**Recommended execution order**: A → B → C → D → E
**Parallel option**: A + B in parallel → C + E in parallel → D

---

## Effort Summary

| Phase | Items | Est. Hours | Priority |
|-------|-------|------------|----------|
| A — Trend Pipeline Reliability | 12 | ~8 h | CRITICAL |
| B — Feedback Weight Amplification | 6 | ~4 h | HIGH |
| C — Human-in-the-Loop Trend Selection | 8 | ~10 h | HIGH |
| D — AI-Suggested Topics from Persona | 8 | ~8 h | MEDIUM |
| E — AI Detector + Humanizer | 7 | ~8 h | MEDIUM |
| **TOTAL** | **41** | **~38 h** | |

---

## Key Architecture Notes for Implementation

- **Phase A is entirely backend** — no frontend changes required. All trend pipeline changes are internal; the `TrendResult` output schema stays identical.
- **`researchTrendsForUser()` gains an optional `recentTrends` parameter** — non-breaking. Existing callers without the parameter continue to work.
- **New `GenerationMode` values** ("trend-selected", "persona-topics") are backward-compatible — MongoDB won't break on documents with existing modes.
- **`trendDiscoveryCache.ts` is reused** by both trend selection (Phase C) and topic selection (Phase D) — design it to handle both from the start.
- **AI detection + humanizer use `checkTokenQuota()`** before proceeding — consistent with all other AI operations. Estimated ~4,900 tokens worst case per draft.
- **Humanizer uses the same `applyAiContent` pattern** as the existing post editor agent — content is auto-persisted server-side, frontend receives the update.
- **Dashboard generation UI** evolves from a single button to a 3-option selector: Quick Generate / Browse Trends / AI Topic Suggestions. The existing one-shot pipeline (`/api/suggestions/generate`) remains completely untouched.
- **`feedbackProfile.tonePreference`** was already defined in the schema (Phase 2 #10) but never populated — Phase B #18 finally activates it.
- **All feedback weight changes (Phase B) are internal** to scoring and prompt construction — no schema changes, no API signature changes, no frontend impact.
