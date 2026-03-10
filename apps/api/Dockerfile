# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Prune the monorepo — generate a lockfile with ONLY api + shared-types
#
# This is the key optimisation: turbo prune strips out the web workspace
# and its ~900MB of dependencies (Next.js, React, Tailwind, PostCSS, etc.)
# so the production image only ships what the API actually imports.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS pruner

WORKDIR /app

# turbo is a devDependency — install globally so prune can run without npm ci
RUN npm install -g turbo@2

# Copy the full repo (node_modules / dist / .next are excluded by .dockerignore)
COPY . .

# Produce out/json/ (package.jsons + pruned lockfile) and out/full/ (source code)
RUN turbo prune @repo/api --docker

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Install dependencies from the pruned lockfile
#
# Because the lockfile no longer references @repo/web or any web-only packages,
# npm ci installs only what the API workspace actually needs.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy pruned manifests + lockfile (great layer cache — changes rarely)
COPY --from=pruner /app/out/json/ .

# Install ALL deps (dev included — TypeScript is needed for the build step)
RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Build — compile TypeScript → dist/
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Bring in node_modules from the clean install
COPY --from=deps /app/ .

# Overlay source code + config files (turbo.json, source code, etc.)
COPY --from=pruner /app/out/full/ .

# turbo prune does NOT copy root config files like tsconfig.base.json.
# The API's tsconfig extends ../../tsconfig.base.json — without it,
# skipLibCheck defaults to false and @mastra/core .d.ts files explode.
COPY tsconfig.base.json ./

# Build only the API (turbo handles shared-types → api dependency order)
RUN npx turbo run build --filter=@repo/api

# Strip devDependencies (typescript, @types/*, nodemon, eslint, etc.)
# This is now effective because the workspace only contains api + shared-types
RUN npm prune --omit=dev

# Clean non-runtime files from node_modules (~30-50MB savings)
# Remove: TypeScript source maps, READMEs, changelogs, test dirs, .d.ts maps
RUN find node_modules \( \
    -name "*.md" -o -name "*.map" -o -name "*.ts.map" -o \
    -name "CHANGELOG*" -o -name "LICENSE*" -o -name ".npmignore" -o \
    -name "tsconfig.json" -o -name ".eslintrc*" -o -name ".prettierrc*" -o \
    -name "Makefile" -o -name ".travis.yml" -o -name ".github" \
  \) -delete 2>/dev/null; \
  find node_modules -type d \( \
    -name "test" -o -name "tests" -o -name "__tests__" -o \
    -name "docs" -o -name "example" -o -name "examples" -o \
    -name ".cache" \
  \) -exec rm -rf {} + 2>/dev/null; \
  true

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: Production runner — minimal image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Puppeteer / Chromium removed — scraping is disabled, users paste posts manually.
# To re-enable: add `puppeteer` to package.json, uncomment Chromium install below,
# and restore scrapeLinkedInProfile() in services/linkedin.ts.
# RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

ENV NODE_ENV=production

# Copy compiled JS output
COPY --from=builder /app/apps/api/dist ./dist

# Copy production node_modules (now contains ONLY api deps — not web)
COPY --from=builder /app/node_modules ./node_modules

# shared-types exports raw .ts source via "main": "./src/index.ts"
# TypeScript elides type-only imports, but copy it in case any runtime
# re-export exists (belt-and-suspenders)
COPY --from=builder /app/packages/shared-types ./node_modules/@repo/shared-types

EXPOSE 5006

# Health check so docker compose / orchestrators know when ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:5006/api/health || exit 1

CMD ["node", "dist/index.js"]
