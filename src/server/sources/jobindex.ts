import { join } from 'path';
import type { Job } from '../types';
import { DATA_DIR } from '../config';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'status' | 'seen_at'>;

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

async function loadJobindexSearchUrls(): Promise<string[]> {
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
        return terms.map(
          term => `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent(term)}&superjob=1&area=${area}`,
        );
      }
    }
  } catch {
    // preferences.md not found — fall through to defaults
  }

  const defaults = [
    `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent('frontend udvikler')}&superjob=1&area=${area}`,
    `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent('webudvikler')}&superjob=1&area=${area}`,
  ];
  return defaults;
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

async function fetchPage(url: string): Promise<JobPartial[]> {
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

  return results
    .filter(r => r.tid && r.headline)
    .map(r => ({
      source: 'jobindex' as const,
      external_id: r.tid,
      title: r.headline!,
      company: r.companytext || 'Unknown',
      location: r.area || null,
      url: r.share_url,
      description: null,
      posted_at: r.firstdate ? new Date(r.firstdate).toISOString() : null,
      fetched_at,
    }));
}

export async function fetchJobindex(): Promise<JobPartial[]> {
  const searchUrls = await loadJobindexSearchUrls();
  let allJobs: JobPartial[] = [];

  for (const url of searchUrls) {
    try {
      const jobs = await fetchPage(url);
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

  console.log(`[jobindex] Fetch complete — ${unique.length} unique jobs from ${searchUrls.length} URL(s)`);
  return unique;
}
