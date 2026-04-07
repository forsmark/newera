import { fetchJobindex } from './sources/jobindex';
import { fetchLinkedIn } from './sources/linkedin';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';
import type { Job } from './types';
import { getPreferences, getResume } from './settings';

let lastFetchAt: string | null = null;
let isFetching = false;
let lastFetchNewJobs = 0;

export function getLastFetchAt(): string | null {
  return lastFetchAt;
}

export function getIsFetching(): boolean { return isFetching; }
export function getLastFetchNewJobs(): number { return lastFetchNewJobs; }

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
    const existsStmt = db.prepare('SELECT id FROM jobs WHERE source = ? AND external_id = ?');
    const upsertStmt = db.prepare(`
      INSERT INTO jobs (id, source, external_id, title, company, location, url, description, posted_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, external_id) DO UPDATE SET
        description = CASE WHEN jobs.description IS NULL AND excluded.description IS NOT NULL THEN excluded.description ELSE jobs.description END,
        url         = CASE WHEN jobs.url LIKE '%/vis-job/%' AND excluded.url NOT LIKE '%/vis-job/%' THEN excluded.url ELSE jobs.url END
    `);

    const newJobIds: string[] = [];

    for (const job of allJobs) {
      const existing = existsStmt.get(job.source, job.external_id) as { id: string } | null;
      const id = existing?.id ?? randomUUID();
      upsertStmt.run(
        id,
        job.source,
        job.external_id,
        job.title,
        job.company,
        job.location,
        job.url,
        job.description,
        job.posted_at,
        job.fetched_at,
      );
      if (!existing) {
        newJobIds.push(id);
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
          db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ? WHERE id = ?', [
            result.match_score,
            result.match_reasoning,
            result.match_summary,
            JSON.stringify(result.tags),
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
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ?, match_summary = ?, tags = ? WHERE id = ?', [
        result.match_score,
        result.match_reasoning,
        result.match_summary,
        JSON.stringify(result.tags),
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
