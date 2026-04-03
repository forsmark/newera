import { Hono } from 'hono';
import db from '../db';
import type { ApplicationWithJob } from '../types';

const app = new Hono();

const VALID_COLUMNS = new Set(['applied', 'interview', 'offer', 'rejected']);

function reshapeRow(row: Record<string, unknown>): ApplicationWithJob {
  const job: Record<string, unknown> = {};
  const app: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('job__')) {
      job[key.slice(5)] = value;
    } else {
      app[key] = value;
    }
  }
  // Parse tags from JSON string
  if (typeof job['tags'] === 'string') {
    try { job['tags'] = JSON.parse(job['tags']); } catch { job['tags'] = null; }
  }
  return { ...app, job } as ApplicationWithJob;
}

// GET /api/kanban
// Returns all applications with joined job data
app.get('/', (c) => {
  const rows = db.query(`
    SELECT
      a.job_id,
      a.kanban_column,
      a.notes,
      a.interview_at,
      a.applied_at,
      a.updated_at,
      j.id           AS job__id,
      j.source       AS job__source,
      j.external_id  AS job__external_id,
      j.title        AS job__title,
      j.company      AS job__company,
      j.location     AS job__location,
      j.url          AS job__url,
      j.description  AS job__description,
      j.posted_at    AS job__posted_at,
      j.match_score  AS job__match_score,
      j.match_reasoning AS job__match_reasoning,
      j.tags         AS job__tags,
      j.status       AS job__status,
      j.seen_at      AS job__seen_at,
      j.fetched_at   AS job__fetched_at
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    ORDER BY a.updated_at DESC
  `).all() as Record<string, unknown>[];

  // Reshape flat rows into ApplicationWithJob shape
  const result: ApplicationWithJob[] = rows.map(reshapeRow);

  return c.json(result);
});

// PATCH /api/kanban/:id  (id is job_id)
// Body: { kanban_column?, notes?, interview_at? }
app.patch('/:id', async (c) => {
  const jobId = c.req.param('id');
  let body: { kanban_column?: string; notes?: string; interview_at?: string | null };
  try {
    body = await c.req.json<{ kanban_column?: string; notes?: string; interview_at?: string | null }>();
  } catch {
    return c.json({ error: 'Malformed request body' }, 400);
  }

  if (body.kanban_column !== undefined && !VALID_COLUMNS.has(body.kanban_column)) {
    return c.json(
      { error: `Invalid kanban_column. Must be one of: ${[...VALID_COLUMNS].join(', ')}` },
      400,
    );
  }

  const existing = db.query('SELECT * FROM applications WHERE job_id = ?').get(jobId);
  if (!existing) {
    return c.json({ error: 'Application not found' }, 404);
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.kanban_column !== undefined) {
    fields.push('kanban_column = ?');
    params.push(body.kanban_column);
  }
  if ('notes' in body) {
    fields.push('notes = ?');
    params.push(body.notes ?? null);
  }
  if ('interview_at' in body) {
    fields.push('interview_at = ?');
    params.push(body.interview_at ?? null);
  }

  if (fields.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(jobId);

  db.run(`UPDATE applications SET ${fields.join(', ')} WHERE job_id = ?`, params);

  const updated = db.query(`
    SELECT
      a.job_id, a.kanban_column, a.notes, a.interview_at, a.applied_at, a.updated_at,
      j.id AS job__id, j.source AS job__source, j.external_id AS job__external_id,
      j.title AS job__title, j.company AS job__company, j.location AS job__location,
      j.url AS job__url, j.description AS job__description, j.posted_at AS job__posted_at,
      j.match_score AS job__match_score, j.match_reasoning AS job__match_reasoning,
      j.tags AS job__tags, j.status AS job__status, j.seen_at AS job__seen_at, j.fetched_at AS job__fetched_at
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.job_id = ?
  `).get(jobId) as Record<string, unknown>;

  return c.json(reshapeRow(updated));
});

export default app;
