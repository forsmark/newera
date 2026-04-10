import { fetchJobindex } from './sources/jobindex';
import { fetchLinkedIn } from './sources/linkedin';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';
import type { Job } from './types';
import { getPreferences, getResume } from './settings';
import { contentFingerprint } from './utils/normalize';

let lastFetchAt: string | null = null;
let isFetching = false;
let lastFetchNewJobs = 0;

export function getLastFetchAt(): string | null {
  return lastFetchAt;
}

export function getIsFetching(): boolean { return isFetching; }
export function getLastFetchNewJobs(): number { return lastFetchNewJobs; }

type JobPartial = {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location?: string | null;
  url: string;
  description?: string | null;
  posted_at?: string | null;
  fetched_at: string;
};

export function ingestJob(job: JobPartial): { isNew: boolean } {
  const fp = contentFingerprint(job.title, job.company);

  // Check for existing job with same fingerprint but different identity
  const duplicate = db.query<{ id: string }, [string, string, string]>(
    `SELECT id FROM jobs
     WHERE content_fingerprint = ?
     AND NOT (source = ? AND external_id = ?)
     AND duplicate_of IS NULL
     LIMIT 1`
  ).get(fp, job.source, job.external_id);

  const existingRow = db.query<{ id: string }, [string, string]>(
    'SELECT id FROM jobs WHERE source = ? AND external_id = ?'
  ).get(job.source, job.external_id);

  const id = existingRow?.id ?? randomUUID();

  db.run(
    `INSERT INTO jobs (id, source, external_id, title, company, location, url, description, posted_at, fetched_at, content_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, external_id) DO UPDATE SET
       description = CASE WHEN jobs.description IS NULL AND excluded.description IS NOT NULL
                          THEN excluded.description ELSE jobs.description END,
       url = CASE WHEN jobs.url LIKE '%/vis-job/%' AND excluded.url NOT LIKE '%/vis-job/%'
                  THEN excluded.url ELSE jobs.url END,
       content_fingerprint = excluded.content_fingerprint`,
    [id, job.source, job.external_id, job.title, job.company,
     job.location ?? null, job.url, job.description ?? null, job.posted_at ?? null,
     job.fetched_at, fp]
  );

  if (duplicate) {
    db.run('UPDATE jobs SET duplicate_of = ? WHERE source = ? AND external_id = ?',
      [duplicate.id, job.source, job.external_id]);
    return { isNew: false };
  }

  return { isNew: existingRow === null };
}

export async function fetchJobs(): Promise<number> {
  if (isFetching) {
    console.log('[scheduler] Fetch already in progress, skipping');
    return 0;
  }
  isFetching = true;
  try {
    console.log('[scheduler] Fetching jobs...');

    // 1. Fetch from all sources in parallel
    const [jobindexResult, linkedinResult] = await Promise.allSettled([
      fetchJobindex(),
      fetchLinkedIn(),
    ]);
    const jobindexJobs = jobindexResult.status === 'fulfilled' ? jobindexResult.value : [];
    const linkedinJobs = linkedinResult.status === 'fulfilled' ? linkedinResult.value : [];
    if (jobindexResult.status === 'rejected') console.error('[scheduler] Jobindex failed:', jobindexResult.reason);
    if (linkedinResult.status === 'rejected') console.error('[scheduler] LinkedIn failed:', linkedinResult.reason);

    const allJobs = [...jobindexJobs, ...linkedinJobs];
    console.log(`[scheduler] Fetched ${allJobs.length} jobs`);

    // 2. Insert new jobs; backfill description/url for existing rows that were stored without them
    const newJobIds: string[] = [];

    for (const job of allJobs) {
      const { isNew } = ingestJob(job);
      if (isNew) {
        const row = db.query<{ id: string }, [string, string]>(
          'SELECT id FROM jobs WHERE source = ? AND external_id = ?'
        ).get(job.source, job.external_id);
        if (row) newJobIds.push(row.id);
      }
    }

    console.log(`[scheduler] ${newJobIds.length} new jobs inserted`);
    lastFetchAt = new Date().toISOString();
    lastFetchNewJobs = newJobIds.length;

    // 3. Analyze new jobs with LLM in the background (don't await — return count immediately)
    (async () => {
      for (const jobId of newJobIds) {
        const job = db.query('SELECT * FROM jobs WHERE id = ?').get(jobId) as Job | null;
        if (!job) continue;

        const result = await analyzeJob(job);
        if (result) {
          db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ?, work_type = ?, prefs_hash = ? WHERE id = ?', [
            result.match_score,
            result.match_reasoning,
            result.match_summary,
            JSON.stringify(result.tags),
            result.work_type,
            result.prefs_hash,
            jobId,
          ]);
          maybeAutoReject(jobId, result.match_score);
          console.log(`[scheduler] Analyzed job ${jobId}: score=${result.match_score} tags=${result.tags.join(',')}`);
        }
      }

      // Also retry any existing jobs that weren't scored yet (e.g. Ollama was unavailable)
      await analyzeUnscoredJobs();

      console.log('[scheduler] Done');
    })().catch((err) => console.error('[scheduler] Background analysis failed:', err));

    return newJobIds.length;
  } finally {
    isFetching = false;
  }
}

export async function analyzeUnscoredJobs(): Promise<void> {
  if (!getResume()) return;

  const unscoredJobs = db.query(`
    SELECT * FROM jobs
    WHERE match_score IS NULL
    ORDER BY fetched_at DESC
    LIMIT 20
  `).all() as Job[];

  if (unscoredJobs.length === 0) return;

  console.log(`[scheduler] Retrying analysis for ${unscoredJobs.length} unscored jobs`);

  for (const job of unscoredJobs) {
    const result = await analyzeJob(job);
    if (result) {
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ?, work_type = ?, prefs_hash = ? WHERE id = ?', [
        result.match_score,
        result.match_reasoning,
        result.match_summary,
        JSON.stringify(result.tags),
        result.work_type,
        result.prefs_hash,
        job.id,
      ]);
      maybeAutoReject(job.id, result.match_score);
      console.log(`[scheduler] Scored job ${job.id}: ${result.match_score}`);
    }
  }
}

export function maybeAutoReject(jobId: string, score: number) {
  const { autoRejectLowScore, lowScoreThreshold } = getPreferences();
  if (autoRejectLowScore && score < lowScoreThreshold) {
    db.run("UPDATE jobs SET status = 'rejected' WHERE id = ? AND status = 'new'", [jobId]);
  }
}

function scheduleNextFetch() {
  const { fetchIntervalHours } = getPreferences();
  const ms = Math.max(1, fetchIntervalHours) * 60 * 60 * 1000;
  setTimeout(() => {
    fetchJobs().catch(console.error).finally(scheduleNextFetch);
  }, ms);
}

export function startScheduler(): void {
  fetchJobs().catch(console.error);
  scheduleNextFetch();
}
