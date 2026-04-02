import { parse } from 'node-html-parser';
import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'status' | 'seen_at'>;

// Tried in order — first selector that returns at least one element wins
const LISTING_SELECTORS = [
  '.PaidJob',
  '.jix_robotjob',
  'article.job-listing',
  'article[class*="job"]',
  'li[class*="job"]',
  'li[class*="Job"]',
  '.job-list-item',
  '[class*="JobAd"]',
  '[class*="jobad"]',
];

const TITLE_SELECTORS = [
  'h4 a',
  'h3 a',
  'h2 a',
  '.jix-toolbar__title a',
  '[class*="title"] a',
  'a[href*="jobannonce"]',
];

const COMPANY_SELECTORS = [
  '.jix-toolbar__company-name',
  '.jix-toolbar__company',
  '.company-name',
  '.company',
  '[class*="company"]',
  '[class*="Company"]',
  'em', // jobindex sometimes uses <em> for company
];

const DEFAULT_SEARCH_URLS = [
  'https://www.jobindex.dk/jobsoegning?q=frontend+udvikler&superjob=1&area=storkoebenhavn',
  'https://www.jobindex.dk/jobsoegning?q=webudvikler&superjob=1&area=storkoebenhavn',
];

function extractExternalId(href: string): string {
  // Jobindex URLs look like /jobannonce/12345678/... — grab the numeric segment
  const match = href.match(/\/jobannonce\/(\d+)/);
  if (match) return match[1];
  // Fallback: use the full href as a stable identifier
  return href;
}

function resolveUrl(href: string): string {
  if (href.startsWith('http')) return href;
  return `https://www.jobindex.dk${href}`;
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

async function loadJobindexArea(): Promise<string> {
  try {
    const text = await Bun.file('/app/data/preferences.md').text();
    // Find ## Location section
    const match = text.match(/##\s+Location\s*\n((?:.+\n?){1,5})/i);
    if (!match) return DEFAULT_AREA;
    const section = match[1];
    for (const [pattern, code] of AREA_MAP) {
      if (pattern.test(section)) return code;
    }
    return DEFAULT_AREA;
  } catch {
    return DEFAULT_AREA;
  }
}

async function loadJobindexSearchUrls(): Promise<string[]> {
  const area = await loadJobindexArea();
  try {
    const text = await Bun.file('/app/data/preferences.md').text();
    // Look for a section like:
    // ## Jobindex Search Terms
    // - frontend udvikler
    // - webudvikler
    const match = text.match(/##\s+Jobindex\s+Search\s+Terms\s*\n((?:\s*[-*]\s*.+\n?)+)/i);
    if (!match) return DEFAULT_SEARCH_URLS.map(url => url.replace('storkoebenhavn', area));
    const terms = match[1]
      .split('\n')
      .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter(l => l.length > 0);
    if (terms.length === 0) return DEFAULT_SEARCH_URLS.map(url => url.replace('storkoebenhavn', area));
    return terms.map(
      term =>
        `https://www.jobindex.dk/jobsoegning?q=${encodeURIComponent(term)}&superjob=1&area=${area}`,
    );
  } catch {
    return DEFAULT_SEARCH_URLS.map(url => url.replace('storkoebenhavn', area));
  }
}

async function fetchPage(url: string): Promise<JobPartial[]> {
  const response = await fetch(url, {
    headers: {
      // Mimic a real browser so the server doesn't return a bot-check page
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'da,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`jobindex returned ${response.status} for ${url}`);
  }

  const html = await response.text();
  const root = parse(html);

  // Try each listing selector in order — stop at the first one that yields results
  let listings: ReturnType<typeof root.querySelectorAll> = [];
  let matchedSelector = '';
  for (const sel of LISTING_SELECTORS) {
    const found = root.querySelectorAll(sel);
    if (found.length > 0) {
      listings = found;
      matchedSelector = sel;
      break;
    }
  }

  if (listings.length === 0) {
    console.warn(
      `[jobindex] No job listings found on ${url} — page structure may have changed. Tried: ${LISTING_SELECTORS.join(', ')}`,
    );
    // Dump the first 5000 chars of the HTML for debugging
    try {
      await Bun.write('/tmp/jobindex-debug.html', html.slice(0, 5000));
      console.warn('[jobindex] Saved first 5000 chars to /tmp/jobindex-debug.html for debugging');
    } catch {}
    return [];
  }

  console.log(`[jobindex] Found ${listings.length} listings on ${url} (selector: "${matchedSelector}")`);

  const jobs: JobPartial[] = [];
  const fetched_at = new Date().toISOString();

  for (const listing of listings) {
    try {
      // Try each title selector in order
      let anchor: ReturnType<typeof listing.querySelector> = null;
      for (const sel of TITLE_SELECTORS) {
        anchor = listing.querySelector(sel);
        if (anchor) break;
      }
      // Last-resort: any anchor in the listing
      if (!anchor) anchor = listing.querySelector('a');
      if (!anchor) continue;

      const title = anchor.text.trim();
      const href = anchor.getAttribute('href') ?? '';
      if (!href || !title) continue;

      const jobUrl = resolveUrl(href);
      const external_id = extractExternalId(href);

      // Try each company selector in order
      let companyEl: ReturnType<typeof listing.querySelector> = null;
      for (const sel of COMPANY_SELECTORS) {
        companyEl = listing.querySelector(sel);
        if (companyEl) break;
      }
      const company = companyEl ? companyEl.text.trim() : '';

      // Location info (best-effort)
      const topinfoEl =
        listing.querySelector('.jix_robotjob--topinfo') ??
        listing.querySelector('.topinfo') ??
        listing.querySelector('[class*="topinfo"]');
      const location = topinfoEl ? topinfoEl.text.trim().split('\n')[0].trim() : null;

      jobs.push({
        source: 'jobindex',
        external_id,
        title,
        company: company || 'Unknown',
        location: location || null,
        url: jobUrl,
        description: null,
        posted_at: null,
        fetched_at,
      });
    } catch (itemErr) {
      // Skip malformed individual listings without aborting the whole page
      console.warn('[jobindex] Failed to parse a listing — skipping:', itemErr);
    }
  }

  return jobs;
}

export async function fetchJobindex(): Promise<JobPartial[]> {
  const searchUrls = await loadJobindexSearchUrls();

  let allJobs: JobPartial[] = [];

  for (const url of searchUrls) {
    try {
      const jobs = await fetchPage(url);
      allJobs = allJobs.concat(jobs);
    } catch (err) {
      console.error(`[jobindex] Failed to fetch ${url}:`, err);
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
