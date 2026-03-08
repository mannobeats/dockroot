# Dockroot Security And Reliability Review

## Executive Summary

Dockroot has a solid baseline in a few areas: server-side session checks are broadly present, Better Auth is configured with secure-cookie toggles, the app has baseline security headers, and the new deployment/env structure is much cleaner than before. The main production blockers are in runtime-control surfaces and bootstrap/state races, not in the basic auth scaffolding.

The highest-risk issues are:

1. command injection risk in container file operations
2. plaintext agent bearer tokens plus full-table token lookup
3. owner-assignment race on first-user creation

Those three should be treated as release blockers for a production control plane.

---

## Critical Findings

### 1. Command injection in container file-management paths

- Rule ID: NEXT-INJECT-001
- Severity: Critical
- Location:
  - [apps/web/lib/platform/docker.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform/docker.ts#L322)
  - [apps/web/lib/platform/docker.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform/docker.ts#L337)
  - [apps/web/lib/platform/docker.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform/docker.ts#L359)
  - [packages/agent/src/index.mjs](/Users/mannobeats/Documents/Software%20Development/dockroot/packages/agent/src/index.mjs#L158)
  - [packages/agent/src/index.mjs](/Users/mannobeats/Documents/Software%20Development/dockroot/packages/agent/src/index.mjs#L173)
  - [packages/agent/src/index.mjs](/Users/mannobeats/Documents/Software%20Development/dockroot/packages/agent/src/index.mjs#L190)
- Evidence:
  - `mkdir -p "${parentPath.replaceAll('"', '\\"')}"`
  - `mkdir -p "${targetDirectory.replaceAll('"', '\\"')}"`
  - `rm -rf "${targetPath.replaceAll('"', '\\"')}"`
- Impact:
  User-controlled paths are interpolated into `sh -lc` strings. Double-quote escaping is not sufficient against shell expansion such as `$(...)` or backticks, so an attacker with container file access can potentially execute arbitrary shell commands inside the target container.
- Fix:
  Remove shell interpolation entirely for path-handling operations. Use `docker exec` with argv-safe forms, or pass the path through an environment variable and reference it as a quoted variable inside a constant script. Reject dangerous path patterns and normalize to a safe subset before execution.
- Mitigation:
  Disable container file write/delete features in production until this path is fixed.

---

## High Findings

### 2. Agent registration and access tokens are stored in plaintext and matched by scanning the full agents table

- Rule ID: NEXT-SECRETS-001
- Severity: High
- Location:
  - [apps/web/lib/platform.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform.ts#L637)
  - [apps/web/lib/platform.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform.ts#L1219)
  - [apps/web/lib/platform.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform.ts#L1245)
  - [apps/web/lib/platform.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform.ts#L1293)
- Evidence:
  - new agent environments persist `registrationToken` directly
  - `registerAgent` persists `accessToken` directly
  - token lookup loads all agents with `findMany()` and compares in application code
- Impact:
  A database leak or debug exposure immediately yields live agent credentials. Full-table token lookup also scales poorly and creates an avoidable hot path for every heartbeat, registration, and job-claim operation.
- Fix:
  Hash registration and access tokens before storing them, add indexed hash columns, and query by hash instead of loading all agents into memory. Keep plaintext tokens only at issuance time.
- Mitigation:
  Rotate all registration and access tokens after implementing hashed storage.

### 3. First-user owner assignment is race-prone

- Rule ID: NEXT-AUTHZ-001
- Severity: High
- Location:
  - [packages/auth/src/index.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/packages/auth/src/index.ts#L66)
- Evidence:
  - the role decision uses `count()` of existing users in a `before create` hook
  - there is no transaction or uniqueness invariant enforcing a single owner bootstrap
- Impact:
  Two concurrent first-user signups can both observe zero users and both become `owner`. That is a privilege-escalation race at instance bootstrap.
- Fix:
  Enforce owner bootstrap in a transaction or add a dedicated instance-bootstrap table/lock. At minimum, perform the first-owner decision under a DB constraint that guarantees only one row can win.
- Mitigation:
  Keep public signup off in production until first-user bootstrap is made atomic.

### 4. Agent installer exposes registration tokens in URL paths and generated shell scripts

- Rule ID: NEXT-SECRETS-001
- Severity: High
- Location:
  - [apps/web/app/api/agent/install/[token]/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/agent/install/[token]/route.ts#L6)
  - [apps/web/app/api/agent/install/[token]/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/agent/install/[token]/route.ts#L24)
  - [apps/web/app/api/agent/install/[token]/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/agent/install/[token]/route.ts#L43)
- Evidence:
  - registration token is accepted as a URL path segment
  - the route returns a shell script that embeds the token directly
- Impact:
  URL-carried bearer secrets can leak into browser history, reverse-proxy logs, analytics, terminal scrollback, and screenshots. In a control-plane product, that is an unnecessary credential-exposure pattern.
- Fix:
  Replace token-in-URL delivery with an authenticated one-time installer download or an authenticated “generate install command” POST that returns a short-lived secret. Do not use GET path parameters for bearer-style credentials.
- Mitigation:
  Document token rotation and make rotation one-click in the UI.

---

## Medium Findings

### 5. Custom GitHub install cookies are not marked `Secure`

- Rule ID: NEXT-COOKIE-001
- Severity: Medium
- Location:
  - [apps/web/app/api/github/install/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/github/install/route.ts#L27)
  - [apps/web/app/api/github/install/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/github/install/route.ts#L33)
- Evidence:
  - custom cookies are set with `httpOnly` and `sameSite`, but not `secure`
- Impact:
  On HTTPS production deployments, these cookies are still allowed over non-secure transport if a misconfiguration or mixed environment exists. That is weaker than the rest of the session posture.
- Fix:
  Set `secure` conditionally using the same production/TLS logic used for auth cookies.

### 6. Current CSP is too minimal for a control-plane UI

- Rule ID: NEXT-HEADERS-001
- Severity: Medium
- Location:
  - [apps/web/next.config.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/next.config.ts#L5)
- Evidence:
  - CSP only includes `base-uri`, `form-action`, `frame-ancestors`, and `object-src`
  - there is no `default-src`, `script-src`, `style-src`, `img-src`, or `connect-src`
- Impact:
  The current header helps, but it does not materially constrain script, connection, or asset sources. That weakens XSS defense-in-depth for a platform that exposes terminals, logs, GitHub integration, and runtime control.
- Fix:
  Move to a real CSP baseline with explicit `default-src 'self'` and scoped allowances for script/style/connect/image/font sources actually required by the app.

### 7. Error surfaces return raw backend and runtime messages to clients

- Rule ID: NEXT-ERR-001
- Severity: Medium
- Location:
  - [apps/web/app/api/runtime/terminal/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/runtime/terminal/route.ts#L49)
  - [apps/web/app/api/containers/[containerId]/files/route.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/app/api/containers/[containerId]/files/route.ts#L33)
  - [apps/web/lib/environment-runtime.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/environment-runtime.ts#L78)
- Evidence:
  - route handlers and agent bridges often return raw `error.message` or raw agent response text
- Impact:
  Internal command failures, filesystem paths, proxy details, or remote agent messages can be reflected directly to the UI. That increases information leakage and makes future hardening harder.
- Fix:
  Normalize external API errors to controlled user-safe messages and log detailed failures only on the server.

---

## Reliability / Consistency Findings

### 8. Default local environment bootstrap was race-prone

- Rule ID: REL-BOOT-001
- Severity: High
- Location:
  - [apps/web/lib/platform.ts](/Users/mannobeats/Documents/Software%20Development/dockroot/apps/web/lib/platform.ts#L206)
- Evidence:
  - duplicate insert attempts on `ensureDefaultLocalEnvironment` caused first-load failures after signup
- Impact:
  New users could see a runtime error on first dashboard load even though refresh would succeed.
- Status:
  Fixed in the current worktree by making the creation path idempotent and conflict-safe.

---

## Recommended Remediation Plan

### Phase 1: Release Blockers

1. Remove shell interpolation from all container file operations in both manager and agent runtimes.
2. Hash and index agent registration/access tokens; eliminate full-table token scans.
3. Make first-owner bootstrap atomic and impossible to win twice.
4. Replace token-in-URL installer flow with authenticated short-lived install issuance.

### Phase 2: Production Hardening

1. Strengthen CSP to a real allowlist policy.
2. Mark custom OAuth/GitHub cookies as `Secure` in production.
3. Normalize error messages returned from runtime and agent APIs.
4. Add request-size and rate limits to high-risk runtime endpoints and socket actions.

### Phase 3: Consistency And Operability

1. Add concurrency-safe patterns to other bootstrap/default-resource flows, not just local environments.
2. Add security-focused integration tests for:
   - first-user bootstrap
   - agent registration
   - runtime terminal authorization
   - container file operations with malicious path payloads
3. Add a production readiness checklist covering:
   - TLS/proxy requirements
   - secure cookie settings
   - token rotation
   - disabled public signup after owner bootstrap

---

## Suggested Next Fix Order

1. Fix command injection in file-management paths.
2. Fix agent token storage and lookup.
3. Fix owner-bootstrap race.
4. Fix installer token delivery.
5. Harden CSP and cookie flags.

