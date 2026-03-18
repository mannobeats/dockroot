# Large File Refactor Plan

Generated on 2026-03-18 after scanning source files and reviewing the modules over 800 LOC.

## Scope

Files currently above the 800 line threshold:

1. `apps/web/lib/platform.ts` - 2555 LOC
2. `apps/web/app/(dashboard)/actions.ts` - 1652 LOC
3. `apps/web/lib/container-updates.ts` - 1524 LOC
4. `apps/web/lib/platform/docker.ts` - 1263 LOC
5. `apps/web/components/containers-table-workspace.tsx` - 1049 LOC
6. `apps/web/lib/environment-runtime.ts` - 851 LOC

Near-threshold follow-up candidates:

1. `apps/web/components/stack-github-form.tsx` - 788 LOC
2. `apps/web/components/stacks-table-workspace.tsx` - 734 LOC
3. `apps/web/lib/github-app.ts` - 693 LOC

## Global Refactor Rules

Apply these rules consistently so the codebase becomes structurally predictable instead of just smaller:

1. Split by domain responsibility, not by arbitrary line counts.
2. Keep route/server actions thin. Parsing, validation, authorization, orchestration, and persistence should live in separate layers.
3. Put shared types and pure helpers beside the domain they belong to.
4. Prefer small facade entrypoints that re-export stable public APIs from a directory.
5. Add tests around extracted pure logic before moving behavior-heavy code.
6. Preserve external contracts first, then improve internals behind compatibility exports.
7. Move one domain slice at a time and keep each PR shippable.

## Recommended Target Structure

```text
apps/web/
  app/(dashboard)/
    actions/
      environments.ts
      stacks.ts
      containers.ts
      images.ts
      volumes.ts
      networks.ts
      updates.ts
      activity.ts
      utils/
        form-data.ts
        errors.ts

  components/containers-workspace/
    containers-table-workspace.tsx
    toolbar.tsx
    columns.tsx
    row.tsx
    updates-cell.tsx
    actions-cell.tsx
    live-console-dock.tsx
    hooks/
      use-column-visibility.ts
      use-container-selection.ts
      use-runtime-metrics.ts
    lib/
      container-display.ts
      update-display.ts

  lib/platform/
    index.ts
    environments.ts
    stacks.ts
    deployments.ts
    github.ts
    agents.ts
    settings.ts
    activity.ts
    runtime-resources.ts
    shared/
      slugs.ts
      tokens.ts
      urls.ts
      realtime.ts
      environment-state.ts

  lib/platform/docker/
    index.ts
    command.ts
    parsing.ts
    containers.ts
    images.ts
    volumes.ts
    networks.ts
    compose.ts
    files.ts
    backups.ts
    deployment.ts
    workspace.ts

  lib/container-updates/
    index.ts
    schedule.ts
    policy.ts
    state.ts
    registry.ts
    image-ref.ts
    checks.ts
    apply.ts
    runs.ts
    worker.ts

  lib/environment-runtime/
    index.ts
    environment.ts
    local.ts
    remote-agent.ts
    terminal.ts
    containers.ts
    images.ts
    volumes.ts
    networks.ts
    types.ts
```

## File-by-File Plan

### 1. `apps/web/lib/platform.ts`

Current problem:

This is the biggest god module in the repo. It mixes environment provisioning, stack CRUD, GitHub integration, deployment orchestration, agent registration, token issuance, webhook-triggered deploy logic, audit events, settings, runtime aggregation, and cache invalidation.

Observed responsibility clusters:

1. Shared helpers and normalization near the top.
2. Environment lifecycle and default local environment management.
3. Dashboard, environment, stack, deployment, and activity queries.
4. GitHub installation sync and GitHub stack creation.
5. Deployment queueing and local deployment execution.
6. Agent registration, heartbeat, and agent deployment claims.
7. Settings and install command generation.
8. GitHub push auto-deploy trigger flow.

Primary risks:

1. High coupling between DB writes, Docker/runtime side effects, GitHub API calls, and realtime emission.
2. Hard to test because most exports are orchestration-heavy.
3. Easy to introduce regressions when changing one domain because unrelated behaviors live in the same file.

Refactor target:

Split into a platform domain directory with a thin `index.ts` facade:

1. `lib/platform/shared/`
   - `slugs.ts`
   - `tokens.ts`
   - `urls.ts`
   - `environment-state.ts`
   - `realtime.ts`
2. `lib/platform/environments.ts`
   - `ensureDefaultLocalEnvironment`
   - `getEnvironmentById`
   - `createEnvironment`
   - `updateEnvironment`
   - `deleteEnvironment`
3. `lib/platform/stacks.ts`
   - `listStacks`
   - `getStackById`
   - `createStack`
   - `updateStackConfig`
   - `adoptComposeProject`
   - `deleteStack`
4. `lib/platform/github.ts`
   - installation/provider sync
   - source materialization
   - GitHub stack creation
   - push auto-deploy trigger logic
5. `lib/platform/deployments.ts`
   - `queueOrRunDeployment`
   - `claimNextDeployment`
   - `getDeploymentSourceArchive`
   - `completeDeployment`
   - `appendDeploymentLogEvents`
   - deployment list helpers
6. `lib/platform/agents.ts`
   - `registerAgent`
   - `heartbeatAgent`
   - registration token rotation and install command generation
7. `lib/platform/settings.ts`
   - `getGlobalSettings`
   - `updateGlobalSettings`
   - `listRuntimeResources`
8. `lib/platform/activity.ts`
   - audit event creation and deletion

Suggested rollout:

1. Extract pure helpers first with zero behavior changes.
2. Move environment and settings flows next because they have the cleanest boundaries.
3. Move stack CRUD and adoption flows.
4. Move agent flows.
5. Move deployment orchestration.
6. Move GitHub sync and auto-deploy logic last because it has the most cross-module coupling.

Expected result:

`platform.ts` becomes either a small facade or disappears entirely. Each domain file should stay closer to 150-400 LOC.

### 2. `apps/web/app/(dashboard)/actions.ts`

Current problem:

This file is a catch-all action controller for nearly the entire dashboard. It mixes form parsing, auth, validation, destructive confirmation, redirects, revalidation, audit logging, and direct domain orchestration for every resource type.

Observed responsibility clusters:

1. Form-data parsing and generic error shaping.
2. Environment actions.
3. Stack and compose project actions.
4. Container actions.
5. Image actions.
6. Volume actions and backup actions.
7. Network actions.
8. Global settings actions.
9. Container update and scheduling actions.
10. Activity cleanup actions.

Primary risks:

1. Very repetitive validation and hidden-field handling.
2. Hard to see auth differences between actions.
3. Revalidation and redirect logic is duplicated across domains.

Refactor target:

Split by dashboard domain and keep shared action utilities separate:

1. `app/(dashboard)/actions/utils/form-data.ts`
   - `getValue`
   - `getValues`
   - `getBoolValue`
   - `parseJsonValue`
   - destructive confirmation helpers
2. `app/(dashboard)/actions/utils/errors.ts`
   - in-use delete error normalization
3. `app/(dashboard)/actions/environments.ts`
4. `app/(dashboard)/actions/stacks.ts`
5. `app/(dashboard)/actions/containers.ts`
6. `app/(dashboard)/actions/images.ts`
7. `app/(dashboard)/actions/volumes.ts`
8. `app/(dashboard)/actions/networks.ts`
9. `app/(dashboard)/actions/updates.ts`
10. `app/(dashboard)/actions/settings.ts`
11. `app/(dashboard)/actions/activity.ts`
12. Keep `app/(dashboard)/actions.ts` only as a temporary compatibility barrel if needed.

Implementation notes:

1. Extract common revalidation helpers per domain to reduce duplicate path lists.
2. Centralize session requirements so each file clearly shows whether it needs user or privileged access.
3. Move audit logging into service-layer helpers where possible so actions do less orchestration.

Suggested rollout:

1. Extract utilities first.
2. Move actions domain by domain, starting with environments and settings.
3. Move resource actions next: containers, images, volumes, networks.
4. Move stack and update actions last because they touch more services.

Expected result:

Each action file becomes easier to scan, ownership is clearer, and routes/pages can import only the actions they use.

### 3. `apps/web/lib/container-updates.ts`

Current problem:

This module bundles image reference parsing, registry authentication, digest lookup, schedule persistence, policy persistence, state persistence, run logging, update checks, update application, and worker lease processing into one place.

Observed responsibility clusters:

1. Image and digest helpers.
2. Registry and Docker credential handling.
3. Schedule CRUD.
4. Policy/state persistence helpers.
5. Update-run bookkeeping.
6. Check execution flow.
7. Apply execution flow.
8. Background worker lease and processing loop.

Primary risks:

1. Very high cognitive load because pure parsing and long-running orchestration are interleaved.
2. Hard to test targeted behaviors like registry parsing or state transitions in isolation.
3. Scheduler and execution logic are tightly coupled.

Refactor target:

Create a dedicated domain directory:

1. `lib/container-updates/image-ref.ts`
   - image parsing
   - tag/major helpers
   - digest comparison helpers
2. `lib/container-updates/registry.ts`
   - Docker config loading
   - credential resolution
   - manifest digest fetches
   - Docker Hub tag discovery
3. `lib/container-updates/schedule.ts`
   - schedule creation/update/list
   - lease helpers
4. `lib/container-updates/policy.ts`
   - policy retrieval and writes
5. `lib/container-updates/state.ts`
   - state retrieval and upsert logic
6. `lib/container-updates/runs.ts`
   - run creation and completion
7. `lib/container-updates/checks.ts`
   - `runContainerUpdateCheck`
   - internal per-container evaluation helpers
8. `lib/container-updates/apply.ts`
   - `runContainerUpdateApply`
   - stack grouping and queueing
9. `lib/container-updates/worker.ts`
   - `processDueContainerUpdateSchedules`

Implementation notes:

1. Define explicit input/output types for check/apply flows before extracting.
2. Convert repeated map-building logic into query helpers.
3. Keep scheduler code free of image-registry details.
4. Add unit tests around image reference parsing and digest comparison first.

Suggested rollout:

1. Extract pure image and digest helpers.
2. Extract registry client code.
3. Extract policy/state/run repositories.
4. Move check flow.
5. Move apply flow.
6. Move worker processing last.

Expected result:

The update system becomes understandable as a small set of focused modules instead of a single 1500+ line execution script.

### 4. `apps/web/lib/platform/docker.ts`

Current problem:

This file is acting as both a Docker client SDK and a deployment/runtime utility module. It contains command execution, parsing, snapshots, container/image/volume/network operations, compose project control, container file mutation, backup/restore flows, container creation, stack deployment, workspace prep, and stack cleanup.

Observed responsibility clusters:

1. Docker command execution and parsing helpers.
2. Runtime inventory and detail queries.
3. Compose project listing and control.
4. Container filesystem mutation and browsing.
5. Volume backup and restore.
6. Container creation and lifecycle control.
7. Image, network, and volume management.
8. Local stack deployment and workspace preparation.

Primary risks:

1. `runDockerCommand` is a low-level primitive used by unrelated high-level features in the same file.
2. File system mutation and deployment workspace setup have very different safety concerns from simple listing APIs.
3. This file is likely to keep growing because every new Docker feature gets added here.

Refactor target:

Split `lib/platform/docker/` into capability-oriented modules:

1. `command.ts`
   - `runDockerCommand`
   - operation timeout config
2. `parsing.ts`
   - JSON parsing
   - ANSI stripping
   - shared Docker output mappers
3. `containers.ts`
   - list/details/logs/control/create
4. `images.ts`
   - list/details/pull/remove/prune
5. `volumes.ts`
   - list/details/create/remove/prune
6. `networks.ts`
   - list/details/create/remove/prune
7. `compose.ts`
   - list compose projects
   - control compose project
   - export compose config
8. `files.ts`
   - browse/write/upload/delete container paths
   - path safety enforcement
9. `backups.ts`
   - volume backup, restore, delete, file size
10. `deployment.ts`
   - `deployStackLocally`
   - `deleteLocalStackResources`
11. `workspace.ts`
   - temp workspace and archive extraction helpers

Implementation notes:

1. Keep `index.ts` as a stable public API while internal imports change.
2. Move path-safety logic into `files.ts` so it is not mixed with unrelated Docker operations.
3. Deployment code should depend on lower-level Docker modules, not the other way around.

Suggested rollout:

1. Extract command/parsing first.
2. Extract inventory CRUD modules.
3. Extract file mutation and backup flows.
4. Extract deployment/workspace logic last.

Expected result:

This becomes a real internal SDK instead of a single oversized utility file.

### 5. `apps/web/components/containers-table-workspace.tsx`

Current problem:

This component contains table configuration, local persistence, selection state, socket subscriptions, bulk action toolbar, row rendering, update controls, action controls, and the live deploy console dock.

Observed responsibility clusters:

1. Column configuration and storage.
2. Selection state and bulk-action payload building.
3. Runtime metrics socket subscription.
4. Toolbar rendering.
5. Row rendering and formatting helpers.
6. Update-status cell UI.
7. Per-row action UI.
8. Live deploy console dock.

Primary risks:

1. The main component owns too much state, which makes it hard to reason about rerenders and action flows.
2. UI rendering is mixed with a lot of derived business logic.
3. It is difficult to reuse row subparts or test them independently.

Refactor target:

Create a small component package under `components/containers-workspace/`:

1. `containers-table-workspace.tsx`
   - top-level composition only
2. `toolbar.tsx`
   - bulk actions
   - column menu trigger
3. `row.tsx`
   - one container row
4. `updates-cell.tsx`
   - policy toggles
   - update status badges/popovers
5. `actions-cell.tsx`
   - row actions and destructive modal
6. `live-console-dock.tsx`
7. `columns.tsx`
   - column definitions and helpers
8. `hooks/use-column-visibility.ts`
9. `hooks/use-container-selection.ts`
10. `hooks/use-runtime-metrics.ts`
11. `lib/container-display.ts`
12. `lib/update-display.ts`

Implementation notes:

1. Keep props stable by passing a small row view model instead of raw container and many booleans.
2. Move `localStorage` behavior into a hook.
3. Move socket subscription into a hook with environment filtering.
4. Extract row-level forms into subcomponents to keep the main table readable.

Suggested rollout:

1. Extract pure display helpers and column config.
2. Extract hooks for metrics, column visibility, and selection.
3. Extract toolbar and live console dock.
4. Extract row, then split update/actions cells.

Expected result:

The top-level component should shrink to a coordinator around 150-250 LOC with most complexity pushed into testable hooks and focused cells.

### 6. `apps/web/lib/environment-runtime.ts`

Current problem:

This module is a large adapter that hides the difference between local Docker runtime access and remote agent access, but it does so with a long sequence of repetitive wrappers for every resource category.

Observed responsibility clusters:

1. Environment lookup and fallback.
2. Remote agent fetch helpers and error mapping.
3. Local terminal proxying.
4. Container resource wrappers.
5. Terminal session wrappers.
6. Image wrappers.
7. Volume wrappers.
8. Network wrappers.

Primary risks:

1. Repetition makes it easy for local and remote code paths to drift.
2. Terminal behavior is mixed into general runtime resource access.
3. The file encourages copy-paste when new runtime operations are added.

Refactor target:

Split into a runtime adapter directory:

1. `lib/environment-runtime/environment.ts`
   - environment lookup
   - default local fallback
2. `lib/environment-runtime/remote-agent.ts`
   - fetch helpers
   - remote error mapping
3. `lib/environment-runtime/local.ts`
   - local runtime bindings to Docker helpers
4. `lib/environment-runtime/terminal.ts`
   - local terminal proxy
   - remote terminal operations
5. `lib/environment-runtime/containers.ts`
6. `lib/environment-runtime/images.ts`
7. `lib/environment-runtime/volumes.ts`
8. `lib/environment-runtime/networks.ts`
9. `lib/environment-runtime/types.ts`
   - shared result types and runtime error contracts

Implementation notes:

1. Introduce a small internal helper like `withEnvironmentRuntime()` to branch once per call path instead of repeating local/remote checks in every export.
2. Keep `RuntimeConnectionError` in a shared `types.ts` or `errors.ts`.
3. Separate terminal operations from standard CRUD resources.

Suggested rollout:

1. Extract errors and environment lookup.
2. Extract shared remote fetch client.
3. Move terminal operations into their own module.
4. Move containers, images, volumes, and networks into resource-specific wrappers.

Expected result:

The module becomes an adapter layer with predictable per-resource files instead of one long wrapper list.

## Prioritized Execution Order

Recommended order for actual refactor work:

1. `apps/web/lib/environment-runtime.ts`
   - lowest-risk architectural win
   - unlocks cleaner imports elsewhere
2. `apps/web/lib/platform/docker.ts`
   - creates lower-level primitives for later work
3. `apps/web/lib/container-updates.ts`
   - benefits immediately from the runtime and Docker splits
4. `apps/web/app/(dashboard)/actions.ts`
   - easier after services are split
5. `apps/web/components/containers-table-workspace.tsx`
   - UI-only refactor, lower backend risk
6. `apps/web/lib/platform.ts`
   - last because it depends on almost every other major domain

## Suggested PR Plan

1. PR 1: Introduce new directories and move pure helpers only.
2. PR 2: Split `environment-runtime` and `platform/docker`.
3. PR 3: Split `container-updates`.
4. PR 4: Split dashboard actions by resource.
5. PR 5: Split containers workspace UI into hooks and subcomponents.
6. PR 6: Split `platform.ts` into domain services and leave a compatibility facade.

## Guardrails During Refactor

1. Keep public imports stable with temporary barrel exports while moving code.
2. Add regression coverage around deployment flow, agent registration, container update checks, and destructive resource actions before deep extraction.
3. Avoid mixing behavior changes with structural moves in the same PR.
4. Keep each PR focused on one domain and one import graph.
5. Track line counts after each PR and stop files from regrowing past 400-500 LOC.
