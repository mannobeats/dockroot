# Dockroot

Dockroot is a compose-native Docker deployment and management control plane for self-hosted infrastructure. It combines stack deployment, runtime operations, live logs, shell access, monitoring, GitHub-driven delivery, and tenant-aware access control in a single web application.

## Why Dockroot

- Deploy Docker Compose stacks from a structured control plane
- Operate containers with logs, shell, metrics, and file access
- Separate privileged host operations from tenant-scoped workloads
- Support local execution today with groundwork for remote agents and hosted PaaS models
- Ship as a single open-source project with first-party container images

## Architecture

Dockroot is organized as a small monorepo:

```text
apps/
  web/        Next.js application, dashboard, API routes, server actions
packages/
  auth/       Better Auth configuration and role-aware session logic
  db/         Drizzle schema, migrations, and shared database client
server.mjs    Custom Next.js + Socket.IO server for live logs and terminal sessions
```

Core runtime pieces:

- `Next.js 16` with App Router for the control plane UI
- `Better Auth` for email/password auth and role-based sessions
- `PostgreSQL` for users, projects, environments, stacks, and deployments
- `Socket.IO` for live logs, terminal sessions, and runtime updates
- `Docker Engine` access through the host socket
- `Prometheus`, `cAdvisor`, and `node-exporter` for host and container telemetry

## Features

- Project, environment, and stack management
- Manual Docker Compose deployment workflows
- Tenant-aware visibility for stacks, deployments, and runtime containers
- Privileged host operations for images, networks, volumes, and settings
- Live container logs and browser shell access
- Protected self-management for Dockroot’s own core services
- Metrics endpoint protection with Prometheus bearer-token scraping
- GitHub App integration surfaces for repository-backed delivery

## Open Source License

Dockroot is licensed under the `GNU Affero General Public License v3.0` (`AGPL-3.0-only`). See [LICENSE](./LICENSE).

## Container Image

The GitHub Actions workflow publishes Dockroot to:

```text
ghcr.io/mannobeats/dockroot
```

Tag strategy:

- `latest` on `main`
- branch refs
- git tags such as `v0.1.0`
- commit SHA tags

## Production Deployment

The example below is the recommended single-host deployment. It runs Dockroot, PostgreSQL, Prometheus, cAdvisor, and node-exporter together so the dashboard features match the full platform architecture.

### 1. Create a `.env`

Start from the canonical template:

```bash
cp .env.example .env
```

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dockroot
POSTGRES_DB=dockroot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-a-strong-database-password

BETTER_AUTH_SECRET=replace-with-a-strong-random-secret
BETTER_AUTH_URL=https://dockroot.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://dockroot.example.com
SESSION_COOKIE_SECURE=true

NEXT_PUBLIC_APP_NAME=Dockroot
NEXT_PUBLIC_APP_URL=https://dockroot.example.com
DOCKROOT_DATA_DIR=.dockroot
PROMETHEUS_URL=http://localhost:9090

DOCKROOT_ALLOW_PUBLIC_SIGNUP=false
DOCKROOT_TOKEN_PEPPER=replace-with-a-second-strong-random-secret
METRICS_BEARER_TOKEN=replace-with-a-third-strong-random-secret

GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_APP_STATE_SECRET=
```

Generate strong values with:

```bash
openssl rand -base64 48
openssl rand -hex 32
```

Validate the env before deploying:

```bash
docker run --rm --env-file .env ghcr.io/mannobeats/dockroot:latest node /app/runtime-env.mjs --production
```

### 2. Create `docker-compose.yml`

```yaml
services:
  app:
    image: ghcr.io/mannobeats/dockroot:latest
    container_name: dockroot-app
    restart: unless-stopped
    env_file:
      - .env
    environment:
      HOSTNAME: 0.0.0.0
      PORT: 3000
      DATABASE_URL: postgresql://dockroot:${POSTGRES_PASSWORD}@postgres:5432/dockroot
      DOCKROOT_DATA_DIR: /var/lib/dockroot
      PROMETHEUS_URL: http://prometheus:9090
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      prometheus:
        condition: service_started
    volumes:
      - dockroot_data:/var/lib/dockroot
      - /var/run/docker.sock:/var/run/docker.sock

  postgres:
    image: postgres:17-alpine
    container_name: dockroot-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: dockroot
      POSTGRES_USER: dockroot
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dockroot -d dockroot"]
      interval: 5s
      timeout: 5s
      retries: 10

  prometheus:
    image: prom/prometheus:v3.5.0
    container_name: dockroot-prometheus
    restart: unless-stopped
    env_file:
      - .env
    entrypoint:
      - /bin/sh
      - -ec
    command:
      - |
        cat >/tmp/prometheus.yml <<EOF
        global:
          scrape_interval: 15s
          evaluation_interval: 15s

        scrape_configs:
          - job_name: prometheus
            static_configs:
              - targets: ["prometheus:9090"]

          - job_name: dockroot_app
            metrics_path: /api/metrics
            authorization:
              type: Bearer
              credentials: $${METRICS_BEARER_TOKEN}
            static_configs:
              - targets: ["app:3000"]
                labels:
                  service: dockroot-manager

          - job_name: dockroot_host_dev
            metrics_path: /api/metrics
            authorization:
              type: Bearer
              credentials: $${METRICS_BEARER_TOKEN}
            static_configs:
              - targets: ["host.docker.internal:3000"]
                labels:
                  service: dockroot-host-dev

          - job_name: cadvisor
            static_configs:
              - targets: ["cadvisor:8080"]
                labels:
                  service: cadvisor

          - job_name: node_exporter
            static_configs:
              - targets: ["node-exporter:9100"]
                labels:
                  service: node-exporter
        EOF

        exec /bin/prometheus \
          --config.file=/tmp/prometheus.yml \
          --storage.tsdb.path=/prometheus \
          --web.enable-lifecycle
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.52.1
    container_name: dockroot-cadvisor
    restart: unless-stopped
    privileged: true
    devices:
      - /dev/kmsg
    ports:
      - "8081:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk:/dev/disk:ro

  node-exporter:
    image: prom/node-exporter:v1.9.1
    container_name: dockroot-node-exporter
    restart: unless-stopped
    command:
      - --path.rootfs=/host
    ports:
      - "9100:9100"
    volumes:
      - /:/host:ro

volumes:
  dockroot_data:
  postgres_data:
  prometheus_data:
```

### 3. Start the stack

```bash
docker compose up -d
```

Open Dockroot at `http://localhost:3000` or your configured domain. The first account created becomes the instance `owner`.

The deployment env stays intentionally small:

- `POSTGRES_PASSWORD` is the only database value you set manually.
- `DATABASE_URL`, `PROMETHEUS_URL`, and `DOCKROOT_DATA_DIR` are derived in Compose so they cannot drift out of sync.
- Everything else in `.env` is either a real secret or a public URL.
- In production, replace the `localhost` URLs in `.env` with your real app URL. The production compose file ignores the local `DATABASE_URL`, `PROMETHEUS_URL`, and `DOCKROOT_DATA_DIR` values and injects its own internal service URLs.

If Dockroot exits immediately on boot, check the startup logs first. The container now validates the runtime env before migrations and reports common mistakes directly, including missing secrets, placeholder values, localhost production URLs, and broken `DATABASE_URL` passwords with unencoded `@` characters.

## GitHub Container Publish Workflow

The repository includes [publish-image.yml](./.github/workflows/publish-image.yml), which:

- logs in to `ghcr.io`
- builds the production image from the project `Dockerfile`
- pushes `ghcr.io/mannobeats/dockroot`
- emits OCI metadata and license labels

For public repositories, `GITHUB_TOKEN` is enough for GHCR publishing in most cases. If your package visibility or org policy requires it, configure package permissions in GitHub accordingly.

## Local Development

```bash
pnpm install
cp .env.example .env.local
docker compose up -d
pnpm run db:push
pnpm dev
```

For local development, keep the `localhost` defaults from `.env.example`. They are intentional for `.env.local`.

Useful commands:

| Command | Description |
| --- | --- |
| `pnpm dev` | Run Dockroot locally through `server.mjs` |
| `pnpm build` | Create the production build |
| `pnpm start` | Start the production server from `.env.local` |
| `pnpm lint` | Run Biome checks |
| `pnpm lint:fix` | Apply Biome fixes |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:push` | Push schema directly to the database |
| `pnpm db:studio` | Open Drizzle Studio |

## Security Notes

- Disable public sign-up in production with `DOCKROOT_ALLOW_PUBLIC_SIGNUP=false`
- Use strong random values for `BETTER_AUTH_SECRET`, `DOCKROOT_TOKEN_PEPPER`, and `METRICS_BEARER_TOKEN`
- Put Dockroot behind TLS before enabling secure cookie mode on a public domain
- The app requires Docker socket access for host-level runtime management

## Roadmap Direction

Dockroot currently enforces ownership-based isolation inside a single control plane. The longer-term path is first-class tenant and server isolation for hosted or bring-your-own-server PaaS scenarios.
