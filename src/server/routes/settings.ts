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
  const body = await c.req.json<{ content?: string }>().catch(() => null);
  if (!body || typeof body.content !== 'string') return c.json({ error: 'content required' }, 400);
  writeFileSync(resumePath(), body.content, 'utf8');
  return c.json({ ok: true });
});

// PUT /api/settings/preferences
app.put('/preferences', async (c) => {
  const body = await c.req.json<{ content?: string }>().catch(() => null);
  if (!body || typeof body.content !== 'string') return c.json({ error: 'content required' }, 400);
  writeFileSync(prefsPath(), body.content, 'utf8');
  return c.json({ ok: true });
});

// POST /api/settings/rescore
app.post('/rescore', (c) => {
  const result = db.run(
    "UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL WHERE status != 'rejected'"
  );
  // analyzeUnscoredJobs processes up to 20 jobs per call (see scheduler.ts).
  // For large backlogs, re-triggering GET /api/fetch will pick up the remainder.
  analyzeUnscoredJobs().catch((err) => console.error('[settings] rescore failed:', err));
  return c.json({ queued: result.changes });
});

export default app;
