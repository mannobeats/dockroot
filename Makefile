SHELL := /bin/sh

PNPM := pnpm
DOCKER_COMPOSE := docker compose
DOTENV := $(PNPM) exec dotenv
LOCAL_ENV_FILE := .env.local
LOCAL_ENV_EXAMPLE := .env.local.example
LOCAL_RUNTIME_ENV_FILE := .dockroot/runtime.env
DEV_INFRA_COMPOSE_FILE := compose.dev-infra.yml
PROD_COMPOSE_FILE := docker-compose.yaml
LOCAL_INFRA_SERVICES := postgres prometheus cadvisor node-exporter
NEXT_DEV_LOCK := apps/web/.next/dev/lock

.PHONY: help install env-local local-bootstrap env-check-local env-check-compose dev-prepare dev-lite dev-full dev build start lint format prod-up prod-down prod-logs docker-up docker-down docker-logs db-push db-generate db-migrate db-studio infra-up infra-down postgres-up postgres-down clean

help:
	@printf "\nDockroot Commands\n\n"
	@printf "  make install      Install workspace dependencies\n"
	@printf "  make env-local    Create %s from %s if missing\n" "$(LOCAL_ENV_FILE)" "$(LOCAL_ENV_EXAMPLE)"
	@printf "  make env-check-local   Validate host development env\n"
	@printf "  make env-check-compose Validate Docker deployment inputs\n"
	@printf "  make dev-lite     Run host app with PostgreSQL only\n"
	@printf "  make dev-full     Run host app with full local infra (DB + monitoring)\n"
	@printf "  make build        Build the web app\n"
	@printf "  make start        Start the built web app\n"
	@printf "  make lint         Run Biome checks\n"
	@printf "  make format       Format the repo with Biome\n"
	@printf "  make infra-up     Start local Docker infra (Postgres, Prometheus, exporters)\n"
	@printf "  make infra-down   Stop local Docker infra\n"
	@printf "  make postgres-up  Start only PostgreSQL in Docker\n"
	@printf "  make postgres-down Stop only PostgreSQL container\n"
	@printf "  make db-push      Legacy schema sync (avoid for normal workflow)\n"
	@printf "  make db-generate  Generate Drizzle migrations\n"
	@printf "  make db-migrate   Run Drizzle migrations\n"
	@printf "  make db-studio    Open Drizzle Studio\n"
	@printf "  make prod-up      Start the full platform stack in Docker\n"
	@printf "  make prod-down    Stop the full platform stack\n"
	@printf "  make prod-logs    Tail production stack logs\n"
	@printf "  make clean        Remove local build output\n\n"

install:
	$(PNPM) install

env-local:
	@if [ ! -f "$(LOCAL_ENV_FILE)" ]; then cp "$(LOCAL_ENV_EXAMPLE)" "$(LOCAL_ENV_FILE)"; fi

local-bootstrap: env-local
	node scripts/bootstrap-runtime.mjs \
		--env-file $(LOCAL_ENV_FILE) \
		--write-env-file $(LOCAL_RUNTIME_ENV_FILE) \
		--write-postgres-password-file .dockroot/bootstrap/postgres_password \
		--write-metrics-token-file .dockroot/bootstrap/metrics_token

env-check-local: local-bootstrap
	$(DOTENV) -e $(LOCAL_ENV_FILE) -e $(LOCAL_RUNTIME_ENV_FILE) -- node scripts/runtime-env.mjs

env-check-compose:
	@node -e "const appUrl=(process.env.APP_URL||'').trim(); if (appUrl && !/^https?:\\/\\//.test(appUrl)) { console.error('APP_URL must be an absolute http/https URL.'); process.exit(1); }"

dev-prepare:
	rm -f $(NEXT_DEV_LOCK)

infra-up: env-check-local
	$(DOCKER_COMPOSE) --env-file $(LOCAL_RUNTIME_ENV_FILE) -f $(DEV_INFRA_COMPOSE_FILE) up -d $(LOCAL_INFRA_SERVICES)

infra-down:
	$(DOCKER_COMPOSE) --env-file $(LOCAL_RUNTIME_ENV_FILE) -f $(DEV_INFRA_COMPOSE_FILE) stop $(LOCAL_INFRA_SERVICES)

postgres-up: env-check-local
	$(DOCKER_COMPOSE) --env-file $(LOCAL_RUNTIME_ENV_FILE) -f $(DEV_INFRA_COMPOSE_FILE) up -d postgres

postgres-down:
	$(DOCKER_COMPOSE) --env-file $(LOCAL_RUNTIME_ENV_FILE) -f $(DEV_INFRA_COMPOSE_FILE) stop postgres

db-push: local-bootstrap
	$(PNPM) run db:push

db-generate: local-bootstrap
	$(PNPM) run db:generate

db-migrate: local-bootstrap
	$(PNPM) run db:migrate

db-studio: local-bootstrap
	$(PNPM) run db:studio

dev-lite: dev-prepare env-local env-check-local postgres-up db-migrate
	$(PNPM) dev

dev-full: dev-prepare env-local install env-check-local infra-up db-migrate
	$(PNPM) dev

dev: dev-full

build: local-bootstrap
	$(PNPM) build

start: local-bootstrap
	$(PNPM) start

lint:
	$(PNPM) lint

format:
	$(PNPM) format

prod-up: env-check-compose
	$(DOCKER_COMPOSE) -f $(PROD_COMPOSE_FILE) up -d

prod-down:
	$(DOCKER_COMPOSE) -f $(PROD_COMPOSE_FILE) down

prod-logs:
	$(DOCKER_COMPOSE) -f $(PROD_COMPOSE_FILE) logs -f

docker-up: prod-up
docker-down: prod-down
docker-logs: prod-logs

clean:
	rm -rf apps/web/.next
	rm -f migrate.mjs
