import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import jobsRoute from '../../routes/jobs';
import { clearDb, seedJob, seedApplication } from '../helpers/db';

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
