import { fetchJSearch } from './sources/jsearch';
import { fetchJobindex } from './sources/jobindex';
import { analyzeJob } from './llm';
import db from './db';
import { randomUUID } from 'crypto';

let lastFetchAt: string | null = null;

export function getLastFetchAt(): string | null {
  return lastFetchAt;
}

export async function fetchJobs(): Promise<void> {
  console.log('[scheduler] Fetching jobs...');

  // 1. Fetch from both sources
  const [jsearchJobs, jobindexJobs] = await Promise.all([
    fetchJSearch(),
    fetchJobindex(),
  ]);

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

  // 3. Analyze new jobs with LLM (sequentially to avoid hammering Ollama)
  for (const jobId of newJobIds) {
    const job = db.query('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
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

  console.log('[scheduler] Done');
}

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function startScheduler(): void {
  // Run immediately on start
  fetchJobs().catch(console.error);
  // Then every 6 hours
  setInterval(() => fetchJobs().catch(console.error), INTERVAL_MS);
}
