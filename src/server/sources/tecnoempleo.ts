import { parse } from 'node-html-parser';
import type { Job } from '../types';
import { getPreferences } from '../routes/settings';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const BASE_URL = 'https://www.tecnoempleo.com';
const MAX_PAGES = 3;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

// URL: https://www.tecnoempleo.com/busqueda-empleo.php?te={term}&pg={page}
function buildUrl(term: string, page: number): string {
  const params = new URLSearchParams({ te: term, pg: String(page) });
  return `${BASE_URL}/busqueda-empleo.php?${params}`;
}

async function fetchPage(url: string): Promise<JobPartial[]> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.warn(`[tecnoempleo] HTTP ${res.status} for ${url}`);
    return [];
  }

  const html = await res.text();

  // Detect bot-challenge / blocked page
  if (html.includes('captcha') || html.length < 5000) {
    console.warn('[tecnoempleo] Bot challenge / CAPTCHA detected — skipping page');
    return [];
  }

  const root = parse(html);

  // Each job card: <div class="p-3 border rounded mb-3 bg-white" ... onclick="location.href='...'">
  const cards = root.querySelectorAll('div.p-3.border.rounded.mb-3.bg-white');

  if (cards.length === 0) {
    console.warn('[tecnoempleo] No job cards found — page structure may have changed');
    return [];
  }

  const fetchedAt = new Date().toISOString();

  return cards.flatMap(card => {
    // Title + URL: <h3 class="fs-5 mb-2"><a href="..." class="font-weight-bold text-cyan-700" title="...">
    const titleLink = card.querySelector('h3.fs-5 a.font-weight-bold');
    const title = titleLink?.getAttribute('title')?.trim() || titleLink?.text.trim() || '';
    if (!title) return [];

    const href = titleLink?.getAttribute('href') ?? '';
    if (!href) return [];

    const jobUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // External ID from URL: .../rf-<hex>
    const idMatch = href.match(/rf-([a-z0-9]+)$/i);
    const external_id = idMatch ? idMatch[1] : href.split('/').filter(Boolean).pop() ?? href;

    // Company: <a class="text-primary link-muted">
    const company = card.querySelector('a.text-primary.link-muted')?.text.trim() ?? '';
    if (!company) return [];

    // Location: <span class="d-block d-lg-none text-gray-800"><b>City</b> ...
    // This span is the mobile-friendly one that has city in <b>
    const locSpan = card.querySelector('span.d-block.d-lg-none.text-gray-800');
    const location = locSpan?.querySelector('b')?.text.trim() ?? null;

    // Work type: text after </b> in that span, e.g. "(Híbrido)"
    let work_type: string | null = null;
    if (locSpan) {
      const spanText = locSpan.text.trim();
      const wtMatch = spanText.match(/\(([^)]+)\)/);
      if (wtMatch) work_type = wtMatch[1].trim();
    }

    // Posted date: text after the work_type in loc span, e.g. "- 24/04/2026"
    let posted_at: string | null = null;
    if (locSpan) {
      const spanText = locSpan.text.trim();
      const dateMatch = spanText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        // Convert DD/MM/YYYY → ISO date
        posted_at = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }
    }

    return [{
      source: 'tecnoempleo' as const,
      external_id,
      title,
      company,
      location,
      url: jobUrl,
      description: null,
      posted_at,
      fetched_at: fetchedAt,
      work_type,
      prefs_hash: null,
      content_fingerprint: null,
      duplicate_of: null,
      link_status: 'unchecked' as const,
      link_checked_at: null,
    }];
  });
}

export async function fetchTecnoempleo(): Promise<JobPartial[]> {
  const prefs = getPreferences();
  const raw = prefs.searchTerms?.trim() ?? '';
  const terms = raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : ['software engineer'];

  const all: JobPartial[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(term, page);
      console.log(`[tecnoempleo] Fetching: ${url}`);
      let jobs: JobPartial[];
      try {
        jobs = await fetchPage(url);
      } catch (err) {
        console.error(`[tecnoempleo] Error fetching page ${page} for "${term}":`, err);
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

  console.log(`[tecnoempleo] Fetch complete — ${all.length} jobs`);
  return all;
}
