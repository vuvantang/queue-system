# Base image pinned by digest (node:24-alpine, multi-arch index digest resolved
# 2026-11-10 via `docker buildx imagetools inspect` and the registry API).
# Bump the digest deliberately (e.g. via Dependabot/Renovate) to pick up security fixes.
ARG NODE_IMAGE=node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8

# Stage 1: Build
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

# TODO(reproducible build): the build context is server/, which has no lockfile
# (the workspace lock is the repo-root package-lock.json, outside this context and
# spanning all workspaces), so `npm install` re-resolves dependency versions within
# the ^ ranges on every build. To make builds reproducible either commit a
# server-scoped lockfile (e.g. `npm install --package-lock-only --workspaces=false`
# inside server/) and switch to `npm ci`, or build from the repo root with the
# workspace lock (`npm ci --workspace server`).
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Production
FROM ${NODE_IMAGE}
WORKDIR /app

ENV NODE_ENV=production

# Runtime dependency for better-sqlite3
RUN apk add --no-cache libstdc++

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY public/ ./public/

# The app runs as the unprivileged `node` user (uid 1000). data/ (SQLite DB and
# the auto-generated .jwt-secret) and public/uploads/ must be writable by it.
RUN mkdir -p data public/uploads \
  && chown -R node:node /app/data /app/public/uploads

# JWT_SECRET: provide at runtime (>= 32 random characters), e.g.
#   docker run -e JWT_SECRET="$(openssl rand -base64 48)" ...
# Never bake a value into the image. If unset, the server generates a random
# secret on first start and persists it in /app/data/.jwt-secret (keep the
# /app/data volume so tokens survive restarts).
# ALLOWED_ORIGINS: optional comma-separated list of extra CORS origins.

USER node

VOLUME ["/app/data", "/app/public/uploads"]
EXPOSE 3000

CMD ["node", "dist/index.js"]
