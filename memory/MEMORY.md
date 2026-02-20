# Project Memory — LinkedIn AI Content Suggestion Agent

## Mastra 1.5.0 Patterns (CRITICAL — do not relearn)
- Agent constructor requires `id` AND `name` fields
- Import: `Agent` from `@mastra/core/agent`, `createTool` from `@mastra/core/tools`
- `agent.generate(prompt)` returns `{ text: string }` — NOT `{ object: ... }`
- Structured output: parse JSON from `result.text` with regex, then Zod.parse()
- Tool `execute` receives raw input — access as `toolInput?.field ?? toolInput?.context?.field`
- `@ai-sdk/google` exports: `createGoogleGenerativeAI` and `google` (default provider)
- Model: `google('gemini-1.5-flash')` for fast agents, `google('gemini-1.5-pro')` for quality

## TypeScript Quirks Found
- Mongoose 9.x: pre-hook uses `async function()` without `next` param
- Mongoose 9.x: toJSON transform goes inside Schema constructor options, not `.set()`
- Puppeteer page.evaluate() needs `lib: ["DOM"]` in tsconfig for `document` to be known
- google-trends-api has no @types package — use `require()` with manual interfaces

## Project Ports
- API (Express): 3001
- Web (Next.js): 3000

## Tech Stack (immutable decisions)
- Backend: Express (NOT Hono — user requested Express on 2026-02-20)
- AI: Mastra 1.5.0 + @ai-sdk/google (Gemini)
- LLM: gemini-1.5-flash (agents), gemini-1.5-pro (content generator)
- Scraping: Puppeteer (headless, with ScrapingBlockedError fallback)
- Trends: google-trends-api npm (free, no key)
- DB: MongoDB via Mongoose 9.x

## Express Route Quirks
- `req.params['id']` not `req.params.id` due to `noUncheckedIndexedAccess` in tsconfig
- Swagger docs parsed from JSDoc `@swagger` blocks in route files via swagger-jsdoc
- Swagger UI at `/api/docs`, raw spec at `/api/docs/openapi.json`
- Server awaits MongoDB before binding port — expected, not a bug

## Phase Status
- Phase 1: COMPLETE
- Phase 2: COMPLETE
- Phase 3: COMPLETE
- Phase 4: COMPLETE
- Phase 5: COMPLETE
- Phase 6: COMPLETE — ALL PHASES DONE
