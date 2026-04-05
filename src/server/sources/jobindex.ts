import { join } from 'path';
import { parse } from 'node-html-parser';
import type { Job } from '../types';
import { DATA_DIR } from '../config';
import { fetchPageText } from '../utils/fetchPageText';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

interface StashResult {
  tid: string;
  headline: string | null;
  companytext: string | null;
  area: string | null;
  share_url: string;
  firstdate: string | null;
}

const AREA_MAP: [RegExp, string][] = [
  [/copenhagen|københavn|storkoebenhavn/i, 'storkoebenhavn'],
  [/north.?zealand|nordsjæl/i, 'nordsjælland'],
  [/fyn|funen/i, 'fyn'],
  [/north.?jutland|nordjyl/i, 'nordjylland'],
  [/mid.?jutland|midtjyl/i, 'midtjylland'],
  [/south.?jutland|sydjyl/i, 'sydjylland'],
  [/remote|udlandet/i, 'udlandet'],
];
const DEFAULT_AREA = 'storkoebenhavn';

async function loadJobindexSearch(): Promise<{ urls: string[]; area: string }> {
  let area = DEFAULT_AREA;
  try {
    const text = await Bun.file(join(DATA_DIR, 'preferences.md')).text();

    // Resolve area from ## Location section
    const areaMatch = text.match(/##\s+Location\s*\n((?:.+\n?){1,5})/i);
    if (areaMatch) {
      for (const [pattern, code] of AREA_MAP) {
        if (pattern.test(areaMatch[1])) { area = code; break; }
      }
    }

    // Resolve search terms from ## Jobindex Search Terms section
    const termsMatch = text.match(/##\s+Jobindex\s+Search\s+Terms\s*\n((?:\s*[-*]\s*.+\n?)+)/i);
    if (termsMatch) {
      const terms = termsMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
        .filter(l => l.length > 0);
      if (terms.length > 0) {
        return {
          urls: terms.map(
            term => `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent(term)}&superjob=1&area=${area}`,
          ),
          area,
        };
      }
    }
  } catch {
    // preferences.md not found — fall through to defaults
  }

  return {
    urls: [
      `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent('frontend udvikler')}&superjob=1&area=${area}`,
      `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent('webudvikler')}&superjob=1&area=${area}`,
    ],
    area,
  };
}

/** Extract the Stash JSON object from page HTML using brace balancing. */
function extractStash(html: string): Record<string, unknown> {
  const marker = 'var Stash = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('[jobindex] Stash variable not found in page HTML');

  let depth = 0;
  let end = -1;
  for (let i = start + marker.length; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      if (--depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('[jobindex] Could not find end of Stash object');

  return JSON.parse(html.slice(start + marker.length, end + 1)) as Record<string, unknown>;
}

function extractResults(stash: Record<string, unknown>): StashResult[] {
  const resultApp = stash['jobsearch/result_app'] as Record<string, unknown> | undefined;
  const storeData = resultApp?.['storeData'] as Record<string, unknown> | undefined;
  const searchResponse = storeData?.['searchResponse'] as Record<string, unknown> | undefined;
  const results = searchResponse?.['results'] as StashResult[] | undefined;
  if (!results) throw new Error('[jobindex] searchResponse.results not found in Stash');
  return results;
}

/** Returns true if the job location clearly belongs to a region other than targetArea. */
function isWrongRegion(location: string | null, targetArea: string): boolean {
  if (!location) return false;
  for (const [pattern, code] of AREA_MAP) {
    if (pattern.test(location) && code !== targetArea) return true;
  }
  return false;
}

/** Fetch a jobindex detail page and extract the external "se jobbet" employer URL. */
async function resolveExternalUrl(shareUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'da,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Try Stash JSON first — look for apply_url or similar
    try {
      const stash = extractStash(html);
      const jobApp = stash['job_app'] as Record<string, unknown> | undefined;
      const storeData = jobApp?.['storeData'] as Record<string, unknown> | undefined;
      if (storeData) {
        for (const key of Object.keys(storeData)) {
          const entry = storeData[key] as Record<string, unknown> | undefined;
          const applyUrl = entry?.['apply_url'] ?? entry?.['applyUrl'] ?? entry?.['application_url'];
          if (typeof applyUrl === 'string' && applyUrl.startsWith('http') && !applyUrl.includes('jobindex.dk')) {
            return applyUrl;
          }
        }
      }
    } catch {
      // Stash not present or has different structure — fall through to HTML
    }

    // HTML fallback: find anchor with "se jobbet" / "ansøg" text pointing off-site
    const root = parse(html);
    const candidateTexts = /se jobbet|vis job|show job|se job|ansøg nu|ansøg her|apply now|go to job|apply here/i;
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') ?? '';
      const text = a.innerText.trim();
      if (
        href.startsWith('http') &&
        !href.includes('jobindex.dk') &&
        (candidateTexts.test(text) || candidateTexts.test(a.getAttribute('aria-label') ?? ''))
      ) {
        return href;
      }
    }
  } catch (err) {
    console.warn(`[jobindex] resolveExternalUrl failed for ${shareUrl}:`, (err as Error).message);
  }
  return null;
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

async function fetchPage(url: string, targetArea: string): Promise<JobPartial[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'da,en;q=0.9',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[jobindex] HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const stash = extractStash(html);
  const results = extractResults(stash);

  console.log(`[jobindex] Found ${results.length} listings on ${url}`);

  const fetched_at = new Date().toISOString();

  const filtered = results.filter(r => {
    if (!r.tid || !r.headline) return false;
    if (isWrongRegion(r.area, targetArea)) {
      console.log(`[jobindex] Skipping out-of-area job: "${r.headline}" (${r.area})`);
      return false;
    }
    return true;
  });

  // Enrich each job with external URL + full description (5 concurrent)
  const enriched = await pLimit(
    filtered.map(r => async () => {
      const externalUrl = await resolveExternalUrl(r.share_url);
      // Jobindex-hosted listings have no external URL — fall back to /jobannonce/ page
      const joannonceUrl = `https://www.jobindex.dk/jobannonce/${r.tid}/`;
      const descriptionUrl = externalUrl ?? joannonceUrl;

      if (externalUrl) {
        console.log(`[jobindex] Resolved external URL for "${r.headline}": ${externalUrl}`);
      } else {
        console.log(`[jobindex] No external URL for "${r.headline}", using jobannonce page`);
      }

      let description: string | null = null;
      const pageText = await fetchPageText(descriptionUrl);
      if (pageText) {
        // Truncate to keep the scoring LLM prompt manageable
        description = pageText.length > 6_000 ? pageText.slice(0, 6_000) + '\n[truncated]' : pageText;
      }

      return {
        source: 'jobindex' as const,
        external_id: r.tid,
        title: r.headline!,
        company: r.companytext || 'Unknown',
        location: r.area || null,
        url: externalUrl ?? joannonceUrl,
        description,
        posted_at: r.firstdate ? new Date(r.firstdate).toISOString() : null,
        fetched_at,
      } satisfies JobPartial;
    }),
    5,
  );

  return enriched;
}

export async function fetchJobindex(): Promise<JobPartial[]> {
  const { urls, area } = await loadJobindexSearch();
  let allJobs: JobPartial[] = [];

  for (const url of urls) {
    try {
      const jobs = await fetchPage(url, area);
      allJobs = allJobs.concat(jobs);
    } catch (err) {
      console.error(`[jobindex] Failed to fetch ${url}:`, (err as Error).message);
    }
  }

  // Deduplicate by external_id
  const seen = new Set<string>();
  const unique: JobPartial[] = [];
  for (const job of allJobs) {
    if (!seen.has(job.external_id)) {
      seen.add(job.external_id);
      unique.push(job);
    }
  }

  console.log(`[jobindex] Fetch complete — ${unique.length} unique jobs from ${urls.length} URL(s)`);
  return unique;
}
