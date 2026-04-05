import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import kanbanRoute from '../../routes/kanban';
import { clearDb, seedJob, seedApplication } from '../helpers/db';

const app = new Hono().route('/api/kanban', kanbanRoute);

beforeEach(() => clearDb());

// ─── GET /api/kanban ──────────────────────────────────────────────────────────

describe('GET /api/kanban', () => {
  it('returns empty array when no applications exist', async () => {
    const res = await app.request('/api/kanban');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('returns application with joined job data', async () => {
    const job = seedJob({ title: 'Senior Engineer', match_score: 80 });
    seedApplication(job.id);

    const res = await app.request('/api/kanban');
    const [app_entry] = await res.json() as Array<{
      job_id: string;
      kanban_column: string;
      job: { title: string; match_score: number };
    }>;

    expect(app_entry.job_id).toBe(job.id);
    expect(app_entry.kanban_column).toBe('applied');
    expect(app_entry.job.title).toBe('Senior Engineer');
    expect(app_entry.job.match_score).toBe(80);
  });

  it('parses tags from JSON string on the joined job', async () => {
    const job = seedJob({ tags: ['Go', 'Kubernetes'] });
    seedApplication(job.id);

    const [entry] = await (await app.request('/api/kanban')).json() as Array<{ job: { tags: string[] } }>;
    expect(entry.job.tags).toEqual(['Go', 'Kubernetes']);
  });

  it('returns multiple applications ordered by updated_at desc', async () => {
    const j1 = seedJob({ title: 'Older' });
    const j2 = seedJob({ title: 'Newer' });
    seedApplication(j1.id, { });
    // seed j2 with a later updated_at
    const later = new Date(Date.now() + 60_000).toISOString();
    seedApplication(j2.id);
    // Update j2 updated_at manually via import of db
    const db = (await import('../../db')).default;
    db.run('UPDATE applications SET updated_at = ? WHERE job_id = ?', [later, j2.id]);

    const entries = await (await app.request('/api/kanban')).json() as Array<{ job: { title: string } }>;
    expect(entries[0].job.title).toBe('Newer');
  });
});

// ─── PATCH /api/kanban/:id ────────────────────────────────────────────────────

describe('PATCH /api/kanban/:id', () => {
  it('updates kanban_column', async () => {
    const job = seedJob();
    seedApplication(job.id);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: 'interview' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { kanban_column: string };
    expect(body.kanban_column).toBe('interview');
  });

  it('updates notes', async () => {
    const job = seedJob();
    seedApplication(job.id);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Good interview vibes.' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { notes: string };
    expect(body.notes).toBe('Good interview vibes.');
  });

  it('updates interview_at', async () => {
    const job = seedJob();
    seedApplication(job.id);
    const date = '2026-04-20T14:00:00.000Z';

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interview_at: date }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { interview_at: string };
    expect(body.interview_at).toBe(date);
  });

  it('clears notes when set to null', async () => {
    const job = seedJob();
    seedApplication(job.id, { notes: 'Old notes' });

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: null }),
    });
    const body = await res.json() as { notes: null };
    expect(body.notes).toBeNull();
  });

  it('returns 400 for invalid kanban_column', async () => {
    const job = seedJob();
    seedApplication(job.id);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: 'wontfix' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing application', async () => {
    const res = await app.request('/api/kanban/not-a-real-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: 'interview' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body has no recognised fields', async () => {
    const job = seedJob();
    seedApplication(job.id);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
