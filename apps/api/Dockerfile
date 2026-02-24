# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Install all dependencies (needed for build + shared-types resolution)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY apps/api/package.json ./apps/api/package.json
# Web package.json is required for npm workspaces to resolve correctly
COPY apps/web/package.json ./apps/web/package.json

# Install ALL deps (including dev — needed for tsc)
RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Build — compile TypeScript to dist/
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy installed node_modules and shared packages from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy root config files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy only the API source
COPY apps/api ./apps/api

# Run build via turbo (filters to just the API — faster, no web build needed)
RUN npx turbo run build --filter=@repo/api

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production runner — minimal image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install Chromium for Puppeteer (avoids downloading a separate 300MB binary)
# Alpine chromium is smaller and pre-built for the platform
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

# Copy compiled output from builder
COPY --from=builder /app/apps/api/dist ./dist

# Copy shared-types source (resolved at runtime via require paths)
# Actually shared-types are compiled into dist/, so we only need package.json
COPY --from=builder /app/packages ./packages

# Copy package.json for production dependency install
COPY apps/api/package.json ./package.json
# We need the root workspace package.json for npm to resolve @repo/* packages
COPY package.json ./root-package.json

# Install ONLY production dependencies
RUN npm install --omit=dev --ignore-scripts

EXPOSE 5006

# Health check so docker compose / orchestrators know when ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:5006/api/health || exit 1

# In production, env vars come from the container environment (Docker Compose / cloud)
# No dotenv/load-env.cjs needed — process.env is already populated
CMD ["node", "dist/index.js"]
