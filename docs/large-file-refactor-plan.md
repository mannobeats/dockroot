# Large File Refactor Plan

Updated on 2026-03-18.

This document reflects the current state after the large-file refactor campaign.

## Status

- Original large-file targets have been completed.
- No first-party app/runtime module is above 800 LOC.
- `server.mjs` now acts as orchestration, with runtime/socket domains extracted to `server/runtime/` and `server/socket/`.
- Socket runtime responsibilities are split by concern (auth, rate limits, access control, terminal local/proxy, logs).
- Wildcard barrel exports were replaced with explicit exports in key app/lib action surfaces.
- Structure guardrails are enforced in lint via `scripts/check-structure-conventions.mjs`.

## Current Size Snapshot

Largest current modules in app/runtime code:

1. `server.mjs` - 478 LOC
2. `server/runtime/runtime-metrics.mjs` - 420 LOC
3. `server/socket/terminal-runtime.mjs` - 320 LOC
4. `apps/web/components/terminal/use-socket-terminal-session.ts` - 249 LOC
5. `apps/web/components/container-file-browser.tsx` - 249 LOC
6. `apps/web/app/(dashboard)/actions/updates.ts` - 249 LOC
7. `apps/web/lib/environment-runtime/containers.ts` - 248 LOC
8. `apps/web/components/github-apps-panel/use-github-apps-panel.ts` - 248 LOC

These are now within an operationally manageable range.

## Structural Baseline

The codebase now follows this baseline:

- Domain folders are preferred over flat root-level utility files.
- Entrypoints expose explicit public APIs.
- Runtime/server orchestration is separated from domain internals.
- Refactor compatibility paths were normalized to canonical folder surfaces.

Reference rules and guardrails:

- `docs/codebase-structure-conventions.md`
- `scripts/check-structure-conventions.mjs`

## Next Optimization Targets (Optional)

If we want to keep pushing structure quality, these are the highest-leverage follow-ups:

1. Split `server/runtime/runtime-metrics.mjs` into `stream`, `format/parse`, and `persistence` modules.
2. Split `server/socket/terminal-runtime.mjs` into smaller handler registration slices (create/input/resize/close) if desired.
3. Continue extracting reusable UI hooks/helpers from any component crossing ~250-300 LOC.

## Definition of Done for Future Refactors

A refactor is considered complete when all of the following are true:

1. Behavior is preserved and verified by `lint`, `typecheck`, and `build`.
2. Files are split by responsibility, not arbitrary size.
3. Exports are explicit; no accidental wildcard API surfaces.
4. Deprecated import paths are removed.
5. Documentation is updated in the same change.
