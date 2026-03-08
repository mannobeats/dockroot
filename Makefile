SHELL := /bin/sh

PNPM := pnpm
DOCKER_COMPOSE := docker compose
ENV_FILE := .env.local
ENV_EXAMPLE := .env.example
LOCAL_INFRA_SERVICES := postgres prometheus cadvisor node-exporter
NEXT_DEV_LOCK := apps/web/.next/dev/lock

.PHONY: help install env env-check dev-prepare dev dev-full build start lint format docker-build docker-up docker-down docker-logs db-push db-generate db-migrate db-studio infra-up infra-down postgres-up postgres-down clean

help:
	@printf "\nDockroot Commands\n\n"
	@printf "  make install      Install workspace dependencies\n"
	@printf "  make env          Create %s from %s if missing\n" "$(ENV_FILE)" "$(ENV_EXAMPLE)"
	@printf "  make env-check    Validate local environment configuration\n"
	@printf "  make dev          Start local app with Docker infra for live UI changes\n"
	@printf "  make dev-full     Install deps, validate env, sync schema, and start local app\n"
	@printf "  make build        Build the web app\n"
	@printf "  make start        Start the built web app\n"
	@printf "  make lint         Run Biome checks\n"
	@printf "  make format       Format the repo with Biome\n"
	@printf "  make infra-up     Start local Docker infra (Postgres, Prometheus, exporters)\n"
	@printf "  make infra-down   Stop local Docker infra\n"
	@printf "  make postgres-up  Start only PostgreSQL in Docker\n"
	@printf "  make postgres-down Stop only PostgreSQL container\n"
	@printf "  make db-push      Push schema to the database\n"
	@printf "  make db-generate  Generate Drizzle migrations\n"
	@printf "  make db-migrate   Run Drizzle migrations\n"
	@printf "  make db-studio    Open Drizzle Studio\n"
	@printf "  make docker-build Build the app image\n"
	@printf "  make docker-up    Start the full platform stack in Docker\n"
	@printf "  make docker-down  Stop Docker services\n"
	@printf "  make docker-logs  Tail Docker logs\n"
	@printf "  make clean        Remove local build output\n\n"

install:
	$(PNPM) install

env:
	@if [ ! -f "$(ENV_FILE)" ]; then cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; fi

env-check: env
	$(PNPM) run env:check

dev-prepare:
	rm -f $(NEXT_DEV_LOCK)

infra-up: env-check
	$(DOCKER_COMPOSE) up -d $(LOCAL_INFRA_SERVICES)

infra-down:
	$(DOCKER_COMPOSE) stop $(LOCAL_INFRA_SERVICES)

postgres-up: env-check
	$(DOCKER_COMPOSE) up -d postgres

postgres-down:
	$(DOCKER_COMPOSE) stop postgres

db-push: env-check
	$(PNPM) run db:push

db-generate: env-check
	$(PNPM) run db:generate

db-migrate: env-check
	$(PNPM) run db:migrate

db-studio: env-check
	$(PNPM) run db:studio

dev: dev-prepare infra-up
	$(PNPM) dev

dev-full: dev-prepare env install env-check infra-up db-push
	$(PNPM) dev

build: env-check
	$(PNPM) build

start: env-check
	$(PNPM) start

lint:
	$(PNPM) lint

format:
	$(PNPM) format

docker-build: env-check
	$(DOCKER_COMPOSE) build

docker-up: env-check
	$(DOCKER_COMPOSE) up --build -d

docker-down:
	$(DOCKER_COMPOSE) down

docker-logs:
	$(DOCKER_COMPOSE) logs -f

clean:
	rm -rf apps/web/.next
	rm -f migrate.mjs
