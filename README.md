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
scripts/      Runtime helpers and container entrypoint scripts
server.mjs    Custom Next.js + Socket.IO server for live logs and terminal sessions
```

Core runtime pieces:

- `Next.js 16` with App Router for the control plane UI
- `Better Auth` for email/password auth and role-based sessions
- `PostgreSQL` for users, environments, stacks, and deployments
- `Socket.IO` for live logs, terminal sessions, and runtime updates
- `Docker Engine` access through the host socket
- `Prometheus`, `cAdvisor`, and `node-exporter` for host and container telemetry

## Features

- Stack and environment management
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

## Deployment Modes

Dockroot now has explicit deployment modes.

### 1. Local host development

Use this when you want live code changes and the web app running on your machine.

```bash
cp .env.example .env.local
make dev-full
```

What it does:

- runs the app on the host with `pnpm dev`
- starts PostgreSQL, Prometheus, cAdvisor, and node-exporter in Docker
- keeps the full monitoring experience available in the UI

If you only want PostgreSQL:

```bash
make dev-lite
```

### 2. Docker deployment

Use this when you want the full platform to run in Docker with the published image.

```bash
docker compose -f docker-compose.yaml up -d
```

Use Docker Compose v2 (`docker compose ...`). Avoid legacy `docker-compose` v1, which is deprecated and can fail on recreate with errors like `KeyError: 'ContainerConfig'`.

What it does:

- runs Dockroot, PostgreSQL, Prometheus, cAdvisor, and node-exporter in Docker
- bootstraps internal secrets automatically on first run
- keeps monitoring built in by default

Optional production overrides:

- `APP_URL=https://dockroot.example.com` when running behind a reverse proxy or custom domain
- `BETTER_AUTH_TRUSTED_ORIGINS=https://dockroot.example.com` to explicitly trust auth request origins
  (comma-separated when needed, for example `https://dockroot.example.com,http://10.0.10.70:3080`)
- `GITHUB_APP_STATE_SECRET=...` only if you want to override state signing secret for GitHub onboarding

Open Dockroot at `http://localhost:3080` or your configured domain. The first account created becomes the instance `owner`.

### GitHub App Onboarding

Dockroot uses manifest-first onboarding:

1. Open stacks page, choose GitHub, and enter an app name (optional organization owner)
2. Click **New App** to open GitHub with Dockroot manifest fields prefilled
3. Complete GitHub's create + install flow, then return to Dockroot and pick repositories
4. Repeat as needed to register multiple GitHub Apps in one Dockroot instance

Dockroot preconfigures these manifest defaults:

- webhook URL: `<APP_URL>/api/github/webhook`
- redirect URL: `<APP_URL>/api/github/app/manifest/callback`
- setup URL: `<APP_URL>/dashboard/stacks?github=connected`
- repository permissions: `contents: read`, `metadata: read`, `pull_requests: write`
- events: `push`, `installation`, `installation_repositories`

Webhook push deploys are idempotent by delivery id and support per-stack auto-deploy path filters.

### File roles

- `compose.dev-infra.yml`
  Local infrastructure only. Used by `make dev-full` and `make dev-lite`.
- `docker-compose.yaml`
  Full Docker deployment for users and production-style single-host installs.
- `.env.example`
  Optional overrides for both local development and Docker deployments.

### Environment rules

- `.env.local` is optional and only used for local overrides like `APP_URL`
- If you want override files, use `.env.example` as the single template for both local and Docker installs
- Docker deployments do not require a `.env` file
- Dockroot generates its internal secrets on first boot and persists them in the data directory or Docker volume
- Dockroot derives `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, cookie security, database credentials, and metrics auth from the bootstrap runtime config
- `APP_URL` should be the public URL users access (for reverse proxy installs, use your `https://` domain)
- `BETTER_AUTH_TRUSTED_ORIGINS` is optional but recommended for explicit auth origin control
- If users access Dockroot from multiple origins (for example both domain and LAN IP), set all origins in `BETTER_AUTH_TRUSTED_ORIGINS` as a comma-separated list
- GitHub App credentials can be bootstrapped in-product using the manifest flow at runtime (stored encrypted in the database)

### Startup behavior

On container boot, Dockroot now:

1. bootstraps runtime config and secrets
2. validates runtime environment
3. runs database migrations
4. starts the app server

If Dockroot exits immediately on boot, check container logs first. Startup validation reports missing secrets, placeholder values, localhost production URLs, and malformed database credentials directly.

## GitHub Container Publish Workflow

The repository includes [publish-image.yml](./.github/workflows/publish-image.yml), which:

- logs in to `ghcr.io`
- builds the production image from the project `Dockerfile`
- pushes `ghcr.io/mannobeats/dockroot`
- emits OCI metadata and license labels

For public repositories, `GITHUB_TOKEN` is enough for GHCR publishing in most cases. If your package visibility or org policy requires it, configure package permissions in GitHub accordingly.

## Local Development

Recommended:

```bash
make dev-full
```

Minimal:

```bash
make dev-lite
```

Useful commands:

| Command | Description |
| --- | --- |
| `make dev-lite` | Host app + PostgreSQL only |
| `make dev-full` | Host app + PostgreSQL + monitoring stack |
| `make prod-up` | Full Docker deployment |
| `make prod-down` | Stop the Docker deployment |
| `make prod-logs` | Tail Docker deployment logs |
| `pnpm dev` | Run Dockroot locally through `server.mjs` |
| `pnpm build` | Create the production build |
| `pnpm start` | Start the production server with bootstrapped local runtime config |
| `pnpm lint` | Run Biome checks |
| `pnpm lint:fix` | Apply Biome fixes |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:push` | Legacy schema sync for exceptional local recovery only |
| `pnpm db:studio` | Open Drizzle Studio |

## Security Notes

- Dockroot now generates strong internal secrets automatically and persists them in storage
- Set `APP_URL` to an `https://` origin when deploying behind a public reverse proxy or custom domain
- Keep `BETTER_AUTH_TRUSTED_ORIGINS` aligned with every origin that should be allowed to call auth endpoints
- GitHub App private keys and webhook secrets created through Dockroot are encrypted at rest
- GitHub workflows are enabled through manifest bootstrap in the Dockroot UI
- The app requires Docker socket access for host-level runtime management

## Roadmap Direction

Dockroot currently enforces ownership-based isolation inside a single control plane. The longer-term path is first-class tenant and server isolation for hosted or bring-your-own-server PaaS scenarios.
