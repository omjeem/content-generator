# Audit Implementation Action Tracker — Phase 3

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase3/improvement.md`
**Started**: 2026-03-04
**Last Updated**: 2026-03-04 (Created — no items started)

---

## How to Resume

If context runs out, come back here and:

1. Read this file to see what is done and what is next
2. Start from the first unchecked `[ ]` item
3. Do NOT redo completed `[x]` items
4. Read the referenced improvement.md section (e.g. §1.2 Issue A) for full implementation details and code snippets

---

## Phase A — Trend Pipeline Reliability (Sections 1 + 2)

*Priority: CRITICAL — fixes user-reported trend repetition and zero-result bugs. No dependencies.*

- [ ] **#1 — Remove duplicate cache from `services/trends.ts`** (`services/trends.ts` MODIFY): Remove the internal `trendCache` Map and related functions (`getCachedTrends`, `setCachedTrends`, `buildCacheKey`) from `services/trends.ts` (lines ~370-411). The canonical cache in `services/trendCache.ts` is the single source of truth. This eliminates ghost stale data from two independent 30-min caches. (§1.2 Issue A)

- [ ] **#2 — Add time-bucket to `buildTrendCacheKey()` in `trendCache.ts`** (`services/trendCache.ts` MODIFY): Incorporate a 6-hour time-bucket into the cache key so entries auto-rotate: `const timeBucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));` appended to the key. This ensures even the same user with the same persona gets fresh trends every 6 hours. (§1.2 Issue B)

- [ ] **#3 — Add `created_at_i>` time filter to HN Algolia queries** (`services/trends.ts` MODIFY): In `fetchFromHackerNews()` (line ~209), add a `numericFilters` parameter to restrict results to the last 48 hours: `created_at_i>${twoDaysAgo}` where `twoDaysAgo = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000)`. Prevents old high-scoring stories from weeks ago from appearing. (§1.2 Issue B)

- [ ] **#4 — Add random shuffle for equally-scored RSS feeds** (`services/trends.ts` MODIFY): In feed selection logic (line ~301-306), after scoring feeds by keyword match, group feeds by their `matchScore`, shuffle randomly within each score tier, then take the top 3. Ensures different feeds get selected when multiple have the same score. (§1.2 Issue C)

- [ ] **#5 — Shuffle heuristic items + vary content angle templates** (`agents/trendResearch.ts` MODIFY): In `buildHeuristicResult()` (line ~288-316): (1) Shuffle input items before slicing to 8; (2) Add timestamp-based variety to the `contentAngle` template — alternate between 3-4 angle templates based on `item index + current day-of-week`. Prevents identical heuristic results within any cache window. (§1.2 Issue D)

- [ ] **#6 — Implement "recently shown" trend penalty** (`utils/scoring.ts` MODIFY, `agents/trendResearch.ts` MODIFY, `agents/mastra.ts` MODIFY): Track previously shown trends per user. Before trend scoring in `mastra.ts`, load the user's last 3 `ContentSuggestion.trendsUsed` arrays (within last 7 days). Build a `Set<string>` of recently used trend titles. In `utils/scoring.ts`, add optional `recentTrends: Set<string>` parameter to `scoreTrendRelevance()` — apply a `-2` stale penalty when the item title fuzzy-matches any recently used trend. In `agents/trendResearch.ts`, accept optional `recentTrends: string[]` and pass through to scoring. (§1.2 Issue E)

- [ ] **#7 — Expand `HN_QUERY_MAP` to 30+ industries** (`services/trends.ts` MODIFY): Add mappings for niche industries currently missing: healthcare → "health tech medical biotech digital health", education → "edtech learning education online course", legal → "legaltech law compliance regulation", real estate → "proptech real estate housing construction", finance → "fintech banking payments insurance", food → "foodtech restaurant supply chain agriculture", fashion → "fashion retail D2C ecommerce brand", etc. (§2.2 Failure Mode A)

- [ ] **#8 — Lower HN points threshold for raw keyword queries** (`services/trends.ts` MODIFY): When no `HN_QUERY_MAP` match is found (raw keyword search), lower the points threshold from 5 to 2: `const pointsMin = firstMappedExpansion ? 5 : 2;`. Niche topics get fewer upvotes but are still relevant. Also add broad fallback query "technology business innovation 2026" when raw keyword search returns 0. (§2.2 Failure Mode A)

- [ ] **#9 — Add RSS backup feed retry on total failure** (`services/trends.ts` MODIFY): After `Promise.allSettled()` for RSS feeds, if `allItems.length === 0` and at least one feed was rejected, retry with the next 2 backup feeds from the remaining scored pool: `const backupFeeds = scoredFeeds.slice(3, 5);`. (§2.2 Failure Mode B)

- [ ] **#10 — Fix hyphen-normalized keyword matching in `isRelevant()`** (`services/trends.ts` MODIFY): In `isRelevant()` (line ~120-136), normalize both text and keyword by replacing hyphens with spaces before word-boundary matching: `const lower = text.toLowerCase().replace(/-/g, " ");` and `const kwLower = kw.toLowerCase().trim().replace(/-/g, " ");`. Fixes compound keywords like "machine-learning" not matching "machine learning". (§2.2 Failure Mode C)

- [ ] **#11 — Add Google News RSS as Tier 2.5 fallback** (`services/trends.ts` MODIFY): Create `fetchFromGoogleNewsRSS(keywords, industry)` function using `https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en`. Free, no API key, rarely fails. Add to `fetchRealTrendingContent()` AFTER HN+RSS, only if combined results < 5: `if (results.length < 5) { const gnItems = await fetchFromGoogleNewsRSS(...); results = deduplicateAndRank([...results, ...gnItems]); }`. (§2.2 Failure Mode D)

- [ ] **#12 — Add structured zero-result logging** (`agents/trendResearch.ts` MODIFY): Add structured JSON logging with source breakdown: `{ event: "trend_fetch", userId, sources: { tavily, hn, rss, googleNews }, total, cacheHit, duration }`. When `rawItems.length === 0`, log which sources were attempted and WHY each returned 0 with error details. (§2.3)

---

## Phase B — Feedback Weight Amplification (Section 6)

*Priority: HIGH — directly improves content quality. No dependencies — can run in parallel with Phase A.*

- [ ] **#13 — Reduce learning trigger interval** (`services/feedbackProcessor.ts` MODIFY): In `_maybeTrigerLearning()`, change trigger from `count % 5 === 0` to `count % 3 === 0`. Additionally, for the first 3 feedbacks, trigger on every single one: `if (count <= 3 || count % 3 === 0) { triggerLearning(); }`. This closes the gap where users giving 1-4 feedbacks see zero learning effect. (§6.3 Issue 1)

- [ ] **#14 — Strengthen feedback section prompt language** (`agents/contentGenerator.ts` MODIFY): In `buildFeedbackSection()`, change advisory language to directive RULES. (1) `"→ Prioritise ideas within..."` becomes `"→ RULE: At least 60% of generated ideas MUST relate to these preferred topics..."`. (2) `"→ Avoid ideas centred on..."` becomes `"→ RULE: Do NOT generate ANY ideas about these topics. Zero tolerance."`. (3) `"→ Skew format choices..."` becomes `"→ RULE: Format distribution MUST approximately match these percentages."`. (§6.3 Issue 2)

- [ ] **#15 — Add action weight multiplier** (`services/personaLearning.ts` MODIFY): In the scoring loop (line ~80-101), add `ACTION_MULTIPLIER` map: `{ published: 2.0, draft: 1.5, saved: 1.2, dismissed: 1.0 }`. Apply: `weight = ratingWeight * actionMultiplier`. For actions WITHOUT rating, apply implicit signal: `published → 1.5, draft → 0.5, dismissed → -0.5, else 0`. This makes "published" the strongest behavioral signal. (§6.3 Issue 4)

- [ ] **#16 — Add recency decay weighting** (`services/personaLearning.ts` MODIFY): In the scoring loop, apply exponential decay: `const DECAY_HALF_LIFE_DAYS = 14;` then `recencyMultiplier = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)`. Final weight: `ratingWeight * actionMultiplier * recencyMultiplier`. Recent feedback outweighs stale preferences from months ago. (§6.3 Issue 6)

- [ ] **#17 — Lower feedback threshold from 3 to 1 with graduated injection** (`agents/contentGenerator.ts` MODIFY): In `buildFeedbackSection()`, replace the hard `totalFeedbackCount < 3` gate with a two-phase approach. Phase 1 (1-2 feedbacks): inject lightweight "early signal" section with preferred/avoid topics only. Phase 2 (3+ feedbacks): full directive section (existing logic, strengthened by #14). (§6.3 Issue 5)

- [ ] **#18 — Populate `tonePreference` from parsedSignals** (`services/personaLearning.ts` MODIFY): In `aggregateAndUpdatePersona()`, after computing topic/format scores, analyze `parsedSignals.toneMatch` from feedbacks. Filter for feedbacks where `toneMatch === "perfect"` and `rating >= "good"`. If 2+ "perfect" tone matches found, set `feedbackProfile.tonePreference` to `persona.tone ?? "Professional"`. This field was defined in the schema but never populated. (§6.3 Issue 3)

---

## Phase C — Human-in-the-Loop Trend Selection (Section 3)

*Priority: HIGH — major UX improvement. Depends on Phase A (trend reliability must be fixed first).*

- [ ] **#19 — Create `trendDiscoveryCache.ts` service** (`services/trendDiscoveryCache.ts` CREATE): Short-lived per-user cache mapping trend IDs to full trend data. Interface: `TrendDiscoveryEntry { userId, trends: Array<TrendResult["trends"][0] & { id: string }>, expiresAt }`. In-memory Map with 30-min TTL. Exports: `storeTrendDiscovery(userId, trends)`, `getTrendDiscovery(userId)`, `getSelectedTrends(userId, ids[])`. (§3.2.4)

- [ ] **#20 — Add `GET /api/trends/discover` endpoint** (`routes/trends.ts` MODIFY): Calls `researchTrendsForUser()` (same as pipeline Step 3), generates unique `trend_id` per trend (hash of topic + source), maps each to a "category" based on content pillar match, stores in discovery cache (30 min, keyed by userId). Response: `{ trends: [...], categories: [...], fetchedAt, expiresAt, isLive }`. Each trend includes: `id, topic, source, url, relevanceScore, relevanceReason, contentAngle, category, publishedAt`. (§3.2.1)

- [ ] **#21 — Add `POST /api/suggestions/generate-from-trends` endpoint** (`routes/suggestions.ts` MODIFY): Accepts `{ selectedTrendIds: string[], context: IGenerateContextOptions }`. Looks up selected trends from userId discovery cache, validates IDs exist, builds filtered `TrendResult` with ONLY selected trends, calls `generateContentIdeas()` directly (skips pipeline Steps 1-3). Persists with `generationMode = "trend-selected"`. (§3.2.2)

- [ ] **#22 — Add "trend-selected" to GenerationMode enum** (`models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `"trend-selected"` to the `GenerationMode` type. Add `selectedTrendIds?: string[]` to `IGenerateContextOptions`. (§3.2.3)

- [ ] **#23 — Create `TrendCard.tsx` component** (`components/trends/TrendCard.tsx` CREATE): Individual trend card with: topic title, source badge, relevance score, relevance reason, content angle, category pill, published time, checkbox for selection. Visual: compact card with left checkbox, truncated topic, expandable details. (§3.3)

- [ ] **#24 — Create `TrendBrowser.tsx` component** (`components/trends/TrendBrowser.tsx` CREATE): Container showing curated trends for user to browse and select. Category filter pills (AI, Leadership, SaaS, etc.), TrendCard list with checkbox selection (1-5 max), "Generate from Selected (N)" button at bottom, "Refresh Trends" button to re-fetch, loading/error/empty states. (§3.3)

- [ ] **#25 — Update dashboard page with "Browse Trends" flow** (`app/dashboard/page.tsx` MODIFY): Add new `generateFlow` state option: `"browse-trends"`. "Generate Content Ideas" button now shows TWO options: (a) "Quick Generate" → existing one-shot pipeline, (b) "Browse Trends First" → calls `GET /api/trends/discover` and shows `TrendBrowser`. After trend selection → calls `POST /generate-from-trends` → same loading/results flow as existing. (§3.3)

- [ ] **#26 — Add API client functions for trend discovery** (`apps/web/src/lib/api.ts` MODIFY): Add `trendsApi.discover(geo?: string)` → `GET /api/trends/discover`. Add `suggestionsApi.generateFromTrends(selectedTrendIds, context)` → `POST /api/suggestions/generate-from-trends`. (§3.3)

---

## Phase D — AI-Suggested Topics from Persona (Section 4)

*Priority: MEDIUM — new feature, not a fix. No hard dependencies (can start after Phase B).*

- [ ] **#27 — Create `TopicIdeasSchema` and topic suggestion prompt** (`agents/contentGenerator.ts` MODIFY or new `agents/topicSuggester.ts` CREATE): Zod schema: `z.object({ topics: z.array(z.object({ title, category, reasoning, suggestedFormat: z.enum(["carousel","text-post","poll","video-script","list"]), confidence: z.number().min(0).max(1) })).min(5).max(15) })`. Prompt instructs Gemini to suggest 8-12 post TOPICS based purely on persona expertise — NOT referencing external trends. Uses full persona summary + feedbackProfile signals. (§4.2.2)

- [ ] **#28 — Add `GET /api/suggestions/topic-ideas` endpoint** (`routes/suggestions.ts` MODIFY): Loads `UserPersona` (including `feedbackProfile`), builds topic suggestion prompt, calls Gemini with `TopicIdeasSchema`, generates unique topic IDs, stores in discovery cache (reuse same pattern as trends), returns structured response with `topics[]` and `basedOn` metadata. Tracks token usage. (§4.2.2)

- [ ] **#29 — Add `POST /api/suggestions/generate-from-topic` endpoint** (`routes/suggestions.ts` MODIFY): Accepts `{ topicId, topicTitle, context }`. Looks up selected topic from cache (falls back to `topicTitle` if cache expired). Builds synthetic `TrendResult` with single trend derived from the topic. Calls `generateContentIdeas()` with this synthetic trend. Persists with `generationMode = "persona-topics"`. (§4.2.3)

- [ ] **#30 — Add topic discovery cache** (`services/trendDiscoveryCache.ts` MODIFY): Reuse the same cache service from #19 — add `storeTopicDiscovery(userId, topics)`, `getTopicDiscovery(userId)`, `getSelectedTopic(userId, topicId)` alongside the existing trend discovery functions. Same 30-min TTL. (§4.2.3)

- [ ] **#31 — Add "persona-topics" to GenerationMode enum** (`models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `"persona-topics"` to `GenerationMode` type. (§4.2.1)

- [ ] **#32 — Create `TopicBrowser.tsx` component** (`components/suggestions/TopicBrowser.tsx` CREATE): Shows AI-suggested topics as cards. Each card: title, category pill, reasoning text, format badge, confidence bar (0-100%). Click to select → "Generate Posts About This Topic" button. "Suggest More" button to re-run generation. Loading/error/empty states. (§4.3)

- [ ] **#33 — Update dashboard with "AI Topic Suggestions" flow** (`app/dashboard/page.tsx` MODIFY): Add `"browse-topics"` to `generateFlow` state. Three-option generation UI: (a) "Quick Generate" (auto), (b) "Browse Trends" (select), (c) "AI Topic Suggestions" (persona). Shows `TopicBrowser` when in browse-topics mode. After topic selection → calls `POST /generate-from-topic` → same results flow. (§4.3)

- [ ] **#34 — Add API client functions for topic suggestions** (`apps/web/src/lib/api.ts` MODIFY): Add `suggestionsApi.getTopicIdeas()` → `GET /api/suggestions/topic-ideas`. Add `suggestionsApi.generateFromTopic(topicId, topicTitle, context)` → `POST /api/suggestions/generate-from-topic`. (§4.3)

---

## Phase E — AI Detector + Humanizer (Section 5)

*Priority: MEDIUM — new editor feature. Depends on Drafts/Editor system (already implemented). Can start anytime.*

- [ ] **#35 — Add `POST /api/drafts/:id/ai-check` endpoint** (`routes/drafts.ts` MODIFY): Loads draft content. Builds AI detection prompt evaluating 7 signals: sentence length variance, transitional phrase patterns, personal specificity, tonal consistency, vocabulary diversity, opening patterns, paragraph structure. Calls Gemini, returns `{ score: 0-100, verdict: "human"|"mixed"|"likely-ai", signals: string[], suggestions: string[] }`. Tracks token usage (~1,100 tokens). (§5.2.1, §5.2.2)

- [ ] **#36 — Build AI detection prompt with 7-signal analysis** (`routes/drafts.ts` or new `services/aiDetection.ts` CREATE): Encapsulate detection prompt building: score 0-100, structured JSON output with signals/suggestions. Zod schema for response validation. Reusable by both ai-check endpoint and humanizer's before/after scoring. (§5.2.2)

- [ ] **#37 — Add `POST /api/drafts/:id/humanize` endpoint** (`routes/drafts.ts` MODIFY): Loads draft + persona (for voice matching). Accepts `{ preserveCore: boolean, intensity: "light"|"moderate"|"aggressive" }`. Builds humanization prompt with persona voice + 8 humanization rules (personal details, sentence variance, contractions, colloquial expressions, etc.). Calls Gemini, auto-applies via `applyAiContent` pattern, returns `{ humanizedContent, charCount, changesSummary, beforeScore, afterScore }`. Tracks token usage (~2,700 tokens). (§5.3.1, §5.3.2)

- [ ] **#38 — Build humanization prompt with persona voice matching** (`routes/drafts.ts` or `services/aiDetection.ts` MODIFY): Prompt uses `buildPersonaSummary(persona)`, writing style, tone. Three intensity levels: light (keep 80% wording), moderate (rewrite 50%, add personal touches), aggressive (complete rewrite, same core message). 8 specific humanization rules enforced. (§5.3.2)

- [ ] **#39 — Create `AiDetectorPanel.tsx` component** (`components/editor/AiDetectorPanel.tsx` CREATE): UI panel showing: score bar (green 0-30, yellow 31-60, red 61-100), verdict text, detected signals list (warning icons), improvement suggestions list (check icons), "Humanize This Post" button (shows intensity selector: light/moderate/aggressive), "Re-check" button for after manual edits. Loading states for both detection and humanization. Before/after score comparison after humanization. (§5.2.3, §5.3.3)

- [ ] **#40 — Integrate AI detector panel into editor page** (`app/dashboard/editor/page.tsx` MODIFY): Add toggle button in the editor toolbar to show/hide `AiDetectorPanel`. Panel appears as a collapsible section above or alongside the PostEditorPane. "Humanize" action updates editor content via same `handleApplyEdit` callback. "Undo" restores pre-humanization content from `contentHistory`. (§5.3.3)

- [ ] **#41 — Add AI detection & humanizer API client functions** (`apps/web/src/lib/api.ts` MODIFY): Add `draftsApi.aiCheck(draftId, content?)` → `POST /api/drafts/:id/ai-check`. Add `draftsApi.humanize(draftId, { preserveCore, intensity })` → `POST /api/drafts/:id/humanize`. Both use `requestAI` (180s timeout). (§5.2.3, §5.3.3)

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
