# Remotive Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Remotive as a third job source, fetching remote software-dev jobs from their free public API.

**Architecture:** New source file following the linkedin/jobindex pattern. Wired into the scheduler as a third sequential fetch step. UI updated with source pill and filter support.

**Tech Stack:** Bun, Hono, React, SQLite (existing stack — no new deps)

---

### Task 1: Add `'remotive'` to the Job source type

**Files:**
- Modify: `src/server/types.ts:11`
- Modify: `src/client/src/views/JobsView.tsx:15`

- [ ] **Step 1: Update server Job type**

In `src/server/types.ts`, change the `source` field on line 11:

```typescript
source: 'jobindex' | 'linkedin' | 'remotive';
```

- [ ] **Step 2: Update client FilterSource type**

In `src/client/src/views/JobsView.tsx`, change the `FilterSource` type on line 15:

```typescript
type FilterSource = "all" | "linkedin" | "jobindex" | "remotive";
```

- [ ] **Step 3: Commit**

```bash
git add src/server/types.ts src/client/src/views/JobsView.tsx
git commit -m "feat: add remotive to source type union"
```

---

### Task 2: Create Remotive source with tests (TDD)

**Files:**
- Create: `src/server/sources/remotive.ts`
- Create: `src/server/sources/__tests__/remotive.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/server/sources/__tests__/remotive.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { parseRemotiveJobs } from '../remotive';

const SAMPLE_API_RESPONSE = {
  'job-count': 2,
  jobs: [
    {
      id: 1234567,
      url: 'https://remotive.com/remote-jobs/software-dev/senior-frontend-1234567',
      title: 'Senior Frontend Engineer',
      company_name: 'Acme Corp',
      category: 'Software Development',
      tags: ['react', 'typescript'],
      job_type: 'full_time',
      publication_date: '2026-04-10T12:00:00',
      candidate_required_location: 'Europe',
      salary: '$80k - $120k',
      description: '<p>We are looking for a <strong>senior frontend engineer</strong> to join our team.</p><ul><li>React</li><li>TypeScript</li></ul>',
    },
    {
      id: 7654321,
      url: 'https://remotive.com/remote-jobs/software-dev/backend-dev-7654321',
      title: 'Backend Developer',
      company_name: '  SpaceCo  ',
      category: 'Software Development',
      tags: [],
      job_type: 'full_time',
      publication_date: '2026-04-09T08:30:00',
      candidate_required_location: 'Worldwide',
      salary: '',
      description: '<div>Build APIs with <b>Node.js</b>.</div>',
    },
  ],
};

describe('parseRemotiveJobs', () => {
  test('maps API response to JobPartial array', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs).toHaveLength(2);

    expect(jobs[0].source).toBe('remotive');
    expect(jobs[0].external_id).toBe('remotive_1234567');
    expect(jobs[0].title).toBe('Senior Frontend Engineer');
    expect(jobs[0].company).toBe('Acme Corp');
    expect(jobs[0].url).toBe('https://remotive.com/remote-jobs/software-dev/senior-frontend-1234567');
    expect(jobs[0].posted_at).toBe('2026-04-10T12:00:00.000Z');
    expect(jobs[0].location).toBe('Remote — Europe');
  });

  test('strips HTML from description', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[0].description).not.toContain('<p>');
    expect(jobs[0].description).not.toContain('<strong>');
    expect(jobs[0].description).toContain('senior frontend engineer');
    expect(jobs[0].description).toContain('React');
  });

  test('trims company name whitespace', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].company).toBe('SpaceCo');
  });

  test('truncates long descriptions to 6000 chars', () => {
    const longResponse = {
      'job-count': 1,
      jobs: [{
        ...SAMPLE_API_RESPONSE.jobs[0],
        description: '<p>' + 'A'.repeat(7000) + '</p>',
      }],
    };
    const jobs = parseRemotiveJobs(longResponse);
    expect(jobs[0].description!.length).toBeLessThanOrEqual(6012); // 6000 + '\n[truncated]'
    expect(jobs[0].description).toEndWith('\n[truncated]');
  });

  test('skips jobs with missing title or id', () => {
    const badResponse = {
      'job-count': 2,
      jobs: [
        { ...SAMPLE_API_RESPONSE.jobs[0], id: 0 },
        { ...SAMPLE_API_RESPONSE.jobs[1], title: '' },
      ],
    };
    const jobs = parseRemotiveJobs(badResponse);
    expect(jobs).toHaveLength(0);
  });

  test('handles empty jobs array', () => {
    const jobs = parseRemotiveJobs({ 'job-count': 0, jobs: [] });
    expect(jobs).toHaveLength(0);
  });

  test('sets location to "Remote" when candidate_required_location is Worldwide', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].location).toBe('Remote');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/sources/__tests__/remotive.test.ts`
Expected: FAIL — `parseRemotiveJobs` does not exist yet.

- [ ] **Step 3: Implement the source**

Create `src/server/sources/remotive.ts`:

```typescript
import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const REMOTIVE_API = 'https://remotive.com/api/remote-jobs';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function formatLocation(candidateLocation: string): string {
  if (!candidateLocation || candidateLocation.toLowerCase() === 'worldwide') {
    return 'Remote';
  }
  return `Remote — ${candidateLocation}`;
}

export function parseRemotiveJobs(data: RemotiveResponse): JobPartial[] {
  const fetchedAt = new Date().toISOString();
  const jobs: JobPartial[] = [];

  for (const item of data.jobs) {
    if (!item.id || !item.title) continue;

    let description: string | null = stripHtml(item.description);
    if (description.length === 0) {
      description = null;
    } else if (description.length > 6000) {
      description = description.slice(0, 6000) + '\n[truncated]';
    }

    jobs.push({
      source: 'remotive',
      external_id: `remotive_${item.id}`,
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: formatLocation(item.candidate_required_location),
      url: item.url,
      description,
      posted_at: item.publication_date ? new Date(item.publication_date).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }

  return jobs;
}

export async function fetchRemotive(): Promise<JobPartial[]> {
  const url = `${REMOTIVE_API}?category=software-dev`;
  console.log('[remotive] Fetching software-dev jobs...');

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[remotive] API returned ${response.status}`);
  }

  const data = (await response.json()) as RemotiveResponse;
  const jobs = parseRemotiveJobs(data);

  console.log(`[remotive] Fetch complete — ${jobs.length} jobs`);
  return jobs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/sources/__tests__/remotive.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/sources/remotive.ts src/server/sources/__tests__/remotive.test.ts
git commit -m "feat: add remotive source with tests"
```

---

### Task 3: Wire Remotive into the scheduler

**Files:**
- Modify: `src/server/scheduler.ts`

- [ ] **Step 1: Add import**

At the top of `src/server/scheduler.ts`, add alongside the existing source imports (line 1-2):

```typescript
import { fetchRemotive } from './sources/remotive';
```

- [ ] **Step 2: Add Remotive as third fetch step**

In the `fetchJobs()` function, after the LinkedIn fetch block (after the closing `}` of the LinkedIn try/catch around line 163), add:

```typescript
    // 4. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 5. Fetch Remotive
    try {
      const remotiveJobs = await fetchRemotive();
      console.log(`[scheduler] Remotive: ${remotiveJobs.length} jobs`);
      const batch3Ids = ingestBatch(remotiveJobs);
      totalNew += batch3Ids.length;
      if (batch3Ids.length > 0) {
        scoreBatchInBackground(batch3Ids);
      }
    } catch (err) {
      console.error('[scheduler] Remotive failed:', err);
    }
```

- [ ] **Step 3: Run existing tests to check for regressions**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/scheduler.ts
git commit -m "feat: wire remotive into scheduler fetch pipeline"
```

---

### Task 4: Update UI source pills and filter

**Files:**
- Modify: `src/client/src/views/JobsView.tsx`

- [ ] **Step 1: Add remotiveCount**

On line 465, after `jobindexCount`, add:

```typescript
  const remotiveCount = jobs.filter(j => j.source === 'remotive').length;
```

- [ ] **Step 2: Update the source pills condition and array**

Change the source pills block (around line 610) from:

```tsx
{linkedinCount > 0 && jobindexCount > 0 && (
  <div className="flex gap-1">
    {(["all", "linkedin", "jobindex"] as FilterSource[]).map(key => (
```

to:

```tsx
{[linkedinCount, jobindexCount, remotiveCount].filter(c => c > 0).length > 1 && (
  <div className="flex gap-1">
    {(["all", "linkedin", "jobindex", "remotive"] as FilterSource[]).filter(key =>
      key === "all" || (key === "linkedin" && linkedinCount > 0) || (key === "jobindex" && jobindexCount > 0) || (key === "remotive" && remotiveCount > 0)
    ).map(key => (
```

- [ ] **Step 3: Update the pill label**

Change the label line (around line 623) from:

```tsx
{key === 'all' ? 'All sources' : key === 'linkedin' ? 'LinkedIn' : 'Jobindex'}
```

to:

```tsx
{key === 'all' ? 'All sources' : key === 'linkedin' ? 'LinkedIn' : key === 'jobindex' ? 'Jobindex' : 'Remotive'}
```

- [ ] **Step 4: Verify the dev server renders correctly**

Run: `bun run dev`
Open http://localhost:5173 and verify:
- Source pills appear when jobs from multiple sources exist
- "Remotive" pill filters correctly
- No visual regressions

- [ ] **Step 5: Commit**

```bash
git add src/client/src/views/JobsView.tsx
git commit -m "feat: add remotive source pill to jobs UI"
```

---

### Task 5: Update status endpoint source count

**Files:**
- Modify: `src/server/index.ts` (if source counts are returned in `/api/status`)

- [ ] **Step 1: Check if status endpoint reports per-source counts**

Search `src/server/index.ts` for source-specific counting or the `/api/status` handler. If it reports source counts, add `remotive` to the query. If it doesn't break down by source, skip this task.

- [ ] **Step 2: Commit (if changes made)**

```bash
git add src/server/index.ts
git commit -m "feat: include remotive in status source counts"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing + new remotive tests).

- [ ] **Step 2: Manual smoke test**

1. Start dev server: `bun run dev`
2. Open http://localhost:5173
3. Click "Fetch now" in the navbar
4. Watch server logs — should see `[remotive] Fetching software-dev jobs...` followed by `[remotive] Fetch complete — N jobs`
5. After fetch completes, Remotive jobs appear in the list with scores filling in
6. Source pill for "Remotive" appears alongside LinkedIn/Jobindex
7. Filtering by "Remotive" shows only Remotive jobs

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: remotive source integration complete"
```
