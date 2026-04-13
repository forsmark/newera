import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DB_PATH } from './config';

const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
const effectivePath = isTest ? ':memory:' : DB_PATH;

if (!isTest) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}
const db = new Database(effectivePath, { create: true });

db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

db.run(`
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT,
    url         TEXT NOT NULL,
    description TEXT,
    posted_at   TEXT,
    match_score INTEGER,
    match_reasoning TEXT,
    tags        TEXT,
    status      TEXT NOT NULL DEFAULT 'new',
    seen_at     TEXT,
    fetched_at  TEXT NOT NULL,
    UNIQUE(source, external_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS applications (
    job_id        TEXT PRIMARY KEY REFERENCES jobs(id),
    kanban_column TEXT NOT NULL DEFAULT 'applied',
    notes         TEXT,
    interview_at  TEXT,
    applied_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS application_artifacts (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES applications(job_id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK(type IN ('file', 'link')),
    name       TEXT NOT NULL,
    url        TEXT,
    file_data  BLOB,
    mime_type  TEXT,
    file_size  INTEGER,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS application_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT NOT NULL REFERENCES applications(job_id) ON DELETE CASCADE,
    from_column TEXT,
    to_column   TEXT NOT NULL,
    created_at  TEXT NOT NULL
  )
`);

// Migrate existing DBs — ignore error if column already exists
try { db.run('ALTER TABLE jobs ADD COLUMN tags TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN match_summary TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN work_type TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE applications ADD COLUMN archived_description TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE applications ADD COLUMN cover_letter TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN prefs_hash TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN content_fingerprint TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN duplicate_of TEXT'); } catch { /* already exists */ }
try { db.run(`ALTER TABLE jobs ADD COLUMN link_status TEXT NOT NULL DEFAULT 'unchecked'`); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN link_checked_at TEXT'); } catch { /* already exists */ }
db.run('CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(content_fingerprint)');
db.run('CREATE INDEX IF NOT EXISTS idx_events_job_id ON application_events(job_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_artifacts_job_id ON application_artifacts(job_id)');

// Rename legacy 'jsearch' source to 'linkedin'
db.run(`UPDATE jobs SET source = 'linkedin' WHERE source = 'jsearch'`);

export default db;
