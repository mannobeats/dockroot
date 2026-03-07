# Code Style

## General

- **TypeScript strict** — no `any`, no unused imports, no unused variables
- **Biome** for linting and formatting — run `pnpm lint:fix` before committing
- **Tabs** for indentation, **double quotes**, **semicolons always**
- **Line width**: 100 characters max

## File Organization

- One component per file
- Imports order (enforced by Biome): external libs → internal `@/` aliases → relative
- `"use client"` directive at the very top when needed — only add it to components that use hooks, browser APIs, or event handlers

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Components | PascalCase | `Sidebar`, `ThemeToggle` |
| Files | kebab-case | `theme-toggle.tsx`, `auth-client.ts` |
| Route folders | kebab-case | `sign-in`, `dashboard` |
| Route groups | parentheses | `(auth)`, `(dashboard)` |
| DB schemas | camelCase exports, snake_case tables | `export const user`, table `"user"` |
| Env vars | UPPER_SNAKE | `DATABASE_URL`, `NEXT_PUBLIC_APP_NAME` |

## Component Structure

```tsx
"use client"; // only if needed

// 1. External imports
import { Button } from "@heroui/react";
import { Settings } from "lucide-react";

// 2. Internal imports
import { useSession } from "@/lib/auth-client";

// 3. Types (if any)
interface Props { ... }

// 4. Constants (if any)
const items = [...];

// 5. Component
export function MyComponent({ prop }: Props) {
  // hooks first
  // handlers next
  // early returns (loading, auth guards)
  // main render
}
```

## Separation of Concerns

- **`apps/web/components/`** — Reusable UI for the web app only. No business logic.
- **`apps/web/lib/`** — Web-app helpers and client wrappers. No server auth or DB ownership.
- **`packages/auth/`** — Better Auth server configuration and shared auth logic.
- **`packages/db/`** — Database client, schema, and migrations only.
- **`apps/web/app/api/`** — Route handlers. Thin — delegate to packages or lib helpers.
- **`apps/web/app/(group)/page.tsx`** — Page components. Can fetch data and compose UI.

## Do NOT

- Hardcode colors — use HeroUI tokens (see `rules/UI.md`)
- Use `eslint` — this project uses Biome exclusively
- Use `npm` or `yarn` — this project uses pnpm
- Skip `type="button"` on non-submit buttons
- Use `console.log` in committed code
