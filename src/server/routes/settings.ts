import { Hono } from 'hono';
import db from '../db';
import { analyzeUnscoredJobs } from '../scheduler';
import { parseResume } from '../llm';
import { fetchPageText } from '../utils/fetchPageText';
import type { Preferences } from '../types';
import { getSetting, setSetting, getPreferences, getResume } from '../settings';

export { getPreferences, getResume };

const app = new Hono();

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

// POST /api/settings/resume/ingest-linkedin
// Fetches a LinkedIn profile URL and parses it into structured CV markdown
app.post('/resume/ingest-linkedin', async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => null);
  if (!body || typeof body.url !== 'string' || !body.url.trim()) {
    return c.json({ error: 'url required' }, 400);
  }

  const url = body.url.trim();
  if (!url.includes('linkedin.com/in/')) {
    return c.json({ error: 'URL must be a LinkedIn profile URL (linkedin.com/in/…)' }, 400);
  }

  const pageText = await fetchPageText(url);
  if (!pageText || pageText.length < 100) {
    return c.json({
      error: 'Could not extract profile data — LinkedIn may require login. Copy your profile text and use "Ingest resume" instead.',
    }, 503);
  }

  const parsed = await parseResume(pageText);
  if (!parsed) return c.json({ error: 'LLM unavailable or parse failed' }, 503);

  return c.json({ parsed });
});

// POST /api/settings/reject-low-score — retroactively reject all new jobs below threshold
app.post('/reject-low-score', (c) => {
  const { lowScoreThreshold } = getPreferences();
  const result = db.run(
    "UPDATE jobs SET status = 'rejected' WHERE status = 'new' AND match_score IS NOT NULL AND match_score < ?",
    [lowScoreThreshold],
  );
  return c.json({ rejected: result.changes });
});

// POST /api/settings/rescore
app.post('/rescore', (c) => {
  const result = db.run(
    "UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL, work_type = NULL WHERE status != 'rejected'"
  );
  analyzeUnscoredJobs().catch((err) => console.error('[settings] rescore failed:', err));
  return c.json({ queued: result.changes });
});

export default app;
