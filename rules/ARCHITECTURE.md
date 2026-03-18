# Architecture

## Project Structure

```
apps/
└── web/                    # Next.js app
    ├── app/                # App Router routes
    ├── components/         # Web-only UI components
    ├── lib/                # Web domain modules and helpers
    ├── public/             # Static assets
    └── next.config.ts      # App-specific Next config
server/
├── runtime/                # Runtime metrics/events/action journaling services
└── socket/                 # Socket auth, rate-limits, terminal/log services
packages/
├── auth/                   # Better Auth server configuration
│   └── src/
└── db/                     # Drizzle client, schema, migrations
    ├── drizzle/
    └── src/
```

## Route Groups

- **`apps/web/app/(auth)`** — Auth pages. Server-side redirect to `/dashboard` when a valid session exists.
- **`apps/web/app/(dashboard)`** — Authenticated pages. Server-side session check before rendering `Sidebar` + `Topbar`.
- **`apps/web/app/page.tsx`** — Landing page. Manually wraps with `PublicLayout`.

## Layout Hierarchy

```
RootLayout (fonts, Providers)
├── PublicLayout (Navbar + main + Footer)
│   └── Landing page
├── AuthLayout (brand logo + centered card)
│   ├── Sign In
│   └── Sign Up
└── DashboardLayout (Sidebar + Topbar + main)
    ├── Dashboard page (stats, activity, quick actions, charts)
    └── Settings page
```

## Sidebar

Two-part layout (icon rail + expandable panel):

- **Icon Rail** (60px) — Brand logo, nav icons, expand/collapse toggle, user avatar dropdown.
- **Expandable Panel** (260px) — Togglable. Search bar, grid/list view toggle, filter categories, tags. State persists in `localStorage`.

### Mobile Behavior

- **Hidden by default** on screens below `md` (768px)
- **Hamburger button** in `Topbar` toggles the sidebar as a slide-in overlay
- **Backdrop** dims the content area; tapping it closes the sidebar
- **Auto-closes** on route navigation
- On `md+`, sidebar is always visible in its sticky position (no overlay)

To add nav items, edit `SIDEBAR_NAV_ITEMS` in `apps/web/components/sidebar/constants.ts`.
To customize the panel composition, edit files under `apps/web/components/sidebar/`.

## Deployment Architecture

Dockroot has two explicit runtime modes:

```bash
make dev-lite   # Host app + PostgreSQL
make dev-full   # Host app + PostgreSQL
make prod-up    # Full Docker deployment
```

- `compose.dev-infra.yml` runs local infrastructure for host development
- `docker-compose.yaml` runs the full Docker deployment with the published Dockroot image
- `.env.local` is only for host development
- `.env` is only for Docker deployments
- Dockroot derives `DATABASE_URL` from `POSTGRES_*` settings when it is not set explicitly
- Docker deployments inject internal `POSTGRES_*` and `DOCKROOT_DATA_DIR` values
- `scripts/start.sh` validates runtime env, runs Drizzle migrations, then starts the app server

### Runtime Topology

- **Host development**
  `pnpm dev` runs on the host and talks to Dockerized PostgreSQL on localhost while collecting local telemetry directly from the Docker socket
- **Docker deployment**
  App and PostgreSQL run together in Compose
  The app talks to PostgreSQL over Docker DNS (`postgres`) and collects telemetry natively through the Docker socket

### Migration Flow

1. `packages/db/src/migrate.ts` — Programmatic migration script (bundled to `migrate.mjs` at build time)
2. `scripts/start.sh` — Container entrypoint: runs `migrate.mjs` then `server.mjs`
3. `packages/db/drizzle/` — SQL migration files (committed to git, generated via `pnpm run db:generate`)

## Adding a New Dashboard Page

1. Create `apps/web/app/(dashboard)/dashboard/<page>/page.tsx`
2. Add a nav entry in `apps/web/components/sidebar/constants.ts` → `SIDEBAR_NAV_ITEMS`
3. The sidebar + topbar layout is automatic — no extra wiring needed

## Structure Guardrails

- `pnpm run lint` runs Biome checks and structure conventions checks.
- `pnpm run typecheck` now includes:
  - TypeScript project checks
  - JavaScript `checkJs` checks for runtime `.mjs` files
  - Node syntax checks (`node --check`) for runtime entrypoints
- `.github/workflows/quality-gates.yml` enforces `pnpm lint` and `pnpm typecheck` on PRs and `main` pushes.
- Structure conventions are defined in `docs/codebase-structure-conventions.md`.
- Current enforcement script: `scripts/check-structure-conventions.mjs`.

## Adding a New Public Page

1. Create `apps/web/app/<page>/page.tsx`
2. Wrap the return with `<PublicLayout>...</PublicLayout>`
3. Or create a new route group with its own layout importing `PublicLayout`
