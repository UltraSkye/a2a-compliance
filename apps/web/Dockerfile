# syntax=docker/dockerfile:1.7

# ---- Stage 1: shared base with pnpm ----
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /repo

# ---- Stage 2: install workspace dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/schemas/package.json packages/schemas/
COPY packages/core/package.json    packages/core/
COPY packages/cli/package.json     packages/cli/
COPY packages/mcp/package.json     packages/mcp/
COPY apps/web/package.json         apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter '@a2a-compliance/web...'

# ---- Stage 3: build core packages + web app ----
FROM deps AS builder
COPY tsconfig.base.json biome.json ./
COPY packages packages
COPY apps/web apps/web
# Build only what `web` transitively depends on. The mcp package is
# kept out of the graph because its @modelcontextprotocol/sdk + zod
# deps aren't installed in this image (the deps stage filtered to
# `@a2a-compliance/web...`).
RUN pnpm --filter '@a2a-compliance/web...' build

# ---- Stage 4: minimal runtime image ----
FROM node:24-bookworm-slim AS runner
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

# Next.js standalone servers answer on / with 200 once the bundle is
# warm, so the root path works as a liveness probe — no extra /healthz
# endpoint to maintain. node:24-slim lacks wget / curl; use Node's own
# fetch to keep the image minimal.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
