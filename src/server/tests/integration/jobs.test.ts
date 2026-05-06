import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import jobsRoute from '../../routes/jobs';
import { clearDb, seedJob, seedApplication } from '../helpers/db';
import { computePrefsHash } from '../../utils/hash';
import { setSetting } from '../../settings';
import { contentFingerprint } from '../../utils/normalize';
import { ingestJob } from '../../scheduler';
import db from '../../db';

const app = new Hono().route('/api/jobs', jobsRoute);

beforeEach(() => clearDb());

// ─── GET /api/jobs ────────────────────────────────────────────────────────────

describe('GET /api/jobs', () => {
  it('returns empty list when no jobs exist', async () => {
    const res = await app.request('/api/jobs');
    const body = await res.json() as { jobs: unknown[]; total: number };
    expect(res.status).toBe(200);
    expect(body.jobs).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('returns all jobs sorted by match_score descending', async () => {
    seedJob({ title: 'Low', match_score: 30 });
    seedJob({ title: 'High', match_score: 90 });
    seedJob({ title: 'Mid', match_score: 60 });

    const res = await app.request('/api/jobs');
    const { jobs } = await res.json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title)).toEqual(['High', 'Mid', 'Low']);
  });

  it('puts null scores after scored jobs', async () => {
    seedJob({ title: 'Scored', match_score: 50 });
    seedJob({ title: 'Pending', match_score: null });

    const { jobs } = await (await app.request('/api/jobs')).json() as { jobs: Array<{ title: string }> };
    expect(jobs[0].title).toBe('Scored');
    expect(jobs[1].title).toBe('Pending');
  });

  it('filters by status', async () => {
    seedJob({ title: 'New', status: 'new' });
    seedJob({ title: 'Saved', status: 'saved' });

    const res = await app.request('/api/jobs?status=saved');
    const { jobs } = await res.json() as { jobs: Array<{ title: string }> };
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Saved');
  });

  it('returns 400 for invalid status', async () => {
    const res = await app.request('/api/jobs?status=unknown');
    expect(res.status).toBe(400);
  });

  it('text searches title and company', async () => {
    seedJob({ title: 'React Developer', company: 'Foo Inc' });
    seedJob({ title: 'Backend Engineer', company: 'Bar Corp' });

    const res = await app.request('/api/jobs?q=react');
    const { jobs } = await res.json() as { jobs: Array<{ title: string }> };
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('React Developer');
  });

  it('text search matches company name', async () => {
    seedJob({ title: 'Engineer', company: 'Acme Corp' });
    const res = await app.request('/api/jobs?q=acme');
    const { jobs } = await res.json() as { jobs: Array<{ title: string }> };
    expect(jobs).toHaveLength(1);
  });

  it('parses tags from JSON string', async () => {
    seedJob({ tags: ['React', 'TypeScript'] });
    const { jobs } = await (await app.request('/api/jobs')).json() as { jobs: Array<{ tags: string[] }> };
    expect(jobs[0].tags).toEqual(['React', 'TypeScript']);
  });

  it('filters by min_score, keeping unscored jobs', async () => {
    seedJob({ title: 'Strong', match_score: 80 });
    seedJob({ title: 'Weak', match_score: 10 });
    seedJob({ title: 'Pending', match_score: null });

    const { jobs } = await (await app.request('/api/jobs?min_score=50')).json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title).sort()).toEqual(['Pending', 'Strong']);
  });

  it('hide_unscored excludes null-score jobs', async () => {
    seedJob({ title: 'Scored', match_score: 60 });
    seedJob({ title: 'Pending', match_score: null });

    const { jobs } = await (await app.request('/api/jobs?hide_unscored=1')).json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title)).toEqual(['Scored']);
  });

  it('filters by sources whitelist', async () => {
    seedJob({ title: 'L', source: 'linkedin' });
    seedJob({ title: 'J', source: 'jobindex' });
    seedJob({ title: 'R', source: 'remoteok' });

    const { jobs } = await (await app.request('/api/jobs?sources=linkedin,remoteok')).json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title).sort()).toEqual(['L', 'R']);
  });

  it('excludes sources via exclude_sources', async () => {
    seedJob({ title: 'L', source: 'linkedin' });
    seedJob({ title: 'J', source: 'jobindex' });

    const { jobs } = await (await app.request('/api/jobs?exclude_sources=linkedin')).json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title)).toEqual(['J']);
  });

  it('filters by tags (AND, null tags pass through)', async () => {
    seedJob({ title: 'A', tags: ['python', 'aws'] });
    seedJob({ title: 'B', tags: ['python'] });
    seedJob({ title: 'C', tags: ['monty-python'] });
    seedJob({ title: 'D', tags: null });

    const { jobs } = await (await app.request('/api/jobs?tags=python,aws')).json() as { jobs: Array<{ title: string }> };
    expect(jobs.map(j => j.title).sort()).toEqual(['A', 'D']);
  });

  it('total reflects filtered count', async () => {
    seedJob({ title: 'A', match_score: 80 });
    seedJob({ title: 'B', match_score: 10 });

    const body = await (await app.request('/api/jobs?min_score=50')).json() as { total: number };
    expect(body.total).toBe(1);
  });
});

describe('GET /api/jobs/counts', () => {
  it('returns per-status counts honoring global filters', async () => {
    seedJob({ status: 'new', match_score: 80 });
    seedJob({ status: 'new', match_score: 10 });
    seedJob({ status: 'saved', match_score: 90 });
    seedJob({ status: 'rejected', match_score: 70 });
    seedJob({ status: 'new', seen_at: null, match_score: 80 });
    seedJob({ status: 'new', seen_at: '2026-04-10T00:00:00.000Z', match_score: 80 });

    const baseline = await (await app.request('/api/jobs/counts')).json() as {
      unsaved: number; saved: number; rejected: number; unread: number; all_count: number;
    };
    expect(baseline.unsaved).toBe(4);
    expect(baseline.saved).toBe(1);
    expect(baseline.rejected).toBe(1);
    // 6 seeded jobs: 4 'new' with seen_at=null (unread), 1 'saved' with seen_at=null (unread),
    // 1 'rejected' (excluded from unread), and one 'new' with seen_at set (excluded).
    expect(baseline.unread).toBe(4);
    // all_count excludes rejected (5 non-rejected out of 6 total)
    expect(baseline.all_count).toBe(5);

    const filtered = await (await app.request('/api/jobs/counts?min_score=50')).json() as {
      unsaved: number; rejected: number; all_count: number;
    };
    expect(filtered.unsaved).toBe(3);
    expect(filtered.rejected).toBe(1);
    // all_count excludes rejected: new(80)+saved(90)+new(80)+new(80) = 4 (rejected score=70 excluded)
    expect(filtered.all_count).toBe(4);
  });
});

// ─── PATCH /api/jobs/:id ──────────────────────────────────────────────────────

describe('PATCH /api/jobs/:id', () => {
  it('updates status to saved', async () => {
    const { id } = seedJob();
    const res = await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'saved' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('saved');
  });

  it('creates an applications row when status is applied', async () => {
    const { id } = seedJob();
    await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });

    // Verify the application was created by fetching kanban
    const kanbanApp = new Hono();
    const kanbanRoute = (await import('../../routes/kanban')).default;
    kanbanApp.route('/api/kanban', kanbanRoute);
    const kanbanRes = await kanbanApp.request('/api/kanban');
    const apps = await kanbanRes.json() as Array<{ job_id: string }>;
    expect(apps.some(a => a.job_id === id)).toBe(true);
  });

  it('creates application and event when marking as applied', async () => {
    const job = seedJob({ status: 'saved' });
    const res = await app.request(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(res.status).toBe(200);

    const appRow = db.query('SELECT * FROM applications WHERE job_id = ?').get(job.id);
    const eventRow = db.query('SELECT * FROM application_events WHERE job_id = ?').get(job.id);
    expect(appRow).toBeTruthy();
    expect(eventRow).toBeTruthy();
  });

  it('returns 400 for invalid status', async () => {
    const { id } = seedJob();
    const res = await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'unknown' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing job', async () => {
    const res = await app.request('/api/jobs/nonexistent-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'saved' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body has no recognised fields', async () => {
    const { id } = seedJob();
    const res = await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('updates seen_at', async () => {
    const { id } = seedJob({ seen_at: null });
    const now = new Date().toISOString();
    const res = await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen_at: now }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { seen_at: string };
    expect(body.seen_at).toBe(now);
  });
});

// ─── POST /api/jobs/bulk-status ───────────────────────────────────────────────

describe('POST /api/jobs/bulk-status', () => {
  it('updates multiple jobs in one call', async () => {
    const j1 = seedJob();
    const j2 = seedJob();
    const res = await app.request('/api/jobs/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [j1.id, j2.id], status: 'saved' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(2);
  });

  it('returns 400 when status is applied', async () => {
    const { id } = seedJob();
    const res = await app.request('/api/jobs/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], status: 'applied' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await app.request('/api/jobs/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [], status: 'saved' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status', async () => {
    const { id } = seedJob();
    const res = await app.request('/api/jobs/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], status: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('silently ignores unknown ids and returns count of actual updates', async () => {
    const { id } = seedJob();
    const res = await app.request('/api/jobs/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id, 'not-a-real-id'], status: 'saved' }),
    });
    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(1);
  });
});

// ─── POST /api/jobs/rescore-stale ─────────────────────────────────────────────

describe('POST /api/jobs/rescore-stale', () => {
  it('returns 202 with queued count for stale jobs', async () => {
    setSetting('preferences', '{"location":"Copenhagen"}');
    setSetting('resume', 'some resume');
    const oldHash = computePrefsHash('old resume', '{"location":"Copenhagen"}');
    seedJob({ title: 'Stale Job', match_score: 70, prefs_hash: oldHash });
    seedJob({ title: 'Fresh Job', match_score: 80, prefs_hash: computePrefsHash('some resume', '{"location":"Copenhagen"}') });

    const res = await app.request('/api/jobs/rescore-stale', { method: 'POST' });
    expect(res.status).toBe(202);
    const body = await res.json() as { queued: number };
    expect(body.queued).toBe(1);
  });

  it('returns queued: 0 when all jobs are fresh', async () => {
    setSetting('preferences', '{"location":"Copenhagen"}');
    setSetting('resume', 'some resume');
    const hash = computePrefsHash('some resume', '{"location":"Copenhagen"}');
    seedJob({ match_score: 70, prefs_hash: hash });

    const res = await app.request('/api/jobs/rescore-stale', { method: 'POST' });
    const body = await res.json() as { queued: number };
    expect(body.queued).toBe(0);
  });

  it('does not queue rejected jobs', async () => {
    setSetting('preferences', '{"location":"Copenhagen"}');
    setSetting('resume', 'some resume');
    const oldHash = computePrefsHash('old resume', '{"location":"Copenhagen"}');
    seedJob({ title: 'Rejected Stale', match_score: 40, prefs_hash: oldHash, status: 'rejected' });

    const res = await app.request('/api/jobs/rescore-stale', { method: 'POST' });
    const body = await res.json() as { queued: number };
    expect(body.queued).toBe(0);
  });
});

// ─── GET /api/jobs includes link_status ──────────────────────────────────────

describe('GET /api/jobs includes link_status', () => {
  it('returns link_status field on each job', async () => {
    seedJob({ title: 'Test', link_status: 'expired' });
    const res = await app.request('/api/jobs');
    const { jobs } = await res.json() as { jobs: any[] };
    expect(jobs[0].link_status).toBe('expired');
  });
});

// ─── Deduplication at ingest ──────────────────────────────────────────────────

describe('deduplication at ingest', () => {
  it('marks a cross-source duplicate with duplicate_of', () => {
    const existing = seedJob({
      source: 'jobindex',
      external_id: 'ji-123',
      title: 'React Developer',
      company: 'Maersk A/S',
      content_fingerprint: contentFingerprint('React Developer', 'Maersk A/S'),
    });

    ingestJob({
      source: 'linkedin',
      external_id: 'li-456',
      title: 'Senior React Developer',
      company: 'Maersk',
      url: 'https://linkedin.com/jobs/li-456',
      fetched_at: new Date().toISOString(),
    });

    const dupeRow = db.query<{ duplicate_of: string | null }, [string]>(
      'SELECT duplicate_of FROM jobs WHERE external_id = ?'
    ).get('li-456');
    expect(dupeRow?.duplicate_of).toBe(existing.id);
  });

  it('does not mark as duplicate when companies differ', () => {
    seedJob({
      source: 'jobindex',
      external_id: 'ji-789',
      title: 'React Developer',
      company: 'Maersk A/S',
      content_fingerprint: contentFingerprint('React Developer', 'Maersk A/S'),
    });

    ingestJob({
      source: 'linkedin',
      external_id: 'li-999',
      title: 'React Developer',
      company: 'Novo Nordisk',
      url: 'https://linkedin.com/jobs/li-999',
      fetched_at: new Date().toISOString(),
    });

    const row = db.query<{ duplicate_of: string | null }, [string]>(
      'SELECT duplicate_of FROM jobs WHERE external_id = ?'
    ).get('li-999');
    expect(row?.duplicate_of).toBeNull();
  });

  it('rejects jobs with example.com URLs', () => {
    const result = ingestJob({
      source: 'jobindex',
      external_id: 'test-dummy-1',
      title: 'Frontend Developer',
      company: 'Acme Corp',
      url: 'https://example.com/jobs/1',
      fetched_at: new Date().toISOString(),
    });
    expect(result.isNew).toBe(false);

    const row = db.query('SELECT id FROM jobs WHERE external_id = ?').get('test-dummy-1');
    expect(row).toBeNull();
  });

  it('marks fuzzy cross-source duplicate when titles overlap', () => {
    const existing = seedJob({
      source: 'jobindex',
      external_id: 'ji-dsv-1',
      title: 'Application Specialist',
      company: 'DSV A/S',
      content_fingerprint: contentFingerprint('Application Specialist', 'DSV A/S'),
    });

    ingestJob({
      source: 'linkedin',
      external_id: 'li-dsv-1',
      title: 'IT Application Specialist',
      company: 'DSV',
      url: 'https://linkedin.com/jobs/li-dsv-1',
      fetched_at: new Date().toISOString(),
    });

    const dupeRow = db.query<{ duplicate_of: string | null }, [string]>(
      'SELECT duplicate_of FROM jobs WHERE external_id = ?'
    ).get('li-dsv-1');
    expect(dupeRow?.duplicate_of).toBe(existing.id);
  });

  it('does not fuzzy-match when titles have low overlap', () => {
    seedJob({
      source: 'jobindex',
      external_id: 'ji-dsv-2',
      title: 'Application Specialist',
      company: 'DSV A/S',
      content_fingerprint: contentFingerprint('Application Specialist', 'DSV A/S'),
    });

    ingestJob({
      source: 'linkedin',
      external_id: 'li-dsv-2',
      title: 'Warehouse Manager',
      company: 'DSV',
      url: 'https://linkedin.com/jobs/li-dsv-2',
      fetched_at: new Date().toISOString(),
    });

    const row = db.query<{ duplicate_of: string | null }, [string]>(
      'SELECT duplicate_of FROM jobs WHERE external_id = ?'
    ).get('li-dsv-2');
    expect(row?.duplicate_of).toBeNull();
  });
});

// ─── GET /api/jobs/:id ───────────────────────────────────────────────────────

describe('GET /api/jobs/:id', () => {
  it('returns a single job by id', async () => {
    seedJob({ title: 'Test Job' });
    const listRes = await app.request('/api/jobs');
    const { jobs } = await listRes.json() as { jobs: { id: string }[] };
    expect(jobs.length).toBeGreaterThan(0);
    const jobId = jobs[0].id;

    const res = await app.request(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; title: string; tags: string[] | null };
    expect(body.id).toBe(jobId);
    expect(body.title).toBeDefined();
  });

  it('returns 404 for non-existent id', async () => {
    const res = await app.request('/api/jobs/non-existent-id-123');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Job not found');
  });
});

// ─── GET /api/jobs duplicate filtering ───────────────────────────────────────

describe('GET /api/jobs duplicate filtering', () => {
  it('excludes duplicates by default', async () => {
    const orig = seedJob({ title: 'React Dev', content_fingerprint: contentFingerprint('React Dev', 'Maersk') });
    seedJob({ title: 'React Dev', duplicate_of: orig.id });

    const res = await app.request('/api/jobs');
    const { jobs } = await res.json() as { jobs: any[] };
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(orig.id);
  });

  it('includes duplicates when include_duplicates=1', async () => {
    const orig = seedJob({ title: 'React Dev', content_fingerprint: contentFingerprint('React Dev', 'Maersk') });
    seedJob({ title: 'React Dev', duplicate_of: orig.id });

    const res = await app.request('/api/jobs?include_duplicates=1');
    const { jobs } = await res.json() as { jobs: any[] };
    expect(jobs).toHaveLength(2);
  });
});
