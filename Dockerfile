# =============================================================================
# PulseWeave Production Dockerfile
# Multi-stage build for optimized production image
# =============================================================================

# Stage 1: Base dependencies
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat || apk add --no-cache gcompat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 2: Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile

# Stage 3: Build backend
FROM base AS backend-builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules

COPY . .

# Generate Prisma client
WORKDIR /app/packages/database
RUN pnpm generate

# Build workspace packages needed at runtime
WORKDIR /app/packages/types
RUN pnpm build

WORKDIR /app/packages/database
RUN pnpm build

# Build backend
WORKDIR /app/apps/backend
RUN pnpm build

# Stage 4: Build frontend
FROM base AS frontend-builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules

COPY . .

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_MODE=standalone

# Build frontend
WORKDIR /app/apps/frontend
RUN pnpm build

# Stage 5: Production backend image
FROM node:20-alpine AS backend
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 pulseweave

# Copy built backend
COPY --from=backend-builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=backend-builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/apps/backend/node_modules ./apps/backend/node_modules

# Copy workspace packages referenced via pnpm symlinks
COPY --from=backend-builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=backend-builder /app/packages/database/dist ./packages/database/dist
COPY --from=backend-builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=backend-builder /app/packages/types/dist ./packages/types/dist

# Create directories
RUN mkdir -p uploads data && chown -R pulseweave:nodejs uploads data

USER pulseweave

EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/health/live || exit 1

CMD ["node", "apps/backend/dist/index.js"]

# Stage 6: Production frontend image
FROM node:20-alpine AS frontend
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=frontend-builder /app/apps/frontend/.next/standalone ./
COPY --from=frontend-builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=frontend-builder /app/apps/frontend/public ./apps/frontend/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/frontend/server.js"]
