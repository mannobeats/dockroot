#!/bin/sh
set -e

node /app/runtime-env.mjs --production

echo "⏳ Syncing database schema..."
pnpm exec drizzle-kit push --config /app/drizzle.config.ts
echo "✅ Starting application..."
exec node /app/server.mjs
