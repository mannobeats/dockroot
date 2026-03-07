# UI Guidelines

## Design Direction

UniFi Network Dashboard + Apple UX. Clean, minimal, functional.

## Color Tokens

Use HeroUI CSS variable tokens — never hardcode colors.

| Token | Usage |
|-------|-------|
| `bg-background` | Page backgrounds |
| `bg-surface` | Cards, panels, elevated containers |
| `text-foreground` | Primary text |
| `text-muted` | Secondary/helper text |
| `bg-accent` | Primary actions, brand color |
| `text-accent` | Links, active states, icons |
| `bg-danger` | Destructive actions |
| `border-default/30` | Subtle borders |
| `bg-default/40` | Hover backgrounds |
| `bg-success` | Status indicators |

## Component Patterns

### Cards & Panels

Use plain `div` elements with border + surface background. Avoid HeroUI `Card` for custom layouts — it can clip content.

```tsx
<div className="rounded-xl border border-default/40 bg-surface">
  <div className="border-b border-default/30 px-5 py-3.5">
    <h2 className="text-[14px] font-semibold">Title</h2>
  </div>
  <div className="px-5 py-4">Content</div>
</div>
```

### List Rows

Divide with `divide-y divide-default/20`. Each row: flex, gap, padding.

```tsx
<div className="divide-y divide-default/20">
  <div className="flex items-center gap-3.5 px-5 py-3">...</div>
</div>
```

### Icon Containers

```tsx
<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/8">
  <Icon className="h-4 w-4 text-accent" />
</div>
```

### Buttons

- **Primary action**: `bg-accent text-white` or HeroUI `Button variant="primary"`
- **Destructive**: HeroUI `Button variant="danger"`
- **Ghost/text**: Plain `button` with `text-muted hover:text-foreground`
- **Never** wrap HeroUI `Button` inside Next.js `Link` — use styled `Link` or `router.push()`

### Links That Look Like Buttons

```tsx
<Link href="/path" className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-white">
  Label
</Link>
```

## Typography Scale

| Size | Usage |
|------|-------|
| `text-xl font-semibold` | Page titles |
| `text-[14px] font-semibold` | Section headers |
| `text-[13px] font-medium` | Body text, nav items, labels |
| `text-[12px] text-muted` | Captions, metadata, timestamps |
| `text-[11px] text-muted` | Badges, small labels |

## Responsive Design

### Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | `<768px` | Mobile — single column, compact padding |
| `sm` | `≥640px` | Small tablets — 2-column grids |
| `md` | `≥768px` | Tablets — sidebar visible, desktop layout |
| `lg` | `≥1024px` | Desktop — full multi-column grids |

### Mobile-First Rules

- **Always design mobile-first** — start with the smallest screen, add breakpoints up
- **Sidebar**: Hidden on mobile, toggled via hamburger in topbar, slides in as overlay with backdrop
- **Stats grids**: Use `grid-cols-2` on mobile, `lg:grid-cols-4` on desktop
- **Charts**: Use `ResponsiveContainer` (Recharts handles resize), reduce `h-[180px]` on mobile → `sm:h-[220px]`
- **Card padding**: `p-3 sm:p-5` — tighter on mobile, comfortable on desktop
- **Page gaps**: `gap-4 sm:gap-6` — reduce vertical spacing on mobile
- **Page headings**: `text-lg sm:text-xl` — slightly smaller on mobile
- **Stacking**: Use `flex-col` on mobile → `sm:flex-row` for side-by-side layouts

### Pattern: Responsive Card

```tsx
<div className="rounded-xl border border-default/20 bg-surface p-3 sm:p-5">
  <h3 className="text-[13px] font-semibold">Title</h3>
  <div className="h-[180px] sm:h-[220px] w-full">
    {/* Chart or content */}
  </div>
</div>
```

### Pattern: Responsive Header

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <h1 className="text-lg sm:text-xl font-semibold">Title</h1>
  <span className="text-[12px] text-muted w-fit">Badge</span>
</div>
```

## Spacing

- Page padding: `p-4 lg:p-6`
- Section gaps: `gap-4 sm:gap-6`
- Card internal padding: `p-3 sm:p-5` (content), `px-5 py-3.5` (header)
- Between cards: `gap-3` or `gap-4`

## Dashboard Patterns

### Sidebar Icon Rail

Active nav items use filled accent background with white icon + shadow. Inactive items use `text-muted` with hover states.

```tsx
<Link className={isActive
  ? "bg-accent text-white shadow-md shadow-accent-soft-hover"
  : "text-muted hover:bg-default/40 hover:text-foreground"
}>
```

### Data Tables

Use native `<table>` with consistent styling:

```tsx
<table className="w-full text-left text-[13px]">
  <thead>
    <tr className="border-b border-default/10 bg-default/5 text-muted">
      <th className="px-6 py-3 font-medium">Column</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-default/10">
    <tr className="group hover:bg-default/5 transition-colors">
      <td className="px-6 py-3">Cell</td>
    </tr>
  </tbody>
</table>
```

### Status Badges

```tsx
<span className="inline-flex items-center rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success ring-1 ring-inset ring-success-soft-hover">
  Success
</span>
```

### Network Node Cards

Large icon containers with status glow for connectivity visualizations:

```tsx
<div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-success-soft-hover bg-surface shadow-[0_0_20px_rgba(34,197,94,0.1)]">
  <Icon className="h-8 w-8 text-success" />
</div>
```

## Dark/Light Mode

- Handled by `next-themes` with `attribute="class"`
- All color tokens auto-switch — use tokens, not raw colors
- Theme toggle lives in the topbar (dashboard) and navbar (public pages)

## Accessibility

- All form inputs must have `aria-label` or a visible `<label>`
- HeroUI `RadioGroup` and `Checkbox` require `aria-label` when no visible label is provided
- Search inputs without visible labels need `aria-label="Search ..."`

## Interactive Elements

- **No nested buttons** — `DropdownTrigger` renders its own `<button>`, use `<div>` inside it
- **No `<a>` wrapping `<button>`** — use styled `Link` or `button` with `router.push()`
- Always add `type="button"` to non-submit buttons
- **No `isReadOnly`** on HeroUI v3 `DropdownItem` — prop doesn't exist in this version
- Use Tailwind v4 syntax: `bg-linear-to-r` not `bg-gradient-to-r`
- Always pass radix to `parseInt()`: `parseInt(value, 10)`
