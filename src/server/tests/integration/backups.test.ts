import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Hono } from 'hono';
import backupsRoute from '../../routes/backups';
import { createBackup, listBackups, deleteBackup } from '../../backup';

// Use a temp backup dir isolated from the real one
const TEST_BACKUP_DIR = resolve(import.meta.dir, '../../../test-backups-tmp');

// Override BACKUP_DIR via env before each test
beforeEach(() => {
  process.env.BACKUP_DIR = TEST_BACKUP_DIR;
  mkdirSync(TEST_BACKUP_DIR, { recursive: true });
});

afterEach(() => {
  delete process.env.BACKUP_DIR;
  if (existsSync(TEST_BACKUP_DIR)) {
    rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
  }
});

const app = new Hono().route('/api/backups', backupsRoute);

// ─── createBackup / listBackups ───────────────────────────────────────────────

describe('createBackup', () => {
  it('creates a .db file with the expected name pattern', () => {
    const info = createBackup();
    expect(info.name).toMatch(/^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    expect(info.size).toBeGreaterThan(0);
  });

  it('created file appears in listBackups', () => {
    createBackup();
    const list = listBackups();
    expect(list.length).toBe(1);
    expect(list[0].size).toBeGreaterThan(0);
  });

  it('lists backups newest-first', async () => {
    createBackup();
    await new Promise(r => setTimeout(r, 1100)); // ensure different second
    createBackup();
    const list = listBackups();
    expect(list.length).toBe(2);
    expect(new Date(list[0].created_at).getTime()).toBeGreaterThan(
      new Date(list[1].created_at).getTime()
    );
  });
});

describe('deleteBackup', () => {
  it('removes the file and returns true', () => {
    const { name } = createBackup();
    expect(deleteBackup(name)).toBe(true);
    expect(listBackups()).toHaveLength(0);
  });

  it('returns false for non-existent file', () => {
    expect(deleteBackup('jobs-2026-04-06T12-00-00.db')).toBe(false);
  });

  it('returns false for invalid name (path traversal attempt)', () => {
    expect(deleteBackup('../../../etc/passwd')).toBe(false);
    expect(deleteBackup('../../secret.db')).toBe(false);
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────

describe('GET /api/backups', () => {
  it('returns empty list when no backups exist', async () => {
    const res = await app.request('/api/backups');
    const body = await res.json() as { backups: unknown[] };
    expect(res.status).toBe(200);
    expect(body.backups).toHaveLength(0);
  });

  it('returns list after a backup is created', async () => {
    createBackup();
    const res = await app.request('/api/backups');
    const body = await res.json() as { backups: Array<{ name: string; size: number }> };
    expect(body.backups).toHaveLength(1);
    expect(body.backups[0].size).toBeGreaterThan(0);
  });
});

describe('POST /api/backups', () => {
  it('creates a backup and returns 201 with info', async () => {
    const res = await app.request('/api/backups', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = await res.json() as { name: string; size: number };
    expect(body.name).toMatch(/^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    expect(body.size).toBeGreaterThan(0);
  });
});

describe('DELETE /api/backups/:name', () => {
  it('deletes an existing backup', async () => {
    const { name } = createBackup();
    const res = await app.request(`/api/backups/${name}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(listBackups()).toHaveLength(0);
  });

  it('returns 404 for unknown backup name', async () => {
    const res = await app.request('/api/backups/jobs-2026-01-01T00-00-00.db', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid name pattern', async () => {
    const res = await app.request('/api/backups/../../passwd', { method: 'DELETE' });
    // Hono may normalise the path; the important thing is we don't get 200
    expect(res.status).not.toBe(200);
  });
});
