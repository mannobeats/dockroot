#!/bin/sh
set -e

node /app/scripts/runtime-env.mjs --production

echo "⏳ Running database migrations..."
node /app/migrate.mjs
echo "✅ Starting application..."
exec node /app/server.mjs
