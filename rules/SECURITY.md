# Security

## Environment Variables

- **Never** commit `.env.local` — it's gitignored
- `.env.example` is tracked as a reference template
- `BETTER_AUTH_SECRET` must be a strong random string in production
- All `NEXT_PUBLIC_*` vars are exposed to the browser — never put secrets there

## HTTP Headers

Configured in `apps/web/next.config.ts` for all routes:

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevents clickjacking |
| X-Content-Type-Options | nosniff | Prevents MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer leakage |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Restricts browser APIs |

## Route Protection

- `apps/web/lib/session.ts` resolves the authenticated session on the server with Better Auth
- `apps/web/app/(dashboard)/layout.tsx` redirects unauthenticated users before protected pages render
- `apps/web/app/(auth)/layout.tsx` redirects authenticated users away from sign-in and sign-up pages
- Client-side `useSession()` is a convenience layer only, not the primary security boundary

## Authentication

- Better Auth handles email/password auth with server-side sessions
- Session cookies use `cookieCache` with 5-minute TTL
- Auth routes are at `/api/auth/[...all]`
- Client-side auth via `useSession()` hook from `@/lib/auth-client`
- The authoritative auth configuration lives in `packages/auth/src/index.ts`

## Database

- PostgreSQL runs in Docker — never expose port 5432 publicly in production
- Use parameterized queries via Drizzle ORM — never concatenate SQL strings
- DB credentials live in `DATABASE_URL` env var only
