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
