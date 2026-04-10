import { Hono } from 'hono';
import db from '../db';
import type { Job } from '../types';
import { analyzeJob } from '../llm';
import { analyzeUnscoredJobs } from '../scheduler';
import { fetchPageText } from '../utils/fetchPageText';
import { computePrefsHash } from '../utils/hash';
import { getSetting, getResume } from '../settings';

const app = new Hono();

const VALID_STATUSES = new Set(['new', 'saved', 'applied', 'rejected']);

// GET /api/jobs
// Query params: status, q, limit, offset, include_duplicates
app.get('/', (c) => {
  const status = c.req.query('status');
  const q = c.req.query('q');
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const includeDuplicates = c.req.query('include_duplicates') === '1';
  const limit = Math.min(parseInt(limitParam ?? '100', 10) || 100, 200); // cap at 200
  const offset = parseInt(offsetParam ?? '0', 10) || 0;

  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const conditions: string[] = [];
  const countParams: string[] = [];

  if (status) {
    conditions.push('status = ?');
    countParams.push(status);
  }

  if (q) {
    conditions.push('(title LIKE ? OR company LIKE ?)');
    const like = `%${q}%`;
    countParams.push(like, like);
  }

  if (!includeDuplicates) {
    conditions.push('duplicate_of IS NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const params = [...countParams, limit as unknown as string, offset as unknown as string];

  const sql = `SELECT * FROM jobs ${where} ORDER BY match_score DESC NULLS LAST, fetched_at DESC LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as total FROM jobs ${where}`;

  const rawJobs = db.query(sql).all(...params) as (Job & { tags: string | null })[];
  const jobs = rawJobs.map(j => ({ ...j, tags: j.tags ? JSON.parse(j.tags) as string[] : null }));
  const countRow = db.query(countSql).get(...countParams) as { total: number };
  return c.json({ jobs, total: countRow.total, limit, offset });
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

    if (status === 'saved') {
      const now = new Date().toISOString();
      db.run(
        `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
         VALUES (?, 'saved', ?, ?)`,
        [id, now, now],
      );
    }

    if (status === 'applied') {
      const now = new Date().toISOString();
      // Move from saved column if already there, otherwise insert fresh
      const existing = db.query('SELECT * FROM applications WHERE job_id = ?').get(id);
      if (existing) {
        db.run(
          `UPDATE applications SET kanban_column = 'applied', updated_at = ? WHERE job_id = ? AND kanban_column = 'saved'`,
          [now, id],
        );
      } else {
        db.run(
          `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
           VALUES (?, 'applied', ?, ?)`,
          [id, now, now],
        );
      }
      // Fire-and-forget: fetch and archive the full job posting
      (async () => {
        const text = await fetchPageText(job.url);
        const archived = text ?? job.description;
        if (archived) {
          db.run('UPDATE applications SET archived_description = ? WHERE job_id = ?', [archived, id]);
        }
      })().catch(err => console.error('[jobs] Failed to archive posting for job', id, ':', err));
    }
  }

  if (hasSeenAt) {
    db.run('UPDATE jobs SET seen_at = ? WHERE id = ?', [body.seen_at ?? null, id]);
  }

  const raw = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job & { tags: string | null };
  return c.json({ ...raw, tags: raw.tags ? JSON.parse(raw.tags) as string[] : null });
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

// POST /api/jobs/bulk-seen
// Body: { ids: string[] }
// Marks all provided job IDs as seen (sets seen_at if not already set)
app.post('/bulk-seen', async (c) => {
  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400);
  }

  const now = new Date().toISOString();
  const markSeen = db.transaction((jobIds: string[]) => {
    const stmt = db.prepare('UPDATE jobs SET seen_at = ? WHERE id = ? AND seen_at IS NULL');
    let count = 0;
    for (const id of jobIds) {
      count += stmt.run(now, id).changes;
    }
    return count;
  });

  const updated = markSeen(ids as string[]);
  return c.json({ updated, seen_at: now });
});

// POST /api/jobs/bulk-unseen
// Body: { ids: string[] }
// Marks all provided job IDs as unread (clears seen_at)
app.post('/bulk-unseen', async (c) => {
  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400);
  }

  const markUnseen = db.transaction((jobIds: string[]) => {
    const stmt = db.prepare('UPDATE jobs SET seen_at = NULL WHERE id = ?');
    let count = 0;
    for (const id of jobIds) {
      count += stmt.run(id).changes;
    }
    return count;
  });

  const updated = markUnseen(ids as string[]);
  return c.json({ updated });
});

// POST /api/jobs/rescore-all
// Resets match scores for all non-rejected jobs and re-queues analysis via the scheduler
app.post('/rescore-all', (c) => {
  const result = db.run(
    "UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL, work_type = NULL WHERE status != 'rejected'"
  );
  const queued = result.changes;

  // Fire-and-forget: loop until all jobs are scored (analyzeUnscoredJobs processes 20 at a time)
  (async () => {
    for (let i = 0; i < 100; i++) {
      const row = db.query('SELECT COUNT(*) as c FROM jobs WHERE match_score IS NULL').get() as { c: number };
      if (row.c === 0) break;
      await analyzeUnscoredJobs();
    }
    console.log('[jobs] rescore-all complete');
  })().catch(console.error);

  return c.json({ queued }, 202);
});

// POST /api/jobs/rescore-stale
// Re-scores only jobs whose prefs_hash doesn't match the current resume+prefs hash
app.post('/rescore-stale', (c) => {
  const resume = getResume();
  const prefsJson = getSetting('preferences') ?? '{}';
  const currentHash = computePrefsHash(resume, prefsJson);

  const staleJobs = db.query<{ id: string }, [string]>(
    `SELECT id FROM jobs
     WHERE match_score IS NOT NULL
     AND status NOT IN ('rejected')
     AND (prefs_hash IS NULL OR prefs_hash != ?)
     AND description IS NOT NULL`
  ).all(currentHash);

  if (staleJobs.length === 0) return c.json({ queued: 0 }, 202);

  const ids = staleJobs.map(j => j.id);
  db.run(
    `UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  (async () => {
    for (const { id } of staleJobs) {
      const job = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job | null;
      if (!job) continue;
      const result = await analyzeJob(job);
      if (!result) continue;
      db.run(
        `UPDATE jobs SET match_score=?, match_reasoning=?, match_summary=?, tags=?, work_type=?, prefs_hash=? WHERE id=?`,
        [result.match_score, result.match_reasoning, result.match_summary,
         JSON.stringify(result.tags), result.work_type, result.prefs_hash, id]
      );
    }
  })().catch(console.error);

  return c.json({ queued: staleJobs.length }, 202);
});

// POST /api/jobs/:id/analyze
// Resets match_score and match_reasoning to null, then triggers async re-analysis
// Returns 202 immediately; score fills in via the polling mechanism
app.post('/:id/analyze', async (c) => {
  const id = c.req.param('id');

  const job = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job | null;
  if (!job) return c.json({ error: 'Job not found' }, 404);

  // Reset scores so frontend polling picks it up as pending
  db.run('UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL WHERE id = ?', [id]);

  // Fire-and-forget: re-fetch description if missing, then re-analyse
  (async () => {
    let freshJob = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job;

    if (!freshJob.description && freshJob.url) {
      console.log(`[jobs] Re-fetching description for job ${id} (was null)`);
      const pageText = await fetchPageText(freshJob.url);
      if (pageText) {
        const description = pageText.length > 6_000 ? pageText.slice(0, 6_000) + '\n[truncated]' : pageText;
        db.run('UPDATE jobs SET description = ? WHERE id = ?', [description, id]);
        freshJob = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Job;
      }
    }

    const result = await analyzeJob(freshJob);
    if (result) {
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ? WHERE id = ?', [
        result.match_score, result.match_reasoning, result.match_summary, JSON.stringify(result.tags), id,
      ]);
    }
  })().catch(console.error);

  return c.json({ message: 'Re-analysis queued' }, 202);
});

// POST /api/jobs/clear — delete all jobs and applications from the DB
app.post('/clear', (c) => {
  db.run('DELETE FROM applications');
  const result = db.run('DELETE FROM jobs');
  return c.json({ deleted: result.changes });
});

export default app;

