import { describe, it, expect, beforeEach } from 'bun:test';
import { writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import app from '../routes/settings';
import db from '../db';

const dataDir = process.env.DATA_DIR!;

function cleanFiles() {
  try { rmSync(join(dataDir, 'resume.md')); } catch { /* ignore if absent */ }
  try { rmSync(join(dataDir, 'preferences.md')); } catch { /* ignore if absent */ }
}

describe('GET /', () => {
  beforeEach(cleanFiles);

  it('returns empty strings when files do not exist', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const data = await res.json() as { resume: string; preferences: string };
    expect(data.resume).toBe('');
    expect(data.preferences).toBe('');
  });

  it('returns file contents when files exist', async () => {
    writeFileSync(join(dataDir, 'resume.md'), '# My Resume');
    writeFileSync(join(dataDir, 'preferences.md'), '## Preferences');
    const res = await app.request('/');
    const data = await res.json() as { resume: string; preferences: string };
    expect(data.resume).toBe('# My Resume');
    expect(data.preferences).toBe('## Preferences');
  });
});

describe('PUT /resume', () => {
  beforeEach(cleanFiles);

  it('writes content to resume.md and returns ok', async () => {
    const res = await app.request('/resume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New Resume' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(readFileSync(join(dataDir, 'resume.md'), 'utf8')).toBe('# New Resume');
  });
});

describe('PUT /preferences', () => {
  beforeEach(cleanFiles);

  it('writes content to preferences.md and returns ok', async () => {
    const res = await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '## New Prefs' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(readFileSync(join(dataDir, 'preferences.md'), 'utf8')).toBe('## New Prefs');
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
    expect(data.queued).toBe(1); // only non-rejected

    const j1 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j1') as { match_score: number | null };
    expect(j1.match_score).toBeNull();

    const j2 = db.query('SELECT match_score FROM jobs WHERE id = ?').get('j2') as { match_score: number | null };
    expect(j2.match_score).toBe(70); // rejected job unchanged
  });
});
