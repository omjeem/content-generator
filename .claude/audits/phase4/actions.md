# Audit Implementation Action Tracker — Phase 4

**Source**: `/Users/hexahealth/Documents/PP/content-generator/.claude/audits/phase4/improvement.md`
**Started**: 2026-03-05
**Last Updated**: 2026-03-05
**Phase A**: COMPLETE ✅

---

## How to Resume

If context runs out, come back here and:

1. Read this file to see what is done and what is next
2. Start from the first unchecked `[ ]` item
3. Do NOT redo completed `[x]` items
4. Read the referenced improvement.md section (e.g. §2.1, §5.1) for full implementation details and code snippets

---

## Phase A — Quick Wins: Code Quality & Tech Debt (Sections 6.1–6.4, Appendix) ✅ COMPLETE

*Priority: CRITICAL — fixes bugs, hardens schemas, cleans dead code. No dependencies. DO FIRST.*

### Sub-Phase A1 — Constants Extraction & Dead Code Cleanup (§6.2, Appendix)

- [x] **#1 — Create centralized constants file** (`config/constants.ts` CREATE): Extracted SCORING, LEARNING, PIPELINE, GENERATION, CACHE, LIMITS groups. ✅ DONE

- [x] **#2 — Dead code cleanup across agents**: (a) Removed unused `linkedinScrapeTool` + `createTool`/`ScrapingBlockedError` imports from personaAnalyst.ts. (b) Fixed typo `_maybeTrigerLearning` → `_maybeTriggerLearning` in feedbackProcessor.ts (both declaration and call). (c) Verified `chatSchema` in drafts.ts already clean — only stale comment remains. ✅ DONE

- [x] **#3 — Create fire-and-forget safety wrapper** (`utils/fireAndForget.ts` CREATE): Created `fireAndForget(fn, label)` that handles both sync-void and async returns. Applied to 3 `trackTokenUsage` calls in mastra.ts and 1 `processFeedback` call in feedback.ts. ✅ DONE

### Sub-Phase A2 — Schema Hardening (§6.3)

- [x] **#4 — Harden `formatPreferences` in UserPersona**: Replaced `Schema.Types.Mixed` with explicit typed sub-schema with `strict:false` for backward compat. ✅ DONE

- [x] **#5 — Harden `contextOptions` in ContentSuggestion**: Replaced `Schema.Types.Mixed` with explicit sub-schema (mode, topicFocus, targetAudienceOverride, etc.) with `strict:false`. ✅ DONE

- [x] **#6 — Add validators and limits to schemas**: (a) scrapedPosts max 500 validator. (b) analysisHistory max 20 validator. (c) suggestions min 1 validator. (d) `.trim()` on feedbackText Zod schema. ✅ DONE

### Sub-Phase A3 — Error Recovery (§6.4)

- [x] **#7 — Wrapped processFeedback with fireAndForget** in feedback.ts. ✅ DONE

- [x] **#8 — Added try/catch to aiDetection.ts JSON parse**: Returns fallback `{ score: -1, verdict: 'mixed', signals: [...], suggestions: [...] }` on parse failure. Also added parse error handling to runHumanizer. ✅ DONE

- [x] **#9 — Added retry button for failed generation on dashboard**: Caches `lastGenerationContext` in state. Error state shows "Retry with Same Options" + "Change Options" buttons. ✅ DONE

- [x] **#10 — Re-check token quota before each generation**: `handleGenerate()` now calls `tokenApi.getUsage()` before starting generation. Blocks and shows quota exceeded if limit reached. ✅ DONE

---

## Phase B — Rate Limiting & Pipeline Reliability (Sections 5.1–5.4)

*Priority: HIGH — prevents abuse and pipeline hangs. No dependencies — can run in parallel with Phase A.*

- [ ] **#11 — Create rate limiting middleware** (`middleware/rateLimit.ts` CREATE, `routes/suggestions.ts` MODIFY, `routes/drafts.ts` MODIFY, `routes/trends.ts` MODIFY): Install `express-rate-limit`. Create three limiters: `generationLimiter` (5/min per user), `chatLimiter` (20/min per user), `aiCheckLimiter` (10/min per user). Apply to: `/generate` and `/generate-from-trends` and `/generate-from-topic` (generationLimiter), `/refine-context` and `/:id/chat` (chatLimiter), `/:id/ai-check` and `/:id/humanize` (aiCheckLimiter). Key by `req.userId`. (§5.4)

- [ ] **#12 — Add pipeline step-level timeouts** (`agents/mastra.ts` MODIFY): Create `withTimeout<T>(promise, ms, label)` utility. Wrap each pipeline step: persona analysis (30s), trend research (15s), content generation (45s). Add overall pipeline timeout (90s) via `Promise.race`. On timeout, throw descriptive error: `'${label} timed out after ${ms}ms'`. Use timeout constants from `config/constants.ts` (#1). (§5.1)

- [ ] **#13 — Create circuit breaker utility** (`utils/circuitBreaker.ts` CREATE, `agents/mastra.ts` MODIFY): Create `CircuitBreaker` class with states: closed → open → half-open. Config: `failureThreshold: 5`, `cooldownMs: 60_000`, `halfOpenRequests: 1`. Track consecutive failures. When open, return immediate error: `'AI service temporarily unavailable. Retrying in 60s.'`. Use in `runContentPipelineWithRetry()` to wrap the Gemini call. (§5.1)

- [ ] **#14 — Add exponential backoff to pipeline retry** (`agents/mastra.ts` MODIFY): Replace linear 1s wait with exponential: attempt 1 = immediate, attempt 2 = 2s wait. If adding a 3rd attempt later: 4s wait. Use formula: `delay = Math.pow(2, attempt - 1) * 1000`. (§5.1)

- [ ] **#15 — Add trend deduplication across sources** (`services/trends.ts` MODIFY): Add `deduplicateItems(items)` function after merging all tier results. Normalize titles: lowercase, remove non-alphanumeric, sort words, join. Group by normalized title. Keep highest-quality source (rank: Tavily > HN high-score > RSS > HN low-score > Google News). Store alternate URLs on winning item. (§5.2)

- [ ] **#16 — Persistent trend cache (MongoDB L2)** (`models/TrendCache.ts` CREATE, `services/trendCache.ts` MODIFY): Create `TrendCache` Mongoose model with TTL index (`createdAt`, expires: 1800s). Update `trendCache.ts` to use two-tier caching: L1 = in-memory Map (5-min TTL), L2 = MongoDB (30-min TTL via auto-expiry). On miss: check L1 → check L2 → fetch from APIs → store in both. (§5.3)

---

## Phase C — Deeper Persona Understanding (Section 2)

*Priority: CRITICAL for core goal. Depends on Phase A (#1 constants, #4 schema hardening). Start after A1-A2.*

- [ ] **#17 — Create Writing Pattern DNA service** (`services/writingDNA.ts` CREATE): Deterministic (no LLM) extraction of 15+ writing patterns from post array. Outputs: `avgSentenceLength`, `sentenceLengthVariance`, `avgParagraphLength`, `openingPatterns` (question/story/statistic/boldClaim/other counts), `emojiFrequency` (per 100 words), `emojiTypes` (top 5), `hashtagFrequency` (per post), `hashtagPlacement` (inline/end/mixed), `avgPostLength` (chars), `postLengthRange` [min, max], `usesListFormat` (boolean), `usesBulletPoints` (boolean), `lineBreakFrequency` (per 100 words), `readingLevel` (simple/moderate/advanced via avg syllables), `firstPersonRatio` (0-1), `ctaPatterns` (extracted CTA phrases). (§2.1)

- [ ] **#18 — Add `writingDNA` field to UserPersona model** (`models/UserPersona.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `writingDNA` sub-schema to `UserPersona` matching the output of #17. Add `IWritingDNA` interface to shared types. All fields optional (populated lazily). (§2.1)

- [ ] **#19 — Integrate Writing DNA into persona analysis** (`agents/personaAnalyst.ts` MODIFY, `routes/persona.ts` MODIFY): After LLM persona analysis completes, call `extractWritingDNA(posts)` deterministically (free, fast). Store result in `persona.writingDNA`. Also call on `/add-posts` route for incremental updates (recompute from all posts). (§2.1)

- [ ] **#20 — Consume Writing DNA in content generator** (`agents/contentGenerator.ts` MODIFY): Add `buildWritingDNASection(persona)` — returns prompt section only if `writingDNA` exists. Include: "Your creator's typical opening is {topPattern}. Average post length: {N} chars. They {use/don't use} emojis. Reading level: {level}." This helps the LLM generate hooks matching the creator's proven patterns. (§2.1)

- [ ] **#21 — Consume Writing DNA in post editor** (`agents/postEditor.ts` MODIFY): Add Writing DNA context to `buildEditorPrompt()` so the AI co-writer maintains voice consistency: sentence length targets, emoji usage, CTA phrasing style, list/bullet preferences. (§2.1)

- [ ] **#22 — Create Persona Confidence Score calculator** (`services/personaConfidence.ts` CREATE): Deterministic scoring (no LLM): `postVolume` = min(25, totalPostsAnalyzed × 2.5), `interviewComplete` = 4 per filled field (max 20), `feedbackVolume` = min(25, totalFeedbackCount × 2.5), `performanceData` = min(15, postsWithEngagement × 5), `recency` = 15 − (daysSinceLastActivity × 0.5, min 0). Overall = sum of all (0-100). (§2.4)

- [ ] **#23 — Add confidence score to UserPersona** (`models/UserPersona.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `confidenceScore` sub-schema: `{ overall: Number, breakdown: { postVolume, interviewComplete, feedbackVolume, performanceData, recency } }`. Add `IPersonaConfidenceScore` to shared types. (§2.4)

- [ ] **#24 — Compute and persist confidence score** (`routes/persona.ts` MODIFY, `agents/mastra.ts` MODIFY): Recompute confidence score after: persona analysis, post addition, feedback learning update. Store on persona document. Return in `GET /api/persona` response. (§2.4)

- [ ] **#25 — Display confidence score on dashboard** (`app/dashboard/page.tsx` MODIFY): Show confidence badge in profile status card: "We understand you {score}%". If < 40: "Add more posts to improve". If 40-70: "Good — keep providing feedback". If > 70: "Excellent — suggestions are highly personalized". (§2.4)

- [ ] **#26 — Use confidence score in content generator** (`agents/contentGenerator.ts` MODIFY): If confidence < 40 → add prompt directive: "Use broader, exploratory topic suggestions. Include diverse formats." If confidence > 70 → add: "You can be highly specific. Use niche topics matching the creator's proven expertise." (§2.4)

---

## Phase D — Smarter Content Generation (Section 3)

*Priority: HIGH — directly improves suggestion quality. Depends on Phase C (#17-18 Writing DNA, #22-23 Confidence Score).*

- [ ] **#27 — Post Format Intelligence: Schema + Learning** (`services/personaLearning.ts` MODIFY): Update `aggregateAndUpdatePersona()` to compute format preference scores as proper 0-1 values per format type. Use hardened schema from #4. Calculate: `formatScore[format] = positiveCount / totalFormatFeedback`. Only update formats with ≥2 data points. (§3.1)

- [ ] **#28 — Post Format Intelligence: Generation Prompt** (`agents/contentGenerator.ts` MODIFY): Add `buildFormatStrategySection(persona)` — reads `feedbackProfile.formatPreferences`. If format has score > 0.6 → "Prioritize: {format} ({score×100}% positive)". If score < 0.2 → "Use sparingly: {format}". If insufficient data → "Experiment with: {format}". Inject after feedback section. (§3.1)

- [ ] **#29 — Post Format Intelligence: Frontend Filter** (`components/suggestions/GenerateOptionsPanel.tsx` MODIFY): Add "Preferred formats" multi-select dropdown to options panel. Options: carousel, text-post, poll, video-script, list. Pass as `context.preferredFormats[]`. Content generator uses as hard constraint if provided (overrides learned preferences). (§3.1)

- [ ] **#30 — Scheduling Hints: Domain Lookup Data** (`services/schedulingHints.ts` CREATE): Create `OPTIMAL_POSTING_TIMES` record mapping each `DomainCategory` to best days and time ranges (from industry research). Function `getSchedulingHint(domain, timezone?, engagementData?)` returns `{ bestDay, bestTimeRange, reasoning, confidence: 'domain-average' | 'personalized' }`. (§3.2)

- [ ] **#31 — Scheduling Hints: Integration** (`agents/contentGenerator.ts` MODIFY, `models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `schedulingHint` optional field to suggestion item schema. Add `ISchedulingHint` to shared types. Content generator calls `getSchedulingHint()` and attaches to each suggestion. (§3.2)

- [ ] **#32 — Scheduling Hints: Frontend Display** (`components/suggestions/SuggestionCard.tsx` MODIFY): Display scheduling hint as subtle chip below the suggestion hook: "Best posted: Tuesday, 8-10 AM". Only show if `schedulingHint` exists. (§3.2)

- [ ] **#33 — Content Series Detection** (`services/contentContinuity.ts` CREATE): Scan recent published drafts for topic clusters. If 2+ posts share topic keywords → flag as potential series. Function `detectContentSeries(userId)` returns `{ seriesName, postCount, previousTitles }[]`. Uses simple keyword overlap (no LLM). (§3.3)

- [ ] **#34 — Content Series in Generation** (`agents/contentGenerator.ts` MODIFY, `models/ContentSuggestion.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `seriesTag` optional field to suggestion item: `{ name, sequenceNumber, previousPosts }`. Add `ISeriesTag` to shared types. Content generator receives series data and adds directive: "Suggest 1-2 follow-up ideas continuing the '{seriesName}' series." (§3.3)

- [ ] **#35 — Content Series: Frontend Display** (`components/suggestions/SuggestionCard.tsx` MODIFY): Show series badge on SuggestionCard: "Part {N} of '{seriesName}'". Only shown when `seriesTag` exists. (§3.3)

---

## Phase E — Feedback Loop Improvements (Section 4)

*Priority: HIGH — makes the system learn faster. Depends on Phase A (#3 fire-and-forget wrapper). Can run in parallel with Phase D.*

- [ ] **#36 — Implicit Signal Types + Backend Endpoint** (`routes/feedback.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `IImplicitSignal` type: `{ type: 'hook_copied' | 'brief_copied' | 'write_clicked' | 'time_spent' | 'skipped' | 'regenerated', suggestionSetId, suggestionIndex, metadata?: { timeSpentMs? } }`. Add `POST /api/feedback/implicit` endpoint accepting batched events. Convert to equivalent feedback weights: hook_copied=0.75, brief_copied=1.0, write_clicked=1.5, time_spent(>30s)=0.3, skipped(<2s)=-0.1. Fire-and-forget to personaLearning with 0.5× multiplier vs explicit feedback. (§4.1)

- [ ] **#37 — Implicit Signal: Frontend Tracking** (`lib/implicitTracking.ts` CREATE, `components/suggestions/SuggestionCard.tsx` MODIFY): Create `trackImplicitSignal(event)` function. Debounce + batch POST to `/api/feedback/implicit` every 10 seconds or on page unload. Track: `hook_copied` (on copy hook click), `brief_copied` (on copy brief click), `write_clicked` (on "Write This Post" click). Add `IntersectionObserver` for time_spent tracking on SuggestionCard (measure visibility duration). (§4.1)

- [ ] **#38 — Implicit Signal: Learning Integration** (`services/personaLearning.ts` MODIFY): Add `processImplicitSignals(userId, signals)` function. Merge with explicit feedback but apply 0.5× multiplier. Track separately in `feedbackProfile.implicitSignalCount`. Don't let implicit signals override explicit ratings (explicit always wins). (§4.1)

- [ ] **#39 — Feedback Summary: Dashboard Card** (`app/dashboard/page.tsx` MODIFY, `lib/api.ts` — already has `feedbackApi.getSummary()`): Add "What We've Learned" card to dashboard when `totalFeedbackCount > 0`. Shows: preferred topics (pills), avoided topics (pills), best formats (top 3), average rating (stars), total feedback count. Progress bar: "{count}/20 feedbacks for optimal suggestions". (§4.3)

- [ ] **#40 — Feedback Summary: Profile Section** (`app/dashboard/profile/page.tsx` MODIFY): Add "Feedback Insights" section below persona profile. Show: format preferences as horizontal bar chart (CSS-only, no chart library), topic affinity list (positive/negative), rating history summary, "Reset Learning" button (clears `feedbackProfile` via new `DELETE /api/feedback/reset` endpoint). (§4.3)

- [ ] **#41 — Published Post Outcome Tracking: Backend** (`routes/drafts.ts` MODIFY, `models/PostDraft.ts` MODIFY, `packages/shared-types/src/index.ts` MODIFY): Add `performanceData` optional sub-schema to PostDraft: `{ likes: Number, comments: Number, reposts: Number, impressions?: Number, reportedAt: Date }`. Add `POST /api/drafts/:id/performance` endpoint. Trigger personaLearning with 3.0× weight for high-engagement posts (likes+comments > median). Add `IPerformanceData` to shared types. (§4.4, §2.3)

- [ ] **#42 — Published Post Outcome Tracking: Frontend** (`app/dashboard/page.tsx` MODIFY, `lib/api.ts` MODIFY): On dashboard mount, check for published drafts 24-72h old without `performanceData`. Show notification banner: "How did your post on '{topic}' perform?" with quick-entry modal (3 number inputs: likes, comments, reposts + Skip). Call `draftsApi.reportPerformance(id, data)`. (§4.4)

---

## Phase F — UX Enhancements (Section 7)

*Priority: MEDIUM — better user experience. Depends on Phase C (#25 confidence display) and Phase E (#39 feedback summary). Start after C+E.*

- [ ] **#43 — Quick Regenerate with Refinement** (`routes/suggestions.ts` MODIFY, `app/dashboard/page.tsx` MODIFY): Add `POST /api/suggestions/:setId/regenerate` endpoint. Loads original set's trends + context. Accepts refinement body: `{ moreLike?: number[], differentAngle?: number[], avoid?: string, preferredFormats?: string[] }`. Generates new set with `generationMode: 'chat-refined'`, linked via `parentSetId`. Frontend: add "Regenerate with tweaks" button below suggestion set with small refinement modal. (§7.4)

- [ ] **#44 — Suggestion Comparison View** (`app/dashboard/suggestions/compare/page.tsx` CREATE): New page at `/dashboard/suggestions/compare`. Side-by-side comparison of any 2 suggestion sets from history. Highlight unique topics/angles. Quick "Write This Post" from either side. Link from suggestions history page: "Compare" action per set. (§7.2)

- [ ] **#45 — Persona Evolution Timeline** (`app/dashboard/profile/evolution/page.tsx` CREATE, `routes/persona.ts` MODIFY): New page showing persona version history. Each version node: what changed (via diff), what triggered it (posts added / feedback / chat edit), snapshot data. Link from profile page. Add `GET /api/persona/history` endpoint returning `analysisHistory` with formatted diffs. (§7.3)

- [ ] **#46 — Dashboard UX Polish** (`app/dashboard/page.tsx` MODIFY): (a) Replace Unicode status icons (○, ✓, !) with Lucide React icons (`Clock`, `CheckCircle`, `AlertCircle`). (b) Show skeleton loaders while persona loads. (c) Add "View Profile" link from status card. (d) Show token usage as percentage progress bar instead of raw numbers. (e) Auto-hide quota exceeded banner on re-check. (§7 general)

---

## Phase G — Advanced Features (Sections 2.2, 2.3, 3.4, 4.2)

*Priority: MEDIUM — advanced intelligence. Depends on Phase D (#27 format intelligence), Phase E (#41 outcome tracking). Start after D+E.*

- [ ] **#47 — Audience Resonance Tracking: Model + Service** (`models/AudienceInsight.ts` CREATE, `services/audienceTracker.ts` CREATE): Create `AudienceInsight` model: `{ userId, postContent, engagement: { likes, comments, reposts, impressions? }, topics[], format, dayOfWeek, timeOfDay, audienceQuestions[], recordedAt }`. Create `audienceTracker.ts` with `recordEngagement()` and `getAudienceInsights(userId)` — computes top-performing topics, best posting times, format performance. (§2.2)

- [ ] **#48 — Audience Resonance: Route + Integration** (`routes/audience.ts` CREATE, `index.ts` MODIFY, `agents/contentGenerator.ts` MODIFY): Add `POST /api/audience/record` endpoint (user reports engagement). Add `GET /api/audience/insights` endpoint. Content generator receives audience signals: "Your audience responds best to {topics} on {days}. Top format: {format}." (§2.2)

- [ ] **#49 — Content Performance Memory** (`services/performanceTracker.ts` CREATE, `services/personaLearning.ts` MODIFY): Create service linking published draft performance to original suggestions. Performance-weighted learning: published + high engagement = 3.0× (was 2.0×), published + low engagement = 1.0× (reduce from 2.0×). Topics from high-performing posts boosted in `preferredTopics`. (§2.3)

- [ ] **#50 — A/B Test Framework** (`services/abTest.ts` CREATE, `agents/trendResearch.ts` MODIFY, `models/ContentSuggestion.ts` MODIFY): For 10% of requests, run both heuristic AND LLM paths. Serve heuristic (fast), store LLM as shadow. Track feedback rates per path over time. Add `abTestData` optional field to ContentSuggestion: `{ servedPath, shadowResult? }`. (§4.2)

- [ ] **#51 — Competitor/Peer Awareness (MVP)** (`models/UserPersona.ts` MODIFY, `routes/persona.ts` MODIFY, `agents/contentGenerator.ts` MODIFY): Add `peerInsights` optional field to UserPersona: `{ peerUrls[], lastScrapedAt, peerTopics[] }`. Add `POST /api/persona/peers` endpoint to register 2-5 peer LinkedIn URLs. Scrape peer posts (reuse existing scraper). Classify peer topics. Content generator receives: "Your peers recently posted about: {topics}. Suggest angles that differentiate." (§3.4)

---

## Phase H — Shared Types & Integration Testing

*Priority: REQUIRED — runs after all feature phases. Ensures type safety and correct wiring.*

- [ ] **#52 — Update shared types for all new features** (`packages/shared-types/src/index.ts` MODIFY): Add all new interfaces: `IWritingDNA`, `IPersonaConfidenceScore`, `ISchedulingHint`, `ISeriesTag`, `IImplicitSignal`, `IPerformanceData`, `IAudienceInsight`, `IAudienceEngagement`. Update `IUserPersona` with `writingDNA?`, `confidenceScore?`, `peerInsights?`. Update `ISuggestion` with `schedulingHint?`, `seriesTag?`. (§all)

- [ ] **#53 — TypeScript full compilation check** (`tsconfig.json`): Run `npx tsc --noEmit` on both `apps/api` and `apps/web`. Fix all type errors. Ensure zero warnings. (§all)

- [ ] **#54 — Update `.claude` documentation** (`.claude/project-context.md` MODIFY, `.claude/architecture.md` MODIFY, `.claude/rules.md` MODIFY, `.claude/decisions.md` MODIFY): Update all context files with Phase 4 additions: new services, new models, updated agent capabilities, new routes, new frontend pages. Add Decision 21-26 for each major feature. (§all)

---

## Files To Create / Modify

### NEW files to create

**Backend — API**
- `apps/api/src/config/constants.ts` — Centralized magic numbers (#1)
- `apps/api/src/utils/fireAndForget.ts` — Safe fire-and-forget wrapper (#3)
- `apps/api/src/utils/circuitBreaker.ts` — Circuit breaker for Gemini API (#13)
- `apps/api/src/middleware/rateLimit.ts` — Rate limiting middleware (#11)
- `apps/api/src/services/writingDNA.ts` — Deterministic writing pattern extraction (#17)
- `apps/api/src/services/personaConfidence.ts` — Confidence score calculator (#22)
- `apps/api/src/services/schedulingHints.ts` — Domain-based posting time hints (#30)
- `apps/api/src/services/contentContinuity.ts` — Content series detection (#33)
- `apps/api/src/services/audienceTracker.ts` — Audience engagement tracking (#47)
- `apps/api/src/services/performanceTracker.ts` — Performance-weighted learning (#49)
- `apps/api/src/services/abTest.ts` — A/B test framework (#50)
- `apps/api/src/models/TrendCache.ts` — Persistent L2 trend cache (#16)
- `apps/api/src/models/AudienceInsight.ts` — Audience engagement records (#47)
- `apps/api/src/routes/audience.ts` — Audience tracking endpoints (#48)

**Frontend — Web**
- `apps/web/src/lib/implicitTracking.ts` — Implicit signal tracker (#37)
- `apps/web/src/app/dashboard/suggestions/compare/page.tsx` — Comparison view (#44)
- `apps/web/src/app/dashboard/profile/evolution/page.tsx` — Persona timeline (#45)

### Key files to modify

**Backend — Config & Utils**
- `apps/api/src/config/constants.ts` — (#1, used by #12, #13, #14, #22, #27)

**Backend — Models**
- `apps/api/src/models/UserPersona.ts` — writingDNA, confidenceScore, peerInsights, hardened formatPreferences (#4, #18, #23, #51)
- `apps/api/src/models/ContentSuggestion.ts` — contextOptions typed, suggestion validators, schedulingHint, seriesTag, abTestData (#5, #6, #31, #34, #50)
- `apps/api/src/models/PostDraft.ts` — performanceData field (#41)

**Backend — Services**
- `apps/api/src/services/personaLearning.ts` — format scores as 0-1, implicit signals, performance weighting (#27, #38, #49)
- `apps/api/src/services/trendCache.ts` — two-tier L1+L2 caching (#16)
- `apps/api/src/services/trends.ts` — trend deduplication (#15)
- `apps/api/src/services/aiDetection.ts` — JSON parse fallback (#8)
- `apps/api/src/services/feedbackProcessor.ts` — typo fix (#2)

**Backend — Agents**
- `apps/api/src/agents/mastra.ts` — timeouts, circuit breaker, backoff, confidence recompute (#12, #13, #14, #24)
- `apps/api/src/agents/contentGenerator.ts` — writingDNA section, confidence directives, format strategy, scheduling hints, series directives, audience signals (#20, #26, #28, #31, #34, #48)
- `apps/api/src/agents/postEditor.ts` — writingDNA in editor prompt (#21)
- `apps/api/src/agents/personaAnalyst.ts` — dead code cleanup, call writingDNA (#2, #19)

**Backend — Routes**
- `apps/api/src/routes/suggestions.ts` — rate limiting, regenerate endpoint (#11, #43)
- `apps/api/src/routes/feedback.ts` — fire-and-forget wrapper, implicit signals endpoint, trim feedbackText (#3, #7, #36)
- `apps/api/src/routes/drafts.ts` — rate limiting, performance endpoint (#11, #41)
- `apps/api/src/routes/trends.ts` — rate limiting (#11)
- `apps/api/src/routes/persona.ts` — writingDNA integration, confidence compute, peers, history (#19, #24, #45, #51)
- `apps/api/src/index.ts` — register audience routes (#48)

**Frontend — Pages**
- `apps/web/src/app/dashboard/page.tsx` — retry button, quota recheck, confidence badge, feedback summary card, outcome tracking notification, UX polish (#9, #10, #25, #39, #42, #46)
- `apps/web/src/app/dashboard/profile/page.tsx` — feedback insights section (#40)

**Frontend — Components**
- `apps/web/src/components/suggestions/SuggestionCard.tsx` — implicit tracking, scheduling hint, series badge (#32, #35, #37)
- `apps/web/src/components/suggestions/GenerateOptionsPanel.tsx` — format filter (#29)

**Shared Types**
- `packages/shared-types/src/index.ts` — all new interfaces (#18, #23, #31, #34, #36, #41, #52)

**Frontend — API Client**
- `apps/web/src/lib/api.ts` — implicit feedback, performance reporting, audience API, regenerate (#37, #42, #48, #43)

---

## Dependency Graph

```
Phase A (Quick Wins — Code Quality)
  A1: Constants + Dead Code    ─── no deps ─── DO FIRST
  A2: Schema Hardening         ─── no deps ─── PARALLEL with A1
  A3: Error Recovery           ─── no deps ─── PARALLEL with A1
    │
    ├──→ Phase C (Deeper Persona Understanding)
    │      Depends on A1 (#1 constants), A2 (#4 formatPreferences)
    │        │
    │        ├──→ Phase D (Smarter Content Generation)
    │        │      Depends on C (#17 WritingDNA, #22 Confidence)
    │        │        │
    │        │        └──→ Phase G (Advanced Features)
    │        │               Depends on D (#27 format) + E (#41 outcome)
    │        │
    │        └──→ Phase F (UX Enhancements)
    │               Depends on C (#25 confidence) + E (#39 feedback summary)
    │
    └──→ Phase E (Feedback Loop)
           Depends on A1 (#3 fire-and-forget)
           CAN PARALLEL with Phase C and D

Phase B (Rate Limiting & Reliability)
  No dependencies — CAN PARALLEL with Phase A
    │
    └──→ Feeds into all other phases (reliability foundation)

Phase H (Shared Types & Integration Testing)
  Runs LAST after all feature phases
```

**Recommended execution order**: A + B (parallel) → C + E (parallel) → D → F + G (parallel) → H

**Minimum viable Phase 4** (1 week ~40h):
A (all) + B (#11, #12) + C (#17-20, #22-25) + E (#39)
= Clean code + rate limiting + timeouts + Writing DNA + confidence score + feedback summary

---

## Effort Summary

| Phase | Items | Est. Hours | Priority |
|-------|-------|------------|----------|
| A — Quick Wins: Code Quality | 10 | ~10 h | CRITICAL |
| B — Rate Limiting & Reliability | 6 | ~10 h | HIGH |
| C — Deeper Persona Understanding | 10 | ~18 h | CRITICAL |
| D — Smarter Content Generation | 9 | ~16 h | HIGH |
| E — Feedback Loop Improvements | 7 | ~16 h | HIGH |
| F — UX Enhancements | 4 | ~12 h | MEDIUM |
| G — Advanced Features | 5 | ~20 h | MEDIUM |
| H — Shared Types & Testing | 3 | ~4 h | REQUIRED |
| **TOTAL** | **54** | **~106 h** | |

---

## Key Architecture Notes for Implementation

- **Constants file (#1) is foundation** — import from `config/constants.ts` everywhere. No more inline magic numbers.
- **`fireAndForget()` wrapper (#3) is reusable** — use for ALL fire-and-forget calls going forward, not just the 4 fixed here.
- **Writing DNA (#17) is fully deterministic** — NO LLM calls. Pure string analysis. This means it's free, fast, and testable.
- **Confidence Score (#22) is also deterministic** — simple arithmetic, no LLM. Recompute on every relevant data change.
- **Implicit signals (#36-38) use 0.5× multiplier** — explicit feedback ALWAYS overrides implicit. Never let implicit signals dominate.
- **Schema hardening (#4-6) is backward-compatible** — existing `Mixed` data will still load. New writes will be typed.
- **Rate limiting (#11) uses `express-rate-limit`** — key by `req.userId` (after `authenticate` middleware). In-memory store is fine for single-instance; upgrade to Redis store for multi-instance.
- **Circuit breaker (#13) tracks consecutive failures** — resets on first success. Half-open state allows 1 test request after cooldown.
- **Pipeline timeouts (#12) use `Promise.race`** — the original promise continues running but its result is ignored after timeout. This is acceptable for read-only operations; for writes, ensure idempotency.
- **Persistent trend cache (#16) uses MongoDB TTL index** — auto-cleanup by MongoDB. No manual expiry needed. L1 in-memory cache prevents hot-path DB hits.
- **Content series (#33-35) is keyword-based** — no embeddings or LLM. Simple topic keyword overlap detection. Threshold: 2+ posts with ≥50% keyword overlap.
- **Scheduling hints (#30-32) start as domain averages** — personalized hints come later via performance data. The domain lookup is a hardcoded constant record.
- **A/B testing (#50) is opt-in 10%** — shadow results stored but never shown. Feedback comparison runs in background aggregation.
- **Audience tracking (#47-48) is manual-first** — user reports engagement. LinkedIn API integration is a future phase (requires OAuth).
- **All Phase 4 changes preserve backward compatibility** — no existing API signatures change, no schema migrations needed, no breaking frontend changes.
