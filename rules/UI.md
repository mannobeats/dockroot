# UI Rules

This is the UI contract for Dockroot.

## Goal

Build UI that is:

- consistent
- reusable
- easy to restyle globally
- easy to debug

## Core Rule

Pages compose shared primitives.
Pages do not invent their own visual patterns.

Before writing UI:

1. check `apps/web/components/ui`
2. use an existing primitive if it fits
3. if the pattern is repeated and missing, add or extend a primitive

## Source Of Truth

- Tokens: `apps/web/app/globals.css`
- Class merge helper: `apps/web/lib/cn.ts`
- Reusable primitives: `apps/web/components/ui`
- Shared product widgets: `apps/web/components`

## Use These Primitives

- `Panel` for bordered surfaces
- `Button` for actions
- `LinkButton` for navigational actions
- `FormSubmitButton` for submit actions
- `Field`, `FieldLabel`, `Input`, `Select`, `Alert` for forms
- `DataTable*` for tables
- `TabsList`, `TabsTrigger`, `TabsPanel` for tabs
- `EmptyState` for no-data states
- `Badge` for small labels
- `StatusBadge` for runtime/deployment state
- `LogBlock` for log/code-style dark surfaces
- `MetricCard` or `StatCard` for metrics

## Do Not

- do not hand-write repeated button styles
- do not hand-write repeated panel wrappers
- do not hand-write repeated input/select styles
- do not hand-write repeated table markup/styling
- do not create page-local tab styles
- do not hardcode semantic colors like raw red/green/amber classes for shared patterns
- do not hardcode terminal/log background colors
- do not reimplement status color mapping outside `StatusBadge`

## Tokens

Use token-backed colors only.

Use:

- `background`
- `foreground`
- `surface`
- `accent`
- `muted`
- `border-default`
- `success`
- `warning`
- `danger`
- `console`
- `console-foreground`

If you need a new reusable color meaning, add a token first.

## Page Rules

Pages may:

- define layout
- define data flow
- compose primitives

Pages may not:

- recreate shared visual patterns inline

A page should mostly read like composition, not styling.

## When To Add A Primitive

Add or extend `components/ui/*` when the pattern:

- is visual
- is reused or clearly will be reused
- should update globally when restyled

If it is Dockroot-specific but still shared, put it in `apps/web/components`.

## Accessibility

- every input needs a label or `aria-label`
- every icon-only action needs `aria-label`
- keyboard focus must stay visible
- do not rely on color alone for meaning

## Done Criteria

UI work is done only if:

- it uses shared primitives where applicable
- it adds no unnecessary duplicate styling
- it respects tokens
- it is responsive
- it is accessible
- it type-checks

## Quick Mapping

- surface -> `Panel`
- action -> `Button`
- nav action -> `LinkButton`
- submit -> `FormSubmitButton`
- text field -> `Input`
- select -> `Select`
- table -> `DataTable`
- tabs -> `Tabs*`
- empty state -> `EmptyState`
- label -> `Badge`
- state -> `StatusBadge`
- logs -> `LogBlock`
- metric -> `MetricCard` or `StatCard`

If none fit, extend the system first.
