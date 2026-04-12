import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import db from './db';
import { BACKUP_DIR as DEFAULT_BACKUP_DIR } from './config';

const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export interface BackupInfo {
  name: string;
  size: number;       // bytes
  created_at: string; // ISO timestamp parsed from filename
}

// Read lazily so tests can override via process.env.BACKUP_DIR before calling
function getBackupDir(): string {
  return process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
}

function ensureBackupDir() {
  mkdirSync(getBackupDir(), { recursive: true });
}

export function createBackup(): BackupInfo {
  ensureBackupDir();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const name = `jobs-${timestamp}.db`;
  const backupPath = resolve(getBackupDir(), name);

  // VACUUM INTO creates an atomic, defragmented copy of the live DB
  db.run(`VACUUM INTO '${backupPath}'`);

  // Prune oldest backups beyond the limit
  pruneBackups();

  const size = statSync(backupPath).size;
  console.log(`[backup] Created ${name} (${(size / 1024).toFixed(1)} KB)`);
  return { name, size, created_at: new Date().toISOString() };
}

export function listBackups(): BackupInfo[] {
  try {
    ensureBackupDir();
    return readdirSync(getBackupDir())
      .filter(f => /^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .map(name => {
        const path = resolve(getBackupDir(), name);
        const size = statSync(path).size;
        // Parse timestamp from filename: jobs-2026-04-06T12-00-00.db
        const ts = name.slice(5, -3).replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
        return { name, size, created_at: new Date(ts).toISOString() };
      })
      .reverse(); // newest first
  } catch {
    return [];
  }
}

export function deleteBackup(name: string): boolean {
  // Validate name to prevent path traversal
  if (!/^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(name)) return false;
  try {
    unlinkSync(resolve(getBackupDir(), name));
    return true;
  } catch {
    return false;
  }
}

function pruneBackups() {
  const all = listBackups();
  const toDelete = all.slice(MAX_BACKUPS); // already sorted newest-first, so slice from end of keep window
  for (const b of toDelete) {
    deleteBackup(b.name);
    console.log(`[backup] Pruned ${b.name}`);
  }
}

export function restoreBackup(name: string): { ok: boolean; error?: string } {
  // Validate name to prevent path traversal
  if (!/^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(name)) {
    return { ok: false, error: 'Invalid backup name' };
  }

  const backupPath = resolve(getBackupDir(), name);
  if (!existsSync(backupPath)) {
    return { ok: false, error: 'Backup file not found' };
  }

  // Create a safety backup before restoring
  try { createBackup(); } catch { /* best effort */ }

  // Attach the backup DB and copy all data over
  try {
    db.run('PRAGMA foreign_keys = OFF');
    db.run(`ATTACH DATABASE '${backupPath}' AS backup`);

    const tables = ['application_events', 'application_artifacts', 'applications', 'jobs', 'settings', 'logs'];
    db.run('BEGIN TRANSACTION');
    for (const table of tables) {
      db.run(`DELETE FROM main.${table}`);
      db.run(`INSERT INTO main.${table} SELECT * FROM backup.${table}`);
    }
    db.run('COMMIT');
    db.run('DETACH DATABASE backup');
    db.run('PRAGMA foreign_keys = ON');

    console.log(`[backup] Restored from ${name}`);
    return { ok: true };
  } catch (err) {
    try { db.run('ROLLBACK'); } catch { /* ignore */ }
    try { db.run('DETACH DATABASE backup'); } catch { /* ignore */ }
    try { db.run('PRAGMA foreign_keys = ON'); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backup] Restore failed:', msg);
    return { ok: false, error: `Restore failed: ${msg}` };
  }
}

export function startBackupScheduler() {
  // Run an initial backup shortly after server start (30s delay to let things settle)
  setTimeout(() => {
    try { createBackup(); } catch (err) { console.error('[backup] Initial backup failed:', err); }
  }, 30_000);

  setInterval(() => {
    try { createBackup(); } catch (err) { console.error('[backup] Scheduled backup failed:', err); }
  }, BACKUP_INTERVAL_MS);
}
