# Dockroot

A production-ready Next.js template for building self-hosted applications. Designed for IT professionals and homelab enthusiasts.

## Tech Stack

- **Framework** — [Next.js 16](https://nextjs.org) (App Router, React 19, Turbopack)
- **UI** — [HeroUI v3](https://v3.heroui.com) + [Tailwind CSS v4](https://tailwindcss.com)
- **Database** — [PostgreSQL](https://www.postgresql.org) via [Drizzle ORM](https://orm.drizzle.team)
- **Auth** — [Better Auth](https://www.better-auth.com) (email/password, sessions)
- **Linting** — [Biome](https://biomejs.dev) (lint + format)
- **Package Manager** — [pnpm](https://pnpm.io)
- **Icons** — [Lucide](https://lucide.dev)
- **Deployment** — Docker + docker-compose

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v22+)
- [pnpm](https://pnpm.io/installation) (v10+)
- [Docker](https://www.docker.com) & Docker Compose

### 1. Clone & Install

```bash
git clone <your-repo-url> my-app
cd my-app
pnpm install
```

### 2. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values. For development, the defaults work out of the box.

### 3. Start PostgreSQL

```bash
docker compose up -d
```

### 4. Push Database Schema

```bash
pnpm run db:push
```

### 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `pnpm dev`             | Start dev server with Turbopack  |
| `pnpm build`           | Production build                 |
| `pnpm start`           | Start production server          |
| `pnpm lint`            | Lint with Biome                  |
| `pnpm lint:fix`        | Lint and auto-fix                |
| `pnpm format`          | Format with Biome                |
| `pnpm run db:generate` | Generate Drizzle migrations      |
| `pnpm run db:migrate`  | Run Drizzle migrations           |
| `pnpm run db:push`     | Push schema directly to database |
| `pnpm run db:studio`   | Open Drizzle Studio              |

## Workspace Structure

```
apps/
└── web/                  # Next.js app (App Router, UI, route handlers)
    ├── app/
    ├── components/
    └── lib/
packages/
├── auth/                 # Better Auth server package
└── db/                   # Drizzle schema, client, migrations
    ├── drizzle/
    └── src/
```

## Docker Production Build

```bash
docker build -t dockroot .
docker run -p 3000:3000 --env-file .env.local dockroot
```

Or use the full stack with compose:

```bash
docker compose -f docker-compose.yaml up -d
```

## Customization

1. **App Name** — Change `NEXT_PUBLIC_APP_NAME` in `.env.local`
2. **Database** — Edit schema in `packages/db/src/schema/`, run `pnpm run db:push`
3. **Auth** — Configure providers in `packages/auth/src/index.ts`
4. **Theme** — HeroUI theming via `apps/web/app/globals.css`
5. **Components** — Browse [HeroUI v3 docs](https://v3.heroui.com/docs/react/components)
