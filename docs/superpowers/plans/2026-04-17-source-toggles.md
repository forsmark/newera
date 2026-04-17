# Source Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-source enable/disable toggles to settings; skip disabled sources during fetch; optionally hide their jobs from the jobs list.

**Architecture:** Two new `Preferences` fields (`disabledSources: string[]`, `hideJobsFromDisabledSources: boolean`) stored in the existing key-value settings table. Scheduler reads `disabledSources` before each source block. `JobsView` extends its existing `/api/settings` fetch to apply client-side source filtering.

**Tech Stack:** Bun, Hono, React, SQLite, bun:test (server), vitest + @testing-library/react (client)

**Spec:** `docs/superpowers/specs/2026-04-17-source-toggles-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/server/types.ts` | Add two fields to `Preferences` interface and `DEFAULT_PREFERENCES` |
| `src/client/src/components/SettingsShared.tsx` | Mirror the two fields in the frontend `Preferences` type and `EMPTY_PREFS` |
| `src/server/scheduler.ts` | Wrap each of the 5 source blocks with a `disabledSources` guard |
| `src/server/tests/unit/disabled-sources.test.ts` | New: unit tests for disabled-source skipping |
| `src/client/src/views/JobsView.tsx` | Extend settings fetch; add source filter to `filtered` computation |
| `src/client/src/views/SettingsView.tsx` | Add Sources accordion with per-source checkboxes + hide toggle |
| `src/client/src/tests/SettingsView.test.tsx` | Update heading test; add two new tests for Sources accordion |

---

## Task 1: Extend backend Preferences type

**Files:**
- Modify: `src/server/types.ts`

- [ ] **Step 1: Add fields to `Preferences` interface**

In `src/server/types.ts`, add two fields to the `Preferences` interface after `appBaseUrl`:

```ts
  disabledSources: string[];            // sources to skip during fetch, empty = all active
  hideJobsFromDisabledSources: boolean; // hide jobs from disabled sources in job list
```

- [ ] **Step 2: Add defaults to `DEFAULT_PREFERENCES`**

Add after `appBaseUrl: 'http://localhost:3000'`:

```ts
  disabledSources: [],
  hideJobsFromDisabledSources: false,
```

- [ ] **Step 3: Commit**

```bash
git add src/server/types.ts
git commit -m "feat: add disabledSources fields to backend Preferences type"
```

---

## Task 2: Extend frontend Preferences type

**Files:**
- Modify: `src/client/src/components/SettingsShared.tsx`

- [ ] **Step 1: Add fields to frontend `Preferences` interface**

In `src/client/src/components/SettingsShared.tsx`, add after `appBaseUrl: string`:

```ts
  disabledSources: string[];
  hideJobsFromDisabledSources: boolean;
```

- [ ] **Step 2: Add defaults to `EMPTY_PREFS`**

Add after `appBaseUrl: 'http://localhost:3000'`:

```ts
  disabledSources: [],
  hideJobsFromDisabledSources: false,
```

- [ ] **Step 3: Commit**

```bash
git add src/client/src/components/SettingsShared.tsx
git commit -m "feat: add disabledSources fields to frontend Preferences type"
```

---

## Task 3: Scheduler — skip disabled sources (TDD)

**Files:**
- Create: `src/server/tests/unit/disabled-sources.test.ts`
- Modify: `src/server/scheduler.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/tests/unit/disabled-sources.test.ts`:

```ts
import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Module mocks must be declared before any imports that resolve the mocked modules
const mockFetchLinkedIn = mock(() => Promise.resolve([]));
const mockFetchJobDescription = mock(() => Promise.resolve(null));
const mockFetchJobindex = mock(() => Promise.resolve([]));
const mockFetchRemotive = mock(() => Promise.resolve([]));
const mockFetchArbeitnow = mock(() => Promise.resolve([]));
const mockFetchRemoteOK = mock(() => Promise.resolve([]));

mock.module('../../sources/linkedin', () => ({
  fetchLinkedIn: mockFetchLinkedIn,
  fetchJobDescription: mockFetchJobDescription,
}));
mock.module('../../sources/jobindex', () => ({
  fetchJobindex: mockFetchJobindex,
}));
mock.module('../../sources/remotive', () => ({
  fetchRemotive: mockFetchRemotive,
}));
mock.module('../../sources/arbeitnow', () => ({
  fetchArbeitnow: mockFetchArbeitnow,
}));
mock.module('../../sources/remoteok', () => ({
  fetchRemoteOK: mockFetchRemoteOK,
}));
mock.module('../../telegram', () => ({
  sendFetchSummary: mock(() => Promise.resolve()),
}));
mock.module('../../llm', () => ({
  analyzeJob: mock(() => Promise.resolve(null)),
}));

import { setSetting } from '../../settings';
import { fetchJobs } from '../../scheduler';

// Remove 30-second inter-source delays during tests
const _orig = globalThis.setTimeout;
// @ts-ignore
globalThis.setTimeout = (fn: TimerHandler, _delay?: number, ...args: unknown[]) =>
  _orig(fn, 0, ...args);

describe('fetchJobs — disabledSources', () => {
  beforeEach(() => {
    mockFetchLinkedIn.mockClear();
    mockFetchJobindex.mockClear();
    mockFetchRemotive.mockClear();
    mockFetchArbeitnow.mockClear();
    mockFetchRemoteOK.mockClear();
    setSetting('preferences', JSON.stringify({ disabledSources: [] }));
  });

  it('calls all source fetchers when disabledSources is empty', async () => {
    await fetchJobs();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchLinkedIn).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).toHaveBeenCalledTimes(1);
    expect(mockFetchArbeitnow).toHaveBeenCalledTimes(1);
    expect(mockFetchRemoteOK).toHaveBeenCalledTimes(1);
  });

  it('skips LinkedIn when it is in disabledSources', async () => {
    setSetting('preferences', JSON.stringify({ disabledSources: ['linkedin'] }));
    await fetchJobs();
    expect(mockFetchLinkedIn).not.toHaveBeenCalled();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).toHaveBeenCalledTimes(1);
    expect(mockFetchArbeitnow).toHaveBeenCalledTimes(1);
    expect(mockFetchRemoteOK).toHaveBeenCalledTimes(1);
  });

  it('skips multiple sources when listed in disabledSources', async () => {
    setSetting('preferences', JSON.stringify({ disabledSources: ['remotive', 'arbeitnow', 'remoteok'] }));
    await fetchJobs();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchLinkedIn).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).not.toHaveBeenCalled();
    expect(mockFetchArbeitnow).not.toHaveBeenCalled();
    expect(mockFetchRemoteOK).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/server/tests/unit/disabled-sources.test.ts
```

Expected: all 3 tests fail — `fetchJobs()` doesn't yet check `disabledSources`.

- [ ] **Step 3: Update `fetchJobs()` in the scheduler**

Replace the body of `fetchJobs()` in `src/server/scheduler.ts` with the version below. The only change is reading `disabledSources` from prefs and wrapping each of the 5 source blocks with a guard. The inter-source delays stay unconditional (they're harmless when sources are skipped).

```ts
export async function fetchJobs(): Promise<number> {
  if (isFetching) {
    console.log('[scheduler] Fetch already in progress, skipping');
    return 0;
  }
  isFetching = true;
  try {
    console.log('[scheduler] Fetching jobs...');
    const { disabledSources } = getPreferences();

    let totalNew = 0;

    // 1. Fetch jobindex first
    if (!disabledSources.includes('jobindex')) {
      try {
        const jobindexJobs = await fetchJobindex();
        console.log(`[scheduler] Jobindex: ${jobindexJobs.length} jobs`);
        const batch1Ids = ingestBatch(jobindexJobs);
        totalNew += batch1Ids.length;
        if (batch1Ids.length > 0) scoreBatchInBackground(batch1Ids);
      } catch (err) {
        console.error('[scheduler] Jobindex failed:', err);
      }
    }

    // 2. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 3. Fetch LinkedIn
    if (!disabledSources.includes('linkedin')) {
      try {
        const linkedinJobs = await fetchLinkedIn();
        console.log(`[scheduler] LinkedIn: ${linkedinJobs.length} jobs`);
        const batch2Ids = ingestBatch(linkedinJobs);
        totalNew += batch2Ids.length;
        if (batch2Ids.length > 0) scoreBatchInBackground(batch2Ids);
      } catch (err) {
        console.error('[scheduler] LinkedIn failed:', err);
      }
    }

    // 4. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 5. Fetch Remotive
    if (!disabledSources.includes('remotive')) {
      try {
        const remotiveJobs = await fetchRemotive();
        console.log(`[scheduler] Remotive: ${remotiveJobs.length} jobs`);
        const batch3Ids = ingestBatch(remotiveJobs);
        totalNew += batch3Ids.length;
        if (batch3Ids.length > 0) scoreBatchInBackground(batch3Ids);
      } catch (err) {
        console.error('[scheduler] Remotive failed:', err);
      }
    }

    // 6. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 7. Fetch Arbeitnow
    if (!disabledSources.includes('arbeitnow')) {
      try {
        const arbeitnowJobs = await fetchArbeitnow();
        console.log(`[scheduler] Arbeitnow: ${arbeitnowJobs.length} jobs`);
        const batch4Ids = ingestBatch(arbeitnowJobs);
        totalNew += batch4Ids.length;
        if (batch4Ids.length > 0) scoreBatchInBackground(batch4Ids);
      } catch (err) {
        console.error('[scheduler] Arbeitnow failed:', err);
      }
    }

    // 8. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 9. Fetch RemoteOK
    if (!disabledSources.includes('remoteok')) {
      try {
        const remoteokJobs = await fetchRemoteOK();
        console.log(`[scheduler] RemoteOK: ${remoteokJobs.length} jobs`);
        const batch5Ids = ingestBatch(remoteokJobs);
        totalNew += batch5Ids.length;
        if (batch5Ids.length > 0) scoreBatchInBackground(batch5Ids);
      } catch (err) {
        console.error('[scheduler] RemoteOK failed:', err);
      }
    }

    console.log(`[scheduler] ${totalNew} new jobs total`);
    lastFetchAt = new Date().toISOString();
    lastFetchNewJobs = totalNew;

    checkStaleLinksBatch().catch(console.error);

    return totalNew;
  } finally {
    isFetching = false;
  }
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
bun test src/server/tests/unit/disabled-sources.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
bun test
```

Expected: all tests pass. If any test fails, fix it before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/server/tests/unit/disabled-sources.test.ts src/server/scheduler.ts
git commit -m "feat: skip disabled sources during fetch"
```

---

## Task 4: JobsView — filter by disabled sources

**Files:**
- Modify: `src/client/src/views/JobsView.tsx`

`JobsView` already fetches `/api/settings` on mount (around line 190) and reads `lowScoreThreshold`, `defaultHideLowScore`, `defaultHideUnscored`. Extend it to also read and apply the two new prefs.

- [ ] **Step 1: Add state variables**

After the `lowScoreThreshold` state declaration (line ~105), add:

```ts
const [disabledSources, setDisabledSources] = useState<string[]>([]);
const [hideJobsFromDisabledSources, setHideJobsFromDisabledSources] = useState(false);
```

- [ ] **Step 2: Extend the settings fetch**

Replace the existing `/api/settings` `useEffect` (lines ~190–202) with:

```ts
useEffect(() => {
  fetch('/api/settings')
    .then(r => r.json())
    .then((d: {
      preferences?: {
        lowScoreThreshold?: number;
        defaultHideLowScore?: boolean;
        defaultHideUnscored?: boolean;
        disabledSources?: string[];
        hideJobsFromDisabledSources?: boolean;
      }
    }) => {
      const p = d.preferences ?? {};
      if (typeof p.lowScoreThreshold === 'number') setLowScoreThreshold(p.lowScoreThreshold);
      if (Array.isArray(p.disabledSources)) setDisabledSources(p.disabledSources);
      if (typeof p.hideJobsFromDisabledSources === 'boolean') setHideJobsFromDisabledSources(p.hideJobsFromDisabledSources);
      if (!filterDefaultsApplied.current) {
        if (typeof p.defaultHideLowScore === 'boolean') setHideWeakMatches(p.defaultHideLowScore);
        if (typeof p.defaultHideUnscored === 'boolean') setHideUnscored(p.defaultHideUnscored);
        filterDefaultsApplied.current = true;
      }
    })
    .catch(() => {});
}, []);
```

- [ ] **Step 3: Add source filter to the `filtered` computation**

In the `filtered` array's `.filter()` callback (around line 401), add one line immediately after the `selectedSources` check:

```ts
if (selectedSources.size > 0 && !selectedSources.has(j.source)) return false;
if (hideJobsFromDisabledSources && disabledSources.includes(j.source)) return false;  // NEW
```

- [ ] **Step 4: Commit**

```bash
git add src/client/src/views/JobsView.tsx
git commit -m "feat: filter job list by disabled sources"
```

---

## Task 5: SettingsView — Sources accordion (TDD)

**Files:**
- Modify: `src/client/src/views/SettingsView.tsx`
- Modify: `src/client/src/tests/SettingsView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two tests to `src/client/src/tests/SettingsView.test.tsx`, inside the existing `describe('SettingsView', ...)` block:

```ts
it('renders Sources accordion', async () => {
  render(<SettingsView />);
  await waitFor(() => {
    expect(screen.getByText('Sources')).toBeInTheDocument();
  });
});

it('all source checkboxes are checked by default when disabledSources is empty', async () => {
  render(<SettingsView />);
  await waitFor(() => screen.getByText('Sources'));
  fireEvent.click(screen.getByText('Sources'));
  await waitFor(() => {
    expect(screen.getByLabelText('LinkedIn')).toBeChecked();
    expect(screen.getByLabelText('Jobindex')).toBeChecked();
    expect(screen.getByLabelText('Remotive')).toBeChecked();
    expect(screen.getByLabelText('Arbeitnow')).toBeChecked();
    expect(screen.getByLabelText('RemoteOK')).toBeChecked();
  });
});
```

Also update the existing `'renders system section headings'` test to expect `'Sources'`:

```ts
it('renders system section headings', async () => {
  render(<SettingsView />);
  await waitFor(() => {
    expect(screen.getByText('App config')).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/client && npx vitest run src/tests/SettingsView.test.tsx
```

Expected: the two new tests fail and the heading test fails ("Sources" not found).

- [ ] **Step 3: Add `ALL_SOURCES` constant to `SettingsView`**

In `src/client/src/views/SettingsView.tsx`, add this constant before the `export default function SettingsView` line:

```ts
const ALL_SOURCES = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'jobindex', label: 'Jobindex' },
  { key: 'remotive', label: 'Remotive' },
  { key: 'arbeitnow', label: 'Arbeitnow' },
  { key: 'remoteok', label: 'RemoteOK' },
] as const;
```

- [ ] **Step 4: Insert the Sources accordion**

In `SettingsView`'s `return`, insert the following JSX between the closing `</Accordion>` of "App config" and the opening `<Accordion title="Notifications"`:

```tsx
{/* Sources */}
<Accordion title="Sources" defaultOpen={false} action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
  <p className="text-[0.75rem] text-text-3 m-0">
    Disabled sources are skipped during fetch. Existing jobs from disabled sources are not removed.
  </p>
  <div className="flex flex-wrap gap-x-6 gap-y-2">
    {ALL_SOURCES.map(({ key, label }) => {
      const enabled = !prefs.disabledSources.includes(key);
      return (
        <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => {
              const next = e.target.checked
                ? prefs.disabledSources.filter(s => s !== key)
                : [...prefs.disabledSources, key];
              updatePref('disabledSources', next);
            }}
            className="checkbox-styled"
          />
          {label}
        </label>
      );
    })}
  </div>
  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
    <input
      type="checkbox"
      checked={prefs.hideJobsFromDisabledSources}
      onChange={e => updatePref('hideJobsFromDisabledSources', e.target.checked)}
      disabled={prefs.disabledSources.length === 0}
      className="checkbox-styled"
    />
    Hide jobs from disabled sources in job list
  </label>
</Accordion>
```

- [ ] **Step 5: Run frontend tests**

```bash
cd src/client && npx vitest run
```

Expected: all tests pass. If `getByLabelText('LinkedIn')` fails, the label-to-input association isn't working — add `aria-label={label}` to the `<input>` element as a fallback.

- [ ] **Step 6: Run full backend test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/views/SettingsView.tsx src/client/src/tests/SettingsView.test.tsx
git commit -m "feat: add Sources accordion to settings"
```

---

## Self-review

**Spec coverage:**
- ✅ Per-source toggles in Settings UI (Task 5)
- ✅ All sources on by default (`disabledSources: []` in DEFAULT_PREFERENCES)
- ✅ Disabled sources skipped during fetch (Task 3)
- ✅ "Hide jobs from disabled sources" option, jobs list only (Task 4)
- ✅ Kanban unaffected — filter is only in `JobsView`
- ✅ Non-destructive — existing jobs from disabled sources stay in DB

**Type consistency:** `disabledSources: string[]` and `hideJobsFromDisabledSources: boolean` used identically in all four files. `ALL_SOURCES` key values match `Job['source']` union.
