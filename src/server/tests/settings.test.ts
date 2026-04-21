import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import app from '../routes/settings';
import db from '../db';
import { clearDb, seedJob } from './helpers/db';

const originalFetch = globalThis.fetch;

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
    expect(data.preferences.remote).toEqual([]);
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
      body: JSON.stringify({ location: 'Copenhagen', remote: ['hybrid'], seniority: 'senior' }),
    });
    expect(res.status).toBe(200);

    const get = await app.request('/');
    const data = await get.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.location).toBe('Copenhagen');
    expect(data.preferences.remote).toEqual(['hybrid']);
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

describe('POST /reject-low-score', () => {
  beforeEach(() => {
    clearSettings();
    clearDb();
  });

  it('rejects new jobs scored below the threshold and returns count', async () => {
    db.run("INSERT INTO settings (key, value, updated_at) VALUES ('preferences', '{\"lowScoreThreshold\":50}', datetime('now'))");
    seedJob({ match_score: 30, status: 'new' });
    seedJob({ match_score: 70, status: 'new' });

    const res = await app.request('/reject-low-score', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { rejected: number };
    expect(body.rejected).toBe(1);
  });

  it('does not reject saved or applied jobs even if below threshold', async () => {
    db.run("INSERT INTO settings (key, value, updated_at) VALUES ('preferences', '{\"lowScoreThreshold\":50}', datetime('now'))");
    seedJob({ match_score: 10, status: 'saved' });
    seedJob({ match_score: 10, status: 'applied' });

    const res = await app.request('/reject-low-score', { method: 'POST' });
    const body = await res.json() as { rejected: number };
    expect(body.rejected).toBe(0);
  });

  it('does not reject unscored jobs', async () => {
    db.run("INSERT INTO settings (key, value, updated_at) VALUES ('preferences', '{\"lowScoreThreshold\":50}', datetime('now'))");
    seedJob({ match_score: null, status: 'new' });

    const res = await app.request('/reject-low-score', { method: 'POST' });
    const body = await res.json() as { rejected: number };
    expect(body.rejected).toBe(0);
  });

  it('returns 0 when no jobs are below threshold', async () => {
    db.run("INSERT INTO settings (key, value, updated_at) VALUES ('preferences', '{\"lowScoreThreshold\":20}', datetime('now'))");
    seedJob({ match_score: 80, status: 'new' });

    const res = await app.request('/reject-low-score', { method: 'POST' });
    const body = await res.json() as { rejected: number };
    expect(body.rejected).toBe(0);
  });
});

describe('POST /rescore', () => {
  beforeEach(() => {
    db.run('DELETE FROM applications');
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

describe('GET / — LLM provider defaults', () => {
  beforeEach(clearSettings);

  it('defaults llmProvider to ollama', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmProvider).toBe('ollama');
  });

  it('defaults llmBaseUrl to empty string', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmBaseUrl).toBe('');
  });

  it('defaults model to gemma4:26b', async () => {
    const res = await app.request('/');
    const data = await res.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.model).toBe('gemma4:26b');
  });
});

describe('PUT /preferences — LLM provider fields', () => {
  beforeEach(clearSettings);

  it('persists llmProvider and llmBaseUrl', async () => {
    await app.request('/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llmProvider: 'lmstudio', llmBaseUrl: 'http://localhost:1234' }),
    });
    const get = await app.request('/');
    const data = await get.json() as { preferences: Record<string, unknown> };
    expect(data.preferences.llmProvider).toBe('lmstudio');
    expect(data.preferences.llmBaseUrl).toBe('http://localhost:1234');
  });
});

describe('POST /telegram-test', () => {
  beforeEach(clearSettings);
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns 400 when no credentials are configured', async () => {
    const res = await app.request('/telegram-test', { method: 'POST' });
    expect(res.status).toBe(400);
    const data = await res.json() as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toContain('required');
  });

  it('returns 200 when credentials are set and Telegram API responds ok', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }))),
    );
    globalThis.fetch = fetchMock as any;
    db.run(
      "INSERT INTO settings (key, value, updated_at) VALUES ('preferences', ?, datetime('now'))",
      [JSON.stringify({ telegramBotToken: 'tok', telegramChatId: '123' })],
    );

    const res = await app.request('/telegram-test', { method: 'POST' });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
