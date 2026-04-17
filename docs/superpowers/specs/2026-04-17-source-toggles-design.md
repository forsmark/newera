# Source Toggles — Design Spec

**Date:** 2026-04-17  
**Status:** Approved

## Summary

Add per-source enable/disable toggles to settings. Disabled sources are skipped during fetch. An optional setting hides jobs from disabled sources in the jobs list (kanban unaffected).

## Data Model

Two new fields in `Preferences` (`src/server/types.ts`):

```ts
disabledSources: string[];          // default: []
hideJobsFromDisabledSources: boolean; // default: false
```

`DEFAULT_PREFERENCES` updated with both defaults. Empty `disabledSources` means all sources active — no update required when new sources are added.

## Backend — Scheduler

In `fetchJobs()` (`src/server/scheduler.ts`), read `getPreferences().disabledSources` once before the fetch loop. Skip each source block if its source name is in the array.

```ts
const { disabledSources } = getPreferences();
if (!disabledSources.includes('linkedin')) {
  // fetch LinkedIn ...
}
```

Existing jobs from a disabled source remain in the DB — disabling a source is non-destructive.

## Frontend — Jobs List Filtering

`JobsView` (`src/client/src/views/JobsView.tsx`) fetches `/api/settings` on mount to get preferences. After loading jobs, filter client-side:

```ts
if (prefs.hideJobsFromDisabledSources && prefs.disabledSources.length > 0) {
  visibleJobs = visibleJobs.filter(j => !prefs.disabledSources.includes(j.source));
}
```

The kanban board is unaffected — jobs already applied to from a disabled source remain visible there.

## Settings UI

New **"Sources"** accordion in `SettingsView` (`src/client/src/views/SettingsView.tsx`), positioned after the "App config" accordion.

Contents:
- One checkbox per source (Jobindex, LinkedIn, Remotive, Arbeitnow, RemoteOK), all checked by default
- A "Hide jobs from disabled sources in job list" checkbox below, disabled/greyed when `disabledSources` is empty

The Sources accordion shares the same save button pattern as other accordions (`saveBtn`).

## Sources Reference

The five sources and their string identifiers:

| Label     | `source` value |
|-----------|---------------|
| Jobindex  | `jobindex`    |
| LinkedIn  | `linkedin`    |
| Remotive  | `remotive`    |
| Arbeitnow | `arbeitnow`   |
| RemoteOK  | `remoteok`    |

## Out of Scope

- Removing existing jobs when a source is disabled
- Hiding disabled-source jobs from the kanban board
- Per-source fetch schedules
