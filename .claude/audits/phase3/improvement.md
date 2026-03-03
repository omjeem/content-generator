# Phase 3 — Deep Architecture Audit & Improvement Plan

> **Date**: 2026-03-03
> **Scope**: Trend pipeline reliability, human-in-the-loop generation, AI-suggested topics, AI detector + humanizer, feedback weight amplification
> **Principle**: All changes preserve backward compatibility with the existing pipeline and do not break the core fundamentals of the application.

---

## Table of Contents

1. [Trend Repetition Bug — Root Cause & Fix](#1-trend-repetition-bug--root-cause--fix)
2. [Zero Trend Results — Diagnosis & Resilience](#2-zero-trend-results--diagnosis--resilience)
3. [Human-in-the-Loop Trend Selection](#3-human-in-the-loop-trend-selection)
4. [AI-Suggested Topics from Persona](#4-ai-suggested-topics-from-persona)
5. [AI Detector Test & Humanizer in Editor](#5-ai-detector-test--humanizer-in-editor)
6. [Feedback Weight Amplification](#6-feedback-weight-amplification)
7. [Full Pipeline Review — Safety & Compatibility](#7-full-pipeline-review--safety--compatibility)
8. [Prioritized Action Plan](#8-prioritized-action-plan)

---

## 1. Trend Repetition Bug — Root Cause & Fix

### 1.1 Problem Statement

Users report seeing **the same trends appearing repeatedly** even when generating on different days/timelines. This degrades trust in the system and makes suggestions feel stale.

### 1.2 Root Cause Analysis (5 issues found)

After a deep read of the trend pipeline (`services/trends.ts:370-411`, `services/trendCache.ts:1-83`, `agents/trendResearch.ts:113-144`, `utils/scoring.ts`), I've identified **five distinct causes**:

#### Issue A: **DOUBLE CACHE — two independent 30-min caches create 60-min effective staleness**

**Severity**: HIGH

The system has **two separate in-memory caches** for the same data:

1. **`services/trendCache.ts`** (imported by `trendResearch.ts` at line 13-14) — uses `buildTrendCacheKey()` with format `trends:{industry}:{sorted_keywords}:{geo}`
2. **`services/trends.ts:370-411`** — its OWN internal `trendCache` Map with `buildCacheKey()` at line 384 using format `{sorted_keywords}|{industry}|{geo}`

When `researchTrendsForUser()` is called:
1. It checks `trendCache.ts` cache first (line 118-123)
2. On cache miss, it calls `fetchRealTrendingContent()` which checks its OWN internal `trends.ts` cache (line 429-436)
3. Results get cached in BOTH caches independently

**Impact**: Because cache keys use different formats, the same data may be cached under different keys, or a stale entry in one cache survives while the other expires. The effective cache window becomes unpredictable — anywhere from 30 to 60 minutes depending on which cache hits.

**Fix**:
```
File: services/trends.ts
Action: REMOVE the internal cache (lines 370-411) entirely
        Remove getCachedTrends/setCachedTrends/buildCacheKey from this file
        The caching in trendCache.ts is the canonical, well-structured cache
        with proper key building and stats endpoint
```

#### Issue B: **DETERMINISTIC CACHE KEY — same user always hits the same cache entry**

**Severity**: HIGH

The cache key in `trendCache.ts:33-45` is built from `{industry}:{sorted_keywords}:{geo}`. For a given user whose persona doesn't change, this key NEVER changes between sessions. Every generation within 30 minutes returns identical trends.

But even after the cache expires, the problem persists because:
- HN Algolia `search_by_date` with the same query returns results sorted by date, but the TOP stories in any given 24-48hr window barely change
- RSS feeds update ~once per hour at most
- The same 3 feeds are always selected (top 3 by keyword match score)

**Fix**: Add a **freshness salt** to the pipeline:
```
File: services/trendCache.ts
Change: buildTrendCacheKey() should incorporate a time-bucket (e.g., 6-hour window)
        so cache keys rotate every 6 hours automatically:

        const timeBucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
        return `trends:${normalizedIndustry}:${sortedKeywords}:${normalizedGeo}:${timeBucket}`;
```

Additionally in `services/trends.ts`:
```
File: services/trends.ts
Change: fetchFromHackerNews() — add `created_at_i>` numeric filter
        to only fetch stories from the last 48 hours on the primary call.
        Currently uses search_by_date without any time constraint,
        so old high-scoring stories from weeks ago keep appearing.

        Line ~209: Add numericFilter:
        const twoDaysAgo = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
        url.searchParams.set("numericFilters", `points>${pointsMin},created_at_i>${twoDaysAgo}`);
```

#### Issue C: **RSS FEED SELECTION IS STATIC — same 3 feeds always chosen**

**Severity**: MEDIUM

In `services/trends.ts:301-306`, feeds are scored by keyword match and the top 3 are always selected. For a user with topics `["AI", "SaaS", "engineering"]`, TechCrunch + VentureBeat + NYT Technology will ALWAYS be the top 3. Same feeds = same articles.

**Fix**: Add rotation among equally-scored feeds:
```
File: services/trends.ts
Change: In the feed selection logic after scoring (line ~301-306):
        1. Group feeds by their matchScore
        2. Within each score tier, shuffle randomly
        3. Then take the top 3

        This ensures that when multiple feeds have the same score,
        different ones get selected across calls.
```

#### Issue D: **HEURISTIC FAST PATH LOCKS IN STALE TRENDS**

**Severity**: MEDIUM

When the heuristic fast path fires (`trendResearch.ts:187-202`), it skips the LLM entirely and returns deterministic content angles built from matched keywords. Since the same cached items hit the same scoring, the heuristic path returns bit-for-bit identical results within any cache window.

**Fix**: Add light randomization to heuristic selection:
```
File: agents/trendResearch.ts
Change: In buildHeuristicResult() (line 288-316):
        1. Shuffle the input items before slicing to 8
        2. Add timestamp-based variety to the contentAngle template
           e.g., alternate between 3-4 angle templates based on
           item index + current day-of-week
```

#### Issue E: **NO "PREVIOUSLY SHOWN" TRACKING**

**Severity**: HIGH

The system has no memory of which trends were already shown to a user. Even with fresh API data, if a trending story persists for a week (which is common for major tech news), it will appear in every single generation.

**Fix**: Track shown trends per user:
```
New Field: ContentSuggestion.trendsUsed already stores the trend topics!

Strategy:
1. Before trend scoring, load the user's last 3 ContentSuggestion.trendsUsed arrays
2. Build a Set of "recently used trend titles" (normalized)
3. In scoreAndRankTrends(), apply a -2 penalty to items whose title
   fuzzy-matches any recently used trend (within last 7 days)
4. This deprioritizes (but doesn't hard-exclude) repeat trends

File: utils/scoring.ts
Change: scoreTrendRelevance() should accept optional recentTrends: Set<string>
        and apply a -2 "stale" penalty when the item title matches

File: agents/trendResearch.ts
Change: researchTrendsForUser() should accept optional recentTrends: string[]
        and pass them through to the scoring function

File: agents/mastra.ts
Change: Before Step 3 (trend research), load recent trendsUsed:
        const recentSets = await ContentSuggestion.find({ userId: userObjectId })
          .sort({ createdAt: -1 }).limit(3).select("trendsUsed").lean();
        const recentTrends = recentSets.flatMap(s => s.trendsUsed);
        Pass recentTrends to researchTrendsForUser()
```

### 1.3 Summary of Changes

| Issue | File(s) | Change | Impact |
|-------|---------|--------|--------|
| A: Double cache | `services/trends.ts` | Remove internal cache, rely on trendCache.ts only | Eliminates ghost stale data |
| B: Static cache key | `services/trendCache.ts`, `services/trends.ts` | Add time-bucket to key; add HN time filter | Fresh data every 6 hours |
| C: Static feed selection | `services/trends.ts` | Shuffle equally-scored feeds | Feed variety |
| D: Heuristic lock-in | `agents/trendResearch.ts` | Shuffle + template variety | Varied angles |
| E: No shown tracking | `utils/scoring.ts`, `agents/trendResearch.ts`, `agents/mastra.ts` | Penalize recently-shown trends | No repeats across sessions |

**Backward Compatibility**: All changes are internal to the trend pipeline. The `TrendResult` output schema stays identical. The `researchTrendsForUser()` signature gains an optional `recentTrends` parameter (non-breaking). No frontend changes required.

---

## 2. Zero Trend Results — Diagnosis & Resilience

### 2.1 Problem Statement

Logs occasionally show `[trendResearch] Got 0 real items from APIs`, causing the system to fall back to evergreen topics. This makes suggestions generic and disconnected from current events.

### 2.2 Root Cause Analysis (4 failure modes)

#### Failure Mode A: **HN Algolia returns 0 stories for niche keywords**

In `services/trends.ts:182-266`, the HN search uses `query = firstMappedExpansion ?? fallbackTerms`. If the user's keywords don't match any entry in `HN_QUERY_MAP` (line 98-114), the raw keywords like "dermatology" or "real estate" get sent directly to HN Algolia, which is tech-focused and returns 0 results.

**Evidence**: `HN_QUERY_MAP` only covers 14 broad tech/business topics. Any user outside these (healthcare, education, legal, real estate, fashion, food, etc.) gets no HN results.

**Fix**:
```
File: services/trends.ts
Changes:
1. Expand HN_QUERY_MAP to cover 30+ industries:
   - healthcare → "health tech medical biotech digital health"
   - education → "edtech learning education online course"
   - legal → "legaltech law compliance regulation"
   - "real estate" → "proptech real estate housing construction"
   - finance → "fintech banking payments insurance"
   - food → "foodtech restaurant supply chain agriculture"
   - fashion → "fashion retail D2C ecommerce brand"
   - etc.

2. When NO HN_QUERY_MAP match is found AND raw keyword search returns 0:
   Fall back to a BROAD query: "technology business innovation 2026"
   This always returns results from HN (generic but non-empty).

3. Lower the points threshold from 5 to 2 for niche queries
   (niche topics get fewer upvotes but are still relevant):

   Line ~245:
   const pointsMin = firstMappedExpansion ? 5 : 2; // lower for raw keyword queries
```

#### Failure Mode B: **RSS feeds fail silently with 0 items**

In `services/trends.ts:283-368`, RSS parsing uses `Promise.allSettled()` which swallows individual feed errors. When all 3 selected feeds fail (e.g., TechCrunch rate-limits the request, Fast Company returns a 403), the function returns `[]` silently.

**Fix**:
```
File: services/trends.ts
Changes:
1. After Promise.allSettled, if allItems.length === 0 AND at least one feed
   was rejected, try 2 backup feeds from the remaining pool:

   const rejectedCount = results.filter(r => r.status === "rejected").length;
   if (allItems.length === 0 && rejectedCount > 0) {
     console.warn(`[trends:rss] All ${rejectedCount} feeds failed — trying backup feeds`);
     const backupFeeds = scoredFeeds.slice(3, 5); // next 2 feeds
     // ... retry with backup feeds
   }

2. Add a timeout-based retry for individual feeds:
   If a feed times out (12s), retry once with a shorter 8s timeout
```

#### Failure Mode C: **Keyword relevance filter too strict on RSS items**

In `services/trends.ts:322-335`, the `isRelevant()` filter uses word-boundary matching (`\b`). For compound keywords like "machine learning", the regex becomes `\bmachine\b` which won't match "machine-learning" (hyphenated). And the fallback at line 339-353 includes ALL items when 0 match — but only from that specific feed. If all feeds have 0 keyword matches, you get a mix of random articles.

**Fix**:
```
File: services/trends.ts
Change: In isRelevant() (line 120-136):
        Add hyphen-normalized matching:
        const lower = text.toLowerCase().replace(/-/g, " ");

        Also normalize the keyword:
        const kwLower = kw.toLowerCase().trim().replace(/-/g, " ");
```

#### Failure Mode D: **Tavily API key absent + HN/RSS both fail = guaranteed 0**

When `TAVILY_API_KEY` is not set (which is the default), the system relies entirely on HN + RSS. If both fail (network timeout, rate limit), there's no third fallback before the evergreen path.

**Fix**: Add a **Google News RSS** fallback as Tier 2.5:
```
File: services/trends.ts
New function: fetchFromGoogleNewsRSS(keywords, industry)
  URL: https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en
  This is free, no API key, rarely fails, and returns current news.

  Add to fetchRealTrendingContent() AFTER HN+RSS, only if combined results < 5:

  if (results.length < 5) {
    const googleNewsItems = await fetchFromGoogleNewsRSS(keywords, industry);
    results = deduplicateAndRank([...results, ...googleNewsItems]);
  }
```

### 2.3 Observability Improvements

```
File: agents/trendResearch.ts
Changes:
1. Add structured logging with source breakdown:
   console.log(JSON.stringify({
     event: "trend_fetch",
     userId, // anonymized hash
     sources: { tavily: tavilyCount, hn: hnCount, rss: rssCount, googleNews: gnCount },
     total: rawItems.length,
     cacheHit: !!cachedItems,
     duration: fetchDurationMs,
   }));

2. When rawItems.length === 0, log which sources were attempted and WHY each returned 0:
   console.warn("[trendResearch] ZERO results breakdown:", {
     tavilyAttempted: hasTavily,
     hnQuery: query,
     hnError: hnError?.message,
     rssFeedsAttempted: selectedFeeds.map(f => f.name),
     rssErrors: rssErrors,
   });
```

### 2.4 Summary

| Fix | File | Impact |
|-----|------|--------|
| Expand HN_QUERY_MAP to 30+ industries | `services/trends.ts` | Niche users get HN results |
| Lower points threshold for raw queries | `services/trends.ts` | More results for niche topics |
| RSS backup feed retry | `services/trends.ts` | Resilience when primary feeds fail |
| Hyphen-normalized keyword matching | `services/trends.ts` | Compound keywords match correctly |
| Google News RSS as Tier 2.5 fallback | `services/trends.ts` | Near-zero chance of 0 results |
| Structured zero-result logging | `agents/trendResearch.ts` | Debuggable failures |

**Backward Compatibility**: All changes are additive. The `RawTrendItem` interface is unchanged. `fetchRealTrendingContent()` signature is unchanged. No frontend impact.

---

## 3. Human-in-the-Loop Trend Selection

### 3.1 Problem Statement

Currently the pipeline always auto-selects trends and generates content in one shot. The user has no visibility into WHICH trends are driving their suggestions, and no ability to say "I want content about THIS trend, not that one."

### 3.2 Architecture: Two-Step Generation Flow

The existing one-shot pipeline (`/api/suggestions/generate`) must remain functional for backward compatibility. We add a **new two-step flow** alongside it:

```
Step 1: GET /api/trends/discover    → Returns curated trends for the user to browse
Step 2: POST /api/suggestions/generate-from-trends → Accepts selected trend IDs
```

#### 3.2.1 New Endpoint: `GET /api/trends/discover`

```
File: routes/trends.ts (extend existing)

GET /api/trends/discover?geo=US

Response:
{
  "trends": [
    {
      "id": "trend_abc123",          // unique ID for selection
      "topic": "OpenAI releases GPT-5 with reasoning capabilities",
      "source": "TechCrunch",
      "url": "https://...",
      "relevanceScore": 4,
      "relevanceReason": "Directly relevant to your AI content pillar",
      "contentAngle": "Share your take on what GPT-5 means for product teams",
      "category": "ai",              // mapped from content pillar
      "publishedAt": "2026-03-03T10:00:00Z"
    },
    // ... 10-15 trends
  ],
  "categories": ["ai", "leadership", "saas"],  // available filter categories
  "fetchedAt": "2026-03-03T12:00:00Z",
  "expiresAt": "2026-03-03T12:30:00Z",         // when to re-fetch
  "isLive": true
}

Implementation:
1. Calls researchTrendsForUser() (same as existing pipeline Step 3)
2. Generates a unique `trend_id` for each trend (hash of topic + source)
3. Stores the full trend list in a short-lived cache (30 min, keyed by userId)
   so the subsequent generate-from-trends call can look up selected trends
4. Maps each trend to a "category" based on which content pillar it matches
```

#### 3.2.2 New Endpoint: `POST /api/suggestions/generate-from-trends`

```
File: routes/suggestions.ts (extend existing)

POST /api/suggestions/generate-from-trends
Body:
{
  "selectedTrendIds": ["trend_abc123", "trend_def456"],  // 1-5 trends
  "context": { ... }  // same IGenerateContextOptions as existing
}

Response: Same as existing /generate response

Implementation:
1. Look up selected trends from the userId cache
2. Validate that selectedTrendIds exist in the cached trend list
3. Build a TrendResult with ONLY the selected trends
4. Call generateContentIdeas() with the filtered trends (skip Step 3 of pipeline)
5. Persist as ContentSuggestion with generationMode = "trend-selected"
```

#### 3.2.3 New Generation Mode

```
File: models/ContentSuggestion.ts
Change: Add "trend-selected" to GenerationMode enum:
        type GenerationMode = "profile" | "topic-focus" | "chat-refined" | "trend-selected";

File: packages/shared-types/src/index.ts
Change: Update IGenerateContextOptions to include:
        selectedTrendIds?: string[];
```

#### 3.2.4 Trend Discovery Cache

```
New File: services/trendDiscoveryCache.ts

Purpose: Short-lived per-user cache mapping trend IDs to full trend data.
         Prevents re-fetching between discover → generate-from-trends calls.

interface TrendDiscoveryEntry {
  userId: string;
  trends: Array<TrendResult["trends"][0] & { id: string }>;
  expiresAt: number;  // 30 min TTL
}

const discoveryCache = new Map<string, TrendDiscoveryEntry>();

export function storeTrendDiscovery(userId: string, trends: ...): void;
export function getTrendDiscovery(userId: string): TrendDiscoveryEntry | null;
export function getSelectedTrends(userId: string, ids: string[]): TrendResult["trends"];
```

### 3.3 Frontend Changes

```
File: apps/web/src/app/dashboard/page.tsx

New state: generateFlow = "one-shot" | "browse-trends" | "selecting-trends" | "generating"

New UI flow:
1. "Generate Content Ideas" button now shows TWO options:
   a. "Quick Generate" → existing one-shot pipeline (handleGenerate)
   b. "Browse Trends First" → calls GET /api/trends/discover

2. "Browse Trends" mode:
   - Shows a TrendBrowser component with:
     - Category filter pills (AI, Leadership, SaaS, etc.)
     - Trend cards with checkbox selection (1-5 max)
     - Each card shows: topic, source, relevance reason, content angle
     - "Generate from Selected (N)" button at bottom
   - "Refresh Trends" button to re-fetch

3. After selection → calls POST /generate-from-trends
   - Same loading/results flow as existing

New Component: apps/web/src/components/trends/TrendBrowser.tsx
New Component: apps/web/src/components/trends/TrendCard.tsx
```

```
File: apps/web/src/lib/api.ts

New API functions:
  trendsApi.discover(geo?: string) → GET /api/trends/discover
  suggestionsApi.generateFromTrends(selectedTrendIds, context) → POST /api/suggestions/generate-from-trends
```

### 3.4 Pipeline Integration (Non-Breaking)

The existing `runContentPipeline()` in `mastra.ts` is **NOT modified**. The new flow bypasses Steps 1-3 entirely and calls `generateContentIdeas()` directly. This means:
- Existing one-shot flow works exactly as before
- The new flow reuses the content generator agent (Step 4)
- Token tracking, quota checks, and persistence are shared

**Backward Compatibility**: 100%. The one-shot pipeline is untouched. New endpoints are additive. The `GenerationMode` enum addition is backward-compatible (existing documents stay "profile"/"topic-focus"/"chat-refined").

---

## 4. AI-Suggested Topics from Persona

### 4.1 Problem Statement

Currently, content generation is **always driven by trends** (live or evergreen). Users want an option where the AI suggests post topics purely based on their persona — what they've written about, their content pillars, audience, goals — without any trend dependency.

### 4.2 Architecture: Persona-Driven Topic Suggestions

#### 4.2.1 New Generation Mode: `"persona-topics"`

```
File: packages/shared-types/src/index.ts
Change: Add new mode to IGenerateContextOptions:
        mode: "profile" | "topic-focus" | "chat-refined" | "persona-topics"

File: models/ContentSuggestion.ts
Change: Add "persona-topics" to GenerationMode enum
```

#### 4.2.2 New Endpoint: `GET /api/suggestions/topic-ideas`

```
File: routes/suggestions.ts (extend)

GET /api/suggestions/topic-ideas

Response:
{
  "topics": [
    {
      "id": "topic_abc123",
      "title": "The 3 biggest mistakes first-time engineering managers make",
      "category": "Leadership",           // from content pillar
      "reasoning": "Your audience is engineering leaders — this hits a common pain point",
      "suggestedFormat": "carousel",
      "confidence": 0.92                   // how well it fits the persona
    },
    // ... 8-12 topics
  ],
  "basedOn": {
    "contentPillars": ["Leadership", "AI", "Engineering Culture"],
    "topTopics": ["team management", "AI adoption"],
    "preferredFormats": ["carousel", "text-post"],
    "avoidTopics": ["crypto"]
  }
}

Implementation:
1. Load UserPersona (including feedbackProfile)
2. Build a prompt for the content generator that:
   - Provides the full persona summary
   - Provides feedback profile (preferred/avoid topics, format preferences)
   - Explicitly instructs: "Suggest 8-12 post TOPICS (not full briefs) based purely
     on this creator's expertise, audience, and content pillars. Do NOT reference
     any external trends — these should come from their own knowledge domain."
3. Use a new lightweight Zod schema (TopicIdeasSchema) for validation
4. Return structured response with unique IDs

New Schema:
const TopicIdeasSchema = z.object({
  topics: z.array(z.object({
    title: z.string(),
    category: z.string(),
    reasoning: z.string(),
    suggestedFormat: z.enum(["carousel", "text-post", "poll", "video-script", "list"]),
    confidence: z.number().min(0).max(1),
  })).min(5).max(15),
});
```

#### 4.2.3 New Endpoint: `POST /api/suggestions/generate-from-topic`

```
File: routes/suggestions.ts (extend)

POST /api/suggestions/generate-from-topic
Body:
{
  "topicId": "topic_abc123",        // from the topic-ideas response
  "topicTitle": "The 3 biggest...", // for resilience if cache expires
  "context": { ... }                // same context options
}

Implementation:
1. Look up the selected topic from a short-lived cache (same pattern as trend discovery)
2. Build a TrendResult with a single synthetic "trend" derived from the topic
3. Call generateContentIdeas() with this synthetic trend
4. The content generator sees ONE focused topic and generates 5-7 ideas around it
5. Persist with generationMode = "persona-topics"
```

#### 4.2.4 Combined Flow: Topic Selection + Trend Selection

The frontend should present BOTH options on the same screen:

```
┌─────────────────────────────────────────────────────┐
│  How would you like to generate content?             │
│                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │   Quick       │ │  Browse      │ │  AI Topic    │ │
│  │   Generate    │ │  Trends      │ │  Suggestions │ │
│  │   (Auto)      │ │  (Select)    │ │  (Persona)   │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                      │
│  Or: Start a refinement chat to brainstorm first     │
└─────────────────────────────────────────────────────┘
```

### 4.3 Frontend Changes

```
New Component: apps/web/src/components/suggestions/TopicBrowser.tsx
  - Shows AI-suggested topics as cards
  - Each card has: title, category pill, reasoning, format badge, confidence bar
  - Click to select → "Generate Posts About This Topic" button
  - Can also "Suggest More" to re-run the topic generation

File: apps/web/src/app/dashboard/page.tsx
Change: Add "persona-topics" to the GenerateState flow
        New state option: generateFlow = "one-shot" | "browse-trends" | "browse-topics"

File: apps/web/src/lib/api.ts
New functions:
  suggestionsApi.getTopicIdeas() → GET /api/suggestions/topic-ideas
  suggestionsApi.generateFromTopic(topicId, topicTitle, context)
    → POST /api/suggestions/generate-from-topic
```

### 4.4 Persona Signals Used for Topic Generation

The topic suggestion prompt leverages ALL available persona data:

| Signal | Source | Weight |
|--------|--------|--------|
| Content pillars | `UserPersona.contentPillars` | Primary driver |
| Industry | `UserPersona.industry` | Context framing |
| Topics | `UserPersona.topics` | Topic seed pool |
| Writing style | `UserPersona.writingStyle` | Format suggestion |
| Preferred topics | `feedbackProfile.preferredTopics` | Boost similar topics |
| Avoid topics | `feedbackProfile.avoidTopics` | Hard exclude |
| Format preferences | `feedbackProfile.formatPreferences` | Format suggestion |
| Target audience | `UserPersona.targetAudience` | Angle framing |
| Platform goal | `UserPersona.platformGoal` | Topic orientation |
| Published posts | `PostDraft` (published, last 30 days) | Avoid recent duplicates |

**Backward Compatibility**: New endpoints are additive. Existing `/generate` flow is untouched. New generation mode adds a new enum value (backward-compatible — MongoDB won't break on documents with existing modes).

---

## 5. AI Detector Test & Humanizer in Editor

### 5.1 Problem Statement

Users need two capabilities in the post editor:
1. **AI Detector Test**: Check if their draft reads as AI-written (and get a score)
2. **Humanize**: Convert AI-generated text to read like organic, human-written content

### 5.2 Architecture: AI Detection

#### 5.2.1 Detection Approach

Rather than calling an external AI detection API (which adds cost and a dependency), we can use our existing Gemini model to evaluate the text. Gemini is trained to recognize AI-written patterns and can provide a reliable self-assessment.

```
New Endpoint: POST /api/drafts/:id/ai-check

Request:
{
  "content": "optional — if omitted, uses draft.content"
}

Response:
{
  "score": 72,                    // 0-100 (0 = fully human, 100 = fully AI)
  "verdict": "likely-ai",         // "human" | "mixed" | "likely-ai"
  "signals": [
    "Uniform sentence length (avg 18 words, std dev 2.1)",
    "Overuse of transitional phrases ('Furthermore', 'Moreover')",
    "Lacks personal anecdotes or specific examples",
    "Consistent formal register — no tonal shifts"
  ],
  "suggestions": [
    "Add a personal story from your experience in the opening",
    "Vary sentence length — mix short punchy lines with longer ones",
    "Replace 'Furthermore' with your natural connectors",
    "Add a specific metric or example from your work"
  ]
}
```

#### 5.2.2 Detection Implementation

```
File: routes/drafts.ts (extend)

POST /api/drafts/:id/ai-check

Implementation:
1. Load draft content
2. Build detection prompt:
   "Analyze this text for AI-written patterns. Score 0-100 where
    0 = definitively human-written, 100 = definitively AI-generated.

    Evaluate these specific signals:
    - Sentence length variance (AI text is unnaturally uniform)
    - Transitional phrase patterns (AI overuses 'Furthermore', 'Moreover', etc.)
    - Personal specificity (human text has concrete personal details)
    - Tonal consistency (human text has natural register shifts)
    - Vocabulary diversity (AI uses a narrower vocabulary range)
    - Opening patterns (AI posts often start with a question or bold statement)
    - Paragraph structure (AI uses unnaturally consistent paragraph lengths)

    Return ONLY JSON:
    {
      'score': number,
      'verdict': 'human' | 'mixed' | 'likely-ai',
      'signals': ['specific observation 1', ...],
      'suggestions': ['specific fix 1', ...]
    }"
3. Call Gemini with the prompt + the draft content
4. Parse and return the result
5. Track token usage (fire-and-forget)
```

#### 5.2.3 AI Detection — Frontend

```
New Component: apps/web/src/components/editor/AiDetectorPanel.tsx

UI:
┌──────────────────────────────────────┐
│  AI Detection Score                   │
│  ████████████░░░░░░░░░  72/100       │
│  Verdict: Likely AI-written           │
│                                       │
│  Signals detected:                    │
│  ⚠ Uniform sentence length           │
│  ⚠ Overuse of transitional phrases   │
│  ⚠ No personal anecdotes             │
│                                       │
│  Suggestions:                         │
│  ✓ Add a personal story              │
│  ✓ Vary sentence length              │
│  ✓ Replace formal connectors         │
│                                       │
│  [Humanize This Post]  [Re-check]    │
└──────────────────────────────────────┘

- Score bar color: green (0-30), yellow (31-60), red (61-100)
- "Humanize This Post" button triggers the humanizer
- "Re-check" re-runs detection after manual edits
```

### 5.3 Architecture: Humanizer

#### 5.3.1 Humanizer Endpoint

```
New Endpoint: POST /api/drafts/:id/humanize

Request:
{
  "preserveCore": true,  // keep the core message, just change the delivery
  "intensity": "moderate" // "light" | "moderate" | "aggressive"
}

Response:
{
  "humanizedContent": "...",        // the rewritten text
  "charCount": 1234,
  "changesSummary": "Added personal anecdote, varied sentence rhythm, replaced 3 formal connectors, added colloquial closer",
  "beforeScore": 72,                // AI score before
  "afterScore": 28,                 // AI score after (estimated)
}
```

#### 5.3.2 Humanizer Implementation

```
File: routes/drafts.ts (extend)

POST /api/drafts/:id/humanize

Implementation:
1. Load draft + persona (persona provides the user's REAL voice)
2. Build humanization prompt:

   "You are rewriting an AI-generated text to sound like it was written by this specific person.

    CREATOR VOICE:
    ${buildPersonaSummary(persona)}
    Writing style: ${persona.writingStyle}
    Tone: ${persona.tone}

    INTENSITY: ${intensity}
    - light: Fix only the most obvious AI patterns. Keep 80% of the original wording.
    - moderate: Rewrite significantly. Add personal touches, vary rhythm, change 50% of phrasing.
    - aggressive: Complete rewrite. Same core message but entirely new delivery, as if
      the person wrote it from scratch while talking to a friend.

    HUMANIZATION RULES:
    1. Add at least one specific personal detail (even if invented — the user can replace it)
    2. Vary sentence length dramatically: 3-word punches mixed with 25-word explanations
    3. Replace ALL transitional phrases (Furthermore, Moreover, Additionally) with
       natural connectors (But here's the thing, Look, So, And honestly)
    4. Add 1-2 incomplete sentences or fragments (humans don't always finish thoughts)
    5. Use contractions (don't, can't, shouldn't)
    6. Add at least one colloquial expression
    7. Break the formal register at least twice
    8. Make the CTA sound like a real question, not a marketing prompt

    ORIGINAL TEXT:
    ${draft.content}

    Return ONLY the rewritten text. No explanation, no markdown, just the post."

3. Call Gemini with the prompt
4. Auto-apply the humanized content to the draft (same as post editor flow)
5. Track token usage
6. Return the humanized content with before/after AI score estimate
```

#### 5.3.3 Humanizer — Frontend Integration

```
File: apps/web/src/components/editor/AiDetectorPanel.tsx (extend)

"Humanize This Post" button:
1. Shows intensity selector (light / moderate / aggressive)
2. Calls POST /api/drafts/:id/humanize
3. Shows before/after comparison in a diff view
4. "Apply" button updates the editor content
5. "Undo" restores the pre-humanization content (from contentHistory)

The humanized content is auto-applied server-side (consistent with
the existing post editor flow where AI changes are auto-persisted).
The frontend receives the new content and updates the editor.
```

#### 5.3.4 Integration with Existing Draft System

```
File: services/draftService.ts
Change: Add applyHumanizedContent() function (similar to existing applyAiContent):
        - Saves to contentHistory with editedBy: "ai", changeNote: "Humanized (moderate)"
        - Updates charCount
        - This preserves the full edit trail — user can undo via contentHistory

File: models/PostDraft.ts
No changes needed — existing IContentHistoryEntry structure handles this
with editedBy: "ai" and changeNote: "Humanized (moderate intensity)"
```

### 5.4 Token Cost Considerations

| Operation | Est. Input Tokens | Est. Output Tokens | Total |
|-----------|------------------|--------------------| ------|
| AI Detection Check | ~800 | ~300 | ~1,100 |
| Humanize (moderate) | ~1,200 | ~1,500 | ~2,700 |
| Re-check after humanize | ~800 | ~300 | ~1,100 |
| **Worst case per draft** | | | **~4,900** |

These are manageable within typical token budgets. Both operations use `checkTokenQuota()` before proceeding.

**Backward Compatibility**: New endpoints are purely additive. The existing editor chat, draft CRUD, and publish flow are completely untouched. The humanizer uses the same `applyAiContent` pattern already established for the post editor agent.

---

## 6. Feedback Weight Amplification

### 6.1 Problem Statement

The current feedback system exists but has **too little weight** in the generation pipeline. Users want their feedback to more strongly influence future suggestions — if they consistently dismiss a topic, it should stop appearing; if they love a format, it should dominate.

### 6.2 Current Feedback Pipeline Audit

After reading the full feedback chain, here's what exists:

```
User submits feedback
  → SuggestionFeedback document created (routes/feedback.ts:80-152)
  → processFeedback() fires (fire-and-forget)
    → _parseFeedbackText() — LLM extracts signals from free-text (feedbackProcessor.ts:58-108)
    → _maybeTrigerLearning() — every 5th feedback triggers aggregation (feedbackProcessor.ts:117-135)
      → aggregateAndUpdatePersona() — computes preferred/avoid topics, format %, avg rating (personaLearning.ts:46-166)
        → Writes to UserPersona.feedbackProfile ($set)

Content Generation reads feedbackProfile:
  → buildFeedbackSection() in contentGenerator.ts:117-164
    → Appended to prompt ONLY when totalFeedbackCount >= 3
    → Contains: preferred topics, avoid topics, format preferences, avg rating, avg content length
```

### 6.3 Issues Found (6 weaknesses)

#### Issue 1: **Learning trigger is too infrequent — every 5th feedback**

**File**: `feedbackProcessor.ts:123`
**Problem**: Aggregation only runs on every 5th feedback (`count % 5 === 0`). A user who gives 4 feedbacks sees NO learning effect. After feedback #5, they get partial learning. Full signal accumulation requires 10-15 feedbacks.

**Fix**: Reduce trigger interval AND add immediate effect:
```
File: feedbackProcessor.ts
Change: _maybeTrigerLearning()
        1. Change trigger from count % 5 to count % 3 (every 3rd feedback)
        2. For the FIRST 3 feedbacks, trigger on every single one:
           if (count <= 3 || count % 3 === 0) { triggerLearning(); }
```

#### Issue 2: **Feedback section in prompt is too weak — advisory, not directive**

**File**: `contentGenerator.ts:117-164`
**Problem**: The feedback section uses soft language: "Prioritise ideas within..." and "Avoid ideas centred on...". LLMs treat advisory language as suggestions, not rules. When the trend section has strong signals, the feedback gets overridden.

**Fix**: Make feedback section DIRECTIVE:
```
File: contentGenerator.ts
Change: buildFeedbackSection()

BEFORE (line 130-131):
  "→ Prioritise ideas within or adjacent to these topics."

AFTER:
  "→ RULE: At least 60% of generated ideas MUST relate to these preferred topics or closely adjacent ones."

BEFORE (line 136-137):
  "→ Avoid ideas centred on these topics."

AFTER:
  "→ RULE: Do NOT generate ANY ideas about these topics. They have been explicitly rejected by the user. Zero tolerance."

BEFORE (line 149):
  "→ Skew format choices to reflect these preferences."

AFTER:
  "→ RULE: Format distribution MUST approximately match these percentages. For example, if carousel is 40%, at least 2 out of 5 ideas must be carousel format."
```

#### Issue 3: **feedbackProfile.tonePreference is never populated**

**File**: `personaLearning.ts:1-166`
**Problem**: The `IFeedbackProfile` interface defines `tonePreference?: string`, and `contentGenerator.ts:151-153` checks for it:
```ts
if (fp.tonePreference) {
  lines.push(`Tone preference: ${fp.tonePreference}`);
}
```
But `aggregateAndUpdatePersona()` NEVER computes or sets `tonePreference`. It's always undefined.

**Fix**: Derive tonePreference from feedback text analysis:
```
File: personaLearning.ts
Change: aggregateAndUpdatePersona()
        After computing topic/format scores, analyze the parsedSignals:

        // Compute tone preference from parsedSignals.toneMatch
        const toneMatches = feedbacks
          .filter(fb => fb.parsedSignals?.toneMatch)
          .map(fb => ({
            rating: fb.rating,
            toneMatch: fb.parsedSignals!.toneMatch,
            tone: fb.suggestionSnapshot.hook  // infer tone from the hook style
          }));

        // If user consistently rates "perfect" on certain tone patterns,
        // extract the common tone
        const perfectMatches = toneMatches.filter(t => t.toneMatch === "perfect");
        if (perfectMatches.length >= 2) {
          // Simple heuristic: if ≥2 "perfect" tone matches, ask the LLM
          // to characterize the common tone (or derive from persona.tone)
          setPayload["feedbackProfile.tonePreference"] = persona.tone ?? "Professional";
        }
```

#### Issue 4: **Action weight is ignored — "published" should be strongest signal**

**File**: `personaLearning.ts:80-101`
**Problem**: The scoring only considers `fb.rating` (loved/good/meh/bad). The `fb.action` field (saved/draft/published/dismissed) is completely ignored. But action is the **strongest behavioral signal**:
- `published` = user actually posted this → strongest positive signal
- `draft` = user started writing → strong positive signal
- `saved` = user bookmarked → moderate positive signal
- `dismissed` = user explicitly rejected → moderate negative signal

**Fix**: Add action-based weight multiplier:
```
File: personaLearning.ts
Change: In the scoring loop (line 80-101):

        const ACTION_MULTIPLIER = {
          published: 2.0,   // strongest — user actually used this
          draft: 1.5,       // strong — user invested time writing
          saved: 1.2,       // moderate — user bookmarked for later
          dismissed: 1.0,   // base — explicit rejection (combined with rating)
        } as const;

        for (const fb of feedbacks) {
          const ratingWeight = fb.rating ? SIGNAL_WEIGHTS[fb.rating] : 0;
          const actionMultiplier = ACTION_MULTIPLIER[fb.action] ?? 1.0;
          const weight = ratingWeight * actionMultiplier;

          // Apply implicit action signal even without rating:
          // A "published" action without rating implies "loved"
          const effectiveWeight = fb.rating ? weight : (
            fb.action === "published" ? 1.5 :
            fb.action === "draft" ? 0.5 :
            fb.action === "dismissed" ? -0.5 : 0
          );

          if (topic) topicScores.set(topic, (topicScores.get(topic) ?? 0) + effectiveWeight);
          // ... similar for format
        }
```

#### Issue 5: **Feedback minimum threshold of 3 is too high for new users**

**File**: `contentGenerator.ts:119`
**Problem**: `if (!fp || fp.totalFeedbackCount < 3) return "";` — the feedback section is completely suppressed until 3 feedbacks exist. New users who give 1-2 feedbacks see zero effect, which is discouraging.

**Fix**: Lower threshold and use graduated injection:
```
File: contentGenerator.ts
Change: buildFeedbackSection()

        // Phase 1 (1-2 feedbacks): inject lightweight signal
        if (fp.totalFeedbackCount >= 1 && fp.totalFeedbackCount < 3) {
          lines.push("\n## USER FEEDBACK SIGNALS (early — limited data)");
          if (fp.preferredTopics.length > 0) {
            lines.push(`Early signal — user engaged positively with: ${fp.preferredTopics.join(", ")}`);
          }
          if (fp.avoidTopics.length > 0) {
            lines.push(`Early signal — user rejected: ${fp.avoidTopics.join(", ")}`);
          }
          return lines.join("\n");
        }

        // Phase 2 (3+ feedbacks): full directive section (existing logic, strengthened)
```

#### Issue 6: **No recency weighting — old feedback has same weight as recent**

**File**: `personaLearning.ts:54-58`
**Problem**: The query fetches the last 50 feedbacks sorted by date, but all 50 are weighted equally. A user's preferences evolve — feedback from 3 months ago may no longer represent their current interests.

**Fix**: Add exponential decay weighting:
```
File: personaLearning.ts
Change: In the scoring loop, apply a recency multiplier:

        const now = Date.now();
        const DECAY_HALF_LIFE_DAYS = 14; // signal halves in importance every 2 weeks

        for (const fb of feedbacks) {
          const ageMs = now - new Date(fb.createdAt).getTime();
          const ageDays = ageMs / (24 * 60 * 60 * 1000);
          const recencyMultiplier = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);

          const weight = ratingWeight * actionMultiplier * recencyMultiplier;
          // ... apply weight
        }
```

### 6.4 Summary

| Issue | File | Change | Impact |
|-------|------|--------|--------|
| 1: Infrequent learning trigger | `feedbackProcessor.ts` | Every 3rd (or every for first 3) | Faster learning loop |
| 2: Weak prompt language | `contentGenerator.ts` | Advisory → directive RULES | LLM actually follows feedback |
| 3: tonePreference never set | `personaLearning.ts` | Derive from parsedSignals | Tone learning works |
| 4: Action weight ignored | `personaLearning.ts` | ACTION_MULTIPLIER applied | Published/draft = strongest signal |
| 5: Threshold too high | `contentGenerator.ts` | 1-feedback minimum | Immediate feedback effect |
| 6: No recency weighting | `personaLearning.ts` | Exponential decay | Recent feedback > old feedback |

**Backward Compatibility**: All changes are to internal scoring and prompt construction. No schema changes, no API signature changes, no frontend impact. The `SuggestionFeedback` model is unchanged. The `feedbackProfile` subdocument structure is unchanged (tonePreference was already in the schema, just never populated).

---

## 7. Full Pipeline Review — Safety & Compatibility

### 7.1 Core Pipeline Touchpoint Analysis

Every change proposed in Sections 1-6 has been designed to be **non-breaking**. Here's the verification:

| Pipeline Step | Affected By | How | Risk Level |
|--------------|-------------|-----|------------|
| Step 0: Token quota | Section 5 (new endpoints) | New endpoints use `checkTokenQuota()` — same pattern | ZERO |
| Step 1: Persona Analysis | Not affected | No changes to persona analysis flow | ZERO |
| Step 2: Interview Check | Not affected | No changes to interview gate | ZERO |
| Step 3: Trend Research | Sections 1, 2, 3 | Internal changes to fetching/caching/scoring. Output schema unchanged | LOW |
| Step 4: Content Generation | Sections 4, 6 | New generation modes + stronger feedback. Prompt changes only | LOW |
| Step 5: Persistence | Sections 3, 4 | New `generationMode` value. MongoDB handles new enum values gracefully | ZERO |

### 7.2 Existing Routes — No Breaking Changes

| Route | Status |
|-------|--------|
| `POST /api/suggestions/generate` | UNCHANGED — works exactly as before |
| `GET /api/suggestions` | UNCHANGED |
| `GET /api/suggestions/:id` | UNCHANGED |
| `POST /api/suggestions/refine-context` | UNCHANGED |
| `GET /api/trends` | UNCHANGED |
| `POST /api/auth/*` | UNCHANGED |
| `POST /api/persona/*` | UNCHANGED |
| `POST /api/onboarding/*` | UNCHANGED |
| `POST /api/persona-chat/*` | UNCHANGED |
| `POST /api/drafts/*` | UNCHANGED (new endpoints added alongside) |
| `POST /api/feedback/*` | UNCHANGED |

### 7.3 Data Model Compatibility

| Model | Change | Backward Compatible? |
|-------|--------|---------------------|
| `ContentSuggestion` | New `generationMode` values ("trend-selected", "persona-topics") | YES — MongoDB accepts new enum strings; old documents keep existing values |
| `UserPersona.feedbackProfile` | `tonePreference` populated (was always in schema) | YES — field already exists, just starts getting values |
| `SuggestionFeedback` | No changes | YES |
| `PostDraft` | No changes | YES |
| `ChatSession` | No changes | YES |

### 7.4 Token Budget Impact

| New Operation | Tokens per Call | Expected Frequency | Monthly Impact |
|--------------|----------------|-------------------|----------------|
| Trend discovery (`/discover`) | ~2,500 | 2-3x per generation | +5,000-7,500 |
| Topic suggestions (`/topic-ideas`) | ~2,000 | 1x per session | +2,000 |
| AI detection (`/ai-check`) | ~1,100 | 2-3x per draft | +2,200-3,300 |
| Humanize (`/humanize`) | ~2,700 | 1x per draft | +2,700 |
| **Total new cost per user/month** | | | **~12,000-15,500** |

This is within the existing token budget structure. The `checkTokenQuota()` gate protects against runaway usage.

### 7.5 Files Modified (Summary)

**Modified files (existing):**
1. `services/trends.ts` — Remove duplicate cache, expand HN_QUERY_MAP, add Google News RSS, fix keyword matching
2. `services/trendCache.ts` — Add time-bucket to cache key
3. `agents/trendResearch.ts` — Add recentTrends penalty, shuffle heuristic results
4. `utils/scoring.ts` — Accept recentTrends parameter, add stale penalty
5. `agents/mastra.ts` — Load recent trendsUsed before Step 3
6. `routes/trends.ts` — Add `GET /discover` endpoint
7. `routes/suggestions.ts` — Add `generate-from-trends`, `topic-ideas`, `generate-from-topic` endpoints
8. `routes/drafts.ts` — Add `ai-check` and `humanize` endpoints
9. `models/ContentSuggestion.ts` — Add new GenerationMode values
10. `contentGenerator.ts` — Strengthen feedback section, lower threshold
11. `feedbackProcessor.ts` — Reduce learning trigger interval
12. `personaLearning.ts` — Add action weights, recency decay, populate tonePreference
13. `packages/shared-types/src/index.ts` — Add new mode types

**New files:**
1. `services/trendDiscoveryCache.ts` — Short-lived per-user trend selection cache

**New frontend files:**
1. `components/trends/TrendBrowser.tsx` — Trend selection UI
2. `components/trends/TrendCard.tsx` — Individual trend card
3. `components/suggestions/TopicBrowser.tsx` — AI topic suggestion UI
4. `components/editor/AiDetectorPanel.tsx` — AI detection + humanizer UI

---

## 8. Prioritized Action Plan

### Phase A: Trend Pipeline Reliability (Sections 1 + 2)

**Priority**: CRITICAL — fixes user-reported bugs
**Estimated effort**: ~8 hours
**Dependencies**: None

| # | Task | File(s) | Est. |
|---|------|---------|------|
| A1 | Remove duplicate cache from `services/trends.ts` (lines 370-411) | `services/trends.ts` | 0.5h |
| A2 | Add time-bucket to `buildTrendCacheKey()` in `trendCache.ts` | `services/trendCache.ts` | 0.5h |
| A3 | Add `created_at_i>` time filter to HN Algolia queries | `services/trends.ts` | 0.5h |
| A4 | Add random shuffle for equally-scored RSS feeds | `services/trends.ts` | 0.5h |
| A5 | Shuffle heuristic items + vary content angle templates | `agents/trendResearch.ts` | 0.5h |
| A6 | Implement "recently shown" trend penalty via ContentSuggestion.trendsUsed | `utils/scoring.ts`, `agents/trendResearch.ts`, `agents/mastra.ts` | 1.5h |
| A7 | Expand `HN_QUERY_MAP` to 30+ industries | `services/trends.ts` | 1h |
| A8 | Lower HN points threshold for raw keyword queries | `services/trends.ts` | 0.25h |
| A9 | Add RSS backup feed retry on total failure | `services/trends.ts` | 0.5h |
| A10 | Fix hyphen-normalized keyword matching in `isRelevant()` | `services/trends.ts` | 0.25h |
| A11 | Add Google News RSS as Tier 2.5 fallback | `services/trends.ts` | 1h |
| A12 | Add structured zero-result logging | `agents/trendResearch.ts` | 0.5h |

### Phase B: Feedback Weight Amplification (Section 6)

**Priority**: HIGH — directly improves content quality
**Estimated effort**: ~4 hours
**Dependencies**: None (can run in parallel with Phase A)

| # | Task | File(s) | Est. |
|---|------|---------|------|
| B1 | Reduce learning trigger interval (every 3rd; every one for first 3) | `feedbackProcessor.ts` | 0.5h |
| B2 | Strengthen feedback section prompt language (advisory → directive) | `contentGenerator.ts` | 0.5h |
| B3 | Add action weight multiplier (published=2x, draft=1.5x) | `personaLearning.ts` | 1h |
| B4 | Add recency decay weighting (14-day half-life) | `personaLearning.ts` | 0.5h |
| B5 | Lower feedback threshold from 3 to 1 with graduated injection | `contentGenerator.ts` | 0.5h |
| B6 | Populate `tonePreference` from parsedSignals | `personaLearning.ts` | 1h |

### Phase C: Human-in-the-Loop Trend Selection (Section 3)

**Priority**: HIGH — major UX improvement
**Estimated effort**: ~10 hours
**Dependencies**: Phase A (trend reliability must be fixed first)

| # | Task | File(s) | Est. |
|---|------|---------|------|
| C1 | Create `trendDiscoveryCache.ts` service | `services/trendDiscoveryCache.ts` | 1h |
| C2 | Add `GET /api/trends/discover` endpoint | `routes/trends.ts` | 1.5h |
| C3 | Add `POST /api/suggestions/generate-from-trends` endpoint | `routes/suggestions.ts` | 1.5h |
| C4 | Add "trend-selected" to GenerationMode enum | `models/ContentSuggestion.ts`, `shared-types` | 0.5h |
| C5 | Create `TrendCard.tsx` component | `components/trends/TrendCard.tsx` | 1h |
| C6 | Create `TrendBrowser.tsx` component | `components/trends/TrendBrowser.tsx` | 1.5h |
| C7 | Update dashboard page with "Browse Trends" flow | `app/dashboard/page.tsx` | 1.5h |
| C8 | Add API client functions for trend discovery | `lib/api.ts` | 0.5h |

### Phase D: AI-Suggested Topics from Persona (Section 4)

**Priority**: MEDIUM — new feature, not a fix
**Estimated effort**: ~8 hours
**Dependencies**: None (can start after Phase B)

| # | Task | File(s) | Est. |
|---|------|---------|------|
| D1 | Create `TopicIdeasSchema` and topic suggestion prompt | `agents/contentGenerator.ts` or new `agents/topicSuggester.ts` | 1.5h |
| D2 | Add `GET /api/suggestions/topic-ideas` endpoint | `routes/suggestions.ts` | 1.5h |
| D3 | Add `POST /api/suggestions/generate-from-topic` endpoint | `routes/suggestions.ts` | 1h |
| D4 | Add topic discovery cache (reuse trendDiscoveryCache pattern) | `services/trendDiscoveryCache.ts` | 0.5h |
| D5 | Add "persona-topics" to GenerationMode enum | `models/ContentSuggestion.ts`, `shared-types` | 0.25h |
| D6 | Create `TopicBrowser.tsx` component | `components/suggestions/TopicBrowser.tsx` | 1.5h |
| D7 | Update dashboard with "AI Topic Suggestions" flow | `app/dashboard/page.tsx` | 1.5h |
| D8 | Add API client functions | `lib/api.ts` | 0.25h |

### Phase E: AI Detector + Humanizer (Section 5)

**Priority**: MEDIUM — new feature for editor
**Estimated effort**: ~8 hours
**Dependencies**: Drafts/Editor system (already implemented)

| # | Task | File(s) | Est. |
|---|------|---------|------|
| E1 | Add `POST /api/drafts/:id/ai-check` endpoint | `routes/drafts.ts` | 1.5h |
| E2 | Build AI detection prompt with 7-signal analysis | `routes/drafts.ts` or new `services/aiDetection.ts` | 1h |
| E3 | Add `POST /api/drafts/:id/humanize` endpoint | `routes/drafts.ts` | 1.5h |
| E4 | Build humanization prompt with persona voice matching | `routes/drafts.ts` or `services/aiDetection.ts` | 1h |
| E5 | Create `AiDetectorPanel.tsx` component | `components/editor/AiDetectorPanel.tsx` | 1.5h |
| E6 | Integrate panel into editor page with toggle | Editor page | 1h |
| E7 | Add API client functions | `lib/api.ts` | 0.5h |

### Implementation Dependency Graph

```
Phase A (Trend Fixes) ─────┐
                            ├──→ Phase C (Human-in-Loop Trends)
Phase B (Feedback Weight) ──┤
                            ├──→ Phase D (AI Topics)
                            │
Phase E (AI Detector) ──────┘   (Independent — can start anytime)
```

### Total Estimated Effort

| Phase | Hours | Priority |
|-------|-------|----------|
| A: Trend Pipeline Reliability | ~8h | CRITICAL |
| B: Feedback Weight Amplification | ~4h | HIGH |
| C: Human-in-the-Loop Trends | ~10h | HIGH |
| D: AI-Suggested Topics | ~8h | MEDIUM |
| E: AI Detector + Humanizer | ~8h | MEDIUM |
| **Total** | **~38h** | |

### Action Item Count

| Phase | Items | New | Fix |
|-------|-------|-----|-----|
| A | 12 | 2 | 10 |
| B | 6 | 0 | 6 |
| C | 8 | 8 | 0 |
| D | 8 | 8 | 0 |
| E | 7 | 7 | 0 |
| **Total** | **41** | **25** | **16** |
