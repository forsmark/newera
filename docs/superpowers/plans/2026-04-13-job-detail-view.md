# Job Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/jobs/:id` detail page so Telegram notifications can deep-link to individual jobs.

**Architecture:** New API endpoint `GET /api/jobs/:id`, new React view component `JobDetailView`, updated Telegram message links. Reuses existing `JobDetail` component for LLM analysis section.

**Tech Stack:** Bun, Hono, React, react-router-dom (existing stack)

---

### Task 1: Add `GET /api/jobs/:id` endpoint with test

**Files:**
- Modify: `src/server/routes/jobs.ts`
- Modify: `src/server/tests/integration/jobs.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/server/tests/integration/jobs.test.ts`, after the existing `PATCH /api/jobs/:id` describe block:

```typescript
// ─── GET /api/jobs/:id ───────────────────────────────────────────────────────

describe('GET /api/jobs/:id', () => {
  it('returns a single job by id', async () => {
    const listRes = await app.request('/api/jobs');
    const { jobs } = await listRes.json() as { jobs: { id: string }[] };
    expect(jobs.length).toBeGreaterThan(0);
    const jobId = jobs[0].id;

    const res = await app.request(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; title: string; tags: string[] | null };
    expect(body.id).toBe(jobId);
    expect(body.title).toBeDefined();
  });

  it('returns 404 for non-existent id', async () => {
    const res = await app.request('/api/jobs/non-existent-id-123');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Job not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/tests/integration/jobs.test.ts`
Expected: FAIL — route not defined, returns 404 for existing job.

- [ ] **Step 3: Add the endpoint**

In `src/server/routes/jobs.ts`, add after the `GET /` handler (before the `PATCH /:id` handler around line 61):

```typescript
// GET /api/jobs/:id
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const row = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as (Job & { tags: string | null }) | null;
  if (!row) return c.json({ error: 'Job not found' }, 404);
  return c.json({ ...row, tags: row.tags ? JSON.parse(row.tags) as string[] : null });
});
```

**Important:** This must go BEFORE the `PATCH /:id` handler. Hono matches routes in registration order, and both `GET /:id` and `PATCH /:id` coexist fine since they're different methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/tests/integration/jobs.test.ts`
Expected: PASS — all existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/jobs.ts src/server/tests/integration/jobs.test.ts
git commit -m "feat: add GET /api/jobs/:id endpoint"
```

---

### Task 2: Fix client types — add `'remotive'` to source union

**Files:**
- Modify: `src/client/src/types.ts:2`

- [ ] **Step 1: Update the client Job type**

In `src/client/src/types.ts`, change line 2 from:

```typescript
source: 'jobindex' | 'linkedin';
```

to:

```typescript
source: 'jobindex' | 'linkedin' | 'remotive';
```

(This was missed when we added the Remotive source earlier — the server type was updated but the client type was not.)

- [ ] **Step 2: Commit**

```bash
git add src/client/src/types.ts
git commit -m "fix: add remotive to client Job source type"
```

---

### Task 3: Create `JobDetailView` component

**Files:**
- Create: `src/client/src/views/JobDetailView.tsx`

- [ ] **Step 1: Create the view**

Create `src/client/src/views/JobDetailView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Job } from "../types";
import JobDetail from "../components/JobDetail";

const WORK_TYPE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  remote:  { label: 'Remote',  color: '#34d399', bg: '#022b1e', border: '#0a3d2a' },
  hybrid:  { label: 'Hybrid',  color: '#a78bfa', bg: '#1a0a38', border: '#2d1558' },
  onsite:  { label: 'On-site', color: '#6b8aa3', bg: '#0b1628', border: '#1a2840' },
};

function inferWorkType(location: string | null): 'remote' | 'hybrid' | 'onsite' | null {
  if (!location) return null;
  const l = location.toLowerCase();
  if (l.includes('remote')) return 'remote';
  if (l.includes('hybrid')) return 'hybrid';
  if (l.includes('on-site') || l.includes('onsite') || l.includes('in-office')) return 'onsite';
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function scoreAccentColor(score: number | null): string {
  if (score === null) return "#243653";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#1a2840";
}

export default function JobDetailView() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/jobs/${id}`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        return res.json();
      })
      .then(data => { if (data) { setJob(data as Job); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  async function patchStatus(status: string) {
    if (!job) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setJob(prev => prev ? { ...prev, status: status as Job['status'] } : prev);
    } finally {
      setStatusLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-[740px] mx-auto px-4 py-12 text-center text-text-3">
        Loading…
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="max-w-[740px] mx-auto px-4 py-12 text-center">
        <div className="text-text-3 text-lg mb-4">Job not found</div>
        <Link to="/jobs" className="text-accent no-underline hover:underline">← Back to jobs</Link>
      </div>
    );
  }

  const scoreBadgeClass = job.match_score === null
    ? "bg-surface-raised text-text-3"
    : job.match_score >= 80
      ? "bg-green-bg text-green"
      : job.match_score >= 50
        ? "bg-amber-bg text-amber"
        : "bg-surface text-text-3";

  const wt = job.work_type ?? inferWorkType(job.location) ?? 'onsite';
  const wtStyle = WORK_TYPE_STYLES[wt];

  return (
    <div className="max-w-[740px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Back link */}
      <Link to="/jobs" className="text-text-3 text-[0.8125rem] no-underline hover:text-text-2 mb-4 inline-block">
        ← Back to jobs
      </Link>

      {/* Header card */}
      <div
        className="rounded overflow-hidden bg-surface mb-4"
        style={{
          borderLeft: `3px solid ${scoreAccentColor(job.match_score)}`,
          border: `1px solid #1a2840`,
          borderLeftWidth: '3px',
          borderLeftColor: scoreAccentColor(job.match_score),
        }}
      >
        <div className="px-4 sm:px-5 py-4 sm:py-5">
          {/* Title row */}
          <div className="flex items-start gap-3">
            <div className={`${scoreBadgeClass} min-w-[2.75rem] text-center px-2 py-1.5 rounded-sm font-bold text-[0.875rem] tabular-nums shrink-0`}>
              {job.match_score === null
                ? <span style={{ animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }}>···</span>
                : job.match_score}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-text text-lg font-semibold m-0 leading-tight">{job.title}</h1>
              <div className="text-text-2 text-[0.9375rem] mt-0.5">{job.company}</div>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <span className="bg-bg border border-border rounded-sm px-2 py-1 uppercase tracking-[0.05em] font-semibold text-[0.625rem] text-text-3">
              {job.source}
            </span>
            {job.posted_at && <span className="text-text-3 text-[0.75rem]">{formatDate(job.posted_at)}</span>}
            {job.location && <span className="text-text-3 text-[0.8125rem]">{job.location}</span>}
            <span style={{ color: wtStyle.color, background: wtStyle.bg, border: `1px solid ${wtStyle.border}`, borderRadius: 'var(--radius-sm)', padding: '0.1875rem 0.4375rem', fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              {wtStyle.label}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <a href={job.url} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-accent bg-accent-bg text-accent no-underline font-medium">
              View original posting ↗
            </a>

            {(job.status === "new" || job.status === "saved") && (
              <button
                onClick={() => patchStatus(job.status === "new" ? "saved" : "new")}
                disabled={statusLoading}
                className={job.status === "saved"
                  ? "px-3 py-1.5 text-[0.8125rem] rounded-sm border border-accent bg-accent-bg text-accent font-medium cursor-pointer"
                  : "px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border-accent text-accent font-medium bg-transparent cursor-pointer"
                }
              >
                {job.status === "saved" ? "Saved" : "Save"}
              </button>
            )}

            {job.status === "saved" && (
              <button
                onClick={() => patchStatus("applied")}
                disabled={statusLoading}
                className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border text-text-3 font-medium bg-transparent cursor-pointer"
              >
                Applied →
              </button>
            )}

            {(job.status === "new" || job.status === "saved") && (
              <button
                onClick={() => patchStatus("rejected")}
                disabled={statusLoading}
                className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border-red text-red font-medium bg-transparent cursor-pointer"
              >
                Reject
              </button>
            )}

            {job.status === "rejected" && (
              <button
                onClick={() => patchStatus("new")}
                disabled={statusLoading}
                className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border text-text-3 font-medium bg-transparent cursor-pointer"
              >
                Restore
              </button>
            )}
          </div>
        </div>

        {/* Reuse existing JobDetail for LLM analysis, tags, re-score, copy */}
        <JobDetail job={job} onRescore={() => {
          fetch(`/api/jobs/${job.id}`)
            .then(r => r.json())
            .then(data => setJob(data as Job))
            .catch(() => {});
        }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/src/views/JobDetailView.tsx
git commit -m "feat: add JobDetailView component"
```

---

### Task 4: Add `/jobs/:id` route to App.tsx

**Files:**
- Modify: `src/client/src/App.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/client/src/App.tsx`, after the existing view imports (around line 8), add:

```typescript
import JobDetailView from "./views/JobDetailView";
```

- [ ] **Step 2: Add the route**

In the `AnimatedRoutes` component, inside the `<Routes>` block (around line 214), add the new route **before** the `/jobs` route so that `/jobs/:id` matches before `/jobs`:

Change:

```tsx
<Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} isFetching={isFetching} status={status} />} />
```

to:

```tsx
<Route path="/jobs/:id" element={<JobDetailView />} />
<Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} isFetching={isFetching} status={status} />} />
```

- [ ] **Step 3: Verify dev server works**

Run: `bun run dev`
Navigate to `http://localhost:5173/jobs` — the list still works.
Navigate to `http://localhost:5173/jobs/<some-job-id>` — the detail view renders.

- [ ] **Step 4: Commit**

```bash
git add src/client/src/App.tsx
git commit -m "feat: add /jobs/:id route for job detail view"
```

---

### Task 5: Update Telegram notifications to use deep links

**Files:**
- Modify: `src/server/telegram.ts`
- Modify: `src/server/tests/unit/telegram.test.ts`

- [ ] **Step 1: Update the test**

In `src/server/tests/unit/telegram.test.ts`, find the assertion that checks the message text for the app URL. The existing test should assert that the URL now includes the job ID. Find the test that verifies the message format and update its assertion to check for `/jobs/` in the URL.

Look for an assertion like:

```typescript
expect(bodyText).toContain('http://localhost:3000');
```

Update it (or add alongside) to check for job-specific deep links:

```typescript
expect(bodyText).toContain('/jobs/');
```

- [ ] **Step 2: Run the test to see it fail**

Run: `bun test src/server/tests/unit/telegram.test.ts`
Expected: FAIL — message still contains the generic app URL without `/jobs/`.

- [ ] **Step 3: Update telegram.ts**

In `src/server/telegram.ts`, change line 46 from:

```typescript
      lines.push(`→ ${escapeMarkdownV2(prefs.appBaseUrl)}`);
```

to:

```typescript
      lines.push(`→ [Open](${escapeMarkdownV2(`${prefs.appBaseUrl}/jobs/${job.id}`)})`);
```

This makes each job in the notification a clickable "Open" link pointing directly to that job's detail view.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/tests/unit/telegram.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/telegram.ts src/server/tests/unit/telegram.test.ts
git commit -m "feat: telegram notifications link to individual job detail views"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 2: Manual smoke test**

1. Start dev server: `bun run dev`
2. Open `http://localhost:5173/jobs` — list works as before
3. Copy a job ID from the browser's network tab (GET /api/jobs response)
4. Navigate to `http://localhost:5173/jobs/<that-id>` — detail view renders with:
   - Score badge, title, company
   - Source label, posted date, location, work type badge
   - Action buttons (Save/Reject/Applied)
   - "View original posting" link
   - LLM analysis section (role summary, fit reasoning, tags)
   - Back link to /jobs
5. Navigate to `http://localhost:5173/jobs/fake-id-123` — shows "Job not found" with back link
6. Action buttons work — clicking Save/Reject updates the status inline

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: job detail view complete"
```
