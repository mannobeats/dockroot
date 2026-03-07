SHELL := /bin/sh

PNPM := pnpm
DOCKER_COMPOSE := docker compose
ENV_FILE := .env.local
ENV_EXAMPLE := .env.example

.PHONY: help install env dev dev-full build start lint format docker-build docker-up docker-down docker-logs db-push db-generate db-migrate db-studio postgres-up postgres-down clean

help:
	@printf "\nDockroot Commands\n\n"
	@printf "  make install      Install workspace dependencies\n"
	@printf "  make env          Create %s from %s if missing\n" "$(ENV_FILE)" "$(ENV_EXAMPLE)"
	@printf "  make dev          Start local app with Docker Postgres\n"
	@printf "  make dev-full     Start local app after ensuring env, deps, and schema\n"
	@printf "  make build        Build the web app\n"
	@printf "  make start        Start the built web app\n"
	@printf "  make lint         Run Biome checks\n"
	@printf "  make format       Format the repo with Biome\n"
	@printf "  make postgres-up  Start only PostgreSQL in Docker\n"
	@printf "  make postgres-down Stop PostgreSQL container\n"
	@printf "  make db-push      Push schema to the database\n"
	@printf "  make db-generate  Generate Drizzle migrations\n"
	@printf "  make db-migrate   Run Drizzle migrations\n"
	@printf "  make db-studio    Open Drizzle Studio\n"
	@printf "  make docker-build Build the app image\n"
	@printf "  make docker-up    Start app + database with Docker\n"
	@printf "  make docker-down  Stop Docker services\n"
	@printf "  make docker-logs  Tail Docker logs\n"
	@printf "  make clean        Remove local build output\n\n"

install:
	$(PNPM) install

env:
	@if [ ! -f "$(ENV_FILE)" ]; then cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; fi

postgres-up: env
	$(DOCKER_COMPOSE) up -d postgres

postgres-down:
	$(DOCKER_COMPOSE) stop postgres

db-push: env
	$(PNPM) run db:push

db-generate: env
	$(PNPM) run db:generate

db-migrate: env
	$(PNPM) run db:migrate

db-studio: env
	$(PNPM) run db:studio

dev: postgres-up
	$(PNPM) dev

dev-full: env install postgres-up db-push
	$(PNPM) dev

build:
	$(PNPM) build

start:
	$(PNPM) start

lint:
	$(PNPM) lint

format:
	$(PNPM) format

docker-build: env
	$(DOCKER_COMPOSE) build

docker-up: env
	$(DOCKER_COMPOSE) up --build

docker-down:
	$(DOCKER_COMPOSE) down

docker-logs:
	$(DOCKER_COMPOSE) logs -f

clean:
	rm -rf apps/web/.next
	rm -f migrate.mjs
