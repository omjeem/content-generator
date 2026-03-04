# Project Context — Quick Reference

> Last synced: 2026-03-04

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
| Database | MongoDB + Mongoose | Atlas free M0. 11 collections |
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

## MongoDB Collections (11)

| Collection | Model File | Purpose |
|---|---|---|
| `users` | `User.ts` | Auth accounts (email, bcrypt password, role, token limits) |
| `user_personas` | `UserPersona.ts` | LinkedIn profile analysis, interview answers, feedback profile |
| `chat_sessions` | `ChatSession.ts` | Onboarding / persona-chat / post-editor conversation history |
| `content_suggestions` | `ContentSuggestion.ts` | Generated suggestion sets with rich briefs |
| `suggestion_feedbacks` | `SuggestionFeedback.ts` | Per-suggestion rating + action feedback |
| `post_drafts` | `PostDraft.ts` | Co-writing drafts with version history |
| `token_usage_logs` | `TokenUsageLog.ts` | Per-agent token consumption tracking |
| `token_requests` | `TokenRequest.ts` | User requests for more tokens |
| `admin_audit_logs` | `AdminAuditLog.ts` | Admin action audit trail |
| `system_configs` | `SystemConfig.ts` | Platform-wide settings |
| `refresh_tokens` | `RefreshToken.ts` | JWT refresh token storage |

---

## API Routes (10 route files)

| Route File | Mount Point | Key Endpoints |
|---|---|---|
| `auth.ts` | `/api/auth` | register, login, logout, me, refresh |
| `persona.ts` | `/api/persona` | analyze, get, add-posts, posts, history |
| `onboarding.ts` | `/api/onboarding` | chat, session, status |
| `trends.ts` | `/api/trends` | get trends, discover (browseable) |
| `suggestions.ts` | `/api/suggestions` | generate, refine-context, list, get, topic-ideas, generate-from-topic |
| `personaChat.ts` | `/api/persona-chat` | chat, apply-changes, history, persona |
| `feedback.ts` | `/api/feedback` | submit, get for suggestion |
| `drafts.ts` | `/api/drafts` | CRUD, editor-chat, ai-check, humanize |
| `tokenUsage.ts` | `/api/token-usage` | summary, request-increase |
| `admin.ts` | `/api/admin` | users, analytics, token-requests, audit-log |

---

## Frontend Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | Root redirect | → `/dashboard` if logged in, else `/login` |
| `/login` | Login | Email + password form |
| `/register` | Register | Name + email + password form |
| `/onboarding` | Onboarding | Step 1: LinkedIn URL/paste. Step 2: Chat interview |
| `/dashboard` | Dashboard | Generate ideas (3 modes) + browse trends + suggestion cards |
| `/dashboard/profile` | Profile | View persona + AI strategy chat + pending changes |
| `/dashboard/suggestions` | History | Full history of suggestion sets |
| `/dashboard/suggestions/[id]/editor` | Post Editor | Co-writing editor with AI chat + AI detection |
| `/admin/*` | Admin | User management, analytics, token requests, audit log |

---

## Key Services

| Service | File | Purpose |
|---|---|---|
| LinkedIn Scraper | `services/linkedin.ts` | Puppeteer-based profile scraping |
| Trend Fetcher | `services/trends.ts` | Multi-tier domain-aware trend fetching |
| Trend Cache | `services/trendCache.ts` | 30-min in-memory cache for trend results |
| Discovery Cache | `services/trendDiscoveryCache.ts` | Per-user trend discovery session cache |
| Feedback Processor | `services/feedbackProcessor.ts` | Fire-and-forget feedback signal extraction |
| Persona Learning | `services/personaLearning.ts` | Aggregates feedback → updates UserPersona.feedbackProfile |
| Draft Service | `services/draftService.ts` | Draft CRUD + version history management |
| AI Detection | `services/aiDetection.ts` | Heuristic AI-content scoring + humanization |
| Token Usage | `services/tokenUsage.ts` | Per-agent token tracking + limit enforcement |
| Health Check | `services/healthCheck.ts` | MongoDB + external API health monitoring |
| Persona Merge | `services/personaMerge.ts` | Incremental persona analysis for added posts |
| Admin Seed | `services/adminSeed.ts` | First-run admin account creation |

---

## Critical Rules

1. **Express not Hono** — switched 2026-02-20
2. **Gemini not OpenAI** — via `@ai-sdk/google`
3. **JWT in httpOnly cookies** — never expose tokens to JS
4. **Ports**: API=5006, Web=3000
5. **Never hardcode secrets** — always `process.env.VAR`
6. **MongoDB collections**: see table above (11 collections)
7. **Domain-aware trends** — `classifyDomain()` routes to appropriate RSS pools; HN skipped for non-tech domains

---

## For Deep Architecture Details

→ See `.claude/architecture.md` for full LLD with flow diagrams
→ See `.claude/decisions.md` for all tech decisions with rationale
→ See `.claude/rules.md` for development conventions and patterns
