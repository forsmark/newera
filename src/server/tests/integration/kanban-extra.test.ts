import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import kanbanRoute from '../../routes/kanban';
import { clearDb, seedJob, seedApplication } from '../helpers/db';
import db from '../../db';

const app = new Hono().route('/api/kanban', kanbanRoute);

beforeEach(() => clearDb());

// ─── PATCH /api/kanban/:id — cover_letter ─────────────────────────────────────

describe('PATCH /api/kanban/:id cover_letter', () => {
  it('persists a cover letter', async () => {
    const job = seedJob();
    seedApplication(job.id);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_letter: 'Dear Hiring Manager…' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { cover_letter: string };
    expect(body.cover_letter).toBe('Dear Hiring Manager…');
  });

  it('clears cover_letter when set to null', async () => {
    const job = seedJob();
    seedApplication(job.id);
    db.run('UPDATE applications SET cover_letter = ? WHERE job_id = ?', ['Old letter', job.id]);

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_letter: null }),
    });

    const body = await res.json() as { cover_letter: string | null };
    expect(body.cover_letter).toBeNull();
  });

  it('accepts saved as a valid kanban column', async () => {
    const job = seedJob();
    seedApplication(job.id, { kanban_column: 'saved' });

    const res = await app.request(`/api/kanban/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: 'applied' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { kanban_column: string };
    expect(body.kanban_column).toBe('applied');
  });
});

// ─── POST /api/kanban/:id/cover-letter ───────────────────────────────────────

describe('POST /api/kanban/:id/cover-letter', () => {
  it('returns 404 for missing application', async () => {
    const res = await app.request('/api/kanban/not-a-real-id/cover-letter', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  // Note: happy-path test requires a live Ollama instance — covered by e2e tests.
});

// ─── GET /api/kanban — saved column ──────────────────────────────────────────

describe('GET /api/kanban — saved column', () => {
  it('returns applications in the saved column', async () => {
    const job = seedJob();
    seedApplication(job.id, { kanban_column: 'saved' });

    const res = await app.request('/api/kanban');
    const [entry] = await res.json() as Array<{ kanban_column: string }>;
    expect(entry.kanban_column).toBe('saved');
  });

  it('includes cover_letter in the response', async () => {
    const job = seedJob();
    seedApplication(job.id);
    db.run('UPDATE applications SET cover_letter = ? WHERE job_id = ?', ['Test letter', job.id]);

    const res = await app.request('/api/kanban');
    const [entry] = await res.json() as Array<{ cover_letter: string | null }>;
    expect(entry.cover_letter).toBe('Test letter');
  });

  it('includes match_summary in the joined job', async () => {
    const job = seedJob({ match_summary: 'A senior backend role in Copenhagen.' });
    seedApplication(job.id);

    const res = await app.request('/api/kanban');
    const [entry] = await res.json() as Array<{ job: { match_summary: string | null } }>;
    expect(entry.job.match_summary).toBe('A senior backend role in Copenhagen.');
  });
});
