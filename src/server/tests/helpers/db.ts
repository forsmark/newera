import { randomUUID } from 'crypto';
import db from '../../db';

export function clearDb() {
  db.run('DELETE FROM applications');
  db.run('DELETE FROM jobs');
  db.run('DELETE FROM settings');
}

type JobSeed = {
  id?: string;
  source?: string;
  external_id?: string;
  title?: string;
  company?: string;
  location?: string | null;
  url?: string;
  description?: string | null;
  posted_at?: string | null;
  match_score?: number | null;
  match_reasoning?: string | null;
  match_summary?: string | null;
  tags?: string[] | null;
  work_type?: string | null;
  status?: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at?: string | null;
  fetched_at?: string;
  prefs_hash?: string | null;
  content_fingerprint?: string | null;
  duplicate_of?: string | null;
  link_status?: 'unchecked' | 'active' | 'expired' | 'unknown';
  link_checked_at?: string | null;
};

export function seedJob(overrides: JobSeed = {}) {
  const job = {
    id: randomUUID(),
    source: 'jobindex',
    external_id: `ext_${randomUUID()}`,
    title: 'Frontend Developer',
    company: 'Acme Corp',
    location: 'Copenhagen',
    url: 'https://example.com/jobs/1',
    description: 'A great job opportunity.',
    posted_at: '2026-04-01T00:00:00.000Z',
    match_score: null as number | null,
    match_reasoning: null as string | null,
    match_summary: null as string | null,
    tags: null as string[] | null,
    work_type: null as string | null,
    status: 'new' as const,
    seen_at: null as string | null,
    fetched_at: '2026-04-05T00:00:00.000Z',
    prefs_hash: null as string | null,
    content_fingerprint: null as string | null,
    duplicate_of: null as string | null,
    link_status: 'unchecked' as const,
    link_checked_at: null as string | null,
    ...overrides,
  };

  db.run(
    `INSERT INTO jobs
       (id, source, external_id, title, company, location, url, description,
        posted_at, match_score, match_reasoning, match_summary, tags, work_type,
        status, seen_at, fetched_at, prefs_hash, content_fingerprint, duplicate_of,
        link_status, link_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id, job.source, job.external_id, job.title, job.company, job.location,
      job.url, job.description, job.posted_at, job.match_score, job.match_reasoning,
      job.match_summary, job.tags ? JSON.stringify(job.tags) : null, job.work_type,
      job.status, job.seen_at, job.fetched_at, job.prefs_hash, job.content_fingerprint,
      job.duplicate_of, job.link_status, job.link_checked_at,
    ],
  );

  return job;
}

export function seedApplication(jobId: string, overrides: {
  kanban_column?: string;
  notes?: string | null;
  interview_at?: string | null;
} = {}) {
  const now = '2026-04-05T00:00:00.000Z';
  const app = {
    job_id: jobId,
    kanban_column: 'applied',
    notes: null as string | null,
    interview_at: null as string | null,
    applied_at: now,
    updated_at: now,
    ...overrides,
  };
  db.run(
    `INSERT INTO applications (job_id, kanban_column, notes, interview_at, applied_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [app.job_id, app.kanban_column, app.notes, app.interview_at, app.applied_at, app.updated_at],
  );
  return app;
}
