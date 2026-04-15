import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const REMOTEOK_API = 'https://remoteok.com/api';

interface RemoteOKJob {
  slug: string;
  id: string;
  epoch: number;
  date: string;
  company: string;
  position: string;
  tags: string[];
  location: string;
  apply_url: string;
  url: string;
  description: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function parseRemoteOKJobs(data: unknown[]): JobPartial[] {
  const fetchedAt = new Date().toISOString();
  const jobs: JobPartial[] = [];

  // First element is a legal/metadata object — skip it
  for (let i = 1; i < data.length; i++) {
    const item = data[i] as RemoteOKJob;
    if (!item.slug || !item.position) continue;

    let description: string | null = item.description ? stripHtml(item.description) : null;
    if (description !== null) {
      if (description.length === 0) {
        description = null;
      } else if (description.length > 6000) {
        description = description.slice(0, 6000) + '\n[truncated]';
      }
    }

    const location = item.location && item.location.trim() ? item.location.trim() : null;

    jobs.push({
      source: 'remoteok',
      external_id: `remoteok_${item.slug}`,
      title: item.position.trim(),
      company: item.company.trim(),
      location,
      url: item.apply_url || item.url,
      description,
      posted_at: item.epoch ? new Date(item.epoch * 1000).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }

  return jobs;
}

export async function fetchRemoteOK(): Promise<JobPartial[]> {
  console.log('[remoteok] Fetching remote jobs...');

  const response = await fetch(REMOTEOK_API, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[remoteok] API returned ${response.status}`);
  }

  const data = (await response.json()) as unknown[];
  const jobs = parseRemoteOKJobs(data);

  console.log(`[remoteok] Fetch complete — ${jobs.length} jobs`);
  return jobs;
}
