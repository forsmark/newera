import { Hono } from 'hono';
import db from '../db';
import type { Job } from '../types';

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
// Body: { status: string }
app.patch('/:id', async (c) => {
  const id = c.req.param('id');

  let body: { status: string };
  try {
    body = await c.req.json<{ status: string }>();
  } catch {
    return c.json({ error: 'Malformed request body' }, 400);
  }
  const { status } = body;

  if (!status || !VALID_STATUSES.has(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400);
  }

  const job = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job | null;
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  db.run('UPDATE jobs SET status = ? WHERE id = ?', [status, id]);

  if (status === 'applied') {
    const now = new Date().toISOString();
    db.run(
      `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
       VALUES (?, 'applied', ?, ?)`,
      [id, now, now],
    );
  }

  return c.json({ ...job, status });
});

export default app;
