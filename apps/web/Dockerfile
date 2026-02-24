# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Install all dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY apps/web/package.json ./apps/web/package.json
# API package.json required for npm workspaces to resolve correctly
COPY apps/api/package.json ./apps/api/package.json

RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Build Next.js
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy node_modules and shared packages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy root config files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy the web app source
COPY apps/web ./apps/web

# NEXT_PUBLIC_API_URL is baked into the Next.js bundle at build time.
# It must be the externally accessible URL of your API server
# (e.g. http://your-server-ip:3001 or https://api.yourdomain.com)
ARG NEXT_PUBLIC_API_URL=http://localhost:5006
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build via turbo (filters to just the web app)
RUN npx turbo run build --filter=@repo/web

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production runner — uses Next.js standalone output
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the standalone bundle (self-contained server with minimal deps)
COPY --from=builder /app/apps/web/.next/standalone ./

# Copy static assets (CSS, JS chunks, images) — must be at the right path
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy public directory if it exists (static files served directly)
# Using a conditional copy pattern: copy the whole public dir if present
COPY --from=builder /app/apps/web/public* ./apps/web/public/

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone outputs a server.js in the workspace subdirectory
CMD ["node", "apps/web/server.js"]
