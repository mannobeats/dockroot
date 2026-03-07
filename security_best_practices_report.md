# Security Best Practices Report

## Executive Summary

The repository is in materially better shape after this pass. I migrated the project from Bun to pnpm/Node.js, moved route protection to verified server-side session checks, added explicit auth hardening, added baseline response headers, and removed the optimistic cookie-check proxy boundary.

At the end of the audit, I did not find a current high-severity vulnerability in the shipped application code. One moderate dependency advisory remains in a transitive development-only tool path used by `drizzle-kit`; it is not exercised by the production app runtime, but it should still be tracked.

## Remediated Findings

### R-001

- Severity: High
- Location: `apps/web/app/(dashboard)/layout.tsx:1`, `apps/web/lib/session.ts:1`
- Evidence: The original route protection depended on an optimistic cookie presence check rather than validating a real session. The app now enforces `auth.api.getSession()` on the server before rendering dashboard routes.
- Impact: A cookie-existence check is not an authorization boundary. It can be spoofed and should not gate authenticated pages in a starter kit.
- Fix: Removed the optimistic proxy boundary, added a server session helper, and redirected unauthenticated users from the dashboard layout before render.

### R-002

- Severity: Medium
- Location: `apps/web/app/(auth)/layout.tsx:1`
- Evidence: Auth pages now verify the session on the server and redirect authenticated users away from `/sign-in` and `/sign-up`.
- Impact: This avoids relying on a client-side session hook for a state transition that should be enforced at render time.
- Fix: Added a server-side session check in the auth route-group layout.

### R-003

- Severity: Medium
- Location: `packages/auth/src/index.ts:1`, `packages/db/src/index.ts:1`
- Evidence: Better Auth now has explicit `secret`, `baseURL`, `trustedOrigins`, `rateLimit`, and `useSecureCookies` configuration sourced from required server env parsing.
- Impact: Starter kits should not rely on implicit env resolution for critical auth configuration, and production auth endpoints should have baseline rate limiting and cookie hardening.
- Fix: Added required env parsing plus Better Auth hardening defaults.

### R-004

- Severity: Medium
- Location: `next.config.ts:1`
- Evidence: The app now returns baseline hardening headers including CSP directives for `base-uri`, `form-action`, `frame-ancestors`, and `object-src`, plus COOP/CORP, `nosniff`, referrer policy, and permissions policy.
- Impact: Without these, the browser gets less defense-in-depth against clickjacking, MIME confusion, and some cross-origin attack classes.
- Fix: Added a safer default header set.

### R-005

- Severity: Low
- Location: `package.json:1`, `Dockerfile:1`, `start.sh:1`, `README.md:1`
- Evidence: The repo now builds and runs with Node.js and pnpm, uses `pnpm-lock.yaml`, and no longer depends on Bun-only runtime paths.
- Impact: The previous setup tied app lifecycle tasks to Bun-specific commands even though the app ultimately deploys as a Node.js Next.js server.
- Fix: Switched package management, Docker build, migration bundling, and docs to pnpm/Node.js and removed `bun.lock`.

## Remaining Findings

### F-001

- Severity: Medium
- Location: `package.json:22`, transitive path reported by `pnpm audit --prod`
- Evidence: `pnpm audit --prod` still reports `better-auth -> drizzle-kit -> @esbuild-kit/esm-loader -> @esbuild-kit/core-utils -> esbuild` with advisory `GHSA-67mh-4wv8-2f99`.
- Impact: This is a development-tool-chain dependency rather than a production runtime dependency, so the practical risk to the shipped app is lower. It still leaves the repo with a non-zero audit finding.
- Fix: No clean direct upgrade path was available from the registry today because the vulnerable path is pinned transitively inside the current `drizzle-kit` chain. Track upstream updates and retest after `better-auth` or `drizzle-kit` lifts that dependency.
- False positive notes: Verify your actual deployment artifact does not include this tool chain. In this repo, the production app runs from standalone Next.js output plus the bundled migration script, not from `drizzle-kit`.

## Additional Review Notes

- I did not find evidence of `dangerouslySetInnerHTML`, DOM injection sinks, dynamic code execution, open redirect parameters, or direct secret exposure through `NEXT_PUBLIC_*` variables in the application code.
- I did not verify reverse-proxy, TLS termination, WAF, or edge rate-limiting configuration because those controls are not present in this repo. Verify them in deployment infrastructure before exposing the app publicly.
