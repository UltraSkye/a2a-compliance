# syntax=docker/dockerfile:1.7

# ---- Stage 1: shared base with pnpm ----
FROM node:25-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /repo

# ---- Stage 2: install workspace dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/schemas/package.json packages/schemas/
COPY packages/core/package.json    packages/core/
COPY packages/cli/package.json     packages/cli/
COPY apps/web/package.json         apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Stage 3: build core packages + web app ----
FROM deps AS builder
COPY tsconfig.base.json biome.json ./
COPY packages packages
COPY apps/web apps/web
# Next.js uses outputFileTracingRoot to find workspace packages; building
# the workspace packages first gives the tracer something to resolve.
RUN pnpm -r --filter=./packages/* build \
 && pnpm --filter @a2a-compliance/web build

# ---- Stage 4: minimal runtime image ----
FROM node:25-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone bundle already contains a pruned node_modules tree plus the
# server entry point. Static and public are copied separately per Next.js
# docs.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
