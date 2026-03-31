import type { Job } from '../types';

const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY ?? '';
const JSEARCH_BASE = 'https://jsearch.p.rapidapi.com/search';

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
  url.searchParams.set('num_pages', '1');
  url.searchParams.set('country', 'dk');

  const response = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': JSEARCH_API_KEY,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
  });

  if (!response.ok) {
    throw new Error(`JSearch API returned ${response.status} for query "${query}"`);
  }

  const json = (await response.json()) as JSearchResponse;
  return json.data ?? [];
}

function mapItem(item: JSearchItem): JobPartial {
  return {
    source: 'jsearch',
    external_id: item.job_id,
    title: item.job_title,
    company: item.employer_name,
    location: item.job_city ?? item.job_country ?? null,
    url: item.job_apply_link,
    description: item.job_description ?? null,
    posted_at: item.job_posted_at_datetime_utc ?? null,
    fetched_at: new Date().toISOString(),
  };
}

// Returns array of Job objects ready for DB insert (no id set — caller assigns)
export async function fetchJSearch(): Promise<JobPartial[]> {
  if (!JSEARCH_API_KEY) {
    console.warn('[jsearch] JSEARCH_API_KEY is not set — skipping fetch');
    return [];
  }

  const queries = [
    'frontend developer Copenhagen',
    'web developer Copenhagen',
  ];

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

  return unique.map(mapItem);
}
