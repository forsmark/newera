import { parse } from 'node-html-parser';
import type { Job } from '../types';
import { getPreferences } from '../routes/settings';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const BASE_URL = 'https://www.infojobs.net';
const MAX_PAGES = 3;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

// Note: infojobs.net/ofertas-trabajo/q-*/pg-*.xhtml returns a CAPTCHA page for bots.
// The /jobsearch/search-results/list.xhtml endpoint serves actual HTML job listings.
function buildUrl(term: string, page: number): string {
  const params = new URLSearchParams({ keyword: term, page: String(page) });
  return `${BASE_URL}/jobsearch/search-results/list.xhtml?${params}`;
}

async function fetchPage(url: string): Promise<JobPartial[]> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.warn(`[infojobs] HTTP ${res.status} for ${url}`);
    return [];
  }

  const html = await res.text();

  // Detect CAPTCHA / bot-challenge page (body will be tiny or contain captcha marker)
  if (html.includes('captcha') || html.length < 5000) {
    console.warn('[infojobs] Bot challenge / CAPTCHA detected — skipping page');
    return [];
  }

  const root = parse(html);
  const cards = root.querySelectorAll('li.ij-OfferList-offerCardItem');

  if (cards.length === 0) return [];

  const fetchedAt = new Date().toISOString();

  return cards.flatMap(card => {
    // Title + URL: the primary link inside ij-OfferCardContent-description-title
    const titleLinkEl = card.querySelector('a.ij-OfferCardContent-description-link');
    const title = (
      card.querySelector('.ij-OfferCardContent-description-title-link')?.text.trim() ||
      titleLinkEl?.getAttribute('aria-label')?.trim() ||
      ''
    );
    if (!title) return [];

    const href = titleLinkEl?.getAttribute('href') ?? '';
    if (!href) return [];

    // href is protocol-relative: //www.infojobs.net/...
    const jobUrl = href.startsWith('//') ? `https:${href}` : href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Extract external_id from URL: the "of-i<hex>" segment
    const idMatch = href.match(/of-i([a-f0-9]+)/i);
    const external_id = idMatch ? idMatch[1] : href.split('/').filter(Boolean).pop()?.replace(/\?.*/, '') ?? href;

    // Company: subtitle link
    const company = card.querySelector('.ij-OfferCardContent-description-subtitle-link')?.text.trim() ?? '';
    if (!company) return [];

    // Location: first description-list-item (city)
    const location = card.querySelector('.ij-OfferCardContent-description-list-item-truncate')?.text.trim() || null;

    return [{
      source: 'infojobs' as const,
      external_id,
      title,
      company,
      location,
      url: jobUrl,
      description: null,
      posted_at: null,
      fetched_at: fetchedAt,
      work_type: null,
      prefs_hash: null,
      content_fingerprint: null,
      duplicate_of: null,
      link_status: 'unchecked' as const,
      link_checked_at: null,
    }];
  });
}

export async function fetchInfojobs(): Promise<JobPartial[]> {
  const prefs = getPreferences();
  const raw = prefs.searchTerms?.trim() ?? '';
  const terms = raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : ['software engineer'];

  const all: JobPartial[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(term, page);
      console.log(`[infojobs] Fetching: ${url}`);
      let jobs: JobPartial[];
      try {
        jobs = await fetchPage(url);
      } catch (err) {
        console.error(`[infojobs] Error fetching page ${page} for "${term}":`, err);
        break;
      }

      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (!seen.has(job.external_id)) {
          seen.add(job.external_id);
          all.push(job);
        }
      }

      if (page < MAX_PAGES) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Small delay between search terms
    if (terms.indexOf(term) < terms.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`[infojobs] Fetch complete — ${all.length} jobs`);
  return all;
}
