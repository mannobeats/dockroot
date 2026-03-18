# Codebase Structure Conventions

This document defines the structure and naming rules used in Dockroot. The goal is to keep modules discoverable, stable, and easy to maintain as the codebase grows.

## Naming

- Use `kebab-case` for file and directory names.
- Use `index.ts` only for intentional, explicit module surfaces.
- Keep public API names explicit and descriptive (`createSocketRuntimeService`, `getRuntimeMetrics`).

## Module Boundaries

- Keep domain logic inside domain folders.
- Avoid placing domain files at broad root levels when a domain folder exists.
  - Example: GitHub App provider/state modules belong under `apps/web/lib/github-app/`.
- Treat `server.mjs` as orchestration only; runtime/socket internals live in `server/runtime/` and `server/socket/`.

## Exports

- Do not use wildcard re-exports (`export * from ...`) in application code.
- Re-export explicit symbols to keep API surfaces intentional and reviewable.

## Import Hygiene

- Prefer domain-local imports inside a feature folder (`./provider`, `./state`) instead of legacy root aliases.
- Remove/deprecate old import paths as part of refactors.

## Guardrails

- `pnpm run lint` includes `scripts/check-structure-conventions.mjs`.
- The structure check currently enforces:
  - No wildcard re-exports in scanned source directories.
  - No deprecated GitHub App import paths (`@/lib/github-app-provider`, `@/lib/github-app-state`).
- Current scan roots: `apps/web/app`, `apps/web/lib`, `apps/web/components`, `server`.

Extend this guardrail script as new conventions are adopted.
