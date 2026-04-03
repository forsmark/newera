import { fetchJSearch } from './sources/jsearch';
import { fetchJobindex } from './sources/jobindex';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';
import type { Job } from './types';

let lastFetchAt: string | null = null;
let isFetching = false;

export function getLastFetchAt(): string | null {
  return lastFetchAt;
}

export function getIsFetching(): boolean { return isFetching; }

export async function fetchJobs(): Promise<number> {
  if (isFetching) {
    console.log('[scheduler] Fetch already in progress, skipping');
    return 0;
  }
  isFetching = true;
  try {
    console.log('[scheduler] Fetching jobs...');

    // 1. Fetch from both sources
    const [jsearchResult, jobindexResult] = await Promise.allSettled([fetchJSearch(), fetchJobindex()]);
    const jsearchJobs = jsearchResult.status === 'fulfilled' ? jsearchResult.value : [];
    const jobindexJobs = jobindexResult.status === 'fulfilled' ? jobindexResult.value : [];
    if (jsearchResult.status === 'rejected') console.error('[scheduler] JSearch failed:', jsearchResult.reason);
    if (jobindexResult.status === 'rejected') console.error('[scheduler] Jobindex failed:', jobindexResult.reason);

    const allJobs = [...jsearchJobs, ...jobindexJobs];
    console.log(`[scheduler] Fetched ${allJobs.length} jobs`);

    // 2. Insert new jobs into DB (INSERT OR IGNORE respects UNIQUE(source, external_id))
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO jobs (id, source, external_id, title, company, location, url, description, posted_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const newJobIds: string[] = [];

    for (const job of allJobs) {
      const id = randomUUID();
      const result = insertStmt.run(
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
      if (result.changes > 0) {
        newJobIds.push(id);
      }
    }

    console.log(`[scheduler] ${newJobIds.length} new jobs inserted`);
    lastFetchAt = new Date().toISOString();

    // 3. Analyze new jobs with LLM in the background (don't await — return count immediately)
    (async () => {
      for (const jobId of newJobIds) {
        const job = db.query('SELECT * FROM jobs WHERE id = ?').get(jobId) as Job | null;
        if (!job) continue;

        const result = await analyzeJob(job);
        if (result) {
          db.run('UPDATE jobs SET match_score = ?, match_reasoning = ? WHERE id = ?', [
            result.match_score,
            result.match_reasoning,
            jobId,
          ]);
          console.log(`[scheduler] Analyzed job ${jobId}: score=${result.match_score}`);
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
      db.run('UPDATE jobs SET match_score = ?, match_reasoning = ? WHERE id = ?', [
        result.match_score,
        result.match_reasoning,
        job.id,
      ]);
      console.log(`[scheduler] Scored job ${job.id}: ${result.match_score}`);
    }
  }
}

// 12h interval = 2 fetches/day. With up to 5 JSearch queries that's ~150 req/month,
// comfortably within the 200 req/month budget on openwebninja.com's free tier.
const INTERVAL_MS = 12 * 60 * 60 * 1000;

export function startScheduler(): void {
  fetchJobs().catch(console.error);
  setInterval(() => fetchJobs().catch(console.error), INTERVAL_MS);
}
