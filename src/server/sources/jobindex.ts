import { parse } from 'node-html-parser';
import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'status' | 'seen_at'>;

const SEARCH_URLS = [
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

  const jobs: JobPartial[] = [];
  const fetched_at = new Date().toISOString();

  // Each job listing lives inside a .PaidJob or .jix_robotjob element
  const listings = root.querySelectorAll('.PaidJob, .jix_robotjob');

  if (listings.length === 0) {
    console.warn(`[jobindex] No job listings found on ${url} — page structure may have changed`);
    return [];
  }

  for (const listing of listings) {
    try {
      // Title and URL come from the first <a> inside an <h4>
      const anchor = listing.querySelector('h4 a') ?? listing.querySelector('a');
      if (!anchor) continue;

      const title = anchor.text.trim();
      const href = anchor.getAttribute('href') ?? '';
      if (!href || !title) continue;

      const jobUrl = resolveUrl(href);
      const external_id = extractExternalId(href);

      // Company name
      const companyEl =
        listing.querySelector('.jix-toolbar__company-name') ??
        listing.querySelector('.company-name') ??
        listing.querySelector('[class*="company"]');
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
  let allJobs: JobPartial[] = [];

  for (const url of SEARCH_URLS) {
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

  return unique;
}
