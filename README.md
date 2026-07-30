# PostMind AI

**AI-powered LinkedIn & Twitter/X content suggestion agent** that deeply understands your writing voice, learns from your feedback, and combines it with real-time trending topics to generate personalized content ideas.

---

## What is PostMind AI?

PostMind AI is a full-stack Applied AI platform that analyzes your LinkedIn presence (or pasted posts) and generates hyper-personalized content ideas using a **6-agent Mastra AI pipeline**. Unlike generic AI writing tools, PostMind AI:

- **Learns your unique voice** — analyzes your writing patterns, sentence structure, emoji usage, opening styles, and vocabulary level
- **Fetches real-time trends** — pulls from 60+ domain-specific RSS feeds, Tavily web search, Hacker News, and Google News
- **Adapts to your industry** — classifies your domain (tech, healthcare, finance, legal, education, etc.) and fetches industry-relevant trends
- **Gets smarter over time** — every rating, action, and interaction feeds back into your persona profile
- **Supports LinkedIn & Twitter/X** — generates platform-specific content with the right format, length, and style

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo with npm workspaces |
| **Backend** | Express + TypeScript (port 5006) |
| **Frontend** | Next.js 14 App Router (port 3000) |
| **AI Framework** | Mastra AI with 6 specialized agents |
| **LLM** | Pluggable — Google Gemini (`@ai-sdk/google`) or Ollama Cloud (`@ai-sdk/openai-compatible`), switchable via `MODEL_PROVIDER` |
| **Database** | MongoDB with Mongoose (13 collections) |
| **Auth** | JWT with httpOnly cookies + refresh tokens |
| **Styling** | Tailwind CSS + shadcn/ui components |
| **API Docs** | Swagger/OpenAPI at `/api/docs` |
| **Trends** | Tavily, HN Algolia, 60+ Domain RSS, Google News |

---

## The 6-Agent AI Pipeline

```
Your Posts ──→ Agent 1: Persona Analyst ──→ Agent 2: Onboarding Coach
                  │                              │
                  │  Understands your voice       │  Fills in gaps via interview
                  │  + Writing DNA extraction     │  (goals, audience, industry)
                  ▼                              ▼
            Agent 3: Trend Researcher ──→ Agent 4: Content Generator
                  │                              │
                  │  Domain-aware trend fetch     │  Merges voice + trends
                  │  from 60+ industry feeds      │  into 5-7 rich briefs
                  ▼                              ▼
            Agent 5: Persona Chat          Agent 6: Post Editor
                  │                              │
                  │  Refine persona live          │  AI co-writing with
                  │  via conversation             │  AI detection + humanizer
                  ▼                              ▼
            ┌─── Feedback Loop ───────────────────┐
            │  Every interaction improves the next │
            │  generation via weighted learning    │
            └──────────────────────────────────────┘
```

---

## Project Structure

```
content-generator/
├── apps/
│   ├── api/                     # Express + TypeScript backend
│   │   └── src/
│   │       ├── agents/          # 6 AI agents + orchestrator
│   │       ├── config/          # DB, env validation, constants
│   │       ├── models/          # 13 Mongoose models
│   │       ├── routes/          # 11 route files
│   │       ├── services/        # 19 service files
│   │       ├── middleware/      # Auth, admin, rate limiting, errors
│   │       └── utils/           # Scoring, circuit breaker, helpers
│   │
│   └── web/                     # Next.js 14 frontend
│       └── src/
│           ├── app/             # Pages (auth, onboarding, dashboard, admin)
│           ├── components/      # UI components (chat, editor, suggestions, trends)
│           └── lib/             # API client, auth helpers, implicit tracking
│
└── packages/
    ├── shared-types/            # 40+ shared TypeScript interfaces
    └── eslint-config/           # Shared ESLint config
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **MongoDB** — free tier at [MongoDB Atlas](https://cloud.mongodb.com)
- **An LLM provider** — either a **Gemini API Key** (free at [Google AI Studio](https://ai.google.dev)) or an **Ollama Cloud API Key** ([ollama.com/settings/keys](https://ollama.com/settings/keys); a local Ollama server also works)
- **Tavily API Key** (optional) — free tier at [tavily.com](https://tavily.com)

### 1. Clone the repository

```bash
git clone <repo-url>
cd content-generator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
# Required
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/postmind
JWT_SECRET=your_64_char_random_hex_string

# LLM provider — "gemini" (default) or "ollama"
MODEL_PROVIDER=gemini

# If MODEL_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# If MODEL_PROVIDER=ollama (Ollama Cloud shown; for local use http://localhost:11434/v1 and omit the key)
# OLLAMA_API_KEY=your_ollama_cloud_key
# OLLAMA_BASE_URL=https://ollama.com/v1
# OLLAMA_MODEL=gpt-oss:120b
# OLLAMA_REASONING_EFFORT=low

# Optional (improves trend quality)
TAVILY_API_KEY=your_tavily_key

# Ports (defaults work for local dev)
PORT=5006
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5006
```

### Switching model providers

The entire app is provider-agnostic — every agent and service resolves its model
through a single factory ([apps/api/src/llm/provider.ts](apps/api/src/llm/provider.ts)).
To switch providers, change `MODEL_PROVIDER` in `.env` and restart:

| `MODEL_PROVIDER` | Key | Model var | Notes |
|------------------|-----|-----------|-------|
| `gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL` | Default. Uses `@ai-sdk/google`. |
| `ollama` | `OLLAMA_API_KEY` | `OLLAMA_MODEL` | Ollama Cloud via its OpenAI-compatible API (`OLLAMA_BASE_URL`, default `https://ollama.com/v1`). For a self-hosted server set `OLLAMA_BASE_URL=http://localhost:11434/v1` — no key required. |

### How structured (JSON) output is enforced

No agent hands a response schema to the SDK — models without schema-constrained
decoding fail unpredictably when you do. Structure is enforced in four layers,
ordered cheapest-first, so extra model calls are the last resort
([apps/api/src/llm/structured.ts](apps/api/src/llm/structured.ts)):

| Layer | Mechanism | Cost |
|-------|-----------|------|
| 1. Transport | Provider-native JSON mode — Ollama `response_format: json_object`, Gemini `responseMimeType`. Applied to every JSON call by the provider factory, not per call site. | Free |
| 2. Prompt | Every JSON agent appends the shared `JSON_OUTPUT_RULE`. | Free |
| 3. Local | `extractJSON()` strips fences/reasoning channels, unwraps double-encoded JSON, repairs syntax (trailing commas, single quotes, unquoted keys, raw newlines) and salvages truncated output. A per-agent `normalize` hook then coerces near-misses — aliased/snake_case keys, stringified lists, invalid enums — before Zod validation. | Free |
| 4. Repair | At most ONE schema-free repair call, and only if the step's time budget allows. | 1 call |

A retry (full regeneration) only happens after all four fail. Conversational
agents — onboarding, persona chat, post editor — use the plain text model, since
their replies are prose.

Set `LLM_JSON_MODE=off` if a model or endpoint rejects the JSON-mode flag; the
app also disables it automatically for the process on the first such rejection.

**Generate a JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Start the development servers

```bash
npm run dev
```

This starts both servers via Turborepo:
- **API** at `http://localhost:5006`
- **Web** at `http://localhost:3000`
- **API Docs** at `http://localhost:5006/api/docs`

### 5. First-time admin setup

On first start, the API creates an admin account and logs a setup token to the console. Visit `http://localhost:3000/admin/setup` and enter the token to set your admin password.

---

## Docker Deployment

### Local Docker

```bash
# Build and start all services
npm run docker:build:local
npm run docker:up

# Stop services
npm run docker:down
```

### Production

```bash
# Pull latest images and start
npm run docker:prod
```

---

## How to Get the Best Results

PostMind AI produces dramatically better content ideas when you give it more data to work with. Here's how to maximize the quality of suggestions:

### Step 1: Provide Quality Input Posts (Most Important)

- **Paste 5-10 of your best-performing posts** — not random ones, but posts that got good engagement and represent the voice you want
- **Include variety** — mix different formats (stories, lists, opinions, how-tos) so the AI understands your range
- **Recent posts work best** — the AI learns your current style, not what you wrote 3 years ago
- **Longer posts are better** — a 200-word post gives 10x more signal than a 20-word update

### Step 2: Complete the Strategy Interview

- Answer all 5 onboarding questions (goals, audience, industry, content pillars, frequency)
- Be specific — "SaaS founders with 10-50 employees" is better than "business people"
- Your content pillars directly shape what topics get suggested

### Step 3: Rate Every Suggestion

- **Rate with ratings** (loved/good/meh/bad) AND **actions** (saved/draft/dismissed)
- The first 3 feedbacks trigger immediate learning — don't skip them
- After 10+ feedbacks, the AI significantly adapts to your preferences
- After 20+ feedbacks, suggestions become highly personalized

### Step 4: Use the Right Generation Mode

| Mode | Best For |
|------|----------|
| **Quick Generate** | Fast ideas from your existing profile + live trends |
| **Browse Trends** | When you want to pick specific trending topics first |
| **AI Topic Suggestions** | When you want AI to suggest topics from your expertise |
| **Topic Focus** | When you have a specific topic in mind |
| **Chat Refined** | When you want to describe exactly what you need |

### Step 5: Use the Post Editor

- Click "Write This Post" on any suggestion to open the AI co-writer
- The editor maintains your voice (using your Writing DNA fingerprint)
- Use the AI Detector to check if content sounds too robotic
- Use the Humanizer to make AI-written content sound more natural

### Step 6: Report Post Performance

- After publishing a post, report how it performed (likes, comments, reposts)
- This is the strongest learning signal — tells the AI what actually resonates with your audience
- Posts with reported performance get 3x weight in future suggestions

---

## Key Features

### Persona Intelligence
- **Writing DNA** — deterministic extraction of 15+ writing patterns (sentence length, emoji usage, opening styles, CTA patterns, reading level)
- **Confidence Score** — 0-100 score showing how well the AI understands you, adapts generation strategy accordingly
- **Persona Evolution** — view how your profile has changed over time with version history

### Content Generation
- **5 generation modes** — profile, topic-focus, chat-refined, trend-selected, persona-topics
- **Rich content briefs** — hook, talking points, CTA, SEO keywords, format recommendation
- **Scheduling hints** — industry-specific best posting times
- **Content series detection** — automatically detects recurring themes and suggests follow-ups
- **Format intelligence** — learns which post formats work best for you

### Trend Intelligence
- **14 domain categories** — tech, healthcare, finance, legal, education, creative, food, sustainability, and more
- **60+ domain-specific RSS feeds** — industry-relevant news sources
- **Multi-tier fetching** — Tavily (Tier 1) → HN + RSS (Tier 2) → Google News (Tier 2.5) → Evergreen (Tier 3)
- **Trend deduplication** — cross-source dedup prevents duplicate trending topics

### Feedback & Learning
- **Explicit feedback** — rate suggestions with quality + action signals
- **Implicit tracking** — copies, clicks, time spent are automatically captured
- **Performance-weighted learning** — published posts with high engagement get 3x learning weight
- **Recency decay** — 14-day half-life ensures recent preferences outweigh old ones
- **A/B testing framework** — measures heuristic vs LLM path quality

### Post Editor & AI Co-Writing
- **AI writing partner** — Agent 6 helps draft, edit, refine, expand, or compress posts
- **Voice consistency** — uses your Writing DNA to maintain your style
- **AI detector** — 7-signal analysis scores how "AI" your content sounds
- **Humanizer** — 3 intensity levels (light/moderate/aggressive) to make content sound natural
- **Version history** — every edit tracked with user/AI attribution

### Platform Support
- **LinkedIn** — long-form posts (3,000 chars), carousels, polls, video scripts
- **Twitter/X** — tweets (280 chars), threads (up to 25), quote-tweets, image-tweets

### Admin Dashboard
- **User management** — view, search, edit users and roles
- **Token analytics** — usage trends, request management, quota adjustments
- **Audit trail** — every admin action logged

---

## API Documentation

Interactive Swagger UI available at `http://localhost:5006/api/docs` when the API is running.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Log in |
| `/api/persona/analyze` | POST | Analyze posts → build persona |
| `/api/persona` | GET | Get current persona |
| `/api/suggestions/generate` | POST | Generate content suggestions |
| `/api/trends/discover` | GET | Browse trending topics |
| `/api/feedback` | POST | Submit suggestion feedback |
| `/api/feedback/implicit` | POST | Track implicit signals |
| `/api/drafts` | POST/GET | Create and manage post drafts |
| `/api/drafts/:id/chat` | POST | AI co-writing chat |
| `/api/drafts/:id/ai-check` | POST | Run AI content detection |
| `/api/drafts/:id/humanize` | POST | Humanize AI content |
| `/api/audience/record` | POST | Record engagement data |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string ([get free](https://cloud.mongodb.com)) |
| `JWT_SECRET` | Yes | 64+ char random hex for JWT signing |
| `MODEL_PROVIDER` | No | LLM provider: `gemini` (default) or `ollama` |
| `GEMINI_API_KEY` | If `gemini` | Google Gemini API key ([get free](https://ai.google.dev)) |
| `GEMINI_MODEL` | No | Gemini model name (default: `gemini-2.5-flash`) |
| `OLLAMA_API_KEY` | If `ollama` (cloud) | Ollama Cloud API key ([get one](https://ollama.com/settings/keys)). Not needed for a local server. |
| `OLLAMA_BASE_URL` | No | Ollama OpenAI-compatible endpoint (default: `https://ollama.com/v1`) |
| `OLLAMA_MODEL` | No | Ollama model name (default: `gpt-oss:120b`) |
| `OLLAMA_REASONING_EFFORT` | No | Reasoning budget for reasoning models: `low` (default), `medium`, `high`, or `default` to send nothing. `low` cuts latency sharply on gpt-oss-class models. |
| `LLM_JSON_MODE` | No | `on` (default) uses the provider's native JSON mode for JSON calls; `off` falls back to prompt-level JSON + local repair |
| `LLM_JSON_REPAIR` | No | `on` (default) allows one model repair call when local parsing fails; `off` never spends a second call |
| `LLM_TIMEOUT_SCALE` | No | Multiplier on pipeline step timeouts (default: 3 for `ollama`, 1 for `gemini`) |
| `TAVILY_API_KEY` | No | Tavily API key for premium trend search ([get free](https://tavily.com)) |
| `PORT` | No | API port (default: 5006) |
| `FRONTEND_URL` | No | Frontend origin for CORS (default: http://localhost:3000) |
| `NEXT_PUBLIC_API_URL` | No | API URL for browser requests (default: http://localhost:5006) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services in development mode |
| `npm run build` | Build all packages and apps |
| `npm run lint` | Run ESLint across all packages |
| `npm run format` | Format code with Prettier |
| `npm run docker:up` | Start Docker containers |
| `npm run docker:down` | Stop Docker containers |

---

## Architecture

For detailed architecture documentation including flow diagrams, data model relationships, and system design decisions, see:

- `.claude/architecture.md` — Full low-level design with ASCII flow diagrams
- `.claude/decisions.md` — All 29 technical decisions with rationale
- `.claude/project-context.md` — Quick reference for tech stack and components

---

## License

Private project. All rights reserved.
