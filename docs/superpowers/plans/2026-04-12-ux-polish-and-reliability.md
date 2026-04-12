# UX Polish & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six improvements — multi-tag AND filtering, kanban activity timeline, graceful shutdown, sequential fetch staggering, jsearch→linkedin rename, and search bar clear buttons.

**Architecture:** All changes are additive. One new DB table (`application_events`), one new DB migration (`source` rename), minor restructuring of the fetch pipeline in `scheduler.ts`, and UI updates in `JobsView.tsx`, `KanbanView.tsx`, `JobRow.tsx`, and `KanbanCard.tsx`.

**Tech Stack:** Bun, Hono, React, SQLite (WAL mode), Tailwind-style inline classes.

---

### Task 1: Graceful shutdown

**Files:**
- Modify: `src/server/index.ts:97-106`

- [ ] **Step 1: Add shutdown handler**

In `src/server/index.ts`, add after line 100 (`startBackupScheduler();`):

```ts
function shutdown() {
  console.log('[server] Shutting down — checkpointing WAL…');
  try {
    db.run('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (err) {
    console.error('[server] Shutdown error:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 2: Verify it works**

Run: `bun run src/server/index.ts &` then `kill -TERM $!`

Expected: Log line `[server] Shutting down — checkpointing WAL…` and clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: graceful shutdown with WAL checkpoint on SIGTERM/SIGINT"
```

---

### Task 2: Rename jsearch → linkedin

**Files:**
- Modify: `src/server/db.ts` (add migration)
- Modify: `src/client/src/views/JobsView.tsx` (FilterSource type, source pills, counts)
- Modify: `src/client/src/tests/helpers.ts` (seed data)
- Modify: `src/server/routes/backups.ts` (add `application_events` to restore)
- Modify: `CLAUDE.md` (JSearch reference)
- Modify: `README.md` (if it mentions JSearch)

- [ ] **Step 1: Add DB migration**

In `src/server/db.ts`, add after the existing `ALTER TABLE` migrations (after line 86):

```ts
// Rename legacy 'jsearch' source to 'linkedin'
db.run(`UPDATE jobs SET source = 'linkedin' WHERE source = 'jsearch'`);
```

This is idempotent — runs every startup but only affects rows that still have the old value.

- [ ] **Step 2: Update FilterSource type and source pills in JobsView**

In `src/client/src/views/JobsView.tsx`:

Change the `FilterSource` type (line 15):
```ts
type FilterSource = "all" | "linkedin" | "jobindex";
```

Change the source count variables. Find `jsearchCount` and `jobindexCount` — rename `jsearchCount` to `linkedinCount`. Search for the pattern where these are computed and update. The source pills section (lines 589-605) becomes:

```tsx
{linkedinCount > 0 && jobindexCount > 0 && (
  <div className="flex gap-1">
    {(["all", "linkedin", "jobindex"] as FilterSource[]).map(key => (
      <button
        key={key}
        onClick={() => setFilterSource(key)}
        className="px-3 py-1.5 rounded-full border cursor-pointer text-[0.75rem] font-medium"
        style={{
          borderColor: filterSource === key ? '#243653' : '#1a2840',
          background: filterSource === key ? '#1a2840' : 'transparent',
          color: filterSource === key ? '#7a95b0' : '#6b8aa3',
        }}
      >
        {key === 'all' ? 'All sources' : key === 'linkedin' ? 'LinkedIn' : 'Jobindex'}
      </button>
    ))}
  </div>
)}
```

Also update any `localStorage` key that stores `'jsearch'` as a value — check the `filterSource` initialization from localStorage.

- [ ] **Step 3: Update client test helper**

In `src/client/src/tests/helpers.ts`, line 6:
```ts
source: 'linkedin',
```

- [ ] **Step 4: Update Job type**

In `src/client/src/types.ts`, line 2:
```ts
source: 'jobindex' | 'linkedin';
```

This is already correct — verify it says `'linkedin'` not `'jsearch'`.

- [ ] **Step 5: Update CLAUDE.md**

Replace "JSearch API key" references with a note that JSEARCH_API_KEY is the RapidAPI key used for LinkedIn scraping. Update any mention of "JSearch API + jobindex.dk" to "LinkedIn (via RapidAPI) + jobindex.dk".

- [ ] **Step 6: Run tests**

Run: `bun test`
Expected: All 183+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename jsearch to linkedin throughout codebase"
```

---

### Task 3: Search bar clear button

**Files:**
- Modify: `src/client/src/views/JobsView.tsx:501-508` (jobs search input)
- Modify: `src/client/src/views/KanbanView.tsx:79-87` (kanban search input)

- [ ] **Step 1: Add clear button to JobsView search**

In `src/client/src/views/JobsView.tsx`, replace the search `<input>` (lines 502-507) with:

```tsx
<div className="relative w-full sm:flex-1">
  <input
    type="text"
    placeholder="Search jobs…"
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    className="w-full px-3 py-2 pr-8 rounded-sm border border-border bg-surface text-text text-sm outline-none"
  />
  {searchQuery && (
    <button
      type="button"
      onClick={() => setSearchQuery('')}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-0 border-none bg-transparent text-text-3 cursor-pointer text-sm leading-none"
      aria-label="Clear search"
    >
      ✕
    </button>
  )}
</div>
```

Note the `pr-8` on the input to prevent text from flowing under the button.

- [ ] **Step 2: Add clear button to KanbanView search**

In `src/client/src/views/KanbanView.tsx`, replace the search `<input>` (lines 80-86) with:

```tsx
<div className="relative w-full">
  <input
    type="text"
    placeholder="Search applications…"
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    className="w-full px-3 py-[0.375rem] pr-8 rounded-sm border border-border bg-surface text-text text-sm outline-none"
  />
  {searchQuery && (
    <button
      type="button"
      onClick={() => setSearchQuery('')}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-0 border-none bg-transparent text-text-3 cursor-pointer text-sm leading-none"
      aria-label="Clear search"
    >
      ✕
    </button>
  )}
</div>
```

- [ ] **Step 3: Visual check**

Open http://localhost:3000 in the browser. Type in the Jobs search bar — the ✕ should appear. Click it — the search should clear. Repeat for the Kanban search bar.

- [ ] **Step 4: Commit**

```bash
git add src/client/src/views/JobsView.tsx src/client/src/views/KanbanView.tsx
git commit -m "feat: add clear button to search bars"
```

---

### Task 4: Multi-tag AND filtering

**Files:**
- Modify: `src/client/src/views/JobsView.tsx` (state, filter logic, chip rendering, localStorage)
- Modify: `src/client/src/components/JobRow.tsx` (props: `activeTag` → `activeTags`, highlight logic)

- [ ] **Step 1: Update JobRow props**

In `src/client/src/components/JobRow.tsx`, change the Props interface (lines 12-26):

```ts
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
```

Replace `activeTag` with `activeTags` (remove the `activeTag` prop entirely).

Then update the tag rendering (lines 287-306) to use `activeTags`:

```tsx
{job.tags && job.tags.length > 0 && job.tags.map(tag => {
  const isActive = activeTags?.includes(tag) ?? false;
  return (
    <span
      key={tag}
      onClick={e => { e.stopPropagation(); onTagClick?.(tag); }}
      className={onTagClick ? "tag-btn" : ""}
      style={{
        background: isActive ? '#0d1e38' : '#030b17',
        border: `1px solid ${isActive ? '#243653' : '#1a2840'}`,
        color: isActive ? '#3b82f6' : '#6b8aa3',
        borderRadius: "var(--radius-sm)",
        padding: "0.1875rem 0.4375rem",
        fontSize: "0.6875rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
        cursor: onTagClick ? "pointer" : "default",
      }}
    >
      {tag}
    </span>
  );
})}
```

- [ ] **Step 2: Update JobsView state**

In `src/client/src/views/JobsView.tsx`:

Replace the state declaration (line 115):
```ts
const [activeTags, setActiveTags] = useState<string[]>(() => {
  try {
    const stored = localStorage.getItem('jobs-active-tags');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
});
```

- [ ] **Step 3: Update filter logic**

In `src/client/src/views/JobsView.tsx`, replace line 399:
```ts
if (activeTag && !(j.tags?.includes(activeTag))) return false;
```
with:
```ts
if (activeTags.length > 0 && !activeTags.every(tag => j.tags?.includes(tag))) return false;
```

- [ ] **Step 4: Update filterKey**

In `src/client/src/views/JobsView.tsx`, update the `filterKey` (line 130) to include `activeTags.join(',')` instead of `activeTag`.

Also update the `useEffect` dependency array (line 430) — replace `activeTag` with `activeTags`.

- [ ] **Step 5: Persist to localStorage**

Add an effect after the state declaration:
```ts
useEffect(() => {
  localStorage.setItem('jobs-active-tags', JSON.stringify(activeTags));
}, [activeTags]);
```

- [ ] **Step 6: Update tag click handler**

Replace the `onTagClick` callback passed to `<JobRow>` (line 710):
```tsx
onTagClick={tag => setActiveTags(prev =>
  prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
)}
activeTags={activeTags}
```

- [ ] **Step 7: Update chip rendering in filter bar**

Replace the active tag chip section (lines 608-619):

```tsx
{activeTags.length > 0 && (
  <div className="flex items-center gap-1 flex-wrap">
    {activeTags.map(tag => (
      <span key={tag} className="flex items-center gap-1 bg-accent-bg border border-border-2 text-accent rounded-sm px-2 py-[0.125rem] text-[0.75rem] font-medium">
        {tag}
        <button onClick={() => setActiveTags(prev => prev.filter(t => t !== tag))}
          className="p-0 border-none bg-transparent text-accent cursor-pointer text-[0.75rem] leading-none ml-0.5">
          ✕
        </button>
      </span>
    ))}
    {activeTags.length >= 2 && (
      <button onClick={() => setActiveTags([])}
        className="px-2 py-[0.125rem] border-none bg-transparent text-text-3 cursor-pointer text-[0.75rem]">
        Clear
      </button>
    )}
  </div>
)}
```

- [ ] **Step 8: Visual check**

Open http://localhost:3000. Click a tag on a job — it should appear as a chip in the filter bar. Click a second tag — both chips appear, and only jobs with BOTH tags are shown. Click ✕ on a chip to remove one tag. Click "Clear" to remove all.

- [ ] **Step 9: Run tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/client/src/views/JobsView.tsx src/client/src/components/JobRow.tsx
git commit -m "feat: multi-tag AND filtering with persistent tag selection"
```

---

### Task 5: Kanban activity timeline

**Files:**
- Modify: `src/server/db.ts` (new table)
- Modify: `src/server/routes/kanban.ts` (insert events, return events in GET)
- Modify: `src/server/routes/jobs.ts:87-124` (insert event on save/apply)
- Modify: `src/client/src/types.ts` (new type, update Application)
- Modify: `src/client/src/components/KanbanCard.tsx` (timeline section)
- Modify: `src/server/backup.ts` (add `application_events` to restore)

- [ ] **Step 1: Create the table**

In `src/server/db.ts`, add after the `application_artifacts` table creation (after line 73):

```ts
db.run(`
  CREATE TABLE IF NOT EXISTS application_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT NOT NULL REFERENCES applications(job_id) ON DELETE CASCADE,
    from_column TEXT,
    to_column   TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )
`);
```

- [ ] **Step 2: Add client types**

In `src/client/src/types.ts`, add after the `Application` interface:

```ts
export interface ApplicationEvent {
  id: number;
  job_id: string;
  from_column: string | null;
  to_column: string;
  created_at: string;
}
```

Add `events` to the `Application` interface:
```ts
export interface Application {
  job_id: string;
  kanban_column: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
  archived_description: string | null;
  cover_letter: string | null;
  job: Job;
  events: ApplicationEvent[];
}
```

- [ ] **Step 3: Insert events on application creation (jobs route)**

In `src/server/routes/jobs.ts`, after the `INSERT OR IGNORE INTO applications` for saved (line 94-97), add:

```ts
if (status === 'saved') {
  const now = new Date().toISOString();
  db.run(
    `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
     VALUES (?, 'saved', ?, ?)`,
    [id, now, now],
  );
  db.run(
    `INSERT INTO application_events (job_id, from_column, to_column, created_at)
     VALUES (?, NULL, 'saved', ?)`,
    [id, now],
  );
}
```

Similarly for the `applied` status block — after the insert or update, add:

```ts
// Log the transition event
const toColumn = 'applied';
const fromColumn = existing ? 'saved' : null;
db.run(
  `INSERT INTO application_events (job_id, from_column, to_column, created_at)
   VALUES (?, ?, ?, ?)`,
  [id, fromColumn, toColumn, now],
);
```

- [ ] **Step 4: Insert events on kanban column change**

In `src/server/routes/kanban.ts`, in the PATCH handler, after the column change is applied (around line 119), add event insertion. Before the UPDATE statement, capture the old column:

```ts
if (body.kanban_column !== undefined) {
  const old = (existing as { kanban_column: string }).kanban_column;
  if (old !== body.kanban_column) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO application_events (job_id, from_column, to_column, created_at)
       VALUES (?, ?, ?, ?)`,
      [jobId, old, body.kanban_column, now],
    );
  }
  fields.push('kanban_column = ?');
  params.push(body.kanban_column);
}
```

This replaces the existing `if (body.kanban_column !== undefined)` block (lines 94-97).

- [ ] **Step 5: Return events in GET /api/kanban**

In `src/server/routes/kanban.ts`, modify the GET handler to attach events. After `reshapeRow`, add an events query:

```ts
app.get('/', (c) => {
  const rows = db.query(`
    SELECT ${SELECT_FIELDS}
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    ORDER BY a.updated_at DESC
  `).all() as Record<string, unknown>[];

  const applications = rows.map(reshapeRow);

  // Attach events to each application
  const eventStmt = db.query(
    'SELECT id, job_id, from_column, to_column, created_at FROM application_events WHERE job_id = ? ORDER BY created_at ASC'
  );
  for (const app of applications) {
    (app as any).events = eventStmt.all(app.job_id);
  }

  return c.json(applications);
});
```

Also return events on the single-application response from PATCH — after the reshapeRow call at the end of the PATCH handler:

```ts
const updated = db.query(`...`).get(jobId) as Record<string, unknown>;
const result = reshapeRow(updated);
(result as any).events = db.query(
  'SELECT id, job_id, from_column, to_column, created_at FROM application_events WHERE job_id = ? ORDER BY created_at ASC'
).all(jobId);
return c.json(result);
```

- [ ] **Step 6: Add timeline UI to KanbanCard**

In `src/client/src/components/KanbanCard.tsx`, add a collapsible timeline section. Add this after the interview date section and before the match summary. Import `ApplicationEvent` from types if needed — it's on the `application.events` array.

```tsx
{/* Timeline */}
{application.events && application.events.length > 0 && (
  <details className="mb-1">
    <summary className="text-[0.6875rem] text-text-3 cursor-pointer select-none">
      Timeline ({application.events.length})
    </summary>
    <div className="mt-1 flex flex-col gap-0.5 pl-1 border-l border-border ml-1">
      {application.events.map((evt, i) => {
        const label = evt.to_column.charAt(0).toUpperCase() + evt.to_column.slice(1);
        const date = new Date(evt.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return (
          <div key={evt.id} className="text-[0.6875rem] text-text-3 py-0.5 pl-2">
            {i > 0 ? '→ ' : ''}{label} — {date}
          </div>
        );
      })}
    </div>
  </details>
)}
```

- [ ] **Step 7: Add application_events to backup restore**

In `src/server/backup.ts`, add `'application_events'` to the `tables` array in the `restoreBackup` function:

```ts
const tables = ['application_events', 'application_artifacts', 'applications', 'jobs', 'settings', 'logs'];
```

Put it first since it depends on `applications` (FK), so it needs to be deleted first and restored after.

- [ ] **Step 8: Run tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 9: Visual check**

Open http://localhost:3000. Save a job → check the Kanban view, the card should show "Timeline (1)" with "Saved — Apr 12". Drag it to Applied → timeline should show two entries.

- [ ] **Step 10: Commit**

```bash
git add src/server/db.ts src/server/routes/kanban.ts src/server/routes/jobs.ts src/client/src/types.ts src/client/src/components/KanbanCard.tsx src/server/backup.ts
git commit -m "feat: kanban activity timeline tracking column transitions"
```

---

### Task 6: Sequential fetch staggering

**Files:**
- Modify: `src/server/scheduler.ts:76-156`

- [ ] **Step 1: Restructure fetchJobs to sequential**

In `src/server/scheduler.ts`, replace the `fetchJobs` function body (lines 76-156) with:

```ts
export async function fetchJobs(): Promise<number> {
  if (isFetching) {
    console.log('[scheduler] Fetch already in progress, skipping');
    return 0;
  }
  isFetching = true;
  try {
    console.log('[scheduler] Fetching jobs...');

    let totalNew = 0;

    // 1. Fetch jobindex first
    try {
      const jobindexJobs = await fetchJobindex();
      console.log(`[scheduler] Jobindex: ${jobindexJobs.length} jobs`);
      const batch1Ids = ingestBatch(jobindexJobs);
      totalNew += batch1Ids.length;
      if (batch1Ids.length > 0) {
        scoreBatchInBackground(batch1Ids);
      }
    } catch (err) {
      console.error('[scheduler] Jobindex failed:', err);
    }

    // 2. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 3. Fetch LinkedIn
    try {
      const linkedinJobs = await fetchLinkedIn();
      console.log(`[scheduler] LinkedIn: ${linkedinJobs.length} jobs`);
      const batch2Ids = ingestBatch(linkedinJobs);
      totalNew += batch2Ids.length;
      if (batch2Ids.length > 0) {
        scoreBatchInBackground(batch2Ids);
      }
    } catch (err) {
      console.error('[scheduler] LinkedIn failed:', err);
    }

    console.log(`[scheduler] ${totalNew} new jobs total`);
    lastFetchAt = new Date().toISOString();
    lastFetchNewJobs = totalNew;

    // Check link liveness for a batch of older jobs (fire-and-forget)
    checkStaleLinksBatch().catch(console.error);

    return totalNew;
  } finally {
    isFetching = false;
  }
}
```

- [ ] **Step 2: Extract ingestBatch helper**

Add above `fetchJobs`:

```ts
function ingestBatch(jobs: JobPartial[]): string[] {
  const newIds: string[] = [];
  for (const job of jobs) {
    const { isNew } = ingestJob(job);
    if (isNew) {
      const row = db.query<{ id: string }, [string, string]>(
        'SELECT id FROM jobs WHERE source = ? AND external_id = ?'
      ).get(job.source, job.external_id);
      if (row) newIds.push(row.id);
    }
  }
  return newIds;
}
```

- [ ] **Step 3: Extract scoreBatchInBackground helper**

Add above `fetchJobs`:

```ts
function scoreBatchInBackground(jobIds: string[]) {
  (async () => {
    const scoredResults: ScoredJob[] = [];

    for (const jobId of jobIds) {
      const job = db.query('SELECT * FROM jobs WHERE id = ?').get(jobId) as Job | null;
      if (!job) continue;

      const result = await analyzeJob(job);
      if (result) {
        db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ?, work_type = ?, prefs_hash = ? WHERE id = ?', [
          result.match_score,
          result.match_reasoning,
          result.match_summary,
          JSON.stringify(result.tags),
          result.work_type,
          result.prefs_hash,
          jobId,
        ]);
        maybeAutoReject(jobId, result.match_score);
        scoredResults.push({ job, score: result.match_score, matchSummary: result.match_summary });
        console.log(`[scheduler] Analyzed job ${jobId}: score=${result.match_score} tags=${result.tags.join(',')}`);
      }
    }

    // Send Telegram notification with batch summary
    await sendFetchSummary(scoredResults);

    // Retry any existing jobs that weren't scored yet
    await analyzeUnscoredJobs();

    console.log('[scheduler] Done scoring batch');
  })().catch((err) => console.error('[scheduler] Background analysis failed:', err));
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduler.ts
git commit -m "feat: sequential fetch staggering — jobindex first, 30s delay, then LinkedIn"
```

---

### Task 7: Final integration test

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 2: Rebuild and test deployed app**

```bash
docker compose up -d --build app
```

Open http://localhost:3000 and verify:
1. Search bars have ✕ clear buttons in both Jobs and Kanban views
2. Source pills say "LinkedIn" / "Jobindex" (not "JSearch")
3. Clicking multiple tags shows only jobs matching ALL selected tags
4. Saving a job creates a timeline entry on the kanban card
5. Dragging a card between columns adds a timeline entry

- [ ] **Step 3: Test graceful shutdown**

```bash
docker compose stop app
docker compose logs app --tail 5
```

Expected: Log shows `[server] Shutting down — checkpointing WAL…`

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit.
