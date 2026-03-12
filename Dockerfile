FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Install dependencies
FROM base AS deps
RUN apk add --no-cache make g++ python3
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts=false && pnpm rebuild node-pty

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Non-production placeholders so `next build` can compile without runtime secrets.
# Better Auth validates secret quality during build, so this placeholder must
# still look like a real high-entropy secret to avoid false warnings.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV BETTER_AUTH_SECRET="9d3fd5cdb7c96796b845921a63b742a5d662078f9bc7c83a745f5225f2c98d9d"
ENV BETTER_AUTH_URL="http://localhost:3080"
RUN pnpm run build
RUN pnpm run db:bundle-migrate

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache docker-cli docker-cli-compose

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=builder /app/migrate.mjs ./migrate.mjs
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/local-terminal.mjs ./local-terminal.mjs
RUN chmod +x ./scripts/start.sh

EXPOSE 3080
ENV PORT=3080
ENV HOSTNAME="0.0.0.0"

CMD ["./scripts/start.sh"]
