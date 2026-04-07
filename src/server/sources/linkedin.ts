import { parse } from 'node-html-parser';
import type { Job } from '../types';
import { getPreferences } from '../routes/settings';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

// LinkedIn guest jobs API — no auth required, returns HTML job cards.
// geoId=102194656: Greater Copenhagen area
// f_TPR=r604800: posted in last 7 days (was 24h — too few results)
// No experience level filter (f_E removed) — LLM scoring handles seniority
// No work type filter (f_WT removed) — LLM scoring handles remote/hybrid preference
const LINKEDIN_GUEST_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const LINKEDIN_JOB_API = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';
const GEO_ID = '102194656'; // Greater Copenhagen

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'close',
};

function buildSearchUrl(keywords: string, start = 0): string {
  const url = new URL(LINKEDIN_GUEST_API);
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('geoId', GEO_ID);
  url.searchParams.set('f_TPR', 'r604800'); // last 7 days
  url.searchParams.set('sortBy', 'R');       // most recent
  url.searchParams.set('start', String(start));
  return url.toString();
}

interface ParsedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedAt: string | null;
}

// Parse LinkedIn job cards from the guest API HTML response.
// Each card contains a data-entity-urn with the job ID, plus structured HTML fields.
export function parseJobCards(html: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];

  // Split on job card boundaries
  const cardPattern = /data-entity-urn="urn:li:jobPosting:(\d+)"([\s\S]*?)(?=data-entity-urn="urn:li:jobPosting:|$)/g;
  let match: RegExpExecArray | null;

  while ((match = cardPattern.exec(html)) !== null) {
    const [, id, body] = match;

    const title = extractText(body, 'base-search-card__title');
    const company = extractText(body, 'hidden-nested-link') || extractText(body, 'base-search-card__subtitle');
    const location = extractText(body, 'job-search-card__location');
    const urlMatch = body.match(/href="(https:\/\/[a-z]{2}\.linkedin\.com\/jobs\/view\/[^"]+)"/);
    const url = urlMatch ? decodeHtmlEntities(urlMatch[1]) : '';
    const dateMatch = body.match(/<time[^>]+datetime="([^"]+)"/);
    const postedAt = dateMatch ? dateMatch[1] : null;

    if (id && title && url) {
      jobs.push({ id, title: title.trim(), company: company.trim(), location: location.trim(), url, postedAt });
    }
  }

  return jobs;
}

function extractText(html: string, className: string): string {
  const re = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>\\s*([\\s\\S]*?)\\s*<`, 'i');
  const m = html.match(re);
  if (!m) return '';
  // Strip any inner tags (e.g. <a> wrappers)
  return m[1].replace(/<[^>]+>/g, '').trim();
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function extractJobId(url: string): string {
  try {
    const u = new URL(url);
    const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) return `li_${viewMatch[1]}`;
    const param = u.searchParams.get('currentJobId') ?? u.searchParams.get('jobId');
    if (param) return `li_${param}`;
  } catch {
    // ignore
  }
  return `li_${url.slice(-32).replace(/\W/g, '')}`;
}

/** Fetch the job description from LinkedIn's guest detail API. */
async function fetchJobDescription(jobId: string): Promise<string | null> {
  try {
    const res = await fetch(`${LINKEDIN_JOB_API}/${jobId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const root = parse(html);
    const descEl =
      root.querySelector('.show-more-less-html__markup') ??
      root.querySelector('.description__text--rich');
    if (!descEl) return null;
    const text = descEl.innerText
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn(`[linkedin] fetchJobDescription failed for ${jobId}:`, (err as Error).message);
    return null;
  }
}

/** Run promises with at most `limit` in parallel. */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const DEFAULT_KEYWORDS = ['frontend developer', 'web developer'];
const PAGE_SIZE = 25;
const MAX_PAGES = 4; // up to 100 jobs per keyword

function loadKeywords(): string[] {
  const prefs = getPreferences();
  if (!prefs.linkedinSearchTerms) return DEFAULT_KEYWORDS;
  const lines = prefs.linkedinSearchTerms
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
  return lines.length > 0 ? lines : DEFAULT_KEYWORDS;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOnePage(keywords: string, start: number): Promise<ParsedJob[]> {
  const url = buildSearchUrl(keywords, start);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const backoff = attempt === 1 ? 15_000 : 45_000;
      console.warn(`[linkedin] 429 for "${keywords}" start=${start} — retrying in ${backoff / 1000}s (attempt ${attempt + 1})`);
      await sleep(backoff);
    }
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429) continue;
    if (!response.ok) {
      throw new Error(`LinkedIn guest API returned ${response.status} for "${keywords}" start=${start}`);
    }
    return parseJobCards(await response.text());
  }

  throw new Error(`LinkedIn guest API returned 429 for "${keywords}" start=${start} (all retries exhausted)`);
}

async function fetchJobs(keywords: string): Promise<JobPartial[]> {
  const fetchedAt = new Date().toISOString();
  const parsed: ParsedJob[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE;
    const batch = await fetchOnePage(keywords, start);
    parsed.push(...batch);
    if (batch.length < PAGE_SIZE) break; // no more pages
  }

  console.log(`[linkedin] "${keywords}" → ${parsed.length} listings, fetching descriptions...`);

  // Fetch descriptions in parallel (3 concurrent to avoid rate-limiting)
  const enriched = await pLimit(
    parsed.map(item => async () => {
      const description = await fetchJobDescription(item.id);
      return {
        source: 'linkedin' as const,
        external_id: `li_${item.id}`,
        title: item.title,
        company: item.company,
        location: item.location || 'Copenhagen, Denmark',
        url: item.url,
        description,
        posted_at: item.postedAt ? new Date(item.postedAt).toISOString() : null,
        fetched_at: fetchedAt,
      } satisfies JobPartial;
    }),
    3,
  );

  return enriched;
}

export async function fetchLinkedIn(): Promise<JobPartial[]> {
  const keywords = loadKeywords();
  let allJobs: JobPartial[] = [];

  for (let i = 0; i < keywords.length; i++) {
    if (i > 0) await sleep(3_000 + Math.random() * 2_000); // 3–5s between keyword batches
    const kw = keywords[i];
    try {
      const jobs = await fetchJobs(kw);
      console.log(`[linkedin] "${kw}" → ${jobs.length} results`);
      allJobs = allJobs.concat(jobs);
    } catch (err) {
      console.error(`[linkedin] Failed to fetch "${kw}":`, err);
    }
  }

  // Deduplicate by external_id
  const seen = new Set<string>();
  const unique = allJobs.filter(j => {
    if (seen.has(j.external_id)) return false;
    seen.add(j.external_id);
    return true;
  });

  console.log(`[linkedin] Fetch complete — ${unique.length} unique jobs`);
  return unique;
}
