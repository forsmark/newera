import { describe, it, expect, beforeEach } from 'bun:test';
import app from '../routes/settings';
import db from '../db';

function clearSettings() {
  db.run('DELETE FROM settings');
}

describe('GET /', () => {
  beforeEach(clearSettings);

  it('returns default preferences and empty resume when nothing set', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const data = await res.json() as { resume: string; preferences: Record<string, unknown> };
    expect(data.resume).toBe('');
    expect(data.preferences.remote).toBe('any');
    expect(data.preferences.seniority).toBe('any');
  });
});

describe('PUT /resume', () => {
  beforeEach(clearSettings);

  it('stores resume in DB and returns ok', async () => {
    const res = await app.request('/resume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# My Resume' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as { ok: boolean }).ok).toBe(true);

    // Verify via GET
    const get = await app.request('/');
    const data = await get.json() as { resume: string };
    expect(data.resume).toBe('# My Resume');
  });

  it('returns 400 when content is missing', async () => {
    const res = await app.request('/resume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /preferences', () => {
  beforeEach(clearSettings);

  it('merges preferences into DB', async () => {
    const res = await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Copenhagen', remote: 'hybrid', seniority: 'senior' }),
    });
    expect(res.status).toBe(200);

    const get = await app.request('/');
    const data = await get.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.location).toBe('Copenhagen');
    expect(data.preferences.remote).toBe('hybrid');
    expect(data.preferences.seniority).toBe('senior');
    // Other fields should still have defaults
    expect(data.preferences.techInterests).toBe('');
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /rescore', () => {
  beforeEach(() => {
    db.run('DELETE FROM jobs');
  });

  it('clears scores for non-rejected jobs and returns queued count', async () => {
    db.run(`INSERT INTO jobs (id, source, external_id, title, company, url, status, fetched_at, match_score, match_reasoning, match_summary, tags)
            VALUES ('j1', 'jobindex', 'e1', 'Dev', 'Corp', 'http://x.com', 'new', '2026-01-01', 85, 'good', 'summary', '[]')`);
    db.run(`INSERT INTO jobs (id, source, external_id, title, company, url, status, fetched_at, match_score, match_reasoning, match_summary, tags)
            VALUES ('j2', 'jobindex', 'e2', 'Dev 2', 'Corp', 'http://x.com', 'rejected', '2026-01-01', 70, 'ok', 'sum', '[]')`);

    const res = await app.request('/rescore', { method: 'POST' });
    expect(res.status).toBe(200);
    const data = await res.json() as { queued: number };
    expect(data.queued).toBe(1);

    const j1 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j1') as { match_score: number | null };
    expect(j1.match_score).toBeNull();
    const j2 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j2') as { match_score: number | null };
    expect(j2.match_score).toBe(70);
  });
});
