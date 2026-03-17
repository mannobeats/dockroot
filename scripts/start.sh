#!/bin/sh
set -e

eval "$(node /app/scripts/bootstrap-runtime.mjs --format shell --write-env-file /var/lib/dockroot/bootstrap/runtime.env --write-postgres-password-file /var/lib/dockroot/bootstrap/postgres_password)"

node /app/scripts/runtime-env.mjs --production

echo "⏳ Running database migrations..."
node /app/migrate.mjs
echo "✅ Starting application..."
exec node /app/server.mjs
