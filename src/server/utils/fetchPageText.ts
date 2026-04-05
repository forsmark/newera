import { parse } from 'node-html-parser';

const TIMEOUT_MS = 10_000;
const STRIP_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'noscript', 'iframe'];

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

    // Remove noise elements before extracting text
    for (const tag of STRIP_TAGS) {
      root.querySelectorAll(tag).forEach(el => el.remove());
    }

    // Try progressively broader content containers
    const content =
      root.querySelector('main') ??
      root.querySelector('article') ??
      root.querySelector('[class*="description"]') ??
      root.querySelector('body') ??
      root;

    const text = content.innerText
      .replace(/[ \t]{2,}/g, ' ')       // collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')        // collapse blank lines
      .trim();

    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn(`[fetchPageText] Failed to fetch ${url}:`, (err as Error).message);
    return null;
  }
}
