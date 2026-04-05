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
