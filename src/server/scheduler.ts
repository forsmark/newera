import { fetchJobindex } from './sources/jobindex';
import { fetchLinkedIn } from './sources/linkedin';
import { fetchRemotive } from './sources/remotive';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';
import type { Job } from './types';
import { getPreferences, getResume } from './settings';
import { contentFingerprint } from './utils/normalize';
import { classifyLiveness } from './utils/liveness';
import { sendFetchSummary, type ScoredJob } from './telegram';

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

  const result = db.transaction(() => {
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
  })();

  return result;
}

function ingestBatch(jobs: JobPartial[]): string[] {
  const newIds: string[] = [];
  for (const job of jobs) {
    const { isNew } = ingestJob(job);
    if (isNew) {
      const row = db.query<{ id: string }, [string, string]>(
        'SELECT id FROM jobs WHERE source = ? AND external_id = ?'
      ).get(job.source, job.external_id);
      if (row) newIds.push(row.id);
    }
  }
  return newIds;
}

function scoreBatchInBackground(jobIds: string[]) {
  (async () => {
    const scoredResults: ScoredJob[] = [];

    for (const jobId of jobIds) {
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
        scoredResults.push({ job, score: result.match_score, matchSummary: result.match_summary });
        console.log(`[scheduler] Analyzed job ${jobId}: score=${result.match_score} tags=${result.tags.join(',')}`);
      }
    }

    // Send Telegram notification with batch summary
    await sendFetchSummary(scoredResults);

    // Retry any existing jobs that weren't scored yet
    await analyzeUnscoredJobs();

    console.log('[scheduler] Done scoring batch');
  })().catch((err) => console.error('[scheduler] Background analysis failed:', err));
}

export async function fetchJobs(): Promise<number> {
  if (isFetching) {
    console.log('[scheduler] Fetch already in progress, skipping');
    return 0;
  }
  isFetching = true;
  try {
    console.log('[scheduler] Fetching jobs...');

    let totalNew = 0;

    // 1. Fetch jobindex first
    try {
      const jobindexJobs = await fetchJobindex();
      console.log(`[scheduler] Jobindex: ${jobindexJobs.length} jobs`);
      const batch1Ids = ingestBatch(jobindexJobs);
      totalNew += batch1Ids.length;
      if (batch1Ids.length > 0) {
        scoreBatchInBackground(batch1Ids);
      }
    } catch (err) {
      console.error('[scheduler] Jobindex failed:', err);
    }

    // 2. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 3. Fetch LinkedIn
    try {
      const linkedinJobs = await fetchLinkedIn();
      console.log(`[scheduler] LinkedIn: ${linkedinJobs.length} jobs`);
      const batch2Ids = ingestBatch(linkedinJobs);
      totalNew += batch2Ids.length;
      if (batch2Ids.length > 0) {
        scoreBatchInBackground(batch2Ids);
      }
    } catch (err) {
      console.error('[scheduler] LinkedIn failed:', err);
    }

    // 4. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 5. Fetch Remotive
    try {
      const remotiveJobs = await fetchRemotive();
      console.log(`[scheduler] Remotive: ${remotiveJobs.length} jobs`);
      const batch3Ids = ingestBatch(remotiveJobs);
      totalNew += batch3Ids.length;
      if (batch3Ids.length > 0) {
        scoreBatchInBackground(batch3Ids);
      }
    } catch (err) {
      console.error('[scheduler] Remotive failed:', err);
    }

    console.log(`[scheduler] ${totalNew} new jobs total`);
    lastFetchAt = new Date().toISOString();
    lastFetchNewJobs = totalNew;

    // Check link liveness for a batch of older jobs (fire-and-forget)
    checkStaleLinksBatch().catch(console.error);

    return totalNew;
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

const LIVENESS_CHECK_INTERVAL_DAYS = 7;
const LIVENESS_MIN_AGE_DAYS = 3;
const LIVENESS_BATCH_SIZE = 10;

async function checkStaleLinksBatch(): Promise<void> {
  const cutoffAge = new Date(Date.now() - LIVENESS_MIN_AGE_DAYS * 86400000).toISOString();
  const cutoffCheck = new Date(Date.now() - LIVENESS_CHECK_INTERVAL_DAYS * 86400000).toISOString();

  const jobs = db.query<{ id: string; url: string }, [string, string, number]>(
    `SELECT id, url FROM jobs
     WHERE status IN ('new', 'saved')
     AND link_status != 'expired'
     AND fetched_at < ?
     AND (link_checked_at IS NULL OR link_checked_at < ?)
     AND duplicate_of IS NULL
     LIMIT ?`
  ).all(cutoffAge, cutoffCheck, LIVENESS_BATCH_SIZE);

  for (const job of jobs) {
    const result = await classifyLiveness(job.url);
    db.run(
      'UPDATE jobs SET link_status = ?, link_checked_at = ? WHERE id = ?',
      [result, new Date().toISOString(), job.id]
    );
    // Small delay to avoid hammering job boards
    await new Promise(r => setTimeout(r, 500));
  }

  if (jobs.length > 0) {
    console.log(`[scheduler] Link liveness: checked ${jobs.length} jobs`);
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
