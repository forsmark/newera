import { Hono } from 'hono';
import db from '../db';
import { generateCoverLetter } from '../llm';
import type { Application, ApplicationWithJob } from '../types';
import { randomUUID } from 'crypto';

interface ApplicationEvent {
  id: number;
  job_id: string;
  from_column: string | null;
  to_column: string;
  created_at: string;
}

const app = new Hono();

const VALID_COLUMNS = new Set(['saved', 'applied', 'interview', 'offer', 'rejected']);

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

const SELECT_FIELDS = `
  a.job_id,
  a.kanban_column,
  a.notes,
  a.interview_at,
  a.applied_at,
  a.updated_at,
  a.archived_description,
  a.cover_letter,
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
  j.match_summary AS job__match_summary,
  j.tags         AS job__tags,
  j.status       AS job__status,
  j.seen_at      AS job__seen_at,
  j.fetched_at   AS job__fetched_at
`;

// GET /api/kanban
// Returns all applications with joined job data
app.get('/', (c) => {
  const rows = db.query(`
    SELECT ${SELECT_FIELDS}
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    ORDER BY a.updated_at DESC
  `).all() as Record<string, unknown>[];

  const applications = rows.map(reshapeRow);

  const eventStmt = db.query<ApplicationEvent, [string]>(
    'SELECT id, job_id, from_column, to_column, created_at FROM application_events WHERE job_id = ? ORDER BY created_at ASC'
  );
  const withEvents = applications.map(app => ({
    ...app,
    events: eventStmt.all(app.job_id),
  }));

  return c.json(withEvents);
});

// PATCH /api/kanban/:id  (id is job_id)
// Body: { kanban_column?, notes?, interview_at?, cover_letter? }
app.patch('/:id', async (c) => {
  const jobId = c.req.param('id');
  let body: { kanban_column?: string; notes?: string; interview_at?: string | null; cover_letter?: string | null };
  try {
    body = await c.req.json();
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
    const old = (existing as { kanban_column: string }).kanban_column;
    if (old !== body.kanban_column) {
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO application_events (job_id, from_column, to_column, created_at)
         VALUES (?, ?, ?, ?)`,
        [jobId, old, body.kanban_column, now],
      );
    }
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
  if ('cover_letter' in body) {
    fields.push('cover_letter = ?');
    params.push(body.cover_letter ?? null);
  }

  if (fields.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(jobId);

  db.run(`UPDATE applications SET ${fields.join(', ')} WHERE job_id = ?`, params);

  if (body.kanban_column === 'rejected') {
    db.run(`UPDATE jobs SET status = 'rejected', updated_at = ? WHERE id = ?`, [new Date().toISOString(), jobId]);
  }

  const updated = db.query(`
    SELECT ${SELECT_FIELDS}
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.job_id = ?
  `).get(jobId) as Record<string, unknown>;

  const result = reshapeRow(updated);
  (result as any).events = db.query(
    'SELECT id, job_id, from_column, to_column, created_at FROM application_events WHERE job_id = ? ORDER BY created_at ASC'
  ).all(jobId);
  return c.json(result);
});

// POST /api/kanban/:id/cover-letter
// Generates a cover letter via the LLM and persists it
app.post('/:id/cover-letter', async (c) => {
  const jobId = c.req.param('id');

  const row = db.query(`
    SELECT ${SELECT_FIELDS}
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.job_id = ?
  `).get(jobId) as Record<string, unknown> | null;

  if (!row) {
    return c.json({ error: 'Application not found' }, 404);
  }

  const application = reshapeRow(row) as Application & { archived_description: string | null };
  const coverLetter = await generateCoverLetter(application.job, application.archived_description);

  if (!coverLetter) {
    return c.json({ error: 'Cover letter generation failed — check Ollama is running' }, 503);
  }

  const now = new Date().toISOString();
  db.run('UPDATE applications SET cover_letter = ?, updated_at = ? WHERE job_id = ?', [coverLetter, now, jobId]);

  return c.json({ cover_letter: coverLetter });
});

// GET /api/kanban/:id/artifacts
app.get('/:id/artifacts', (c) => {
  const jobId = c.req.param('id');
  const rows = db.query(`
    SELECT id, job_id, type, name, url, mime_type, file_size, created_at
    FROM application_artifacts WHERE job_id = ? ORDER BY created_at ASC
  `).all(jobId);
  return c.json(rows);
});

// POST /api/kanban/:id/artifacts
// Multipart for file uploads, JSON for links
app.post('/:id/artifacts', async (c) => {
  const jobId = c.req.param('id');
  const existing = db.query('SELECT * FROM applications WHERE job_id = ?').get(jobId);
  if (!existing) return c.json({ error: 'Application not found' }, 404);

  const contentType = c.req.header('content-type') ?? '';
  const id = randomUUID();
  const now = new Date().toISOString();

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await c.req.formData(); } catch { return c.json({ error: 'Invalid form data' }, 400); }

    const file = form.get('file') as File | null;
    if (!file) return c.json({ error: 'file required' }, 400);

    const name = (form.get('name') as string | null)?.trim() || file.name;
    const buf = Buffer.from(await file.arrayBuffer());

    db.run(
      'INSERT INTO application_artifacts (id, job_id, type, name, url, file_data, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, jobId, 'file', name, null, buf, file.type || 'application/octet-stream', file.size, now],
    );
  } else {
    let body: { name?: string; url?: string };
    try { body = await c.req.json(); } catch { return c.json({ error: 'Malformed JSON' }, 400); }

    const name = body.name?.trim();
    const url = body.url?.trim();
    if (!name || !url) return c.json({ error: 'name and url required' }, 400);

    db.run(
      'INSERT INTO application_artifacts (id, job_id, type, name, url, file_data, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, jobId, 'link', name, url, null, null, null, now],
    );
  }

  const row = db.query(`
    SELECT id, job_id, type, name, url, mime_type, file_size, created_at
    FROM application_artifacts WHERE id = ?
  `).get(id);
  return c.json(row, 201);
});

// DELETE /api/kanban/:id/artifacts/:aid
app.delete('/:id/artifacts/:aid', (c) => {
  const jobId = c.req.param('id');
  const aid = c.req.param('aid');
  const result = db.run('DELETE FROM application_artifacts WHERE id = ? AND job_id = ?', [aid, jobId]);
  if (result.changes === 0) return c.json({ error: 'Artifact not found' }, 404);
  return c.json({ ok: true });
});

// GET /api/kanban/:id/artifacts/:aid/file
app.get('/:id/artifacts/:aid/file', (c) => {
  const jobId = c.req.param('id');
  const aid = c.req.param('aid');
  const row = db.query('SELECT name, mime_type, file_data FROM application_artifacts WHERE id = ? AND job_id = ? AND type = ?').get(aid, jobId, 'file') as { name: string; mime_type: string; file_data: Uint8Array } | null;
  if (!row || !row.file_data) return c.json({ error: 'File not found' }, 404);

  return new Response(row.file_data, {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
      'Content-Length': String(row.file_data.byteLength),
    },
  });
});

export default app;
