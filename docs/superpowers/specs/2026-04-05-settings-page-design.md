# Settings Page — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Overview

A `/settings` page allowing the user to view and edit their resume and preferences files from the UI, and to trigger a full LLM re-score of all jobs. This replaces the current workflow of manually editing `data/resume.md` and `data/preferences.md` on the host filesystem.

---

## Architecture

### Docker
The `data/` volume mount in `docker-compose.yml` is changed from `:ro` to read-write (drop the `:ro` flag). This is required for the API to write back to the files.

### Backend
New route file: `src/server/routes/settings.ts`, registered at `/api/settings` in `src/server/index.ts`.

Endpoints:
- `GET /api/settings` — reads both files and returns `{ resume: string, preferences: string }`
- `PUT /api/settings/resume` — body `{ content: string }` — writes `data/resume.md`, returns `{ ok: true }`
- `PUT /api/settings/preferences` — body `{ content: string }` — writes `data/preferences.md`, returns `{ ok: true }`
- `POST /api/settings/rescore` — clears `match_score`, `match_reasoning`, `match_summary`, `tags` for all jobs where `status != 'rejected'`, then calls `analyzeUnscoredJobs()` in the background; returns `{ queued: number }`

If a data file doesn't exist, `GET /api/settings` returns an empty string for that key. `PUT` endpoints create the file if missing.

Error responses use standard HTTP status codes with `{ error: string }` body.

### Frontend
- New view: `src/client/src/views/SettingsView.tsx`
- Nav link "Settings" added to `App.tsx` Nav component, after "Applications", before the right-side spacer

---

## UI

### Layout
Single-column page, max-width ~800px, centered, with the same padding/spacing as JobsView. Three card sections stacked vertically.

### Section 1 — Resume
- Heading: "Resume"
- Subtext: "data/resume.md"
- Full-width `<textarea>` — fixed height ~400px, monospace font, dark background matching `--color-surface`, resize: vertical
- "Save" button — disabled until content differs from the loaded value
- On save: `PUT /api/settings/resume`, success shows toast "Resume saved", error shows toast with message

### Section 2 — Preferences
- Identical structure to Resume section, for `data/preferences.md`
- Height ~300px (preferences file is shorter)
- On save: `PUT /api/settings/preferences`, toast "Preferences saved"

### Section 3 — System
- Heading: "System"
- **Ollama status** — small indicator row: green dot + "Connected" or red dot + "Unavailable", sourced from the existing `/api/status` endpoint
- **Unscored jobs** — "N jobs pending LLM analysis" (or "All jobs scored" if 0)
- **Re-score all jobs** button — clears all scores and re-queues; triggers `POST /api/settings/rescore`. Button shows "Re-scoring…" while in-flight (disable during). On success: toast "Re-scoring N jobs". Destructive action — button styled with a subtle warning color (`--color-amber`) to signal it will wipe existing scores.

### State management
Each text section tracks its own local state independently:
- `original` — value loaded from server
- `current` — current textarea value
- `saving` — boolean for in-flight request

No shared state with the rest of the app; SettingsView fetches its own data on mount.

---

## Data Flow

```
Mount → GET /api/settings → populate resume + preferences textareas
             ↓
User edits textarea → dirty state (Save button enables)
             ↓
User clicks Save → PUT /api/settings/{resume|preferences} → toast → reset dirty state
             ↓
User clicks Re-score → POST /api/settings/rescore → toast with count
```

---

## Error Handling

- File read errors (e.g. file missing) — return empty string, UI shows empty textarea (user can create file content from scratch)
- File write errors — return 500, toast shows error message
- Re-score while Ollama unavailable — proceeds anyway (jobs get queued as unscored, will be retried next time Ollama is available)

---

## Out of Scope

- Syntax highlighting or markdown preview in textareas
- Scheduler interval configuration
- Ollama model/URL configuration
- Per-job manual re-score
