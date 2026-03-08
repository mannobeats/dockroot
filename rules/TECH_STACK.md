# Tech Stack

## Core

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16 | App Router, React 19, Turbopack |
| React | 19 | UI framework |
| HeroUI | v3 beta | Component library (React Aria + Tailwind v4) |
| Tailwind CSS | v4 | Utility-first styling |
| TypeScript | 5 | Type safety |

## Backend

| Technology | Purpose |
|-----------|---------|
| Better Auth | Email/password auth, sessions, cookie cache |
| Drizzle ORM | Type-safe SQL, migrations, schema management |
| PostgreSQL | Primary database (Dockerized via docker-compose) |
| postgres.js | Postgres driver |

## Tooling

| Tool | Purpose |
|------|---------|
| pnpm | Package manager (`pnpm install`, `pnpm dev`) |
| Node.js 22 | Runtime for local dev, builds, and container startup |
| Biome v2 | Linting + formatting (replaces ESLint + Prettier) |
| Docker | Local infra services and full single-host deployment |
| Turbopack | Dev server bundler (via `next dev --turbopack`) |

## Key Libraries

| Library | Purpose |
|---------|---------|
| next-themes | Dark/light mode switching |
| lucide-react | Icon library |
| recharts | Composable chart library (Area, Bar, Pie, etc.) |

## Recharts Notes

- **Composable API**: `<AreaChart>`, `<BarChart>`, `<PieChart>` with nested `<Area>`, `<Bar>`, `<Pie>`, `<Tooltip>`, etc.
- **Responsive**: Always wrap charts in `<ResponsiveContainer width="100%" height="100%">`
- **Theme-aware tooltips**: Use CSS variables for `contentStyle` (`var(--surface)`, `var(--border)`, etc.)
- **Grid/axis styling**: Use `var(--border)` for `CartesianGrid` stroke, `var(--muted)` for tick fill
- See dashboard page for working examples (area, bar, donut charts)

## HeroUI v3 Notes

- **Compound components**: `Card.Header`, `Card.Title`, `Card.Content`, `Card.Footer`
- **No Navbar component** — custom sidebar/navbar built from scratch
- **DropdownTrigger** renders its own `<button>` — never nest a `<button>` inside it
- **Button variants**: `primary`, `secondary`, `tertiary`, `outline`, `ghost`, `danger`, `danger-soft`
- **Card variants**: `default`, `secondary`, `tertiary`, `transparent`
- Prefer plain `div` with `border`/`bg-surface` over `Card` for custom layouts

## Scripts

```bash
pnpm dev               # Start dev server with Turbopack
pnpm build             # Production build
pnpm lint              # Check with Biome
pnpm lint:fix          # Auto-fix with Biome
pnpm format            # Format with Biome
pnpm run db:generate   # Generate migrations
pnpm run db:migrate    # Run migrations
pnpm run db:push       # Legacy schema sync for exceptional local recovery only
pnpm run db:studio     # Open Drizzle Studio
```

## Deployment

Preferred commands:

```bash
make dev-lite           # Host app + PostgreSQL
make dev-full           # Host app + PostgreSQL + monitoring stack
make prod-up            # Full Docker deployment
make prod-down          # Stop the Docker deployment
make prod-logs          # Tail the Docker deployment logs
```

- `Dockerfile` — Multi-stage Node.js build with standalone Next.js output
- `compose.dev-infra.yml` — Local infrastructure for host-run development
- `docker-compose.yaml` — Full Docker deployment with app, database, and monitoring
- `.dockerignore` — Excludes node_modules, app build output, and local env files from build context

## Environment Variables

```
DATABASE_URL          # Optional explicit PostgreSQL connection string
POSTGRES_HOST         # PostgreSQL host when DATABASE_URL is not set
POSTGRES_PORT         # PostgreSQL port when DATABASE_URL is not set
POSTGRES_DB           # PostgreSQL database name when DATABASE_URL is not set
POSTGRES_USER         # PostgreSQL username when DATABASE_URL is not set
POSTGRES_PASSWORD     # PostgreSQL password when DATABASE_URL is not set
BETTER_AUTH_SECRET    # Auth encryption secret (change in production!)
BETTER_AUTH_URL       # Auth base URL
BETTER_AUTH_TRUSTED_ORIGINS # Optional comma-separated extra trusted origins
SESSION_COOKIE_SECURE # Optional override for secure auth cookies
NEXT_PUBLIC_APP_NAME  # App display name
NEXT_PUBLIC_APP_URL   # Public app URL
PROMETHEUS_URL        # Metrics backend URL (injected by Docker deployment)
DOCKROOT_DATA_DIR     # Dockroot data directory (injected by Docker deployment)
```
