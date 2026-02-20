# Phase 1: Turborepo Scaffold + Environment Setup
# Status: COMPLETE ✓ (2026-02-20)

---

## Goal
Create the complete monorepo skeleton with all config files, shared packages,
and app stubs so that Phases 2-6 can build on a solid foundation.

## Checklist
- [ ] Root package.json with workspaces config
- [ ] turbo.json with build/dev/lint pipelines
- [ ] tsconfig.base.json (shared TS config)
- [ ] .gitignore
- [ ] .env (empty values, gitignored)
- [ ] .env.example (documented keys)
- [ ] packages/shared-types/ — TypeScript interfaces
- [ ] packages/eslint-config/ — shared ESLint rules
- [ ] apps/api/ — Hono + TypeScript skeleton (no logic yet)
- [ ] apps/web/ — Next.js 14 App Router skeleton
- [ ] CLAUDE.md in root

## Key Files to Create

### Root level
```
package.json          → name: "content-generator", workspaces: ["apps/*","packages/*"]
turbo.json            → pipelines: build, dev, lint, clean
tsconfig.base.json    → strict: true, target: ES2022, moduleResolution: bundler
.gitignore            → node_modules, .env, .next, dist, .turbo
.env                  → all keys empty
.env.example          → all keys with comments
CLAUDE.md             → project overview + phase checklist
```

### packages/shared-types/
```
package.json          → name: "@repo/shared-types"
tsconfig.json         → extends ../../tsconfig.base.json
src/index.ts          → IUser, IUserPersona, IChatSession, IContentSuggestion,
                        ILoginRequest, IRegisterRequest, IApiResponse<T>,
                        ISuggestion, IPersonaAnalysisInput, IOnboardingMessage
```

### packages/eslint-config/
```
package.json          → name: "@repo/eslint-config"
index.js              → extends: eslint:recommended + typescript-eslint/recommended
```

### apps/api/
```
package.json          → name: "@repo/api", scripts: dev/build/start
tsconfig.json         → extends ../../tsconfig.base.json
src/index.ts          → Hono app with health check route only (Phase 2 adds more)
nodemon.json          → watches src/, runs ts-node
```

### apps/web/
```
package.json          → name: "@repo/web", Next.js deps
tsconfig.json         → Next.js standard tsconfig
next.config.ts        → minimal config
tailwind.config.ts    → content paths for Tailwind
src/app/layout.tsx    → root layout with Tailwind
src/app/page.tsx      → placeholder landing page
```

## npm packages to install

### Root devDependencies
```
turbo
typescript
@types/node
```

### packages/shared-types
```
(no runtime deps — pure TypeScript interfaces)
```

### apps/api dependencies
```
hono
@hono/node-server
@hono/swagger-ui
@hono/zod-openapi
zod
dotenv
```

### apps/api devDependencies
```
typescript
ts-node
nodemon
@types/node
```

### apps/web dependencies
```
next
react
react-dom
tailwindcss
postcss
autoprefixer
```

## Notes
- Do NOT install Mastra, MongoDB, or Puppeteer in Phase 1 — that's Phase 2/3
- The apps just need to start without errors after Phase 1
- `turbo dev` should start both api and web in parallel
- Health check: `GET /api/health` → returns `{ status: "ok" }`

## Completion Criteria
- `npm run dev` from root starts both apps
- No TypeScript errors
- Shared types are importable in both apps
- All env variable keys exist in .env.example with comments
