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
- **Chosen**: Google Gemini (gemini-1.5-pro or gemini-1.5-flash)
- **Rejected**: OpenAI GPT-4, Anthropic Claude
- **Reason**: Free tier available at ai.google.dev with no credit card needed.
  The user does not need to pay anything to run this app.
- **Mastra config**: Use `@ai-sdk/google` provider in Mastra agent definitions
- **Model ID**: `google('gemini-1.5-pro')` or `google('gemini-1.5-flash')`

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

## Decision 4: google-trends-api for Trend Research
- **Chosen**: `google-trends-api` npm package
- **Rejected**: Twitter/X API (paid), News API (limited free tier)
- **Reason**: Completely free, no API key, no rate limiting for reasonable use.
  Returns trending searches by category/geo.
- **Backup**: Tavily free tier (TAVILY_API_KEY) for broader web search
- **File**: `apps/api/src/services/trends.ts`

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
