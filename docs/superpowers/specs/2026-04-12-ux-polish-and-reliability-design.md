# UX Polish & Reliability Improvements

Six targeted changes: multi-tag AND filtering, kanban activity timeline, graceful shutdown, sequential fetch staggering, jsearch→linkedin rename, and search bar clear button.

---

## 1. Multi-tag AND filtering

### Current behavior

`activeTag` is a single `string | null`. Clicking a tag replaces the current filter. Only one tag can be active at a time.

### New behavior

Replace `activeTag` with `activeTags: string[]`. Clicking a tag toggles it in/out of the array. Jobs are shown only if they contain **all** selected tags (AND logic).

### Filter logic

```ts
const matchesTags = activeTags.length === 0
  || activeTags.every(tag => job.tags?.includes(tag));
```

### UI changes

- **Tag chips in filter bar:** render each active tag as a chip with an individual `✕` button (same style as current single-tag chip). Show a "Clear" link when 2+ tags are selected.
- **Tag pills on job rows:** selected tags get the existing highlighted style (blue border/text). Clicking a highlighted tag deselects it.
- **Persistence:** store `activeTags` in `localStorage` as JSON array, same pattern as other filter state.

### Files changed

- `src/client/src/views/JobsView.tsx` — state, filter logic, chip rendering, localStorage
- `src/client/src/components/JobRow.tsx` — `activeTag` prop becomes `activeTags: string[]`, `onTagClick` toggles

---

## 2. Kanban activity timeline

### Schema

```sql
CREATE TABLE application_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES applications(job_id) ON DELETE CASCADE,
  from_column TEXT,
  to_column   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
```

`from_column` is null for the initial event (when the application is first created).

### Event creation

Insert an event automatically in two places:

1. **`POST /api/kanban`** (or wherever applications are created) — insert with `from_column = null`, `to_column = initial column`.
2. **`PATCH /api/kanban/:id`** — when `kanban_column` changes, insert with `from_column = old value`, `to_column = new value`.

### API changes

- **`GET /api/kanban`** — include `events: ApplicationEvent[]` on each application, sorted oldest-first.
- No separate events endpoint needed.

### UI changes

Add a collapsible "Timeline" section to `KanbanCard.tsx`, below notes and above artifacts:

```
▸ Timeline (3)
  Applied        — Apr 5
  → Interview    — Apr 10
  → Offer        — Apr 12
```

Each line shows the `to_column` label and `created_at` formatted as a short date. The arrow prefix is omitted for the first entry. Collapsed by default.

### Files changed

- `src/server/db.ts` — new table creation
- `src/server/routes/kanban.ts` — insert events on create and column change
- `src/client/src/components/KanbanCard.tsx` — timeline section
- `src/client/src/types.ts` — `ApplicationEvent` type, add `events` to `Application`

---

## 3. Graceful shutdown

### Problem

The Docker container receives SIGTERM on restart. Without a handler, Bun exits without checkpointing WAL. Docker then sends SIGKILL after 10s. Pending WAL data may be lost or leave the DB in a state that confuses the next startup.

### Solution

Add signal handlers in `src/server/index.ts`:

```ts
function shutdown() {
  console.log('[server] Shutting down...');
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### Files changed

- `src/server/index.ts` — add shutdown handlers after server startup

---

## 4. Sequential fetch staggering

### Current behavior

`scheduler.ts` fetches jobindex and linkedin in parallel via `Promise.allSettled`, then scores all new jobs in one batch.

### New behavior

Fetch sequentially with a 30-second gap:

1. Fetch jobindex → ingest results → start scoring in background
2. Wait 30 seconds
3. Fetch linkedin → ingest results → start scoring in background

This spreads Ollama load naturally. Each source's jobs start scoring as soon as they arrive rather than waiting for both sources to finish.

### Implementation

Replace the `Promise.allSettled` block with sequential awaits separated by a delay. The scoring loop for each batch runs in a fire-and-forget async block (same pattern as current, just two separate blocks).

### Files changed

- `src/server/scheduler.ts` — restructure `fetchJobs()` to sequential with delay

---

## 5. Rename jsearch → linkedin

### Scope

All code references to "jsearch" become "linkedin". This includes:

- **Source value in DB:** migration `UPDATE jobs SET source = 'linkedin' WHERE source = 'jsearch'` in `db.ts`
- **Source file:** `src/server/sources/jsearch.ts` → already named `linkedin.ts` (verify; rename if not)
- **Variable/function names:** `jsearchCount`, `fetchJSearch`, etc.
- **UI labels:** source pill text, any display strings
- **Filter values:** `FilterSource` type, localStorage keys
- **Config:** `.env` variable `JSEARCH_API_KEY` — keep the env var name as-is since it's the RapidAPI key name, but add a comment noting it's used for linkedin scraping via RapidAPI

### Files changed

- `src/server/db.ts` — migration query
- `src/server/sources/` — verify/rename file
- `src/server/scheduler.ts` — variable names, log messages
- `src/client/src/views/JobsView.tsx` — source pills, filter state, counts
- `src/client/src/components/JobRow.tsx` — source badge label (if shown)

---

## 6. Search bar clear button

### UI

An `✕` button absolutely positioned inside the right edge of the search input. Visible only when the input has text. Clicking it clears the query and refocuses the input.

### Implementation

Wrap the `<input>` in a `relative` container. Add a `<button>` with `absolute right-2 top-1/2 -translate-y-1/2` positioning. Conditionally render based on `searchQuery.length > 0`. Add right padding to the input so text doesn't flow under the button.

### Files changed

- `src/client/src/views/JobsView.tsx` — search input wrapper + clear button

Apply the same pattern to the kanban search bar in `KanbanView.tsx` (line 82).

---

## Out of scope

- Cover letter generation changes
- New job sources
- Dashboard/stats
- Email/calendar integration
