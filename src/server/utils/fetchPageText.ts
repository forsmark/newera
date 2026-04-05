import { parse } from 'node-html-parser';

const TIMEOUT_MS = 10_000;
const STRIP_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'noscript', 'iframe'];

/**
 * Extract content from a JSON-LD <script type="application/ld+json"> block.
 * Returns a flat key: value string for fields that look like job content.
 */
function extractJsonLd(html: string, root: ReturnType<typeof parse>): string {
  const parts: string[] = [];
  root.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const data = JSON.parse(s.innerText) as Record<string, unknown>;
      const relevant = Object.entries(data).filter(
        ([, v]) => typeof v === 'string' && (v as string).length > 10,
      );
      if (relevant.length > 0) {
        parts.push(relevant.map(([k, v]) => `${k}: ${v}`).join('\n'));
      }
    } catch { /* malformed JSON — skip */ }
  });
  return parts.join('\n\n');
}

/**
 * Extract the job description from Nuxt 3's __NUXT_DATA__ serialised state.
 * The blob is a JSON array; we pull out all strings ≥150 chars, which in
 * practice captures the job description and skips short tokens/IDs.
 */
function extractNuxtData(root: ReturnType<typeof parse>): string {
  const el = root.querySelector('#__NUXT_DATA__');
  if (!el) return '';
  try {
    const raw = el.innerText;
    const strings: string[] = [];
    // Match quoted string values that are long enough to be description text
    for (const m of raw.matchAll(/"((?:[^"\\]|\\.){150,})"/g)) {
      strings.push(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, ' '));
    }
    return strings.join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Fetch a URL and return its text content, including content embedded in
 * JS-framework state blobs (Nuxt, Next.js) and structured data (JSON-LD).
 * Falls back to body text for traditional server-rendered pages.
 */
export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[fetchPageText] ${res.status} for ${url}`);
      return null;
    }

    const html = await res.text();
    const root = parse(html);

    // --- Extract structured content BEFORE stripping scripts ---

    const jsonLd = extractJsonLd(html, root);
    const nuxtData = extractNuxtData(root);

    // OG / meta description tags (often populated even on SPAs)
    const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
    const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    const metaPart = [ogDesc, metaDesc !== ogDesc ? metaDesc : ''].filter(Boolean).join('\n');

    // --- Strip noise and extract body text ---

    for (const tag of STRIP_TAGS) {
      root.querySelectorAll(tag).forEach(el => el.remove());
    }

    const content =
      root.querySelector('main') ??
      root.querySelector('article') ??
      root.querySelector('[class*="description"]') ??
      root.querySelector('body') ??
      root;

    const bodyText = content.innerText
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // --- Combine: structured data first, body text last ---
    // Structured data is preferred on JS-rendered pages where bodyText is thin.

    const combined = [jsonLd, nuxtData, metaPart, bodyText]
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join('\n\n');

    return combined.length > 0 ? combined : null;
  } catch (err) {
    console.warn(`[fetchPageText] Failed to fetch ${url}:`, (err as Error).message);
    return null;
  }
}
