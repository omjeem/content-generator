# Architecture — Low-Level Design

> Complete technical architecture with flow diagrams.
> Last synced: 2026-03-10

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         TURBOREPO MONOREPO                                  │
│                                                                              │
│  ┌─────────────────────┐    ┌──────────────────────┐   ┌─────────────────┐  │
│  │    apps/web          │    │     apps/api          │   │   packages/     │  │
│  │   (Next.js 14)       │    │  (Express + TS)       │   │  shared-types/  │  │
│  │   Port: 3000         │───▶│   Port: 5006          │   │  eslint-config/ │  │
│  │                      │    │                       │   │                 │  │
│  │  ┌───────────┐       │    │  ┌──────────┐         │   │  ISuggestion    │  │
│  │  │ App Router│       │    │  │ Express  │         │   │  IUserPersona   │  │
│  │  │  Pages    │       │    │  │ Routes   │         │   │  IPostDraft     │  │
│  │  ├───────────┤       │    │  ├──────────┤         │   │  IContentSug.   │  │
│  │  │Components │       │    │  │ Agents   │         │   │  ...40+ types   │  │
│  │  ├───────────┤       │    │  │(Mastra)  │         │   └─────────────────┘  │
│  │  │ lib/api.ts│       │    │  ├──────────┤         │                        │
│  │  │(API Client)│      │    │  │Services  │         │                        │
│  │  └───────────┘       │    │  ├──────────┤         │                        │
│  └─────────────────────┘    │  │ Models   │         │                        │
│                              │  │(Mongoose)│         │                        │
│                              │  └────┬─────┘         │                        │
│                              └───────┼───────────────┘                        │
└──────────────────────────────────────┼────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
                    ▼                  ▼                   ▼
             ┌──────────┐     ┌──────────────┐    ┌──────────────┐
             │ MongoDB  │     │   Gemini API  │    │ External APIs│
             │ Atlas M0 │     │ (ai.google)   │    │ Tavily, HN,  │
             │ 13 colls │     │ gemini-2.5    │    │ RSS, G-News  │
             └──────────┘     └──────────────┘    └──────────────┘
```

---

## 2. Request Flow (Browser → API → Response)

```
  Browser (localhost:3000)
      │
      │  fetch('/api/...', { credentials: 'include' })
      │
      ▼
  ┌──────────────────────────────────────────────────┐
  │  Express Server (localhost:5006)                   │
  │                                                    │
  │  Request ──▶ CORS ──▶ cookie-parser ──▶ rate-limit│
  │       │                                            │
  │       ▼                                            │
  │  ┌──────────────┐                                  │
  │  │ Route Handler │                                  │
  │  │ (auth check)  │                                  │
  │  └──────┬───────┘                                  │
  │         │                                          │
  │    ┌────┴────┐                                     │
  │    │JWT Auth │  ◀── extracts JWT from cookie       │
  │    │Middleware│      verifies with JWT_SECRET       │
  │    └────┬────┘      sets req.userId                │
  │         │                                          │
  │    ┌────▼────────────────────────┐                 │
  │    │ Route Logic                  │                 │
  │    │  ├─ Mongoose queries (DB)    │                 │
  │    │  ├─ Agent calls (Gemini LLM) │                 │
  │    │  └─ Service calls (APIs)     │                 │
  │    └────┬────────────────────────┘                 │
  │         │                                          │
  │    ┌────▼────┐                                     │
  │    │Response │  ──▶ JSON body + Set-Cookie (auth)  │
  │    └─────────┘                                     │
  │                                                    │
  │  Global: errorHandler middleware (catches throws)  │
  └──────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow

```
  ┌─────────┐     POST /api/auth/register              ┌──────────┐
  │ Browser │ ──────────────────────────────────────▶   │  API     │
  │         │     { email, password, name }             │          │
  │         │                                           │  bcrypt  │
  │         │     200 + Set-Cookie: token=JWT...        │  hash    │
  │         │ ◀──────────────────────────────────────   │  pwd     │
  └─────────┘     httpOnly, sameSite, secure            │  create  │
                                                        │  user    │
  ┌─────────┐     POST /api/auth/login                  │  sign    │
  │ Browser │ ──────────────────────────────────────▶   │  JWT     │
  │         │     { email, password }                   └──────────┘
  │         │
  │         │     200 + Set-Cookie: token=JWT...
  │         │ ◀──────────────────────────────────────
  └────┬────┘
       │
       │  Subsequent requests include cookie automatically
       │  (credentials: 'include')
       ▼
  ┌──────────────────────────────────┐
  │ auth.ts middleware               │
  │                                  │
  │  1. Extract JWT from cookie      │
  │     (or Authorization header)    │
  │  2. jwt.verify(token, SECRET)    │
  │  3. Set req.userId = decoded.id  │
  │  4. next() or 401               │
  └──────────────────────────────────┘

  Cookie settings:
    httpOnly: true      ← JS can't read it (XSS protection)
    sameSite: 'lax'     ← CSRF protection
    secure: false       ← true in production
    maxAge: 7 days
```

---

## 4. Multi-Agent Pipeline (Full Generation)

```
  POST /api/suggestions/generate
       │
       │  { context?: { mode, topicFocus?, platforms?, ... } }
       │
       ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  ORCHESTRATOR (agents/mastra.ts)                              │
  │  with: token quota check, pipeline timeout (90s),             │
  │        circuit breaker, exponential backoff retry              │
  │                                                                │
  │  Pre-flight: checkTokenQuota(userId) — blocks if over limit   │
  │       │                                                        │
  │  Step 1: Load UserPersona + extract WritingDNA (deterministic) │
  │       │  + recompute confidence score (fire-and-forget)        │
  │       │                                                        │
  │       ▼                                                        │
  │  ┌─────────────────────────┐                                   │
  │  │ Agent 3: Trend Research │  ◀── fetchRealTrendingContent()   │
  │  │ trendResearch.ts        │      classifyDomain() → RSS pool  │
  │  │                         │      HN (tech only) + Google News │
  │  │ 1. Fetch raw items      │      Tavily (if key set)          │
  │  │ 2. Score by persona     │      L1→L2 two-tier cache         │
  │  │ 3. Balanced selection   │                                   │
  │  │ 4. Heuristic or LLM    │                                   │
  │  │    enrichment           │                                   │
  │  └──────────┬──────────────┘                                   │
  │             │  TrendResult { trends[], rawTrends[] }           │
  │             ▼                                                  │
  │  Step 3.5 (parallel):                                          │
  │   - getSchedulingHint(domain) → posting time suggestion        │
  │   - detectContentSeries(userId) → existing series clusters     │
  │   - getAudienceInsights(userId) → audience signal prompt       │
  │             │                                                  │
  │             ▼                                                  │
  │  ┌─────────────────────────────┐                               │
  │  │ Agent 4: Content Generator   │                               │
  │  │ contentGenerator.ts          │                               │
  │  │                              │                               │
  │  │ Input:                       │                               │
  │  │  - persona (voice+style)     │                               │
  │  │  - trends (WHAT to write)    │                               │
  │  │  - context overrides         │                               │
  │  │  - feedback profile          │                               │
  │  │  - writingDNA section        │                               │
  │  │  - confidence directive      │                               │
  │  │  - format strategy           │                               │
  │  │  - audience signals          │                               │
  │  │  - peer differentiation      │                               │
  │  │  - content series context    │                               │
  │  │                              │                               │
  │  │ Output:                      │                               │
  │  │  5-10 ISuggestion objects    │                               │
  │  │  + schedulingHint            │                               │
  │  │  + seriesTag (if applicable) │                               │
  │  └──────────┬───────────────────┘                               │
  │             │                                                  │
  │             ▼                                                  │
  │  postProcessIdeas(): attach scheduling hints + series tags     │
  │  Save to ContentSuggestion collection                          │
  │  Track token usage (fire-and-forget via fireAndForget())       │
  │                                                                │
  │  Return: { suggestions[], id, trendsUsed[], trendSource }     │
  └──────────────────────────────────────────────────────────────┘
```

### Generation Modes (5)

```
  ┌───────────────────────────────────────────────────────────┐
  │                   GenerateOptionsPanel                     │
  │                                                            │
  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐     │
  │  │ Use Profile  │ │ Focus Topic │ │ Chat to Refine   │     │
  │  │ mode:profile │ │ mode:       │ │ mode:            │     │
  │  │              │ │ topic-focus │ │ chat-refined     │     │
  │  └──────┬──────┘ └──────┬──────┘ └───────┬──────────┘     │
  │         │               │                │                 │
  │         │               │        stateless chat with       │
  │         │               │        refine-context endpoint   │
  │         │               │        AI extracts summary       │
  │         ▼               ▼                ▼                 │
  │  ┌──────────────────────────────────────────┐              │
  │  │ POST /api/suggestions/generate           │              │
  │  │ context: { mode, topicFocus?, ... }      │              │
  │  └─────────────────────────────────────────┘              │
  │                                                            │
  │  ┌─────────────────┐ ┌──────────────────────┐             │
  │  │ Browse Trends    │ │ AI Topic Suggestions │             │
  │  │ mode:            │ │ mode:                │             │
  │  │ trend-selected   │ │ persona-topics       │             │
  │  └────────┬────────┘ └──────────┬───────────┘             │
  │           │                     │                          │
  │  GET /discover → user picks     GET /topic-ideas →         │
  │  → POST /generate with          user picks →               │
  │    selectedTrendIds              POST /generate-from-topic  │
  └───────────────────────────────────────────────────────────┘
```

---

## 5. Trend Fetching Pipeline (Domain-Aware)

```
  researchTrendsForUser(input)
       │
       ▼
  classifyDomain(industry, topics) ──▶ DomainCategory
       │                                (1 of 14 categories)
       │
       ▼
  fetchRealTrendingContent(keywords, industry, geo, domain)
       │
       ├──────────────────────┬──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
  ┌──────────┐         ┌───────────┐          ┌───────────┐
  │ Tavily   │         │ HN Algolia│          │ Domain    │
  │ (Tier 1) │         │ (Tier 2a) │          │ RSS Feeds │
  │          │         │           │          │ (Tier 2b) │
  │ if API   │         │ SKIP if   │          │           │
  │ key set  │         │ domain    │          │ 4-6 feeds │
  │          │         │ not in    │          │ from      │
  │ 10 items │         │ {tech,    │          │ DOMAIN_   │
  │ max      │         │  business,│          │ RSS_FEEDS │
  │          │         │  finance, │          │ [domain]  │
  └────┬─────┘         │  general} │          │           │
       │               └─────┬─────┘          └─────┬─────┘
       │                     │                      │
       └─────────────────────┼──────────────────────┘
                             │
                             ▼
                   deduplicateAndRank()
                             │
                   items < 5?
                     │yes        │no
                     ▼           ▼
              ┌──────────┐   continue
              │Google    │
              │News RSS  │
              │(Tier 2.5)│
              └────┬─────┘
                   │
                   ▼
            scoreAndRankTrends()       ◀── persona signals
                   │                       (topics, pillars, industry)
                   │                       stale penalty from recentTrends
                   ▼
            selectBalancedTrends()      ◀── ensure pillar coverage
                   │
                   │
            ┌──────┴───────┐
            │              │
   ≥4 items score ≥3?     Otherwise
            │              │
            ▼              ▼
     Heuristic path   LLM enrichment
     (skip Gemini)    (trendResearchAgent)
            │              │
            ▼              ▼
     Domain-aware     Agent adds
     angle templates  relevance +
     (getAngle        content angles
      Templates)
            │              │
            └──────┬───────┘
                   │
                   ▼
           TrendResult { trends[], rawTrends[] }
```

### Domain Categories → Feed Pools

```
  classifyDomain("yoga instructor", ["wellness", "mindfulness"])
       │
       ▼  domain = "wellness"
       │
       ▼  DOMAIN_RSS_FEEDS["wellness"]
       │
       ├── Well+Good
       ├── MindBodyGreen
       ├── Psychology Today
       ├── Shape
       └── Healthline

  classifyDomain("backend engineer", ["microservices", "kubernetes"])
       │
       ▼  domain = "tech"
       │
       ▼  DOMAIN_RSS_FEEDS["tech"]
       │
       ├── TechCrunch
       ├── VentureBeat
       ├── MIT Technology Review
       ├── Ars Technica
       ├── The Verge
       └── NYT Technology
```

---

## 6. Feedback Learning Loop

```
  User sees suggestion card
       │
       │  rates: loved/good/meh/bad
       │  action: saved/draft/published/dismissed
       │
       ▼
  POST /api/feedback/:setId/:index
       │
       ▼
  Save SuggestionFeedback document
       │
       │  fire-and-forget (no await)
       ▼
  feedbackProcessor.processFeedback()
       │
       ├── Extract signals:
       │   - topic, format, platform
       │   - signalStrength: loved=1.0, good=0.75, meh=0.5, bad=0.25
       │   - action multiplier: published=2.0×, draft=1.5×, saved=1.2×
       │
       ▼
  personaLearning.aggregateAndUpdatePersona()
       │
       ├── Load all user's feedback (last 90 days)
       ├── Apply recency decay (14-day half-life)
       ├── Compute:
       │   - preferredTopics (weighted count > threshold)
       │   - avoidTopics (low-rated topics)
       │   - formatPreferences { carousel: 0.4, text-post: 0.3, ... }
       │   - tonePreference (from parsed signals)
       │   - averageRating, totalFeedbackCount
       │
       ▼
  Update UserPersona.feedbackProfile
       │
       │  (next generation reads this)
       ▼
  contentGenerator.ts: buildFeedbackSection()
       │
       └── Injects into prompt:
           "## LEARNING FROM YOUR PAST FEEDBACK
            Creator prefers: [topics]
            Creator avoids: [topics]
            Format preferences: ..."
```

---

## 7. Post Editor & Co-Writing Flow

```
  User clicks "Draft" on a suggestion
       │
       ▼
  POST /api/drafts
  { suggestionSetId, suggestionIndex, platform }
       │
       ▼
  Create PostDraft document
  (copies brief from suggestion)
       │
       ▼
  ┌─────────────────────────────────────────────────┐
  │  Post Editor Page                                │
  │  /dashboard/suggestions/:id/editor               │
  │                                                   │
  │  ┌────────────────┐    ┌─────────────────────┐   │
  │  │ PostEditorPane │    │ EditorChatPane       │   │
  │  │                │    │                      │   │
  │  │ Content        │    │ "Help me improve     │   │
  │  │ textarea       │    │  the opening..."     │   │
  │  │                │    │                      │   │
  │  │ Char count     │    │ Agent 6 responds     │   │
  │  │ Brief sidebar  │    │ with advice +        │   │
  │  │                │    │ <!--POST_CONTENT-->   │   │
  │  │                │◀───│ hidden block with     │   │
  │  │ "Apply Edit"   │    │ revised content      │   │
  │  │ button appears │    │                      │   │
  │  └────────────────┘    └─────────────────────┘   │
  │                                                   │
  │  ┌──────────────────────────────────┐             │
  │  │ AiDetectorPanel                  │             │
  │  │                                  │             │
  │  │ POST /api/drafts/:id/ai-check    │             │
  │  │ → score, verdict, signals,       │             │
  │  │   suggestions                    │             │
  │  │                                  │             │
  │  │ POST /api/drafts/:id/humanize    │             │
  │  │ { intensity: light|moderate|     │             │
  │  │   aggressive }                   │             │
  │  │ → humanizedContent, before/      │             │
  │  │   afterScore, changesSummary     │             │
  │  └──────────────────────────────────┘             │
  └─────────────────────────────────────────────────┘
```

---

## 8. Onboarding Flow

```
  /onboarding page
       │
       ▼
  Step 1: LinkedIn URL or paste posts
       │
       ├── URL provided ──▶ POST /api/persona/analyze { linkedinUrl }
       │                         │
       │                    Agent 1 (Persona Analyst)
       │                         │
       │                    Puppeteer scrapes profile
       │                    (or fallback: manual paste)
       │                         │
       │                    Gemini analyzes: style, tone,
       │                    topics, formats
       │                         │
       │                    Save to UserPersona
       │                         │
       ├── Posts pasted ──▶ POST /api/persona/analyze { manualPosts }
       │                    (same Agent 1, skip scraping)
       │
       ▼
  Step 2: Interview Chat
       │
       │  POST /api/onboarding/chat { message, sessionId }
       │
       ▼
  Agent 2 (Onboarding)
       │
       │  Asks 5-7 questions about:
       │  goals, target audience, industry,
       │  content pillars, posting frequency
       │
       │  Uses <!--INTERVIEW_DATA {...} INTERVIEW_DATA-->
       │  to signal completion
       │
       ▼
  Merge interview answers into UserPersona
       │
       ▼
  Redirect to /dashboard
```

---

## 9. Data Model Relationships

```
  ┌─────────┐
  │  User    │
  │  _id ◄───┼──────────────────────────────────────────────────┐
  └────┬─────┘                                                   │
       │ 1:1                                                     │
       ▼                                                         │
  ┌──────────────┐                                               │
  │ UserPersona   │                                              │
  │ userId ──────▶│ User._id                                     │
  │               │                                              │
  │ feedbackProfile ◄── personaLearning.ts aggregates from       │
  │ analysisHistory     SuggestionFeedback                       │
  │ postMetadata        (continuous learning)                    │
  └──────────────┘                                               │
       │                                                         │
       │ (persona feeds into generation)                         │
       ▼                                                         │
  ┌───────────────────┐         ┌─────────────────────┐          │
  │ContentSuggestion   │         │ SuggestionFeedback  │          │
  │ userId ───────────▶│ User    │ userId ────────────▶│ User     │
  │                    │         │ suggestionSetId ───▶│ CS._id   │
  │ suggestions[]      │         │ suggestionIndex     │          │
  │ (ISuggestion)      │◀────────│ rating, action      │          │
  │ trendsUsed[]       │         │ parsedSignals       │          │
  └────────┬───────────┘         └─────────────────────┘          │
           │                                                      │
           │ (user drafts from a suggestion)                      │
           ▼                                                      │
  ┌──────────────┐              ┌──────────────────┐              │
  │ PostDraft     │              │ ChatSession       │              │
  │ userId ──────▶│ User         │ userId ──────────▶│ User         │
  │ sourceSugg.  ─▶│ CS._id     │ agentType:        │              │
  │ content       │              │  onboarding |     │              │
  │ contentHist[] │              │  persona-chat |   │              │
  │ brief         │              │  post-editor      │              │
  │ status        │              │ messages[]         │              │
  │ platform      │              └──────────────────┘              │
  └──────────────┘                                                │
                                                                  │
  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
  │ TokenUsageLog     │  │ TokenRequest      │  │AdminAuditLog   │  │
  │ userId ──────────▶│  │ userId ──────────▶│  │adminId ───────▶│  │
  │ agent, operation  │  │ status, newLimit  │  │action, details │  │
  │ tokens in/out     │  │ message           │  │                │  │
  └──────────────────┘  └──────────────────┘  └────────────────┘  │
                                                                  │
  ┌──────────────────┐  ┌──────────────────┐                      │
  │ RefreshToken      │  │ SystemConfig      │                      │
  │ userId ──────────▶│  │ (platform-wide)   │                      │
  │ token, expiresAt  │  │ key-value pairs   │                      │
  └──────────────────┘  └──────────────────┘                      │
```

---

## 10. File Responsibility Map

### Agents (`apps/api/src/agents/`)

| File | Agent # | Purpose |
|---|---|---|
| `personaAnalyst.ts` | 1 | Analyzes LinkedIn posts → extracts writing style, tone, topics, formats |
| `onboarding.ts` | 2 | Conducts 5-7 question interview → goals, audience, industry, pillars |
| `trendResearch.ts` | 3 | Fetches real trends, scores by persona, enriches with content angles |
| `contentGenerator.ts` | 4 | Generates 5-10 suggestion briefs from persona + trends + context |
| `personaChat.ts` | 5 | Live persona editor — AI proposes changes, user applies |
| `postEditor.ts` | 6 | Co-writing assistant — suggests edits via hidden-block pattern |
| `mastra.ts` | — | Orchestrator: sequences agents, handles retry, saves results |

### Services (`apps/api/src/services/`)

| File | Purpose |
|---|---|
| `trends.ts` | Multi-tier domain-aware trend fetching with deduplication (Tavily → HN → RSS → Google News) |
| `trendCache.ts` | Two-tier caching: L1 in-memory (5-min TTL) + L2 MongoDB (30-min TTL auto-expiry) |
| `trendDiscoveryCache.ts` | Per-user discovery session cache for Browse Trends flow |
| `linkedin.ts` | Puppeteer-based LinkedIn profile scraper |
| `feedbackProcessor.ts` | Fire-and-forget signal extraction from suggestion feedback |
| `personaLearning.ts` | Aggregates explicit + implicit feedback → updates UserPersona.feedbackProfile |
| `personaMerge.ts` | Incremental persona analysis when user adds more posts |
| `draftService.ts` | PostDraft CRUD + version history management |
| `aiDetection.ts` | Heuristic AI-content scoring + LLM-based humanization (with JSON parse fallback) |
| `tokenUsage.ts` | Per-agent token consumption tracking + limit enforcement |
| `chatSessionService.ts` | ChatSession CRUD for conversation persistence |
| `userPersonaService.ts` | UserPersona helper queries |
| `healthCheck.ts` | MongoDB + external API health monitoring |
| `adminSeed.ts` | First-run admin account creation from env vars |
| `writingDNA.ts` | Deterministic writing pattern extraction (15+ metrics, no LLM) |
| `personaConfidence.ts` | 5-dimension confidence score calculator (0-100 scale) |
| `schedulingHints.ts` | Domain-based optimal posting time lookup (14 domain categories) |
| `contentContinuity.ts` | Content series detection via keyword clustering (2+ posts = series) |
| `audienceTracker.ts` | Audience engagement recording + analytics + prompt signal builder |
| `performanceTracker.ts` | Performance-weighted learning from published post outcomes |
| `abTest.ts` | A/B test framework (10% enrollment, shadow results, stats aggregation) |

### Routes (`apps/api/src/routes/`)

| File | Mount Point | Key Endpoints |
|---|---|---|
| `auth.ts` | `/api/auth` | register, login, logout, me, refresh-token |
| `persona.ts` | `/api/persona` | analyze, get, add-posts, posts, history, peers |
| `onboarding.ts` | `/api/onboarding` | chat, session, status |
| `trends.ts` | `/api/trends` | get, discover |
| `suggestions.ts` | `/api/suggestions` | generate, refine-context, list, get/:id, topic-ideas, generate-from-topic, /:setId/regenerate |
| `personaChat.ts` | `/api/persona-chat` | chat, apply-changes, history, persona |
| `feedback.ts` | `/api/feedback` | submit (POST /:setId/:index), get, implicit, reset |
| `drafts.ts` | `/api/drafts` | CRUD, editor-chat, ai-check, humanize, /:id/performance |
| `tokenUsage.ts` | `/api/token-usage` | summary, request-increase |
| `admin.ts` | `/api/admin` | users, analytics, token-requests, audit-log, config |
| `audience.ts` | `/api/audience` | record, insights |

### Utils (`apps/api/src/utils/`)

| File | Purpose |
|---|---|
| `scoring.ts` | `scoreAndRankTrends()` + `selectBalancedTrends()` — pre-LLM relevance scoring |
| `extractJSON.ts` | Robust JSON extraction from LLM responses (handles markdown code blocks) |
| `sanitizeInput.ts` | Input sanitization for user-submitted text |
| `chatHistory.ts` | Chat history formatting helpers |
| `fireAndForget.ts` | Safe fire-and-forget wrapper with error logging |
| `circuitBreaker.ts` | Circuit breaker for Gemini API (closed → open → half-open states) |

### Config (`apps/api/src/config/`)

| File | Purpose |
|---|---|
| `db.ts` | MongoDB connection setup |
| `env.ts` | Environment variable validation (Zod) |
| `constants.ts` | Centralized magic numbers: SCORING, LEARNING, PIPELINE, GENERATION, CACHE, LIMITS |

### Middleware (`apps/api/src/middleware/`)

| File | Purpose |
|---|---|
| `auth.ts` | JWT authentication middleware |
| `adminAuth.ts` | Admin role verification middleware |
| `errorHandler.ts` | Global error handler |
| `rateLimit.ts` | Per-user rate limiting: generation (5/min), chat (20/min), AI-check (10/min) |

### Frontend (`apps/web/src/`)

| Path | Purpose |
|---|---|
| `app/(auth)/login/page.tsx` | Login form |
| `app/(auth)/register/page.tsx` | Registration form |
| `app/onboarding/page.tsx` | 2-step onboarding: URL/paste + interview chat |
| `app/dashboard/page.tsx` | Main dashboard: generate ideas + suggestion cards + confidence badge + feedback summary + performance notifications |
| `app/dashboard/profile/page.tsx` | Persona viewer + AI strategy chat + feedback insights |
| `app/dashboard/profile/evolution/page.tsx` | Persona version history with diffs and triggers |
| `app/dashboard/suggestions/page.tsx` | Suggestion history + compare action |
| `app/dashboard/suggestions/compare/page.tsx` | Side-by-side comparison of 2 suggestion sets |
| `app/dashboard/suggestions/[id]/editor/page.tsx` | Post editor |
| `app/admin/*` | Admin dashboard pages |
| `components/chat/ChatInterface.tsx` | Reusable chat UI component |
| `components/suggestions/SuggestionCard.tsx` | Suggestion card with rich brief |
| `components/suggestions/GenerateOptionsPanel.tsx` | 3-mode generation panel |
| `components/suggestions/TopicBrowser.tsx` | AI-suggested topics browser |
| `components/trends/TrendBrowser.tsx` | Trend discovery browser |
| `components/trends/TrendCard.tsx` | Individual trend card |
| `components/editor/PostEditorPane.tsx` | Draft content editor |
| `components/editor/EditorChatPane.tsx` | AI co-writing chat |
| `components/editor/AiDetectorPanel.tsx` | AI detection + humanizer UI |
| `components/persona/PendingChangesCard.tsx` | AI-proposed persona changes review |
| `components/persona/PersonaDiffCard.tsx` | Persona before/after comparison |
| `components/layout/Navbar.tsx` | Top navigation bar |
| `lib/api.ts` | API client (authApi, personaApi, suggestionsApi, feedbackApi, draftsApi, tokenApi, audienceApi, etc.) |
| `lib/auth.ts` | Token/cookie helpers |
| `lib/implicitTracking.ts` | Implicit feedback signal tracker (debounced batch POST) |
| `middleware.ts` | Next.js route protection (redirect unauthed to /login) |

---

## 11. Hidden-Block Pattern (structured LLM output)

```
  LLM generates response like:

  "Great question! Here's my analysis of your content strategy...
   I'd recommend focusing on thought leadership.

   <!--PERSONA_CHANGES {"tone":"Professional yet bold","topics":["AI strategy"]} PERSONA_CHANGES-->

   Let me know if you'd like to refine this further."

  Extraction:
    1. Regex: /<!--PERSONA_CHANGES\s*([\s\S]*?)\s*PERSONA_CHANGES-->/
    2. JSON.parse(match[1]) → { tone: "...", topics: [...] }
    3. Strip block from visible reply
    4. Return: { reply: "Great question!...", pendingChanges: {...} }
```

Used by:
- Onboarding agent: `<!--INTERVIEW_DATA ... INTERVIEW_DATA-->`
- Refine-context: `<!--CONTEXT_SUMMARY ... CONTEXT_SUMMARY-->`
- Persona chat: `<!--PERSONA_CHANGES ... PERSONA_CHANGES-->`
- Post editor: `<!--POST_CONTENT ... POST_CONTENT-->`

---

## 12. Pipeline Reliability (Phase 4)

```
  runContentPipelineWithRetry(input)
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │ Circuit Breaker Check                             │
  │ (pipelineBreaker — singleton CircuitBreaker)      │
  │                                                    │
  │ State: CLOSED → OPEN (after 5 failures)           │
  │        OPEN → HALF_OPEN (after 60s cooldown)      │
  │        HALF_OPEN → CLOSED (1 success) or OPEN     │
  │                                                    │
  │ If OPEN: return error immediately (fail fast)     │
  └──────────────┬───────────────────────────────────┘
                 │ allowed
                 ▼
  ┌──────────────────────────────────────────────────┐
  │ Retry Loop (max 2 attempts)                       │
  │                                                    │
  │  Attempt 1 → runContentPipeline()                 │
  │    └── timeout: 90s overall                       │
  │    └── step timeouts: 30s/15s/45s                 │
  │                                                    │
  │  On failure → exponential backoff                 │
  │    └── attempt 1: wait 1s                         │
  │    └── attempt 2: wait 2s                         │
  │                                                    │
  │  Success → breaker.recordSuccess()                │
  │  Failure → breaker.recordFailure()                │
  └──────────────────────────────────────────────────┘
```

### Rate Limiting

```
  Incoming Request
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │ Rate Limiter (middleware/rateLimit.ts)             │
  │ Key: req.userId (per-user, not per-IP)            │
  │                                                    │
  │ ┌─────────────────────┐                            │
  │ │ generationLimiter   │  5 req/min                 │
  │ │ /generate           │  /generate-from-trends     │
  │ │                     │  /generate-from-topic      │
  │ └─────────────────────┘                            │
  │ ┌─────────────────────┐                            │
  │ │ chatLimiter         │  20 req/min                │
  │ │ /refine-context     │  /:id/chat                 │
  │ └─────────────────────┘                            │
  │ ┌─────────────────────┐                            │
  │ │ aiCheckLimiter      │  10 req/min                │
  │ │ /:id/ai-check       │  /:id/humanize             │
  │ └─────────────────────┘                            │
  │                                                    │
  │ Over limit → 429 Too Many Requests                │
  └──────────────────────────────────────────────────┘
```

---

## 13. Caching Strategy

```
  ┌─────────────────────────────────────────┐
  │ Trend Cache (trendCache.ts) — Two-tier   │
  │                                          │
  │ Key: hash(keywords + industry + geo)     │
  │                                          │
  │ L1 — In-memory Map                       │
  │   TTL: 5 minutes (CACHE.L1_CACHE_TTL_MS) │
  │   Lookup: instant                        │
  │                                          │
  │ L2 — MongoDB (TrendCache model)          │
  │   TTL: 30 minutes (auto-expiry TTL index)│
  │   Lookup: L1 miss → L2 query            │
  │                                          │
  │ Write: stores in both L1 + L2            │
  │ Purpose: avoid duplicate API calls       │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ Discovery Cache (trendDiscoveryCache.ts) │
  │                                          │
  │ Key: userId                              │
  │ TTL: 30 minutes                          │
  │ Storage: in-memory Map                   │
  │ Purpose: persist trend discovery results │
  │          between discover → generate     │
  │          steps in Browse Trends flow     │
  └─────────────────────────────────────────┘
```

---

## 14. UX Enhancements (2026-03-10)

### Feature Tour (New User Onboarding)

```
First login → dashboard layout mounts <FeatureTour />
  │
  ├── Check localStorage('postmind-tour-dismissed') → skip if true
  ├── Check localStorage('postmind-tour-completed') → filter out seen steps
  │
  ├── Step 1: Confidence Score badge (data-tour="confidence-score")
  ├── Step 2: Generate Section (data-tour="generate-section")
  ├── Step 3: My Profile nav link (data-tour="nav-profile")
  ├── Step 4: History nav link (data-tour="nav-history")
  └── Step 5: My Posts nav link (data-tour="nav-posts")

Each step:
  ├── Spotlight overlay (SVG mask) highlights target element
  ├── Popover with icon, title, description
  ├── "Next" advances to next uncompleted step
  ├── "Skip tour" dismisses permanently (localStorage flag)
  └── Clicking overlay also dismisses

Tracking: localStorage-based (no backend needed)
  - postmind-tour-completed: string[] of completed step IDs
  - postmind-tour-dismissed: "true" if user skipped
```

### Smart Navigation: "Add more posts to improve"

```
Dashboard confidence badge (<40%):
  "Add more posts to improve →" (clickable link)
    ↓
  navigates to /dashboard/profile?addPosts=true
    ↓
  Profile page reads searchParams, auto-expands "Add More Posts"
  section, scrolls to it
```

### Docker Optimization

```
Before: API image = 2.66 GB (Chromium 726 MB + web deps hoisted)
After:  API image = 338 MB (87% reduction)

Key changes:
  1. turbo prune @repo/api --docker → excludes web workspace deps
  2. COPY tsconfig.base.json → fixes skipLibCheck for @mastra/core
  3. Puppeteer/Chromium removed → 726 MB savings
  4. node_modules cleanup (*.md, *.map, tests, docs) → extra 100 MB
```
