import { Database } from 'bun:sqlite';

const db = new Database('/app/db/jobs.db', { create: true });

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

export default db;
