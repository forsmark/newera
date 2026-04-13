import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const ARBEITNOW_API = 'https://www.arbeitnow.com/api/jobs';
const MAX_PAGES = 5;

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links: {
    next: string | null;
    prev: string | null;
  };
  meta: {
    current_page: number;
    last_page: number;
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function formatLocation(remote: boolean, location: string): string {
  if (!location || !location.trim()) {
    return 'Remote';
  }
  return `Remote — ${location.trim()}`;
}

export function parseArbeitnowJobs(data: ArbeitnowResponse): JobPartial[] {
  const fetchedAt = new Date().toISOString();
  const jobs: JobPartial[] = [];

  for (const item of data.data) {
    if (!item.slug || !item.title) continue;
    if (!item.remote) continue;

    let description: string | null = stripHtml(item.description);
    if (description.length === 0) {
      description = null;
    } else if (description.length > 6000) {
      description = description.slice(0, 6000) + '\n[truncated]';
    }

    jobs.push({
      source: 'arbeitnow',
      external_id: `arbeitnow_${item.slug}`,
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: formatLocation(item.remote, item.location),
      url: item.url,
      description,
      posted_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }

  return jobs;
}

export async function fetchArbeitnow(): Promise<JobPartial[]> {
  console.log('[arbeitnow] Fetching remote jobs...');

  const allJobs: JobPartial[] = [];
  let lastPage = 1;

  // Fetch first page to get pagination info
  const firstResponse = await fetch(`${ARBEITNOW_API}?page=1`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!firstResponse.ok) {
    throw new Error(`[arbeitnow] API returned ${firstResponse.status}`);
  }

  const firstData = (await firstResponse.json()) as ArbeitnowResponse;
  allJobs.push(...parseArbeitnowJobs(firstData));
  lastPage = Math.min(firstData.meta.last_page, MAX_PAGES);

  // Fetch remaining pages
  for (let page = 2; page <= lastPage; page++) {
    const response = await fetch(`${ARBEITNOW_API}?page=${page}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`[arbeitnow] API returned ${response.status} on page ${page}`);
    }

    const data = (await response.json()) as ArbeitnowResponse;
    allJobs.push(...parseArbeitnowJobs(data));
  }

  console.log(`[arbeitnow] Fetch complete — ${allJobs.length} jobs`);
  return allJobs;
}
