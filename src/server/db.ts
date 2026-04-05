import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DB_PATH } from './config';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH, { create: true });

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

// Migrate existing DBs — ignore error if column already exists
try { db.run('ALTER TABLE jobs ADD COLUMN tags TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE jobs ADD COLUMN match_summary TEXT'); } catch { /* already exists */ }
try { db.run('ALTER TABLE applications ADD COLUMN archived_description TEXT'); } catch { /* already exists */ }

export default db;
