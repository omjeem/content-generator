# Project Context — Quick Reference

> Last synced: 2026-03-06

---

## Project Identity

- **Name**: LinkedIn AI Content Suggestion Agent
- **Type**: Full-stack Applied AI — Multi-Agent Pipeline
- **Working Directory**: `/Users/hexahealth/Documents/PP/content-generator/`
- **Monorepo**: Turborepo with npm workspaces
- **Status**: All 7 build phases complete. Now in continuous improvement.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | Turborepo | `turbo.json` defines build/dev/lint pipelines |
| Backend | **Express** + TypeScript | Port 5006. Switched from Hono on 2026-02-20 |
| AI Framework | Mastra AI (`@mastra/core`) | 6 agents + orchestrator |
| LLM | **Gemini 2.5 Flash** (`@ai-sdk/google`) | Free tier, no credit card |
| Trends | Multi-tier real APIs | Tavily → HN Algolia → Domain RSS → Google News → Evergreen |
| LinkedIn | Puppeteer | With manual paste fallback |
| Database | MongoDB + Mongoose | Atlas free M0. 13 collections |
| Auth | JWT in httpOnly cookies | bcrypt + jsonwebtoken + cookie-parser |
| Frontend | Next.js 14 App Router | Port 3000. Tailwind + shadcn/ui |
| API Docs | swagger-ui-express | `GET /api/docs` |

---

## Environment Variables

```env
GEMINI_API_KEY=          # https://ai.google.dev (free)
MONGODB_URI=             # Atlas M0 cluster
JWT_SECRET=              # 64-char random string
TAVILY_API_KEY=          # https://tavily.com (optional, free 1000/mo)
PORT=5006
NEXT_PUBLIC_API_URL=http://localhost:5006
```

---

## 6-Agent Pipeline

| # | Agent | File | Input | Output |
|---|---|---|---|---|
| 1 | Persona Analyst | `agents/personaAnalyst.ts` | LinkedIn URL / pasted posts | UserPersona in MongoDB |
| 2 | Onboarding | `agents/onboarding.ts` | Chat messages | Interview answers → UserPersona |
| 3 | Trend Research | `agents/trendResearch.ts` | Persona industry + topics | Scored + enriched trends |
| 4 | Content Generator | `agents/contentGenerator.ts` | Persona + trends + context | 5-10 suggestion briefs |
| 5 | Persona Chat | `agents/personaChat.ts` | Chat messages + persona | Proposed persona changes |
| 6 | Post Editor | `agents/postEditor.ts` | Draft + brief + chat | AI co-writing assistance |

**Orchestrator**: `agents/mastra.ts` — sequences Agents 1→2→3→4 for full pipeline run.

---

## MongoDB Collections (13)

| Collection | Model File | Purpose |
|---|---|---|
| `users` | `User.ts` | Auth accounts (email, bcrypt password, role, token limits) |
| `user_personas` | `UserPersona.ts` | LinkedIn profile analysis, interview answers, feedback profile, writingDNA, confidence score, peer insights |
| `chat_sessions` | `ChatSession.ts` | Onboarding / persona-chat / post-editor conversation history |
| `content_suggestions` | `ContentSuggestion.ts` | Generated suggestion sets with rich briefs, scheduling hints, series tags, A/B test data |
| `suggestion_feedbacks` | `SuggestionFeedback.ts` | Per-suggestion rating + action feedback |
| `post_drafts` | `PostDraft.ts` | Co-writing drafts with version history + performance data |
| `token_usage_logs` | `TokenUsageLog.ts` | Per-agent token consumption tracking |
| `token_requests` | `TokenRequest.ts` | User requests for more tokens |
| `admin_audit_logs` | `AdminAuditLog.ts` | Admin action audit trail |
| `system_configs` | `SystemConfig.ts` | Platform-wide settings |
| `refresh_tokens` | `RefreshToken.ts` | JWT refresh token storage |
| `trend_caches` | `TrendCache.ts` | Persistent L2 trend cache (30-min TTL index) |
| `audience_insights` | `AudienceInsight.ts` | Per-post audience engagement tracking |

---

## API Routes (11 route files)

| Route File | Mount Point | Key Endpoints |
|---|---|---|
| `auth.ts` | `/api/auth` | register, login, logout, me, refresh |
| `persona.ts` | `/api/persona` | analyze, get, add-posts, posts, history, peers |
| `onboarding.ts` | `/api/onboarding` | chat, session, status |
| `trends.ts` | `/api/trends` | get trends, discover (browseable) |
| `suggestions.ts` | `/api/suggestions` | generate, refine-context, list, get, topic-ideas, generate-from-topic, regenerate |
| `personaChat.ts` | `/api/persona-chat` | chat, apply-changes, history, persona |
| `feedback.ts` | `/api/feedback` | submit, get, implicit, reset |
| `drafts.ts` | `/api/drafts` | CRUD, editor-chat, ai-check, humanize, performance |
| `tokenUsage.ts` | `/api/token-usage` | summary, request-increase |
| `admin.ts` | `/api/admin` | users, analytics, token-requests, audit-log |
| `audience.ts` | `/api/audience` | record, insights |

---

## Frontend Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | Root redirect | → `/dashboard` if logged in, else `/login` |
| `/login` | Login | Email + password form |
| `/register` | Register | Name + email + password form |
| `/onboarding` | Onboarding | Step 1: LinkedIn URL/paste. Step 2: Chat interview |
| `/dashboard` | Dashboard | Generate ideas (5 modes) + browse trends + suggestion cards + confidence badge + feedback summary + performance notifications |
| `/dashboard/profile` | Profile | View persona + AI strategy chat + pending changes + feedback insights |
| `/dashboard/profile/evolution` | Evolution Timeline | Persona version history with diffs and triggers |
| `/dashboard/suggestions` | History | Full history of suggestion sets + compare action |
| `/dashboard/suggestions/compare` | Compare Sets | Side-by-side comparison of any 2 suggestion sets |
| `/dashboard/suggestions/[id]/editor` | Post Editor | Co-writing editor with AI chat + AI detection |
| `/admin/*` | Admin | User management, analytics, token requests, audit log |

---

## Key Services (19)

| Service | File | Purpose |
|---|---|---|
| LinkedIn Scraper | `services/linkedin.ts` | Puppeteer-based profile scraping |
| Trend Fetcher | `services/trends.ts` | Multi-tier domain-aware trend fetching with deduplication |
| Trend Cache | `services/trendCache.ts` | Two-tier caching: L1 in-memory (5-min) + L2 MongoDB (30-min TTL) |
| Discovery Cache | `services/trendDiscoveryCache.ts` | Per-user trend discovery session cache |
| Feedback Processor | `services/feedbackProcessor.ts` | Fire-and-forget feedback signal extraction |
| Persona Learning | `services/personaLearning.ts` | Aggregates feedback → updates UserPersona.feedbackProfile (+ implicit signals) |
| Draft Service | `services/draftService.ts` | Draft CRUD + version history management |
| AI Detection | `services/aiDetection.ts` | Heuristic AI-content scoring + humanization |
| Token Usage | `services/tokenUsage.ts` | Per-agent token tracking + limit enforcement |
| Health Check | `services/healthCheck.ts` | MongoDB + external API health monitoring |
| Persona Merge | `services/personaMerge.ts` | Incremental persona analysis for added posts |
| Admin Seed | `services/adminSeed.ts` | First-run admin account creation |
| Writing DNA | `services/writingDNA.ts` | Deterministic writing pattern extraction (15+ metrics, no LLM) |
| Persona Confidence | `services/personaConfidence.ts` | 5-dimension confidence score calculator (0-100) |
| Scheduling Hints | `services/schedulingHints.ts` | Domain-based optimal posting time lookup (14 categories) |
| Content Continuity | `services/contentContinuity.ts` | Content series detection via keyword clustering |
| Audience Tracker | `services/audienceTracker.ts` | Audience engagement tracking + prompt signal builder |
| Performance Tracker | `services/performanceTracker.ts` | Performance-weighted learning from published post outcomes |
| A/B Test | `services/abTest.ts` | A/B test framework (10% enrollment, shadow results) |

---

## Critical Rules

1. **Express not Hono** — switched 2026-02-20
2. **Gemini not OpenAI** — via `@ai-sdk/google`
3. **JWT in httpOnly cookies** — never expose tokens to JS
4. **Ports**: API=5006, Web=3000
5. **Never hardcode secrets** — always `process.env.VAR`
6. **MongoDB collections**: see table above (13 collections)
7. **Domain-aware trends** — `classifyDomain()` routes to appropriate RSS pools; HN skipped for non-tech domains
8. **Constants from config** — all magic numbers in `config/constants.ts`, not inline
9. **Fire-and-forget via wrapper** — use `fireAndForget(fn, label)` from `utils/fireAndForget.ts`
10. **Rate limiting** — generation (5/min), chat (20/min), AI-check (10/min) via `middleware/rateLimit.ts`

---

## For Deep Architecture Details

→ See `.claude/architecture.md` for full LLD with flow diagrams
→ See `.claude/decisions.md` for all tech decisions with rationale
→ See `.claude/rules.md` for development conventions and patterns
