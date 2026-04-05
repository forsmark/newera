import { Hono } from 'hono';
import db from '../db';
import { analyzeUnscoredJobs } from '../scheduler';
import { parseResume } from '../llm';
import type { Preferences } from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const app = new Hono();

function getSetting(key: string): string | null {
  const row = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(key: string, value: string) {
  db.run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date().toISOString()],
  );
}

export function getPreferences(): Preferences {
  const raw = getSetting('preferences');
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function getResume(): string {
  return getSetting('resume') ?? '';
}

// GET /api/settings
app.get('/', (c) => {
  const preferences = getPreferences();
  const resume = getResume();
  return c.json({ preferences, resume });
});

// PUT /api/settings/preferences
app.put('/preferences', async (c) => {
  const body = await c.req.json<Partial<Preferences>>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid body' }, 400);
  const current = getPreferences();
  const merged: Preferences = { ...current, ...body };
  setSetting('preferences', JSON.stringify(merged));
  return c.json({ ok: true });
});

// PUT /api/settings/resume
app.put('/resume', async (c) => {
  const body = await c.req.json<{ content?: string }>().catch(() => null);
  if (!body || typeof body.content !== 'string') return c.json({ error: 'content required' }, 400);
  setSetting('resume', body.content);
  return c.json({ ok: true });
});

// POST /api/settings/resume/ingest
// Accepts raw pasted CV text, asks the LLM to clean/structure it, returns the result.
// The client previews it and calls PUT /resume to confirm.
app.post('/resume/ingest', async (c) => {
  const body = await c.req.json<{ rawText?: string }>().catch(() => null);
  if (!body || typeof body.rawText !== 'string' || body.rawText.trim().length < 50) {
    return c.json({ error: 'rawText required (min 50 chars)' }, 400);
  }
  const parsed = await parseResume(body.rawText);
  if (!parsed) return c.json({ error: 'LLM unavailable or parse failed' }, 503);
  return c.json({ parsed });
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
