import { Hono } from 'hono';
import db from '../db';
import type { Job } from '../types';
import { analyzeJob } from '../llm';

const app = new Hono();

const VALID_STATUSES = new Set(['new', 'saved', 'applied', 'rejected']);

// GET /api/jobs
// Query params: status (filter by status), q (text search in title+company)
app.get('/', (c) => {
  const status = c.req.query('status');
  const q = c.req.query('q');

  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const conditions: string[] = [];
  const params: string[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (q) {
    conditions.push('(title LIKE ? OR company LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM jobs ${where} ORDER BY match_score DESC NULLS LAST, fetched_at DESC`;

  const jobs = db.query(sql).all(...params) as Job[];
  return c.json(jobs);
});

// PATCH /api/jobs/:id
// Body: { status?: string; seen_at?: string | null }
app.patch('/:id', async (c) => {
  const id = c.req.param('id');

  let body: { status?: string; seen_at?: string | null };
  try {
    body = await c.req.json<{ status?: string; seen_at?: string | null }>();
  } catch {
    return c.json({ error: 'Malformed request body' }, 400);
  }

  const hasStatus = 'status' in body;
  const hasSeenAt = 'seen_at' in body;

  if (!hasStatus && !hasSeenAt) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  if (hasStatus && (!body.status || !VALID_STATUSES.has(body.status))) {
    return c.json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400);
  }

  const job = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job | null;
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (hasStatus) {
    const { status } = body as { status: string };
    db.run('UPDATE jobs SET status = ? WHERE id = ?', [status, id]);

    if (status === 'applied') {
      const now = new Date().toISOString();
      db.run(
        `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
         VALUES (?, 'applied', ?, ?)`,
        [id, now, now],
      );
    }
  }

  if (hasSeenAt) {
    db.run('UPDATE jobs SET seen_at = ? WHERE id = ?', [body.seen_at ?? null, id]);
  }

  const updated = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job;
  return c.json(updated);
});

// POST /api/jobs/bulk-status
// Body: { ids: string[], status: 'saved' | 'rejected' }
// Updates status for all provided job IDs in a single transaction
app.post('/bulk-status', async (c) => {
  let body: { ids?: unknown; status?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { ids, status } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400);
  }
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400);
  }
  // Only allow bulk-setting to saved or rejected (not applied — that needs kanban entry)
  if (status === 'applied') {
    return c.json({ error: 'Use the individual PATCH endpoint to mark jobs as applied' }, 400);
  }

  // Run in a transaction for atomicity
  const updateMany = db.transaction((jobIds: string[]) => {
    const stmt = db.prepare('UPDATE jobs SET status = ?, seen_at = COALESCE(seen_at, ?) WHERE id = ?');
    let count = 0;
    const now = new Date().toISOString();
    for (const id of jobIds) {
      const result = stmt.run(status, now, id);
      count += result.changes;
    }
    return count;
  });

  const updated = updateMany(ids as string[]);
  return c.json({ updated });
});

// POST /api/jobs/:id/analyze
// Resets match_score and match_reasoning to null, then triggers async re-analysis
// Returns 202 immediately; score fills in via the polling mechanism
app.post('/:id/analyze', async (c) => {
  const id = c.req.param('id');

  const job = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job | null;
  if (!job) return c.json({ error: 'Job not found' }, 404);

  // Reset scores so frontend polling picks it up as pending
  db.run('UPDATE jobs SET match_score = NULL, match_reasoning = NULL WHERE id = ?', [id]);

  // Fire-and-forget re-analysis
  const freshJob = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job;
  analyzeJob(freshJob).then((result) => {
    if (result) {
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ? WHERE id = ?', [
        result.match_score, result.match_reasoning, id,
      ]);
    }
  }).catch(console.error);

  return c.json({ message: 'Re-analysis queued' }, 202);
});

export default app;

