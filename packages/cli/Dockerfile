# syntax=docker/dockerfile:1.7
#
# Docker image for @a2a-compliance/cli.
#
#   docker run --rm ghcr.io/ultraskye/a2a-compliance-cli:latest \
#     run https://agent.example.com
#
# Context must be the repository root (the CLI depends on workspace
# packages @a2a-compliance/core and @a2a-compliance/schemas that live
# outside packages/cli/). In CI: build with `context: .` and
# `file: packages/cli/Dockerfile`.

# ---- Stage 1: base with pnpm ----
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /repo

# ---- Stage 2: install workspace deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/schemas/package.json packages/schemas/
COPY packages/core/package.json    packages/core/
COPY packages/cli/package.json     packages/cli/
# apps/web's package.json is copied to keep pnpm's frozen-lockfile happy,
# but we restrict the actual install graph to the CLI transitive chain
# so Next.js / react don't end up in this stage. apps/action has no
# package.json — it's a composite GitHub Action, just YAML.
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter '@a2a-compliance/cli...'

# ---- Stage 3: build + prune to production deps ----
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages packages
# `--filter @a2a-compliance/cli...` builds the CLI plus its transitive
# workspace deps (schemas + core) — explicitly not the mcp package,
# whose deps (@modelcontextprotocol/sdk, zod) aren't installed in this
# image. A bare `pnpm -r --filter=./packages/* build` would try to
# compile mcp and fail on missing modules.
RUN pnpm --filter '@a2a-compliance/cli...' build
# pnpm deploy produces a self-contained node_modules tree pointing at
# the built dist/ of every workspace dep — the runtime image doesn't
# need pnpm or the monorepo.
RUN pnpm --filter @a2a-compliance/cli deploy --prod --legacy /out

# ---- Stage 4: minimal runtime image ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Named non-root user `a2a` so the container can't write outside its
# working dir even if an operator bind-mounts the host cwd.
RUN addgroup -g 1001 a2a && adduser -D -u 1001 -G a2a a2a

COPY --from=builder --chown=a2a:a2a /out/ ./
RUN chmod +x ./dist/index.js

USER a2a:a2a

# The CLI is a one-shot probe — it runs, writes a report, exits. There
# is no long-lived service state to health-check. `HEALTHCHECK NONE`
# is the correct declaration for this class of image; without it,
# Dockerfile linters (Trivy / Hadolint / CodeQL DS-0026) warn that a
# HEALTHCHECK is missing, even though adding one would be meaningless.
HEALTHCHECK NONE

ENTRYPOINT ["node", "/app/dist/index.js"]
# Sensible default: print help when run with no args.
CMD ["--help"]
