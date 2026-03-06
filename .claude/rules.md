# Development Rules & Conventions

> Read this to understand how this codebase works and avoid common pitfalls.
> Last synced: 2026-03-06

---

## 1. Immutable Constraints

These are non-negotiable. The user explicitly chose them:

| Rule | Detail |
|---|---|
| Backend is **Express** | NOT Hono. Switched 2026-02-20. |
| LLM is **Gemini** | NOT OpenAI, NOT Claude API. Uses `@ai-sdk/google`. |
| Scraper is **Puppeteer** | NOT linkedin-api, NOT RapidAPI. |
| Auth is **JWT in httpOnly cookies** | NOT localStorage. Backend sets `Set-Cookie`. |
| DB is **MongoDB** | NOT PostgreSQL. Mongoose ODM. |
| Ports: API=**5006**, Web=**3000** | |
| Secrets via `process.env.VAR` | NEVER hardcoded. |

---

## 2. Code Patterns

### Hidden-Block Pattern
LLM agents return structured data embedded in natural text:
```
<!--BLOCK_NAME {"key":"value"} BLOCK_NAME-->
```
Extract with regex, parse JSON, strip from visible reply. Used by 4 agents.

### Fire-and-Forget
Side effects that shouldn't block the response. Always use the `fireAndForget()` wrapper:
```typescript
import { fireAndForget } from "../utils/fireAndForget";

// DO: use wrapper for safe fire-and-forget
fireAndForget(() => trackTokenUsage({ userId, agent: "...", ... }), "token-tracking");
fireAndForget(() => processFeedback(feedbackDoc), "feedback-processing");

// DON'T: await these in the request handler
await trackTokenUsage(...); // blocks response unnecessarily
// DON'T: raw fire-and-forget without wrapper (swallows errors silently)
trackTokenUsage(...); // no error logging
```

### Constants from Config
All magic numbers are centralized in `config/constants.ts`:
```typescript
import { SCORING, LEARNING, PIPELINE, GENERATION, CACHE, LIMITS } from "../config/constants";
// SCORING.BASE_SCORE, PIPELINE.STEP_TIMEOUTS.PERSONA, CACHE.L1_CACHE_TTL_MS, etc.
```

### Circuit Breaker
The Gemini API pipeline uses a circuit breaker (`utils/circuitBreaker.ts`):
- **CLOSED**: Normal operation. Tracks consecutive failures.
- **OPEN**: After 5 failures, blocks all requests for 60s (fail-fast).
- **HALF_OPEN**: After cooldown, allows 1 test request. Success → CLOSED, failure → OPEN.

### Rate Limiting
Per-user rate limits applied via `middleware/rateLimit.ts`:
- `generationLimiter`: 5 req/min (generation endpoints)
- `chatLimiter`: 20 req/min (chat/refine endpoints)
- `aiCheckLimiter`: 10 req/min (AI detection/humanize endpoints)
Key: `req.userId` (after `authenticate` middleware).

### Domain Classification
`classifyDomain(industry, topics)` returns one of 14 `DomainCategory` values.
This determines:
- Which RSS feed pool to use (`DOMAIN_RSS_FEEDS`)
- Whether to query HN (`TECH_ADJACENT_DOMAINS` set)
- Which content angle template language to use
- What broad fallback query to use

### Scoring & Heuristic Fast Path
`scoreAndRankTrends()` pre-filters items by persona relevance.
When ≥4 items score ≥3, the heuristic path skips the LLM entirely → faster, no tokens used.
`selectBalancedTrends()` ensures content pillars are evenly represented.

### Trend-Content Anchoring
Content generator has a CRITICAL RULE: every idea MUST connect to a provided trend.
The persona tells the agent HOW to write (voice/style); trends tell WHAT to write about.
Never let the agent drift into the persona's general expertise.

---

## 3. File Organization

### Where things go

| Type | Location | Convention |
|---|---|---|
| New agent | `apps/api/src/agents/` | One file per agent. Register in `mastra.ts`. |
| New service | `apps/api/src/services/` | Business logic, external API wrappers. |
| New route | `apps/api/src/routes/` | One file per resource group. Register in `index.ts`. |
| New model | `apps/api/src/models/` | Mongoose schema. Add interface to `packages/shared-types/`. |
| New config constant | `apps/api/src/config/constants.ts` | Add to existing group or create new group. |
| New middleware | `apps/api/src/middleware/` | Per-request processing (auth, rate-limit, etc.). |
| New util | `apps/api/src/utils/` | Pure functions, no side effects. |
| New page | `apps/web/src/app/` | Next.js App Router convention. |
| New component | `apps/web/src/components/<category>/` | Group by feature domain. |
| Shared types | `packages/shared-types/src/index.ts` | ALL shared interfaces in one file. |

### Naming conventions

- Models: PascalCase (`UserPersona.ts`)
- Routes: camelCase (`personaChat.ts`)
- Services: camelCase (`feedbackProcessor.ts`)
- Components: PascalCase (`SuggestionCard.tsx`)
- Types/Interfaces: `I` prefix for interfaces (`IUserPersona`), type aliases without prefix (`PostFormat`)

---

## 4. Adding New Features

### New API endpoint
1. Add route in appropriate `apps/api/src/routes/<resource>.ts`
2. Add Swagger JSDoc comments above the route handler
3. If new data shape, add interface to `packages/shared-types/src/index.ts`
4. If new collection, create Mongoose model in `apps/api/src/models/`
5. Register route in `apps/api/src/index.ts` if it's a new route file

### New agent
1. Create agent file in `apps/api/src/agents/`
2. Use `new Agent({ id, name, model: google('gemini-2.5-flash'), instructions })` pattern
3. Export the agent AND a `run<AgentName>()` helper function
4. Register in `agents/mastra.ts` agent map
5. If it has a chat interface, create a ChatSession `agentType` entry

### New frontend page
1. Create page in `apps/web/src/app/<path>/page.tsx`
2. Add API client function in `apps/web/src/lib/api.ts`
3. If protected, ensure `middleware.ts` routes are correct
4. Add navigation link in `components/layout/Navbar.tsx`

---

## 5. Common Pitfalls

### Things I've gotten wrong before

| Pitfall | Correct approach |
|---|---|
| Saying "Hono" anywhere | It's **Express**. Changed 2026-02-20. |
| Using `google-trends-api` | Dead. Use `fetchRealTrendingContent()` in `services/trends.ts`. |
| Listing only 4 agents | There are **6** agents + orchestrator. |
| Hardcoding tech RSS feeds | Use `DOMAIN_RSS_FEEDS[domain]` — 14 domain categories. |
| HN for all domains | Only `tech`, `business`, `finance`, `general` query HN. |
| Content ideas ignoring trends | Trend-content anchoring CRITICAL RULE in contentGenerator. |
| Awaiting fire-and-forget calls | Use `fireAndForget()` wrapper — never `await` these. |
| Raw fire-and-forget without wrapper | Always use `fireAndForget(fn, label)` for error logging. |
| Inline magic numbers | Use `config/constants.ts` — all numbers centralized. |
| Modifying `packages/shared-types` without rebuilding | Run `npm run build` in root or restart dev server. |
| Using `useSearchParams()` without Suspense | Next.js 14 requires wrapping in `<Suspense>` boundary. |
| Forgetting to pass `domain` to fetch functions | `fetchRealTrendingContent` auto-classifies if not passed. |

### Type checking
Always verify after changes:
```bash
npx tsc --noEmit --project apps/api/tsconfig.json
```

---

## 6. Error Handling

- All route handlers use try/catch with `next(err)` for unhandled errors
- Global `errorHandler` middleware in `middleware/errorHandler.ts` catches and formats
- Agent failures return fallback results (never crash the pipeline)
- RSS feed failures handled by `Promise.allSettled` (individual feed failure doesn't block others)
- Trend fetch failures fall through tiers: Tavily → HN+RSS → Google News → Evergreen

---

## 7. Token Usage & Limits

- Every agent call tracked via `trackTokenUsage()` (fire-and-forget via `fireAndForget()`)
- Users have configurable `tokenLimit` (null = use SystemConfig default)
- `checkTokenQuota()` MUST be awaited before any expensive AI call
- Grace buffer: `allowed = tokensUsed < tokenLimit * 1.1` (10% grace)
- Admin can approve/reject token increase requests
- Frontend rechecks quota before starting generation (dashboard `handleGenerate`)

---

## 8. Testing Approach

- No automated test suite currently (manual testing)
- TypeScript compiler (`tsc --noEmit`) is the primary static check
- Swagger UI at `/api/docs` for API endpoint testing
- Dev servers via `npm run dev` or `.claude/launch.json` preview configs
- After any agent/service change, manually test the affected generation mode

---

## 9. Current State & Known Areas for Improvement

### Working well
- Full 6-agent pipeline with 5 generation modes
- Domain-aware trend fetching across 14 categories with deduplication
- Two-tier trend caching (L1 in-memory + L2 MongoDB)
- Feedback learning loop with explicit + implicit signals + performance weighting
- Writing DNA: deterministic voice fingerprint (15+ metrics)
- Persona confidence scoring (5-dimension, 0-100)
- Content series detection and continuation suggestions
- Scheduling hints based on domain and posting time data
- Post editor with AI co-writing + AI detection
- Admin dashboard with user management
- Per-user rate limiting (generation, chat, AI-check)
- Pipeline reliability: circuit breaker, step timeouts, exponential backoff
- Audience engagement tracking with prompt signal injection
- Persona evolution timeline with diff visualization
- Suggestion set comparison view
- Quick regeneration with per-suggestion refinements
- A/B test framework for future experimentation
- Competitor/peer awareness (MVP — topic differentiation)

### Areas for future work
- Automated test suite (unit + integration)
- WebSocket for real-time generation progress
- More RSS feeds per domain (some categories have untested feeds)
- Mobile-responsive improvements
- Export/import personas
- LinkedIn OAuth for automated audience data (currently manual)
- Personalized scheduling hints (currently domain-average)
- A/B test analysis dashboard (framework in place, UI needed)
- Redis store for rate limiting in multi-instance deployments
