import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import jobsRoute from '../../routes/jobs';
import { clearDb, seedJob } from '../helpers/db';
import db from '../../db';

const app = new Hono().route('/api/jobs', jobsRoute);

beforeEach(() => clearDb());

// ─── POST /api/jobs/bulk-seen ─────────────────────────────────────────────────

describe('POST /api/jobs/bulk-seen', () => {
  it('marks unseen jobs as seen', async () => {
    const j1 = seedJob({ seen_at: null });
    const j2 = seedJob({ seen_at: null });

    const res = await app.request('/api/jobs/bulk-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [j1.id, j2.id] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { updated: number; seen_at: string };
    expect(body.updated).toBe(2);
    expect(body.seen_at).toBeTruthy();

    const row = db.query<{ seen_at: string | null }, [string]>('SELECT seen_at FROM jobs WHERE id = ?').get(j1.id);
    expect(row?.seen_at).not.toBeNull();
  });

  it('does not overwrite jobs already seen', async () => {
    const existing = '2026-01-01T00:00:00.000Z';
    const job = seedJob({ seen_at: existing });

    const res = await app.request('/api/jobs/bulk-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [job.id] }),
    });

    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(0);

    const row = db.query<{ seen_at: string }, [string]>('SELECT seen_at FROM jobs WHERE id = ?').get(job.id);
    expect(row?.seen_at).toBe(existing);
  });

  it('silently ignores unknown ids', async () => {
    const { id } = seedJob({ seen_at: null });
    const res = await app.request('/api/jobs/bulk-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id, 'ghost-id'] }),
    });
    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(1);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await app.request('/api/jobs/bulk-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing ids field', async () => {
    const res = await app.request('/api/jobs/bulk-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/jobs/bulk-unseen ───────────────────────────────────────────────

describe('POST /api/jobs/bulk-unseen', () => {
  it('clears seen_at for selected jobs', async () => {
    const j1 = seedJob({ seen_at: '2026-01-01T00:00:00.000Z' });
    const j2 = seedJob({ seen_at: '2026-01-02T00:00:00.000Z' });

    const res = await app.request('/api/jobs/bulk-unseen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [j1.id, j2.id] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(2);

    const row = db.query<{ seen_at: string | null }, [string]>('SELECT seen_at FROM jobs WHERE id = ?').get(j1.id);
    expect(row?.seen_at).toBeNull();
  });

  it('only marks the specified ids, leaves others untouched', async () => {
    const target = seedJob({ seen_at: '2026-01-01T00:00:00.000Z' });
    const other = seedJob({ seen_at: '2026-01-01T00:00:00.000Z' });

    await app.request('/api/jobs/bulk-unseen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [target.id] }),
    });

    const otherRow = db.query<{ seen_at: string | null }, [string]>('SELECT seen_at FROM jobs WHERE id = ?').get(other.id);
    expect(otherRow?.seen_at).not.toBeNull();
  });

  it('returns 400 for empty ids array', async () => {
    const res = await app.request('/api/jobs/bulk-unseen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/jobs/rescore-all ───────────────────────────────────────────────

describe('POST /api/jobs/rescore-all', () => {
  it('returns 202 and resets scores for non-rejected jobs', async () => {
    // Use already-scored jobs so the background loop exits immediately
    // (loop breaks when it finds 0 unscored rows — seeding with null would loop 100x in tests)
    const j1 = seedJob({ match_score: 80, status: 'new' });
    const j2 = seedJob({ match_score: 60, status: 'saved' });

    const res = await app.request('/api/jobs/rescore-all', { method: 'POST' });

    expect(res.status).toBe(202);
    const body = await res.json() as { queued: number };
    expect(body.queued).toBe(2);

    const scored = db.query<{ match_score: number | null }, []>('SELECT match_score FROM jobs WHERE status != ?').all('rejected' as never);
    for (const row of scored) {
      expect(row.match_score).toBeNull();
    }
  });

  it('preserves scores for rejected jobs', async () => {
    const { id } = seedJob({ match_score: 30, status: 'rejected' });

    await app.request('/api/jobs/rescore-all', { method: 'POST' });

    const row = db.query<{ match_score: number | null }, [string]>('SELECT match_score FROM jobs WHERE id = ?').get(id);
    expect(row?.match_score).toBe(30);
  });

  it('returns queued: 0 when no scoreable jobs exist', async () => {
    seedJob({ match_score: 40, status: 'rejected' });

    const res = await app.request('/api/jobs/rescore-all', { method: 'POST' });
    const body = await res.json() as { queued: number };
    expect(body.queued).toBe(0);
  });
});

// ─── PATCH /api/jobs/:id — kanban side-effects ────────────────────────────────

describe('PATCH /api/jobs/:id — kanban side-effects', () => {
  it('creates a kanban entry in saved column when status set to saved', async () => {
    const { id } = seedJob();

    await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'saved' }),
    });

    const row = db.query<{ kanban_column: string }, [string]>(
      'SELECT kanban_column FROM applications WHERE job_id = ?'
    ).get(id);
    expect(row?.kanban_column).toBe('saved');
  });

  it('moves kanban entry from saved to applied when status advances', async () => {
    const { id } = seedJob();

    // First save it
    await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'saved' }),
    });

    // Then apply
    await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });

    const row = db.query<{ kanban_column: string }, [string]>(
      'SELECT kanban_column FROM applications WHERE job_id = ?'
    ).get(id);
    expect(row?.kanban_column).toBe('applied');

    // Only one row should exist
    const count = db.query<{ c: number }, [string]>(
      'SELECT COUNT(*) as c FROM applications WHERE job_id = ?'
    ).get(id);
    expect(count?.c).toBe(1);
  });

  it('clears seen_at when set to null', async () => {
    const { id } = seedJob({ seen_at: '2026-01-01T00:00:00.000Z' });

    const res = await app.request(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen_at: null }),
    });

    const body = await res.json() as { seen_at: string | null };
    expect(body.seen_at).toBeNull();
  });
});
