# Architecture & Technology Decisions Log
# Reference this when unsure about any choice made in this project

---

## Decision 1: Express (user requested)
- **Chosen**: Express
- **Originally considered**: Hono
- **Reason**: User explicitly requested Express over Hono on 2026-02-20.
- **Impact**: `apps/api/src/index.ts` uses `express()` + standard middleware
- **Swagger**: Use `swagger-ui-express` + `swagger-jsdoc` for docs
- **Packages**: express, cors, cookie-parser, @types/express, @types/cors, @types/cookie-parser

## Decision 2: Gemini over OpenAI/Anthropic in Mastra
- **Chosen**: Google Gemini (gemini-2.5-flash or gemini-2.5-flash)
- **Rejected**: OpenAI GPT-4, Anthropic Claude
- **Reason**: Free tier available at ai.google.dev with no credit card needed.
  The user does not need to pay anything to run this app.
- **Mastra config**: Use `@ai-sdk/google` provider in Mastra agent definitions
- **Model ID**: `google('gemini-2.5-flash')` or `google('gemini-2.5-flash')`

## Decision 3: Puppeteer for LinkedIn Scraping
- **Chosen**: Puppeteer
- **Rejected**: linkedin-api (requires LinkedIn credentials), RapidAPI (paid)
- **Reason**: No API key needed. Puppeteer controls a real browser so it can
  render JavaScript-heavy LinkedIn pages.
- **Caveat**: LinkedIn actively blocks scrapers. Implementation includes:
  - Random delays between actions (1-3 seconds)
  - User-agent spoofing
  - Headless: false in production to avoid detection
  - Fallback: If scraping fails, user pastes posts manually
- **File**: `apps/api/src/services/linkedin.ts`

## Decision 4: Real-API Trend Fetching (replaces LLM-hallucinated trends) — updated 2026-02-21
- **History**: google-trends-api v4.9.2 broken on 2026-02-20 (endpoints dead/blocked)
- **Interim fix**: Replaced with Gemini `generateText` (LLM hallucinated trends — no real data)
- **Final fix on 2026-02-21**: Replaced with real live API sources — no LLM hallucination

### Data Sources (3-tier, highest quality first)

**Tier 1 — Tavily** (when `TAVILY_API_KEY` is set)
- AI-optimised web search engine built for AI agents
- `topic: "news"`, `time_range: "week"` — real articles from the past 7 days
- Returns relevance-scored results for the user's exact niche keywords
- npm: `@tavily/core`, Free: 1,000 searches/month

**Tier 2 — Hacker News Algolia + RSS Feeds** (always-on, zero API keys)
- **HN Algolia** (`hn.algolia.com/api/v1/search_by_date`):
  - No API key, ~10,000 req/hour, completely free
  - Filters by `points>10` to ensure community-validated quality
  - Best for: AI/ML, SaaS, startup, engineering, product management topics
- **RSS Feeds** (curated 6 sources):
  - TechCrunch, HBR, VentureBeat, Fast Company, MIT Tech Review, Inc. Magazine
  - No keys, no rate limits, plain HTTP fetch via `rss-parser` npm package
  - Feed selection is dynamic: top 3 feeds by keyword relevance score are chosen per request
  - Best for: business, leadership, marketing, innovation, entrepreneurship

**Tier 3 — Evergreen fallback** (no network call)
- Returns content-pillar-based topics if all APIs fail
- Ensures the pipeline never blocks on trend fetch errors

### Architecture change
- `fetchRealTrendingContent(keywords, industry, geo)` — new main export, returns `RawTrendItem[]`
  with `title`, `url`, `source`, `score`, `publishedAt` from real articles
- `getTrendingTopics` / `getDailyTrends` kept as deprecated compatibility wrappers
- `trendResearchAgent` role changed: it now receives REAL article titles and is instructed
  NOT to invent topics — only filter + enrich the real data with LinkedIn angles
- All 3 sources (Tavily + HN + RSS) called in parallel via `Promise.all` for speed
- Deduplication by title normalisation; ranked by score then source quality

### New packages
- `rss-parser@3.13.0` — parses RSS/Atom feeds, ships TS types, no key needed
- `@tavily/core@0.7.1` — official Tavily client, optional (only used if key set)

### Files changed
- `apps/api/src/services/trends.ts` — full rewrite with real API sources
- `apps/api/src/agents/trendResearch.ts` — updated prompt to receive real article titles
- `apps/api/package.json` — added `rss-parser` and `@tavily/core`
- `.env.example` — updated Tavily comment to reflect new role

## Decision 5: Mastra AI for Multi-Agent Orchestration
- **Chosen**: Mastra AI (`@mastra/core`)
- **Rejected**: LangChain, LlamaIndex, raw LLM calls
- **Reason**: Mastra provides:
  - Native multi-agent support with supervisor pattern
  - Built-in working memory that persists between sessions
  - Tool use abstraction
  - TypeScript-first SDK
  - No vendor lock-in (works with any LLM provider)
- **Key Mastra concepts used**:
  - `Agent` class for each of the 4 agents
  - `MastraMemory` with MongoDB adapter for persistent working memory
  - `Tool` for LinkedIn scraper and trends API wrappers
  - Orchestrator uses `agent.generate()` calls in sequence

## Decision 6: MongoDB over PostgreSQL
- **Chosen**: MongoDB (Atlas free M0 = 512MB)
- **Rejected**: PostgreSQL (Supabase free tier)
- **Reason**: Persona data and chat messages are naturally document-shaped.
  Schema evolves as we learn what LinkedIn scraping returns. Mongoose provides
  good TypeScript support. Atlas M0 is genuinely free forever.
- **Collections**: `users`, `user_personas`, `chat_sessions`, `content_suggestions`

## Decision 7: JWT in httpOnly Cookies
- **Chosen**: JWT stored in httpOnly cookies (set by backend)
- **Rejected**: localStorage JWT, session tokens
- **Reason**: httpOnly cookies prevent XSS attacks from stealing tokens.
  The backend sets `Set-Cookie` header; frontend never touches the raw JWT.
- **Implementation**: `cookie-parser` middleware on backend, credentials:include on frontend fetch

## Decision 8: Turborepo
- **Chosen**: Turborepo
- **Rejected**: Nx, Lerna, simple npm workspaces
- **Reason**: Turborepo has near-zero config overhead, excellent caching,
  and the simplest mental model. It wraps npm/pnpm workspaces.
- **Package manager**: npm (not pnpm/yarn — keep it simple)
- **turbo.json**: Defines `build`, `dev`, `lint` pipelines

## Decision 9: shadcn/ui over Material UI / Chakra
- **Chosen**: shadcn/ui + Tailwind CSS
- **Rejected**: Material UI, Chakra UI, Ant Design
- **Reason**: shadcn/ui copies components into the project (no runtime dependency),
  fully customizable, Tailwind-based, pairs perfectly with Next.js App Router.
- **Setup**: `npx shadcn@latest init` inside apps/web

## Decision 10: Port Assignments
- **API (Hono)**: Port 3001
- **Web (Next.js)**: Port 3000
- **Why 3001 for API**: Next.js defaults to 3000, so API gets 3001 to avoid conflicts
- **In .env**: `PORT=3001`, `NEXT_PUBLIC_API_URL=http://localhost:3001`

## Decision 11: Flexible Content Generation (3 Modes) — 2026-02-21
- **Chosen approach**: Pre-generate options panel with 3 modes: profile, topic-focus, chat-refined
- **Why 3 modes**: Users have wildly different needs each session — sometimes they want
  full-persona generation, sometimes they want to focus on a specific niche, sometimes they
  want to clarify their thinking via chat first before generating
- **Stateless refine-context endpoint**: Single `POST /api/suggestions/refine-context` that
  receives full messages array — no session management needed, frontend owns the history
- **Context passthrough**: `IGenerateContextOptions` interface threaded from frontend →
  route → pipeline → generateContentIdeas → prompt. Agent gets a `## GENERATION CONTEXT OVERRIDE`
  section added to the prompt with mode-specific guidance
- **Files**: `suggestions.ts` route, `contentGenerator.ts`, `mastra.ts`, `GenerateOptionsPanel.tsx`

## Decision 12: Hidden-Block Pattern for Structured AI Output — 2026-02-21
- **Pattern**: `<!--BLOCK_NAME {...json...} BLOCK_NAME-->` embedded in LLM response
- **Why**: Allows the LLM to return both human-readable text AND structured data in a
  single response without needing strict JSON-only output (which LLMs often fail at)
- **Already used in**: onboarding agent (`<!--INTERVIEW_DATA-->`) and refine-context route (`<!--CONTEXT_SUMMARY-->`)
- **Extended to**: persona-chat agent (`<!--PERSONA_CHANGES-->`)
- **Extraction**: Regex match `/<BLOCK_START\s*([\s\S]*?)\s*BLOCK_END>/` then JSON.parse
- **Stripping**: Regex replace removes the block from the visible reply

## Decision 13: Persona Chat with User-Approved Changes — 2026-02-21
- **Pattern**: AI proposes changes → user reviews → user explicitly applies (2-step)
- **Why not auto-apply**: Persona is critical data. Auto-applying AI suggestions could
  overwrite carefully crafted personas with incorrect interpretations.
- **Implementation**: `pendingChanges` returned in chat response → `PendingChangesCard`
  shown in frontend → user clicks Apply → `POST /api/persona-chat/apply-changes`
- **Partial updates**: Only fields present in `changes` object are updated via MongoDB `$set`
- **Files**: `personaChat.ts` agent, `personaChat.ts` routes, `profile/page.tsx`, `PendingChangesCard.tsx`

## Decision 14: Rich Content Brief in Each Suggestion — 2026-02-21
- **Added fields**: `seoKeywords[]`, `clickbaitHooks[]`, `postPointers[]`, `callToAction`
- **Why**: Users need a complete content brief they can immediately use to write the post,
  not just an idea. The brief removes the "blank page" problem.
- **Backward compat**: All new fields default to `[]` / `''` in Mongoose so existing
  documents without these fields don't break
- **Agent prompt**: Extended with concrete full example showing all 9 fields filled out
- **UI**: Expandable "Full Content Brief" section in SuggestionCard with a "Copy Full Brief"
  button that formats all fields into a clean copyable text block
