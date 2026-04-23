import { fetchJobindex } from './sources/jobindex';
import { fetchLinkedIn } from './sources/linkedin';
import { fetchRemotive } from './sources/remotive';
import { fetchArbeitnow } from './sources/arbeitnow';
import { fetchRemoteOK } from './sources/remoteok';
import { fetchJobDescription } from './sources/linkedin';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';
import type { Job } from './types';
import { getPreferences, getResume } from './settings';
import { contentFingerprint, isFuzzyDuplicate, normalizeCompany } from './utils/normalize';
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
  // Reject test/placeholder URLs that should never enter production
  try {
    const host = new URL(job.url).hostname;
    if (host === 'example.com' || host === 'localhost') {
      return { isNew: false };
    }
  } catch { /* malformed URL — let it through, dedup will handle it */ }

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

    // Fuzzy fallback: same company + similar title across sources
    if (!existingRow) {
      const nc = normalizeCompany(job.company);
      const candidates = db.query<{ id: string; title: string; company: string }, [string, string, string]>(
        `SELECT id, title, company FROM jobs
         WHERE source != ?
         AND NOT (source = ? AND external_id = ?)
         AND duplicate_of IS NULL`
      ).all(job.source, job.source, job.external_id);

      for (const c of candidates) {
        if (normalizeCompany(c.company) === nc && isFuzzyDuplicate(job.title, job.company, c.title, c.company)) {
          db.run('UPDATE jobs SET duplicate_of = ? WHERE source = ? AND external_id = ?',
            [c.id, job.source, job.external_id]);
          return { isNew: false };
        }
      }
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
    const { disabledSources } = getPreferences();

    let totalNew = 0;

    // 1. Fetch jobindex first
    if (!disabledSources.includes('jobindex')) {
      try {
        const jobindexJobs = await fetchJobindex();
        console.log(`[scheduler] Jobindex: ${jobindexJobs.length} jobs`);
        const batch1Ids = ingestBatch(jobindexJobs);
        totalNew += batch1Ids.length;
        if (batch1Ids.length > 0) scoreBatchInBackground(batch1Ids);
      } catch (err) {
        console.error('[scheduler] Jobindex failed:', err);
      }
    }

    // 2. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 3. Fetch LinkedIn
    if (!disabledSources.includes('linkedin')) {
      try {
        const linkedinJobs = await fetchLinkedIn();
        console.log(`[scheduler] LinkedIn: ${linkedinJobs.length} jobs`);
        const batch2Ids = ingestBatch(linkedinJobs);
        totalNew += batch2Ids.length;
        if (batch2Ids.length > 0) scoreBatchInBackground(batch2Ids);
      } catch (err) {
        console.error('[scheduler] LinkedIn failed:', err);
      }
    }

    // 4. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 5. Fetch Remotive
    if (!disabledSources.includes('remotive')) {
      try {
        const remotiveJobs = await fetchRemotive();
        console.log(`[scheduler] Remotive: ${remotiveJobs.length} jobs`);
        const batch3Ids = ingestBatch(remotiveJobs);
        totalNew += batch3Ids.length;
        if (batch3Ids.length > 0) scoreBatchInBackground(batch3Ids);
      } catch (err) {
        console.error('[scheduler] Remotive failed:', err);
      }
    }

    // 6. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 7. Fetch Arbeitnow
    if (!disabledSources.includes('arbeitnow')) {
      try {
        const arbeitnowJobs = await fetchArbeitnow();
        console.log(`[scheduler] Arbeitnow: ${arbeitnowJobs.length} jobs`);
        const batch4Ids = ingestBatch(arbeitnowJobs);
        totalNew += batch4Ids.length;
        if (batch4Ids.length > 0) scoreBatchInBackground(batch4Ids);
      } catch (err) {
        console.error('[scheduler] Arbeitnow failed:', err);
      }
    }

    // 8. Wait 30 seconds to spread Ollama load
    await new Promise(r => setTimeout(r, 30_000));

    // 9. Fetch RemoteOK
    if (!disabledSources.includes('remoteok')) {
      try {
        const remoteokJobs = await fetchRemoteOK();
        console.log(`[scheduler] RemoteOK: ${remoteokJobs.length} jobs`);
        const batch5Ids = ingestBatch(remoteokJobs);
        totalNew += batch5Ids.length;
        if (batch5Ids.length > 0) scoreBatchInBackground(batch5Ids);
      } catch (err) {
        console.error('[scheduler] RemoteOK failed:', err);
      }
    }

    console.log(`[scheduler] ${totalNew} new jobs total`);
    lastFetchAt = new Date().toISOString();
    lastFetchNewJobs = totalNew;

    checkStaleLinksBatch().catch(console.error);

    return totalNew;
  } finally {
    isFetching = false;
  }
}

export async function analyzeUnscoredJobs(autoReject = true): Promise<void> {
  if (!getResume()) return;

  const unscoredJobs = db.query(`
    SELECT * FROM jobs
    WHERE match_score IS NULL
    AND duplicate_of IS NULL
    ORDER BY fetched_at DESC
    LIMIT 20
  `).all() as Job[];

  if (unscoredJobs.length === 0) return;

  console.log(`[scheduler] Retrying analysis for ${unscoredJobs.length} unscored jobs`);

  for (const job of unscoredJobs) {
    // Back-fill missing LinkedIn descriptions before scoring
    if (job.source === 'linkedin' && !job.description) {
      const linkedInId = job.external_id.replace(/^li_/, '');
      console.log(`[scheduler] Re-fetching LinkedIn description for job ${job.id} (${linkedInId})`);
      const desc = await fetchJobDescription(linkedInId);
      if (desc) {
        db.run('UPDATE jobs SET description = ? WHERE id = ?', [desc, job.id]);
        job.description = desc;
      }
    }

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
      if (autoReject) maybeAutoReject(job.id, result.match_score);
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
  (async () => {
    await fetchJobs();
    // Drain any unscored jobs left from a previous run (e.g. after restart mid-rescore)
    for (let i = 0; i < 100; i++) {
      const row = db.query('SELECT COUNT(*) as c FROM jobs WHERE match_score IS NULL AND duplicate_of IS NULL').get() as { c: number };
      if (row.c === 0) break;
      await analyzeUnscoredJobs();
    }
  })().catch(console.error);
  scheduleNextFetch();
}
