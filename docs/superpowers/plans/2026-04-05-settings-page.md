# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page where the user can view and edit `resume.md` and `preferences.md` directly in the browser, and trigger a full LLM re-score of all jobs.

**Architecture:** New Hono route at `/api/settings` reads/writes files in `DATA_DIR`. New `SettingsView` React component added as a `/settings` route. Docker volume for `data/` changed from read-only to read-write.

**Tech Stack:** Bun + Hono (server), React + Vitest + React Testing Library (client), Bun test (server tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `docker-compose.yml` | Remove `:ro` from data volume |
| Modify | `src/server/tests/helpers/setup.ts` | Add temp `DATA_DIR` for server tests |
| Create | `src/server/routes/settings.ts` | `GET /api/settings`, `PUT /…/resume`, `PUT /…/preferences`, `POST /…/rescore` |
| Modify | `src/server/index.ts` | Register `/api/settings` route |
| Create | `src/server/tests/settings.test.ts` | API tests for all four endpoints |
| Create | `src/client/src/views/SettingsView.tsx` | UI: resume editor, preferences editor, system panel |
| Create | `src/client/src/tests/SettingsView.test.tsx` | Component tests |
| Modify | `src/client/src/App.tsx` | Add Settings nav link + `/settings` route |

---

## Task 1: Make data volume read-write

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Remove `:ro` flag from data volume**

In `docker-compose.yml`, change line 6 from:
```yaml
      - ./data:/app/data:ro
```
to:
```yaml
      - ./data:/app/data
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: make data volume read-write for settings editing"
```

---

## Task 2: Add DATA_DIR to server test setup

**Files:**
- Modify: `src/server/tests/helpers/setup.ts`

- [ ] **Step 1: Update setup to create a temp DATA_DIR**

Replace the entire contents of `src/server/tests/helpers/setup.ts` with:

```typescript
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'new-era-test-'));
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
cd src/server && bun test
```

Expected: all existing tests pass (there are no existing server tests, so this is a no-op pass).

```bash
cd ../client && npx vitest run
```

Expected: all existing client tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add src/server/tests/helpers/setup.ts
git commit -m "test: add temp DATA_DIR to server test setup"
```

---

## Task 3: Write failing tests for the settings API

**Files:**
- Create: `src/server/tests/settings.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/server/tests/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import app from '../routes/settings';
import db from '../db';

const dataDir = process.env.DATA_DIR!;

function cleanFiles() {
  try { rmSync(join(dataDir, 'resume.md')); } catch { /* ignore if absent */ }
  try { rmSync(join(dataDir, 'preferences.md')); } catch { /* ignore if absent */ }
}

describe('GET /', () => {
  beforeEach(cleanFiles);

  it('returns empty strings when files do not exist', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const data = await res.json() as { resume: string; preferences: string };
    expect(data.resume).toBe('');
    expect(data.preferences).toBe('');
  });

  it('returns file contents when files exist', async () => {
    writeFileSync(join(dataDir, 'resume.md'), '# My Resume');
    writeFileSync(join(dataDir, 'preferences.md'), '## Preferences');
    const res = await app.request('/');
    const data = await res.json() as { resume: string; preferences: string };
    expect(data.resume).toBe('# My Resume');
    expect(data.preferences).toBe('## Preferences');
  });
});

describe('PUT /resume', () => {
  beforeEach(cleanFiles);

  it('writes content to resume.md and returns ok', async () => {
    const res = await app.request('/resume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New Resume' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(readFileSync(join(dataDir, 'resume.md'), 'utf8')).toBe('# New Resume');
  });
});

describe('PUT /preferences', () => {
  beforeEach(cleanFiles);

  it('writes content to preferences.md and returns ok', async () => {
    const res = await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '## New Prefs' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(readFileSync(join(dataDir, 'preferences.md'), 'utf8')).toBe('## New Prefs');
  });
});

describe('POST /rescore', () => {
  beforeEach(() => {
    db.run('DELETE FROM jobs');
  });

  it('clears scores for non-rejected jobs and returns queued count', async () => {
    db.run(`INSERT INTO jobs (id, source, external_id, title, company, url, status, fetched_at, match_score, match_reasoning, match_summary, tags)
            VALUES ('j1', 'jobindex', 'e1', 'Dev', 'Corp', 'http://x.com', 'new', '2026-01-01', 85, 'good', 'summary', '[]')`);
    db.run(`INSERT INTO jobs (id, source, external_id, title, company, url, status, fetched_at, match_score, match_reasoning, match_summary, tags)
            VALUES ('j2', 'jobindex', 'e2', 'Dev 2', 'Corp', 'http://x.com', 'rejected', '2026-01-01', 70, 'ok', 'sum', '[]')`);

    const res = await app.request('/rescore', { method: 'POST' });
    expect(res.status).toBe(200);
    const data = await res.json() as { queued: number };
    expect(data.queued).toBe(1); // only non-rejected

    const j1 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j1') as { match_score: number | null };
    expect(j1.match_score).toBeNull();

    const j2 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j2') as { match_score: number | null };
    expect(j2.match_score).toBe(70); // rejected job unchanged
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/server && bun test tests/settings.test.ts
```

Expected: FAIL — `Cannot find module '../routes/settings'`

- [ ] **Step 3: Commit**

```bash
cd ..
git add src/server/tests/settings.test.ts
git commit -m "test: failing tests for settings API"
```

---

## Task 4: Implement the settings API route

**Files:**
- Create: `src/server/routes/settings.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create the settings route**

Create `src/server/routes/settings.ts`:

```typescript
import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from '../config';
import db from '../db';
import { analyzeUnscoredJobs } from '../scheduler';

const app = new Hono();

const resumePath = () => join(DATA_DIR, 'resume.md');
const prefsPath = () => join(DATA_DIR, 'preferences.md');

// GET /api/settings
app.get('/', (c) => {
  const resume = existsSync(resumePath()) ? readFileSync(resumePath(), 'utf8') : '';
  const preferences = existsSync(prefsPath()) ? readFileSync(prefsPath(), 'utf8') : '';
  return c.json({ resume, preferences });
});

// PUT /api/settings/resume
app.put('/resume', async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  writeFileSync(resumePath(), content, 'utf8');
  return c.json({ ok: true });
});

// PUT /api/settings/preferences
app.put('/preferences', async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  writeFileSync(prefsPath(), content, 'utf8');
  return c.json({ ok: true });
});

// POST /api/settings/rescore
app.post('/rescore', (c) => {
  const result = db.run(
    "UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL WHERE status != 'rejected'"
  );
  analyzeUnscoredJobs().catch((err) => console.error('[settings] rescore failed:', err));
  return c.json({ queued: result.changes });
});

export default app;
```

- [ ] **Step 2: Register the route in index.ts**

In `src/server/index.ts`, add the import after the existing route imports:

```typescript
import settingsRoute from './routes/settings';
```

And register it after the other `app.route(...)` calls:

```typescript
app.route('/api/settings', settingsRoute);
```

- [ ] **Step 3: Run the tests**

```bash
cd src/server && bun test tests/settings.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ..
git add src/server/routes/settings.ts src/server/index.ts
git commit -m "feat: settings API — read/write resume & preferences, rescore endpoint"
```

---

## Task 5: Write failing tests for SettingsView

**Files:**
- Create: `src/client/src/tests/SettingsView.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/client/src/tests/SettingsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsView from '../views/SettingsView';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resume: '# My Resume', preferences: '## Preferences' }),
      });
    }
    if (url === '/api/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ollama_available: true, unscored_jobs: 3 }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }));
});

describe('SettingsView', () => {
  it('renders section headings', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('loads resume content into the first textarea', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas[0]).toHaveValue('# My Resume');
    });
  });

  it('loads preferences content into the second textarea', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas[1]).toHaveValue('## Preferences');
    });
  });

  it('Save buttons are disabled when content is unchanged', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons[0]).toBeDisabled();
      expect(saveButtons[1]).toBeDisabled();
    });
  });

  it('enables resume Save button when content changes', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getAllByRole('textbox')[0]);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '# Updated' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect(saveButtons[0]).not.toBeDisabled();
    expect(saveButtons[1]).toBeDisabled(); // preferences unchanged
  });

  it('shows Ollama Connected when ollama_available is true', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Ollama Connected')).toBeInTheDocument();
    });
  });

  it('shows unscored jobs count', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('3 jobs pending LLM analysis')).toBeInTheDocument();
    });
  });

  it('shows Re-score all jobs button', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Re-score all jobs' })).toBeInTheDocument();
    });
  });

  it('calls PUT /api/settings/resume on resume save', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getAllByRole('textbox')[0]);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '# New Resume' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/resume' && (opts as RequestInit)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.content).toBe('# New Resume');
    });
  });

  it('calls POST /api/settings/rescore when Re-score button clicked', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByRole('button', { name: 'Re-score all jobs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-score all jobs' }));
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const rescoreCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/rescore' && (opts as RequestInit)?.method === 'POST'
      );
      expect(rescoreCall).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/client && npx vitest run src/tests/SettingsView.test.tsx
```

Expected: FAIL — `Cannot find module '../views/SettingsView'`

- [ ] **Step 3: Commit**

```bash
cd ..
git add src/client/src/tests/SettingsView.test.tsx
git commit -m "test: failing tests for SettingsView"
```

---

## Task 6: Implement SettingsView

**Files:**
- Create: `src/client/src/views/SettingsView.tsx`

- [ ] **Step 1: Create the component**

Create `src/client/src/views/SettingsView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { toast } from "../components/Toast";

interface SettingsData {
  resume: string;
  preferences: string;
}

interface SystemInfo {
  ollama_available: boolean | null;
  unscored_jobs: number;
}

interface EditorProps {
  label: string;
  filename: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  height: string;
}

function FileEditor({ label, filename, value, onChange, onSave, saving, dirty, height }: EditorProps) {
  return (
    <div className="bg-surface rounded border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-text font-semibold text-sm">{label}</h2>
          <p className="text-text-3 text-xs mt-0.5">{filename}</p>
        </div>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className={[
            "px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border",
            dirty && !saving
              ? "bg-surface-raised text-text-2 cursor-pointer btn-ghost"
              : "bg-transparent text-text-3 cursor-not-allowed",
          ].join(" ")}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height, resize: "vertical" }}
        className="w-full bg-surface-deep text-text text-xs font-mono border border-border rounded-sm p-3 outline-none focus:border-accent"
      />
    </div>
  );
}

export default function SettingsView() {
  const [original, setOriginal] = useState<SettingsData>({ resume: "", preferences: "" });
  const [current, setCurrent] = useState<SettingsData>({ resume: "", preferences: "" });
  const [saving, setSaving] = useState({ resume: false, preferences: false });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsData) => {
        setOriginal(data);
        setCurrent(data);
      })
      .catch(() => toast("Failed to load settings"));

    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setSystem({
        ollama_available: data.ollama_available ?? null,
        unscored_jobs: data.unscored_jobs ?? 0,
      }))
      .catch(() => {});
  }, []);

  async function save(key: "resume" | "preferences") {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`/api/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: current[key] }),
      });
      if (!res.ok) throw new Error();
      setOriginal((o) => ({ ...o, [key]: current[key] }));
      toast(key === "resume" ? "Resume saved" : "Preferences saved", "info");
    } catch {
      toast(`Failed to save ${key}`);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function rescore() {
    setRescoring(true);
    try {
      const res = await fetch("/api/settings/rescore", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { queued: number };
      toast(`Re-scoring ${data.queued} jobs`, "info");
    } catch {
      toast("Failed to start re-score");
    } finally {
      setRescoring(false);
    }
  }

  return (
    <div className="max-w-[800px] mx-auto px-4 py-6 flex flex-col gap-6">
      <h1 className="text-text font-semibold text-base">Settings</h1>

      <FileEditor
        label="Resume"
        filename="data/resume.md"
        value={current.resume}
        onChange={(v) => setCurrent((c) => ({ ...c, resume: v }))}
        onSave={() => save("resume")}
        saving={saving.resume}
        dirty={current.resume !== original.resume}
        height="400px"
      />

      <FileEditor
        label="Preferences"
        filename="data/preferences.md"
        value={current.preferences}
        onChange={(v) => setCurrent((c) => ({ ...c, preferences: v }))}
        onSave={() => save("preferences")}
        saving={saving.preferences}
        dirty={current.preferences !== original.preferences}
        height="300px"
      />

      <div className="bg-surface rounded border border-border p-4 flex flex-col gap-3">
        <h2 className="text-text font-semibold text-sm">System</h2>
        {system && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${system.ollama_available ? "bg-green" : "bg-red"}`} />
              <span className="text-text-2">
                Ollama {system.ollama_available ? "Connected" : "Unavailable"}
              </span>
            </div>
            <p className="text-xs text-text-3">
              {system.unscored_jobs > 0
                ? `${system.unscored_jobs} job${system.unscored_jobs === 1 ? "" : "s"} pending LLM analysis`
                : "All jobs scored"}
            </p>
          </div>
        )}
        <button
          onClick={rescore}
          disabled={rescoring}
          className={[
            "mt-1 w-fit px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
            rescoring
              ? "bg-transparent text-text-3 border-border cursor-not-allowed"
              : "bg-surface-raised text-amber border-[#3a2200] cursor-pointer hover:bg-amber-bg",
          ].join(" ")}
        >
          {rescoring ? "Re-scoring…" : "Re-score all jobs"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the tests**

```bash
cd src/client && npx vitest run src/tests/SettingsView.test.tsx
```

Expected: all 10 tests pass.

- [ ] **Step 3: Run full client test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add src/client/src/views/SettingsView.tsx
git commit -m "feat: SettingsView — resume/preferences editors + system panel"
```

---

## Task 7: Wire up nav link and route in App.tsx

**Files:**
- Modify: `src/client/src/App.tsx`

- [ ] **Step 1: Add SettingsView import and nav link**

In `src/client/src/App.tsx`:

Add import after the KanbanView import:
```tsx
import SettingsView from "./views/SettingsView";
```

In the `Nav` function, add a Settings link after the Applications link (line ~51):
```tsx
<NavLink to="/settings" className="nav-link shrink-0" style={navLinkStyle}>Settings</NavLink>
```

In the `AnimatedRoutes` function, add a route after the kanban route (inside `<Routes>`):
```tsx
<Route path="/settings" element={<SettingsView />} />
```

- [ ] **Step 2: Run all tests**

```bash
cd src/client && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add src/client/src/App.tsx
git commit -m "feat: add Settings nav link and route"
```

---

## Self-Review Notes

- Spec requirement: docker `:ro` removed ✓ Task 1
- Spec requirement: `GET /api/settings` ✓ Task 4
- Spec requirement: `PUT /api/settings/resume` ✓ Task 4
- Spec requirement: `PUT /api/settings/preferences` ✓ Task 4
- Spec requirement: `POST /api/settings/rescore` ✓ Task 4 (clears all non-rejected scores, fires `analyzeUnscoredJobs`)
- Spec requirement: resume textarea 400px, preferences 300px ✓ Task 6
- Spec requirement: save button disabled until dirty ✓ Task 6
- Spec requirement: Ollama status + unscored count ✓ Task 6
- Spec requirement: Re-score button amber-styled ✓ Task 6
- Spec requirement: Settings nav link after Applications ✓ Task 7
- Type consistency: `SettingsData`, `SystemInfo` defined once in SettingsView and used throughout
- `analyzeUnscoredJobs` import path: `../scheduler` from `src/server/routes/settings.ts` ✓
