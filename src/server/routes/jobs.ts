import { Hono, type Context } from 'hono';
import db from '../db';
import type { Job } from '../types';
import { analyzeJob } from '../llm';
import { analyzeUnscoredJobs, enqueueForScoring } from '../scheduler';
import { fetchPageText } from '../utils/fetchPageText';
import { computePrefsHash } from '../utils/hash';
import { getSetting, getResume } from '../settings';

const app = new Hono();

let isRescoring = false;

const VALID_STATUSES = new Set(['new', 'saved', 'applied', 'rejected']);

const VALID_WORK_TYPES = new Set(['remote', 'hybrid', 'onsite']);

const VALID_POSTED_WITHIN = new Set(['7d', '30d']);

const VALID_SORT_BY = new Set(['score', 'posted', 'fetched']);

type GlobalFilters = {
  q?: string;
  workTypes: string[];
  sources: string[];
  excludeSources: string[];
  tags: string[];
  minScore?: number;
  hideUnscored: boolean;
  postedWithin?: '7d' | '30d';
  includeDuplicates: boolean;
};

function parseGlobalFilters(c: Context): GlobalFilters {
  const q = c.req.query('q');
  const workTypeParam = c.req.query('work_type');
  const sourcesParam = c.req.query('sources');
  const excludeSourcesParam = c.req.query('exclude_sources');
  const tagsParam = c.req.query('tags');
  const minScoreParam = c.req.query('min_score');
  const hideUnscored = c.req.query('hide_unscored') === '1';
  const postedWithinParam = c.req.query('posted_within');
  const includeDuplicates = c.req.query('include_duplicates') === '1';

  const splitCsv = (s: string | undefined) =>
    s ? s.split(',').map(v => v.trim()).filter(Boolean) : [];

  const minScore = minScoreParam !== undefined ? Number.parseInt(minScoreParam, 10) : undefined;

  return {
    q: q && q.length > 0 ? q : undefined,
    workTypes: splitCsv(workTypeParam).filter(v => VALID_WORK_TYPES.has(v)),
    sources: splitCsv(sourcesParam),
    excludeSources: splitCsv(excludeSourcesParam),
    tags: splitCsv(tagsParam),
    minScore: typeof minScore === 'number' && Number.isFinite(minScore) ? minScore : undefined,
    hideUnscored,
    postedWithin: postedWithinParam && VALID_POSTED_WITHIN.has(postedWithinParam)
      ? (postedWithinParam as '7d' | '30d')
      : undefined,
    includeDuplicates,
  };
}

// Builds the WHERE clause shared between /api/jobs and /api/jobs/counts so both
// endpoints answer the same question and tab badges match what is rendered.
// Behavior intentionally mirrors the old client-side filter rules (e.g. null
// work_type / null tags pass through tag- and work-type filters).
function buildGlobalFilterClause(filters: GlobalFilters): {
  sql: string;
  params: (string | number)[];
} {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push('(title LIKE ? OR company LIKE ? OR work_type LIKE ? OR tags LIKE ?)');
    params.push(like, like, like, like);
  }

  if (filters.workTypes.length > 0) {
    conditions.push(`(work_type IS NULL OR work_type IN (${filters.workTypes.map(() => '?').join(',')}))`);
    params.push(...filters.workTypes);
  }

  if (filters.sources.length > 0) {
    conditions.push(`source IN (${filters.sources.map(() => '?').join(',')})`);
    params.push(...filters.sources);
  }

  if (filters.excludeSources.length > 0) {
    conditions.push(`source NOT IN (${filters.excludeSources.map(() => '?').join(',')})`);
    params.push(...filters.excludeSources);
  }

  if (filters.tags.length > 0) {
    const tagConds = filters.tags.map(() => 'tags LIKE ?').join(' AND ');
    conditions.push(`(tags IS NULL OR (${tagConds}))`);
    params.push(...filters.tags.map(t => `%"${t}"%`));
  }

  if (typeof filters.minScore === 'number') {
    conditions.push('(match_score IS NULL OR match_score >= ?)');
    params.push(filters.minScore);
  }

  if (filters.hideUnscored) {
    conditions.push('match_score IS NOT NULL');
  }

  if (filters.postedWithin) {
    const days = filters.postedWithin === '7d' ? 7 : 30;
    conditions.push(`(posted_at IS NULL OR posted_at >= datetime('now', '-' || ? || ' day'))`);
    params.push(days);
  }

  if (!filters.includeDuplicates) {
    conditions.push('duplicate_of IS NULL');
  }

  return { sql: conditions.join(' AND '), params };
}

// GET /api/jobs/counts
// Returns total job counts per status tab for badge display. Honors the same
// global filters as /api/jobs so badge counts always match what's rendered.
app.get('/counts', (c) => {
  const filters = parseGlobalFilters(c);
  const { sql, params } = buildGlobalFilterClause(filters);
  const where = sql ? `WHERE ${sql}` : '';
  const row = db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'new')                                    AS unsaved,
      COUNT(*) FILTER (WHERE status = 'saved')                                  AS saved,
      COUNT(*) FILTER (WHERE status = 'rejected')                               AS rejected,
      COUNT(*) FILTER (WHERE seen_at IS NULL AND status != 'rejected')          AS unread,
      COUNT(*) FILTER (WHERE status != 'rejected')                              AS all_count
    FROM jobs
    ${where}
  `).get(...params) as {
    unsaved: number; saved: number; rejected: number; unread: number; all_count: number;
  };
  return c.json(row);
});

// GET /api/jobs
// Query params: status, limit, offset, sort_by, plus all global filter params
// (see parseGlobalFilters). Returns paginated jobs filtered server-side.
app.get('/', (c) => {
  const status = c.req.query('status');
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const sortByParam = c.req.query('sort_by');
  const limit = Math.max(1, Math.min(parseInt(limitParam ?? '100', 10) || 100, 200));
  const offset = Math.max(0, parseInt(offsetParam ?? '0', 10) || 0);

  if (status !== undefined && !VALID_STATUSES.has(status) && status !== 'unread') {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const filters = parseGlobalFilters(c);
  const { sql: filterSql, params: filterParams } = buildGlobalFilterClause(filters);
  const conditions: string[] = filterSql ? [filterSql] : [];

  if (status === 'unread') {
    conditions.push("seen_at IS NULL AND status != 'rejected'");
  } else if (status) {
    conditions.push('status = ?');
    filterParams.push(status);
  } else {
    conditions.push("status != 'rejected'");
  }

  const sortBy = sortByParam && VALID_SORT_BY.has(sortByParam) ? sortByParam : 'score';
  const orderBy =
    sortBy === 'posted' ? 'posted_at DESC NULLS LAST, fetched_at DESC' :
    sortBy === 'fetched' ? 'fetched_at DESC' :
    'match_score DESC NULLS LAST, fetched_at DESC';

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM jobs ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as total FROM jobs ${where}`;

  const rawJobs = db.query(sql).all(...filterParams, limit, offset) as (Job & { tags: string | null })[];
  const jobs = rawJobs.map(j => ({ ...j, tags: j.tags ? JSON.parse(j.tags) as string[] : null }));
  const countRow = db.query(countSql).get(...filterParams) as { total: number } | null;
  return c.json({ jobs, total: countRow?.total ?? 0, limit, offset });
});

// GET /api/jobs/:id
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const row = db.query('SELECT * FROM jobs WHERE id = ?').get(id) as (Job & { tags: string | null }) | null;
  if (!row) return c.json({ error: 'Job not found' }, 404);
  return c.json({ ...row, tags: row.tags ? JSON.parse(row.tags) as string[] : null });
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

    const applyStatusChange = db.transaction(() => {
      db.run('UPDATE jobs SET status = ? WHERE id = ?', [status, id]);

      if (status === 'saved') {
        const now = new Date().toISOString();
        const inserted = db.run(
          `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
           VALUES (?, 'saved', ?, ?)`,
          [id, now, now],
        );
        if (inserted.changes > 0) {
          db.run(
            `INSERT INTO application_events (job_id, from_column, to_column, created_at)
             VALUES (?, NULL, 'saved', ?)`,
            [id, now],
          );
        }
      }

      if (status === 'applied') {
        const now = new Date().toISOString();
        const existing = db.query('SELECT kanban_column FROM applications WHERE job_id = ?').get(id) as { kanban_column: string } | null;
        if (existing) {
          const moved = db.run(
            `UPDATE applications SET kanban_column = 'applied', updated_at = ? WHERE job_id = ? AND kanban_column = 'saved'`,
            [now, id],
          );
          if (moved.changes > 0) {
            db.run(
              `INSERT INTO application_events (job_id, from_column, to_column, created_at)
               VALUES (?, 'saved', 'applied', ?)`,
              [id, now],
            );
          }
        } else {
          db.run(
            `INSERT OR IGNORE INTO applications (job_id, kanban_column, applied_at, updated_at)
             VALUES (?, 'applied', ?, ?)`,
            [id, now, now],
          );
          db.run(
            `INSERT INTO application_events (job_id, from_column, to_column, created_at)
             VALUES (?, NULL, 'applied', ?)`,
            [id, now],
          );
        }
      }
    });

    applyStatusChange();

    // Fire-and-forget: archive posting (outside transaction — async network I/O)
    if (status === 'applied') {
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

// DELETE /api/jobs/:id
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const job = db.query('SELECT id FROM jobs WHERE id = ?').get(id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  db.transaction(() => {
    db.run('DELETE FROM applications WHERE job_id = ?', [id]);
    db.run('DELETE FROM jobs WHERE id = ?', [id]);
  })();
  return c.json({ deleted: id });
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

// POST /api/jobs/bulk-rescore
// Body: { ids: string[] }
// Resets scores for specific jobs and re-queues them for analysis
app.post('/bulk-rescore', async (c) => {
  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return c.json({ error: 'ids must be a non-empty string array' }, 400);
  }

  const validIds = ids as string[];
  const placeholders = validIds.map(() => '?').join(',');
  db.run(
    `UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL, work_type = NULL WHERE id IN (${placeholders})`,
    validIds
  );
  enqueueForScoring(validIds, false);

  return c.json({ queued: validIds.length }, 202);
});

// POST /api/jobs/rescore-all
// Resets match scores for all non-rejected jobs and re-queues analysis via the scheduler
app.post('/rescore-all', (c) => {
  if (isRescoring) return c.json({ error: 'Rescore already in progress' }, 409);

  const result = db.run(
    "UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL, work_type = NULL WHERE status != 'rejected'"
  );
  const queued = result.changes;

  isRescoring = true;
  (async () => {
    for (let i = 0; i < 100; i++) {
      const row = db.query('SELECT COUNT(*) as c FROM jobs WHERE match_score IS NULL').get() as { c: number };
      if (row.c === 0) break;
      await analyzeUnscoredJobs(false); // don't auto-reject during explicit rescore
    }
    console.log('[jobs] rescore-all complete');
  })().catch(console.error).finally(() => { isRescoring = false; });

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
    `UPDATE jobs SET match_score = NULL, match_reasoning = NULL, match_summary = NULL, tags = NULL, work_type = NULL
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  enqueueForScoring(ids, true);

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
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ?, work_type = ?, prefs_hash = ? WHERE id = ?', [
        result.match_score, result.match_reasoning, result.match_summary, JSON.stringify(result.tags), result.work_type, result.prefs_hash, id,
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

