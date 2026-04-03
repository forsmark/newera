# New Era — Tailwind v4 + Logo + Animations

**Date:** 2026-04-03
**Status:** Approved

## Overview

Three parallel upgrades to the New Era job tracker client:
1. Migrate all inline styles to Tailwind v4
2. Add a proper SVG logo (nav + favicon)
3. Add Framer Motion animations throughout

## 1. Tailwind v4 Setup

### Dependencies (client package)
- `tailwindcss` (v4)
- `@tailwindcss/vite` (v4 Vite plugin — replaces PostCSS pipeline)
- `framer-motion`

### Configuration
- Add `@tailwindcss/vite` plugin to `src/client/vite.config.ts`
- No `tailwind.config.js`, no `postcss.config.js` — v4 is config-file-free
- `src/client/src/index.css` uses `@import "tailwindcss"` and defines custom tokens via `@theme`:

```css
@import "tailwindcss";

@theme {
  --color-bg: #030b17;
  --color-surface: #0b1628;
  --color-surface-raised: #0f1e34;
  --color-border: #1a2840;
  --color-border-2: #243653;
  --color-text: #dde6f0;
  --color-text-2: #7a95b0;
  --color-text-3: #405a74;
  --color-accent: #3b82f6;
  --color-accent-bg: #0d1e38;
  --color-green: #22c55e;
  --color-green-bg: #081a10;
  --color-amber: #f59e0b;
  --color-amber-bg: #1a1000;
  --color-red: #ef4444;
  --color-red-bg: #1a0606;

  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --radius: 6px;
  --radius-sm: 4px;
}
```

These tokens generate Tailwind classes: `bg-bg`, `bg-surface`, `text-text`, `text-text-2`, `border-border`, etc.

### Migration scope
Every component currently using inline `style={{}}` objects gets replaced with Tailwind utility classes. The migration is a full replacement — no hybrid inline/Tailwind approach.

**Files to migrate:**
- `App.tsx` (Nav)
- `views/JobsView.tsx`
- `views/KanbanView.tsx`
- `components/JobRow.tsx`
- `components/JobDetail.tsx`
- `components/KanbanColumn.tsx`
- `components/KanbanCard.tsx`
- `components/Toast.tsx`

## 2. Logo

### Mark
Three upward chevrons (C2 variant): tightly spaced, stroke only. Top chevron full opacity, middle at 0.55, bottom at 0.2. All `stroke="#22c55e"`, `stroke-width="2.2"`, `stroke-linecap="round"`.

### Component: `Logo.tsx`
```
Props: { size?: 'sm' | 'md' }
- sm (default, nav): icon 20×20 + "New Era" wordmark, Inter 700, -0.02em tracking
- md: icon 28×28 + larger wordmark
```

Used in `App.tsx` Nav, replacing the current `<span>New Era</span>`.

### Favicon
Inline SVG data URI in `index.html` `<link rel="icon">`. Chevron mark only (no wordmark), on `#030b17` background. SVG viewBox sized for clean rendering at 32×32.

## 3. Animations

### Library
`framer-motion` — all animation via `motion.*` components and `AnimatePresence`.

### Reduced motion
All animations check `useReducedMotion()`. When true: disable entrance/exit animations, keep only instantaneous state changes.

### List entrance (JobRow)
- Wrap each `JobRow` div in `motion.div`
- Variants: `hidden: { opacity: 0, y: 10 }` → `visible: { opacity: 1, y: 0 }`
- Stagger: parent container uses `staggerChildren: 0.03` (30ms), `delayChildren: 0.05`
- Duration: 0.2s, `easeOut`
- Re-triggers when `filtered` array identity changes (filter/sort changes)
- Cap stagger at 15 items max to avoid long delays on large lists

### Expand/collapse (JobDetail)
- `AnimatePresence` wraps the detail panel inside `JobRow`
- `motion.div` with `initial={{ height: 0, opacity: 0 }}`, `animate={{ height: "auto", opacity: 1 }}`, `exit={{ height: 0, opacity: 0 }}`
- `overflow: hidden` on the motion div
- Duration: 0.22s, `easeInOut`

### Status change feedback (JobRow)
- When status updates successfully, trigger a brief `animate` sequence on the row: `scale: [1, 1.02, 1]`, duration 0.15s
- Implemented via `useAnimate` hook, called in `patchStatus` on success

### Page transitions
- `AnimatePresence mode="wait"` wraps `<Routes>` in `App.tsx`
- Each view wrapped in a `motion.div`: `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`, `exit={{ opacity: 0 }}`
- Duration: exit 0.12s, enter 0.18s
- Requires `useLocation` key on the `motion.div` to trigger on route change

## File Change Summary

| File | Changes |
|------|---------|
| `src/client/vite.config.ts` | Add `@tailwindcss/vite` plugin |
| `src/client/src/index.css` | Replace with Tailwind v4 + `@theme` tokens |
| `src/client/index.html` | SVG favicon link |
| `src/client/src/main.tsx` | No change (already imports index.css) |
| `src/client/src/components/Logo.tsx` | New — SVG logo component |
| `src/client/src/App.tsx` | Use Logo, add page transition AnimatePresence |
| `src/client/src/views/JobsView.tsx` | Tailwind classes + list animation container |
| `src/client/src/views/KanbanView.tsx` | Tailwind classes |
| `src/client/src/components/JobRow.tsx` | Tailwind + expand animation + status pulse |
| `src/client/src/components/JobDetail.tsx` | Tailwind classes |
| `src/client/src/components/KanbanColumn.tsx` | Tailwind classes |
| `src/client/src/components/KanbanCard.tsx` | Tailwind classes |
| `src/client/src/components/Toast.tsx` | Tailwind classes |

## Out of Scope
- Dark/light mode toggle (already dark-only)
- Backend changes
- Kanban drag animations (complex, separate effort)
- Mobile responsive breakpoints beyond what currently works
