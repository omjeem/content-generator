# Architecture & Technology Decisions Log

> Reference this when unsure about any choice. Newest decisions at the bottom.
> Last synced: 2026-03-04

---

## Decision 1: Express (user requested)

- **Chosen**: Express
- **Originally considered**: Hono
- **Reason**: User explicitly requested Express over Hono on 2026-02-20.
- **Impact**: `apps/api/src/index.ts` uses `express()` + standard middleware
- **Swagger**: `swagger-ui-express` + `swagger-jsdoc`
- **Packages**: express, cors, cookie-parser, @types/express, @types/cors, @types/cookie-parser

## Decision 2: Gemini over OpenAI/Anthropic

- **Chosen**: Google Gemini (`gemini-2.5-flash`) via `@ai-sdk/google`
- **Rejected**: OpenAI GPT-4, Anthropic Claude
- **Reason**: Free tier at ai.google.dev, no credit card needed
- **Usage**: All 6 agents use `google('gemini-2.5-flash')` as model

## Decision 3: Puppeteer for LinkedIn Scraping

- **Chosen**: Puppeteer
- **Rejected**: linkedin-api (requires credentials), RapidAPI (paid)
- **Reason**: No API key needed. Renders JavaScript-heavy LinkedIn pages.
- **Caveat**: LinkedIn blocks scrapers — includes random delays, UA spoofing, manual paste fallback
- **File**: `apps/api/src/services/linkedin.ts`

## Decision 4: Real-API Trend Fetching (domain-aware) — updated 2026-03-04

- **History**: google-trends-api broken (2026-02-20) → LLM hallucinated trends → replaced with real APIs (2026-02-21)
- **Latest**: Domain-aware system added (2026-03-04) — no more tech bias

### Data Sources (3-tier, highest quality first)

**Tier 1 — Tavily** (when `TAVILY_API_KEY` is set)
- AI-optimised web search, `topic: "news"`, `time_range: "week"`
- Free: 1,000 searches/month. Best quality results.

**Tier 2 — HN Algolia + Domain RSS Feeds** (always-on, zero API keys)
- **HN Algolia**: Free, ~10k req/hour. Only used for tech-adjacent domains (tech, business, finance, general). Skipped entirely for healthcare, wellness, legal, food, etc.
- **Domain RSS Feeds**: 14 domain categories × 4-6 feeds each = 60+ curated publication feeds. `classifyDomain(industry, topics)` routes to the right pool.

**Tier 2.5 — Google News RSS** (free, fallback when < 5 results)

**Tier 3 — Evergreen fallback** (no network call, always returns something)

### Domain Classification System

`classifyDomain()` in `services/trends.ts` maps industry+topics → one of 14 categories:
`tech`, `business`, `healthcare`, `wellness`, `finance`, `legal`, `education`,
`creative`, `food`, `sustainability`, `hr`, `real-estate`, `manufacturing`, `general`

Each category has its own RSS feed pool (`DOMAIN_RSS_FEEDS`) and only tech-adjacent
domains query Hacker News (`TECH_ADJACENT_DOMAINS`).

### Packages
- `rss-parser@3.13.0` — RSS/Atom feed parsing
- `@tavily/core@0.7.1` — Tavily search client (optional)

## Decision 5: Mastra AI for Multi-Agent Orchestration

- **Chosen**: Mastra AI (`@mastra/core`)
- **Rejected**: LangChain, LlamaIndex, raw LLM calls
- **Reason**: Native multi-agent, working memory, tool use, TypeScript-first
- **Concepts used**: `Agent` class, `agent.generate()`, sequential orchestration

## Decision 6: MongoDB over PostgreSQL

- **Chosen**: MongoDB (Atlas free M0 = 512MB)
- **Rejected**: PostgreSQL/Supabase
- **Reason**: Document-shaped data (personas, chat messages), flexible schema, Mongoose TS support

## Decision 7: JWT in httpOnly Cookies

- **Chosen**: JWT stored in httpOnly cookies (set by backend)
- **Rejected**: localStorage JWT, session tokens
- **Reason**: Prevents XSS token theft. Backend sets `Set-Cookie`; frontend uses `credentials: 'include'`

## Decision 8: Turborepo

- **Chosen**: Turborepo with npm workspaces
- **Rejected**: Nx, Lerna
- **Reason**: Near-zero config, excellent caching, simplest mental model

## Decision 9: shadcn/ui + Tailwind CSS

- **Chosen**: shadcn/ui (copies components into project, no runtime dep)
- **Rejected**: Material UI, Chakra UI
- **Reason**: Full customizability, Tailwind-based, pairs with Next.js App Router

## Decision 10: Port Assignments

- **API (Express)**: Port 5006
- **Web (Next.js)**: Port 3000
- **Why**: Next.js defaults to 3000, API gets 5006 to avoid conflicts

## Decision 11: Flexible Content Generation (3+ Modes) — 2026-02-21

- **Modes**: `profile`, `topic-focus`, `chat-refined`, `trend-selected`, `persona-topics`
- **Why**: Users have different needs each session
- **Stateless refine-context**: `POST /api/suggestions/refine-context` — frontend owns chat history
- **Context passthrough**: `IGenerateContextOptions` threaded from frontend → route → pipeline → prompt

## Decision 12: Hidden-Block Pattern for Structured AI Output — 2026-02-21

- **Pattern**: `<!--BLOCK_NAME {...json...} BLOCK_NAME-->` in LLM response
- **Why**: LLM returns human-readable text AND structured data in single response
- **Used in**: Onboarding (`INTERVIEW_DATA`), refine-context (`CONTEXT_SUMMARY`), persona-chat (`PERSONA_CHANGES`)
- **Extraction**: Regex match → JSON.parse. Stripping: regex replace removes block from visible reply.

## Decision 13: Persona Chat with User-Approved Changes — 2026-02-21

- **Pattern**: AI proposes → user reviews → user explicitly applies (2-step)
- **Why**: Persona is critical data; auto-applying could corrupt carefully crafted personas
- **Flow**: `pendingChanges` in response → `PendingChangesCard` → user clicks Apply → `POST /api/persona-chat/apply-changes`

## Decision 14: Rich Content Brief in Each Suggestion — 2026-02-21

- **Added fields**: `seoKeywords[]`, `clickbaitHooks[]`, `postPointers[]`, `callToAction`
- **Why**: Users need a complete brief, not just an idea. Removes "blank page" problem.
- **Backward compat**: All new fields default to `[]` / `''`

## Decision 15: Scoring & Balanced Selection — 2026-02-26

- **File**: `apps/api/src/utils/scoring.ts`
- **Why**: Without scoring, the trendResearch agent would pass all raw items to the LLM (slow, noisy). Scoring pre-filters by persona relevance.
- **Heuristic fast path**: When ≥4 items score ≥3, skip LLM entirely and return deterministically (saves tokens + latency)
- **Balanced selection**: `selectBalancedTrends()` ensures content pillars are evenly represented
- **Stale penalty**: Items matching `recentTrends` get score reduced to avoid repetition

## Decision 16: Feedback Learning Loop — 2026-02-26

- **Services**: `feedbackProcessor.ts` + `personaLearning.ts`
- **Flow**: User rates suggestion → `SuggestionFeedback` saved → `feedbackProcessor` extracts signals (fire-and-forget) → `aggregateAndUpdatePersona` writes to `UserPersona.feedbackProfile`
- **Signal weights**: `published=2.0×`, `draft=1.5×`, `saved=1.2×`, `dismissed=1.0×`
- **Recency decay**: Exponential decay with 14-day half-life
- **Injection**: `buildFeedbackSection()` in contentGenerator adds feedback data to LLM prompt

## Decision 17: Post Editor & AI Co-Writing — 2026-02-26

- **Agent**: `postEditor.ts` (Agent 6)
- **Draft model**: `PostDraft` with `contentHistory[]` for version tracking
- **AI Chat**: `EditorChatPane.tsx` — AI suggests edits via `<!--POST_CONTENT-->` hidden block
- **AI Detection**: Heuristic scoring in `aiDetection.ts` — no external API needed
- **Humanizer**: LLM-based rewriting with configurable intensity (light/moderate/aggressive)

## Decision 18: Admin Dashboard — 2026-02-26

- **Route**: `admin.ts` with admin middleware (`adminAuth.ts`)
- **First-run setup**: `adminSeed.ts` creates initial admin from env vars
- **Features**: User management, analytics overview, token request approval, audit log
- **Token limits**: Per-user configurable. `null` = unlimited.

## Decision 19: Domain-Aware Trend Fetching — 2026-03-04

- **Problem**: All RSS feeds were tech-only (TechCrunch, VentureBeat, etc.). HN is inherently a tech community. Non-tech users (yoga, legal, food) got irrelevant results.
- **Solution**: `classifyDomain()` function classifies user into 14 domain categories. Each domain has its own curated RSS feed pool. HN is skipped for non-tech domains.
- **Scope**: `trends.ts` (classification + feeds + fetch logic), `trendResearch.ts` (domain-aware scoring + templates + agent prompts), all `researchTrendsForUser` call sites pass `tone`.
- **Content angle templates**: Tech domains get "practitioners/teams" language; non-tech get "people in/journey/professional" language via `getAngleTemplates(domain)`.

## Decision 20: Trend-Content Anchoring — 2026-03-04

- **Problem**: Content generator treated trends as "inspiration" and generated ideas about the creator's general expertise instead of the provided trends.
- **Solution**: Added CRITICAL RULE to agent instructions that every idea MUST be anchored to a provided trend. Relabeled prompt section to "TRENDING TOPICS TO BASE IDEAS ON". Added `trendAnchorDirective` to enforce constraint.
- **File**: `agents/contentGenerator.ts`
