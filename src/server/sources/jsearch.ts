import { join } from 'path';
import type { Job } from '../types';
import { DATA_DIR } from '../config';

const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY ?? '';
const JSEARCH_BASE = 'https://api.openwebninja.com/jsearch/search';

type JSearchItem = {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city?: string;
  job_country?: string;
  job_apply_link: string;
  job_description?: string;
  job_posted_at_datetime_utc?: string;
};

type JSearchResponse = {
  data?: JSearchItem[];
};

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'status' | 'seen_at'>;

async function fetchQuery(query: string): Promise<JSearchItem[]> {
  const url = new URL(JSEARCH_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('num_pages', '2');  // 20 results per query; 2 fetches/day × 5 queries ≈ 150 req/month
  url.searchParams.set('country', 'DK');

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': JSEARCH_API_KEY,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`JSearch API: ${response.status} — check JSEARCH_API_KEY in .env`);
    }
    if (response.status === 429) {
      throw new Error(`JSearch API: 429 Too Many Requests — quota may be exhausted`);
    }
    throw new Error(`JSearch API returned ${response.status} for query "${query}"`);
  }

  const json = (await response.json()) as JSearchResponse;
  return json.data ?? [];
}

function mapItem(item: JSearchItem, fetchedAt: string): JobPartial {
  return {
    source: 'jsearch',
    external_id: item.job_id,
    title: item.job_title,
    company: item.employer_name,
    location: item.job_city ?? item.job_country ?? null,
    url: item.job_apply_link,
    description: item.job_description ?? null,
    posted_at: item.job_posted_at_datetime_utc ?? null,
    fetched_at: fetchedAt,
  };
}

const DEFAULT_QUERIES = ['frontend developer Copenhagen', 'web developer Copenhagen'];

async function loadSearchQueries(): Promise<string[]> {
  try {
    const text = await Bun.file(join(DATA_DIR, 'preferences.md')).text();
    // Look for a section like:
    // ## Search Terms
    // - frontend developer Copenhagen
    // - React developer Copenhagen
    const match = text.match(/##\s+Search(?:\s+[Tt]erms|\s+[Qq]ueries)?\s*\n((?:\s*[-*]\s*.+\n?)+)/);
    if (!match) return DEFAULT_QUERIES;
    const lines = match[1]
      .split('\n')
      .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter(l => l.length > 0);
    return lines.length > 0 ? lines : DEFAULT_QUERIES;
  } catch {
    return DEFAULT_QUERIES;
  }
}

// Returns array of Job objects ready for DB insert (no id set — caller assigns)
export async function fetchJSearch(): Promise<JobPartial[]> {
  if (!JSEARCH_API_KEY) {
    console.warn('[jsearch] JSEARCH_API_KEY is not set — skipping fetch');
    return [];
  }

  const fetchedAt = new Date().toISOString();

  const queries = await loadSearchQueries();

  let allItems: JSearchItem[] = [];

  for (const query of queries) {
    try {
      const items = await fetchQuery(query);
      allItems = allItems.concat(items);
    } catch (err) {
      console.error(`[jsearch] Failed to fetch query "${query}":`, err);
    }
  }

  // Deduplicate by job_id
  const seen = new Set<string>();
  const unique: JSearchItem[] = [];
  for (const item of allItems) {
    if (!seen.has(item.job_id)) {
      seen.add(item.job_id);
      unique.push(item);
    }
  }

  return unique.map((item) => mapItem(item, fetchedAt));
}
