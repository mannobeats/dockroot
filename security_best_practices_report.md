# Security Best Practices Report

Date: March 8, 2026

## Executive Summary

This codebase is not production-ready in its current form.

The main issue is not syntax or build stability. `pnpm lint` passes and a production `pnpm build` succeeds when network access is available for Google Fonts. The blocking problems are architectural security gaps around remote control surfaces:

1. the Socket.IO server exposes shell and log streaming without any authentication or authorization,
2. public self-service sign-up is enabled in an app that grants host-level Docker control after login,
3. tenant isolation is incomplete and currently leaks deployment data across accounts.

I also confirmed at runtime that `GET /api/metrics` is publicly readable and the Socket.IO polling handshake is reachable without authentication from `http://127.0.0.1:3000`.

## Verification Performed

- Static review of the Next.js app, shared auth package, DB schema, Docker/runtime helpers, agent routes, and GitHub integration
- `pnpm lint` -> passed
- `pnpm build` -> passed after allowing network access for `next/font`
- Runtime HTTP checks against the local app:
  - `GET /sign-in` returned `200`
  - `GET /api/metrics` returned `200` with live infrastructure metrics
  - `GET /socket.io/?EIO=4&transport=polling` returned a Socket.IO session handshake without authentication

## Critical Findings

### F-001

- Severity: Critical
- Rule ID: NEXT-AUTHZ-001
- Location: `server.mjs:42`, `server.mjs:52`, `server.mjs:87`, `server.mjs:172`
- Evidence: The Socket.IO server accepts any connection, enables `cors.origin = true`, and never binds the socket to a validated user session before allowing `terminal:create`, `logs:subscribe`, or arbitrary room joins.
- Impact: Any reachable client can open a host shell, attach to containers, stream logs, and subscribe to internal deployment rooms without first authenticating through the app. This is effectively remote command execution on the manager host.
- Fix: Require session authentication during the Socket.IO handshake, reject unauthenticated sockets, and add per-event authorization checks so a socket can only access resources owned by the authenticated user.
- Mitigation: Disable the shell and log streaming features entirely until the socket layer is protected.
- False positive notes: Runtime confirmed on March 8, 2026: `GET /socket.io/?EIO=4&transport=polling` returned `200 OK` and a valid Engine.IO session payload without credentials.

### F-002

- Severity: Critical
- Rule ID: NEXT-AUTHZ-002
- Location: `packages/auth/src/index.ts:32`, `apps/web/app/(auth)/sign-up/page.tsx:23`, `apps/web/app/(dashboard)/actions.ts:205`, `apps/web/app/(dashboard)/actions.ts:231`, `apps/web/app/(dashboard)/actions.ts:247`, `apps/web/app/(dashboard)/actions.ts:279`, `apps/web/app/(dashboard)/actions.ts:310`
- Evidence: Email/password auth is globally enabled, the public sign-up page calls `signUp.email(...)`, and authenticated users can then invoke host-level actions including container control, compose control, image pulls/removals, volume/network mutations, and deployments.
- Impact: On any internet-exposed deployment, a new attacker can register an account and immediately gain effective infrastructure-admin capabilities over the Docker host.
- Fix: Decide on an access model and enforce it. For a control-plane product like this, default to invite-only or bootstrap-admin-only registration, then add explicit roles such as `owner`, `admin`, and `viewer` with server-side authorization around every destructive action.
- Mitigation: Remove or disable `/sign-up` in production until RBAC exists.
- False positive notes: If this product is intentionally single-user, document that clearly and still disable self-service registration after bootstrap.

## High Findings

### F-003

- Severity: High
- Rule ID: NEXT-DATA-001
- Location: `apps/web/lib/platform.ts:185`, `apps/web/lib/platform.ts:404`, `apps/web/app/(dashboard)/dashboard/page.tsx:175`, `apps/web/app/(dashboard)/dashboard/activity/page.tsx:13`
- Evidence: `getDashboardData()` fetches `recentDeployments` without filtering by `createdByUserId`, and `listDeployments()` returns the latest 25 deployments globally, then both dashboard pages render the associated stack names, environment names, status, summaries, and logs.
- Impact: One account can see other tenants' deployment history and logs, which leaks stack names, environment names, operational status, and potentially secrets embedded in deployment output.
- Fix: Filter deployments through stack ownership in the query layer, not in the page layer. The safest pattern is to join through `stacks` and require `stacks.createdByUserId = userId` for every deployment read.
- Mitigation: Remove deployment logs from shared views until queries are tenant-safe.
- False positive notes: The code currently filters some counters by user, which makes this inconsistency easy to miss during manual testing.

### F-004

- Severity: High
- Rule ID: NEXT-AUTHZ-003
- Location: `apps/web/lib/platform.ts:564`, `apps/web/lib/platform.ts:797`
- Evidence: `createStack()` and `createGitHubStack()` trust the caller-supplied `projectId` and `environmentId` and insert rows directly without verifying that both referenced resources belong to the authenticated user.
- Impact: If an attacker learns another tenant's project or environment ID, they can create cross-tenant relationships, pollute another tenant's workspace, and potentially route deployments through an environment they do not own.
- Fix: Look up the referenced project and environment by `(id, createdByUserId)` before inserting the stack, and reject mismatches.
- Mitigation: Add database-level protection where possible, such as composite foreign-key patterns or application-enforced ownership invariants.
- False positive notes: The current stack read paths often filter by `createdByUserId`, but the write path still allows invalid cross-tenant references to be created.

## Medium Findings

### F-005

- Severity: Medium
- Rule ID: NEXT-INFO-001
- Location: `apps/web/app/api/metrics/route.ts:6`
- Evidence: The metrics route returns the full Prometheus registry without checking a session or bearer token.
- Impact: Anonymous callers can enumerate project counts, deployment counts by status, container/image/volume/network totals, memory usage, process stats, and Node.js runtime telemetry. This materially improves recon for attackers and leaks internal platform state.
- Fix: Protect `/api/metrics` behind a dedicated metrics token, private network boundary, or authenticated admin check.
- Mitigation: If Prometheus scraping is required, expose a separate private bind address or reverse-proxy ACL for metrics only.
- False positive notes: Runtime confirmed on March 8, 2026: `GET /api/metrics` returned `200 OK` with live metrics and no authentication.

### F-006

- Severity: Medium
- Rule ID: NEXT-REDIRECT-001
- Location: `apps/web/app/api/github/install/route.ts:20`, `apps/web/app/api/github/callback/route.ts:26`, `apps/web/app/api/github/callback/route.ts:45`
- Evidence: `redirectTo` is accepted from the query string, signed, stored in a cookie, and then passed to `new URL(...)` during the callback redirect without constraining it to an internal path.
- Impact: An attacker can send a victim through the GitHub install flow and bounce them to an arbitrary external URL after completion, which enables phishing and trust abuse.
- Fix: Only allow internal relative paths that start with `/dashboard` or another explicit allowlist.
- Mitigation: If cross-origin redirects are ever required, use a strict allowlist of exact origins.
- False positive notes: State signing protects integrity, not destination safety.

### F-007

- Severity: Medium
- Rule ID: NEXT-SECRETS-003
- Location: `packages/db/src/schema/platform.ts:80`, `packages/db/src/schema/platform.ts:81`, `apps/web/lib/platform.ts:945`, `apps/web/lib/platform.ts:980`
- Evidence: Agent registration tokens and long-lived access tokens are stored and looked up in plaintext.
- Impact: A database leak immediately becomes agent compromise because the stored token is the bearer credential. There is no additional cryptographic boundary.
- Fix: Store a hash of each token, compare via a derived hash during lookup, and rotate tokens on re-registration.
- Mitigation: Reduce token lifetime and add explicit revocation/rotation support.
- False positive notes: Long random tokens are good for entropy, but they still should not be stored as reusable secrets in cleartext.

## Additional Implementation Risks

### R-001

- Severity: Medium
- Location: `apps/web/app/api/containers/[containerId]/files/route.ts:24`, `apps/web/lib/platform/docker.ts:322`, `apps/web/lib/platform/docker.ts:359`
- Evidence: Any authenticated session can write, upload, or delete arbitrary paths in any named container once the container ID is known.
- Impact: This is consistent with the product's current "all logged-in users are operators" model, but it becomes a major privilege-escalation path in any multi-user deployment.
- Recommendation: When RBAC is added, scope container file access to resources reachable through owned stacks/environments and keep explicit audit logs for file mutations.

### R-002

- Severity: Low
- Location: `apps/web/app/api/github/callback/route.ts:15`
- Evidence: The callback parses auth cookies by applying a regex to the raw `cookie` header instead of using the framework cookie API.
- Impact: This is brittle and easier to get wrong as cookie handling evolves.
- Recommendation: Switch to `request.cookies.get(...)` or `cookies()` so decoding and parsing stay framework-managed.

## Remediation Plan

### Phase 1: Block Internet-Exposed Abuse Immediately

1. Disable public sign-up in production.
2. Remove or hard-disable shell, live logs, and container file mutation features until socket and action authorization is complete.
3. Put `/api/metrics` behind a private boundary or admin token.

### Phase 2: Establish Real Authorization

1. Add a role model to the user table and enforce it in server actions, route handlers, and socket events.
2. Authenticate Socket.IO handshakes from the Better Auth session cookie.
3. Require resource ownership checks for every stack, project, environment, deployment, and container operation.

### Phase 3: Repair Tenant Isolation

1. Fix every deployment query to join through stack ownership.
2. Review all list/detail functions for missing `createdByUserId` predicates.
3. Add regression tests for cross-account reads and writes.

### Phase 4: Secret Hygiene and Operational Hardening

1. Hash agent tokens at rest and add token rotation.
2. Add audit logging for destructive runtime actions.
3. Move runtime admin endpoints behind rate limiting and, where appropriate, CSRF-resistant POST patterns.

## Overall Readiness

The underlying app compiles and the UI surface appears mostly coherent from a static perspective, but the control plane is still operating with a "logged in means root-equivalent" trust model and an unauthenticated websocket backdoor. Until those issues are fixed, this should not be deployed to production or exposed to untrusted networks.
