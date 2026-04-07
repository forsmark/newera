import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import logsRoute from '../../routes/logs';
import db from '../../db';

const app = new Hono().route('/api/logs', logsRoute);

function clearLogs() {
  db.run('DELETE FROM logs');
}

function insertLog(level: string, message: string, created_at?: string) {
  db.run(
    'INSERT INTO logs (level, message, created_at) VALUES (?, ?, ?)',
    [level, message, created_at ?? new Date().toISOString()],
  );
}

beforeEach(clearLogs);

// ─── GET /api/logs ────────────────────────────────────────────────────────────

describe('GET /api/logs', () => {
  it('returns empty list when no logs exist', async () => {
    const res = await app.request('/api/logs');
    const body = await res.json() as { logs: unknown[] };
    expect(res.status).toBe(200);
    expect(body.logs).toHaveLength(0);
  });

  it('returns logs in chronological order (oldest first)', async () => {
    insertLog('info', 'first',  '2026-04-06T10:00:00.000Z');
    insertLog('warn', 'second', '2026-04-06T11:00:00.000Z');
    insertLog('error', 'third', '2026-04-06T12:00:00.000Z');

    const body = await (await app.request('/api/logs')).json() as { logs: Array<{ message: string }> };
    expect(body.logs.map(l => l.message)).toEqual(['first', 'second', 'third']);
  });

  it('filters by level', async () => {
    insertLog('info',  'info msg');
    insertLog('warn',  'warn msg');
    insertLog('error', 'error msg');

    const body = await (await app.request('/api/logs?level=warn')).json() as { logs: Array<{ level: string }> };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].level).toBe('warn');
  });

  it('ignores unknown level filter', async () => {
    insertLog('info', 'a');
    insertLog('error', 'b');
    const body = await (await app.request('/api/logs?level=debug')).json() as { logs: unknown[] };
    expect(body.logs).toHaveLength(2);
  });

  it('respects the limit param', async () => {
    for (let i = 0; i < 10; i++) insertLog('info', `msg ${i}`);
    const body = await (await app.request('/api/logs?limit=3')).json() as { logs: unknown[] };
    expect(body.logs).toHaveLength(3);
  });
});

// ─── DELETE /api/logs ─────────────────────────────────────────────────────────

describe('DELETE /api/logs', () => {
  it('clears all logs and returns deleted count', async () => {
    insertLog('info', 'a');
    insertLog('error', 'b');

    const res = await app.request('/api/logs', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: number };
    expect(body.deleted).toBe(2);

    const after = await (await app.request('/api/logs')).json() as { logs: unknown[] };
    expect(after.logs).toHaveLength(0);
  });

  it('returns 0 when no logs to clear', async () => {
    const res = await app.request('/api/logs', { method: 'DELETE' });
    const body = await res.json() as { deleted: number };
    expect(body.deleted).toBe(0);
  });
});

// ─── GET /api/logs/export ─────────────────────────────────────────────────────

describe('GET /api/logs/export', () => {
  it('returns a text file with all logs', async () => {
    insertLog('info',  'hello world', '2026-04-06T10:00:00.000Z');
    insertLog('error', 'oh no',       '2026-04-06T10:01:00.000Z');

    const res = await app.request('/api/logs/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);

    const text = await res.text();
    expect(text).toContain('[INFO ]');
    expect(text).toContain('hello world');
    expect(text).toContain('[ERROR]');
    expect(text).toContain('oh no');
  });

  it('returns empty string when no logs', async () => {
    const res = await app.request('/api/logs/export');
    expect(await res.text()).toBe('');
  });
});

// ─── POST /api/logs/archive ───────────────────────────────────────────────────

describe('POST /api/logs/archive', () => {
  it('returns log content and clears the table', async () => {
    insertLog('warn', 'something happened');

    const res = await app.request('/api/logs/archive', { method: 'POST' });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('something happened');

    const after = await (await app.request('/api/logs')).json() as { logs: unknown[] };
    expect(after.logs).toHaveLength(0);
  });
});

// ─── logger integration ───────────────────────────────────────────────────────

describe('setupLogger', () => {
  it('writes console.error calls to the logs table', async () => {
    const { setupLogger } = await import('../../logger');
    setupLogger(); // idempotent — safe to call again

    clearLogs();
    console.error('[test] logger integration check');

    const body = await (await app.request('/api/logs?level=error')).json() as { logs: Array<{ message: string }> };
    expect(body.logs.some(l => l.message.includes('logger integration check'))).toBe(true);
  });

  it('writes console.warn calls to the logs table', async () => {
    const { setupLogger } = await import('../../logger');
    setupLogger();

    clearLogs();
    console.warn('[test] warn integration check');

    const body = await (await app.request('/api/logs?level=warn')).json() as { logs: Array<{ message: string }> };
    expect(body.logs.some(l => l.message.includes('warn integration check'))).toBe(true);
  });
});
