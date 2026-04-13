# Job Detail View with Telegram Deep Links

Three changes to enable direct-linking from Telegram notifications to individual jobs.

## 1. API: `GET /api/jobs/:id`

New endpoint in `src/server/routes/jobs.ts`. Returns the full job object as JSON. Returns 404 `{ error: "Job not found" }` if the ID doesn't match.

## 2. Frontend: `/jobs/:id` route + `JobDetailView`

New route in `src/client/src/App.tsx` and new view component `src/client/src/views/JobDetailView.tsx`.

**Layout:**
- Header section: title, company, score badge (green/amber/grey), location, source label, posted date, work type badge
- Status action buttons: Save, Reject, Applied (same actions as JobRow, updating via `PATCH /api/jobs/:id`)
- "View original posting" link to `job.url` (opens in new tab)
- Existing `JobDetail` component embedded below for LLM analysis (role summary, fit reasoning, tags, re-score, copy)
- Back link to `/jobs` list
- Loading spinner while fetching
- 404 message if job not found

**No new dependencies.** Reuses the existing `JobDetail` component and the same PATCH endpoint for status changes.

## 3. Telegram: Deep link per job

In `src/server/telegram.ts`, change line 46 from:

```
lines.push(`→ ${escapeMarkdownV2(prefs.appBaseUrl)}`);
```

to link to the specific job:

```
lines.push(`→ [Open](${escapeMarkdownV2(prefs.appBaseUrl)}/jobs/${job.id})`);
```

Each job in the Telegram notification gets its own clickable deep link.

## Server-side HTML fallback for SPA routing

The Hono server needs a catch-all that serves `index.html` for client-side routes like `/jobs/:id`. Check if this already exists; if not, add it after the static file middleware.
