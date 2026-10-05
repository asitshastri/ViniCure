# Production images: `web` (Next.js standalone server) and `worker` (queue consumer).
#   docker build -f docker/Dockerfile --target web    -t vinicure-web .
#   docker build -f docker/Dockerfile --target worker -t vinicure-worker .
# Both run as the unprivileged `node` user and have a health check. Versions are pinned.

ARG NODE_VERSION=24.14.1
ARG PNPM_VERSION=12.8.1

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force

# Install every dependency once, from the lockfile only.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build && pnpm build:worker && pnpm build:migrate && pnpm build:first-admin

# Production dependencies only, for the worker.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

FROM node:${NODE_VERSION}-alpine AS worker
ENV NODE_ENV=production WORKER_HEALTH_PORT=3001
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/worker.mjs ./worker.mjs
# One-time tool for a new site: node first-admin.mjs you@example.com (see docs/runbooks/aws-test-deployment.md)
COPY --from=build --chown=node:node /app/dist/first-admin.mjs ./first-admin.mjs
COPY --chown=node:node package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.WORKER_HEALTH_PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "worker.mjs"]

# One-off job: applies migrations and creates the job queues, as the migrator role.
FROM node:${NODE_VERSION}-alpine AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/migrate.mjs ./migrate.mjs
COPY --chown=node:node db/migrations ./migrations
COPY --chown=node:node package.json ./
USER node
CMD ["node", "migrate.mjs"]
