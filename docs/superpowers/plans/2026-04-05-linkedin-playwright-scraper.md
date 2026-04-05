# LinkedIn Playwright Scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LinkedIn guest API scraper with a Playwright-based scraper that uses the user's existing browser profile (already logged into LinkedIn), getting the same results as the real feed.

**Architecture:** A new source `src/server/sources/linkedin-playwright.ts` that launches Chromium with a persistent profile via the `playwright` npm package. Swaps in alongside the existing guest API scraper; the old scraper stays as fallback. No proxy required — personal-use, low volume.

**Tech Stack:** Playwright (Node.js/Bun), `@playwright/browser-chromium` or system Chrome via `executablePath`

**Key decisions:**
- Use the user's real Chrome profile (`~/.config/google-chrome/Default` on Linux) so no login is needed
- Run headless; fall back to headed if LinkedIn blocks headless fingerprint
- Rate-limit to one page request per 3–5 seconds to stay under LinkedIn's radar
- Fetch up to 3 pages per keyword (75 jobs) — more than the guest API but still conservative
- Description: visit each job's LinkedIn detail page (authenticated, gets full description)

---

### Task 1: Add Playwright dependency and verify Chrome profile exists

**Files:**
- Modify: `src/server/package.json`

- [ ] **Step 1: Install playwright**

```bash
cd src/server
bun add playwright
bunx playwright install chromium
```

Expected: `playwright` appears in `src/server/package.json` dependencies.

- [ ] **Step 2: Verify Chrome profile path**

```bash
ls ~/.config/google-chrome/Default/Cookies
# If missing, try:
ls ~/.config/chromium/Default/Cookies
```

Note which path exists — this becomes `CHROME_PROFILE` in config.

- [ ] **Step 3: Write a smoke-test script**

Create `src/server/scripts/test-playwright.ts`:

```typescript
import { chromium } from 'playwright';

const PROFILE = process.env.HOME + '/.config/google-chrome';

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const page = await browser.newPage();
await page.goto('https://www.linkedin.com/jobs/search/?keywords=frontend+developer&geoId=102194656', {
  waitUntil: 'domcontentloaded',
  timeout: 30_000,
});
console.log('Title:', await page.title());
const cards = await page.locator('.job-card-container').count();
console.log('Job cards found:', cards);
await browser.close();
```

Run: `bun run src/server/scripts/test-playwright.ts`
Expected: Title contains "LinkedIn" and card count > 0.

If LinkedIn redirects to login page, the profile path is wrong or not logged in.

- [ ] **Step 4: Commit**

```bash
git add src/server/package.json src/server/bun.lock src/server/scripts/test-playwright.ts
git commit -m "chore: add playwright dependency for LinkedIn scraper"
```

---

### Task 2: Implement the Playwright LinkedIn scraper

**Files:**
- Create: `src/server/sources/linkedin-playwright.ts`

The scraper follows the same interface as the existing `linkedin.ts` — exports `fetchLinkedIn(): Promise<JobPartial[]>`.

- [ ] **Step 1: Write the failing test**

Create `src/server/tests/unit/linkedin-playwright.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';

// We can't run a real browser in tests, so we test the parsing helpers.
// The integration is covered by the smoke-test script.

import { parseJobCards, parseJobDetail } from '../../sources/linkedin-playwright';

const SAMPLE_CARD_HTML = `
  <div class="job-card-container" data-job-id="1234567890">
    <a class="job-card-container__link" href="/jobs/view/1234567890/">
      <div class="job-card-list__title--link">Senior Frontend Developer</div>
    </a>
    <div class="artdeco-entity-lockup__subtitle">Acme Corp</div>
    <div class="job-card-container__metadata-wrapper">Copenhagen, Denmark</div>
    <time datetime="2026-04-05">1 day ago</time>
  </div>
`;

describe('parseJobCards', () => {
  it('extracts job id from data-job-id', () => {
    const jobs = parseJobCards(SAMPLE_CARD_HTML);
    expect(jobs[0].id).toBe('1234567890');
  });
  it('extracts title', () => {
    expect(parseJobCards(SAMPLE_CARD_HTML)[0].title).toBe('Senior Frontend Developer');
  });
  it('extracts company', () => {
    expect(parseJobCards(SAMPLE_CARD_HTML)[0].company).toBe('Acme Corp');
  });
  it('extracts location', () => {
    expect(parseJobCards(SAMPLE_CARD_HTML)[0].location).toBe('Copenhagen, Denmark');
  });
  it('constructs full LinkedIn URL', () => {
    expect(parseJobCards(SAMPLE_CARD_HTML)[0].url).toContain('/jobs/view/1234567890/');
  });
});
```

Run: `bun test tests/unit/linkedin-playwright.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 2: Create `src/server/sources/linkedin-playwright.ts`**

```typescript
import { chromium, type BrowserContext } from 'playwright';
import { parse } from 'node-html-parser';
import type { Job } from '../types';
import { DATA_DIR } from '../config';
import { join } from 'path';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

interface ParsedCard {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedAt: string | null;
}

const CHROME_PROFILE = process.env.HOME + '/.config/google-chrome';
const BASE_URL = 'https://www.linkedin.com';
const GEO_ID = '102194656'; // Greater Copenhagen
const DELAY_MS = 3_000;     // 3s between page requests
const MAX_PAGES = 3;        // 75 jobs per keyword max
const PAGE_SIZE = 25;

/** Parse job cards from the LinkedIn search results page HTML. */
export function parseJobCards(html: string): ParsedCard[] {
  const root = parse(html);
  const cards = root.querySelectorAll('.job-card-container');
  return cards.flatMap(card => {
    const id = card.getAttribute('data-job-id') ?? '';
    const titleEl = card.querySelector('.job-card-list__title--link') ??
                    card.querySelector('.job-card-container__link span');
    const title = titleEl?.innerText.trim() ?? '';
    const company = card.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim() ?? '';
    const location = card.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim() ?? '';
    const href = card.querySelector('a.job-card-container__link')?.getAttribute('href') ?? '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const postedAt = card.querySelector('time')?.getAttribute('datetime') ?? null;
    if (!id || !title || !url) return [];
    return [{ id, title, company, location, url, postedAt }];
  });
}

/** Parse the full job description from a LinkedIn job detail page HTML. */
export function parseJobDetail(html: string): string | null {
  const root = parse(html);
  const el = root.querySelector('.job-description__content') ??
             root.querySelector('.description__text') ??
             root.querySelector('[class*="description"]');
  if (!el) return null;
  const text = el.innerText.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 0 ? text : null;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function loadKeywords(): Promise<string[]> {
  const DEFAULT = ['frontend developer', 'web developer'];
  try {
    const text = await Bun.file(join(DATA_DIR, 'preferences.md')).text();
    const match = text.match(/##\s+Search(?:\s+[Tt]erms|\s+[Qq]ueries)?\s*\n((?:\s*[-*]\s*.+\n?)+)/);
    if (!match) return DEFAULT;
    const lines = match[1]
      .split('\n')
      .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
      .map(l => l.replace(/\s+(Copenhagen|København|Denmark|Danmark).*$/i, '').trim())
      .filter(l => l.length > 0);
    return lines.length > 0 ? lines : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

async function scrapeKeyword(ctx: BrowserContext, keyword: string, fetchedAt: string): Promise<JobPartial[]> {
  const page = await ctx.newPage();
  const collected: ParsedCard[] = [];

  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const start = p * PAGE_SIZE;
      const url = `${BASE_URL}/jobs/search/?keywords=${encodeURIComponent(keyword)}&geoId=${GEO_ID}&f_TPR=r604800&sortBy=R&start=${start}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

      // Check we're not on a login/authwall page
      if (page.url().includes('/login') || page.url().includes('/authwall')) {
        console.warn('[linkedin-pw] Hit auth wall — profile not logged in or session expired');
        break;
      }

      const html = await page.content();
      const cards = parseJobCards(html);
      if (cards.length === 0) break;
      collected.push(...cards);
      console.log(`[linkedin-pw] "${keyword}" page ${p + 1}: ${cards.length} cards`);
      if (cards.length < PAGE_SIZE) break;
      if (p < MAX_PAGES - 1) await sleep(DELAY_MS);
    }
  } finally {
    await page.close();
  }

  // Fetch descriptions — 1 at a time to be polite, with delay
  const results: JobPartial[] = [];
  for (const card of collected) {
    const descPage = await ctx.newPage();
    let description: string | null = null;
    try {
      await descPage.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const html = await descPage.content();
      description = parseJobDetail(html);
      await sleep(DELAY_MS);
    } catch (err) {
      console.warn(`[linkedin-pw] Failed to fetch description for ${card.id}:`, (err as Error).message);
    } finally {
      await descPage.close();
    }
    results.push({
      source: 'linkedin',
      external_id: `li_${card.id}`,
      title: card.title,
      company: card.company,
      location: card.location,
      url: card.url,
      description: description ? description.slice(0, 6_000) : null,
      posted_at: card.postedAt ? new Date(card.postedAt).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }

  return results;
}

export async function fetchLinkedIn(): Promise<JobPartial[]> {
  const keywords = await loadKeywords();
  const fetchedAt = new Date().toISOString();
  let ctx: BrowserContext | null = null;

  try {
    ctx = await chromium.launchPersistentContext(CHROME_PROFILE, {
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: { width: 1280, height: 800 },
    });

    const allJobs: JobPartial[] = [];

    for (const kw of keywords) {
      try {
        const jobs = await scrapeKeyword(ctx, kw, fetchedAt);
        console.log(`[linkedin-pw] "${kw}" → ${jobs.length} jobs`);
        allJobs.push(...jobs);
      } catch (err) {
        console.error(`[linkedin-pw] Failed for "${kw}":`, err);
      }
    }

    // Deduplicate by external_id
    const seen = new Set<string>();
    return allJobs.filter(j => {
      if (seen.has(j.external_id)) return false;
      seen.add(j.external_id);
      return true;
    });
  } finally {
    await ctx?.close();
  }
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/unit/linkedin-playwright.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/sources/linkedin-playwright.ts src/server/tests/unit/linkedin-playwright.test.ts
git commit -m "feat: LinkedIn Playwright scraper — authenticated, full results"
```

---

### Task 3: Wire up the new scraper; keep old as fallback

**Files:**
- Modify: `src/server/scheduler.ts`

The scheduler currently calls `fetchLinkedIn()` from `linkedin.ts`. Change it to try the Playwright scraper first and fall back to the guest API if it fails (e.g. browser not available, auth wall hit).

- [ ] **Step 1: Write the failing test**

Add to `src/server/tests/scheduler.test.ts` (or create if not present):

```typescript
// Test that linkedin source falls back to guest API when playwright fails
import { describe, it, expect, mock } from 'bun:test';
// (Integration-level: verify scheduler handles source errors gracefully)
```

(The scheduler's error handling is already tested implicitly — this step is confirming no regression.)

- [ ] **Step 2: Update the scheduler**

In `src/server/scheduler.ts`, find where `fetchLinkedIn` is imported and called:

```typescript
// Before:
import { fetchLinkedIn } from './sources/linkedin';

// After:
import { fetchLinkedIn as fetchLinkedInGuest } from './sources/linkedin';
import { fetchLinkedIn as fetchLinkedInPlaywright } from './sources/linkedin-playwright';

async function fetchLinkedInWithFallback() {
  try {
    const jobs = await fetchLinkedInPlaywright();
    if (jobs.length > 0) return jobs;
    console.warn('[scheduler] Playwright scraper returned 0 jobs, falling back to guest API');
  } catch (err) {
    console.warn('[scheduler] Playwright scraper failed, falling back to guest API:', (err as Error).message);
  }
  return fetchLinkedInGuest();
}
```

Then replace the `fetchLinkedIn()` call in the fetch loop with `fetchLinkedInWithFallback()`.

- [ ] **Step 3: Run all server tests**

```bash
bun test
```

Expected: All 60 tests pass.

- [ ] **Step 4: Integration smoke test**

```bash
bun run src/server/scripts/test-playwright.ts
```

Expected: Card count > 0 and title contains "LinkedIn".

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduler.ts
git commit -m "feat: use Playwright LinkedIn scraper with guest API fallback"
```

---

### Task 4: Expose Chrome profile path as config

**Files:**
- Modify: `src/server/config.ts`
- Modify: `src/server/sources/linkedin-playwright.ts`

The profile path is currently hardcoded. Make it configurable via env var so it can be overridden without code changes.

- [ ] **Step 1: Add to config.ts**

```typescript
// In src/server/config.ts — add:
export const CHROME_PROFILE_PATH = process.env.CHROME_PROFILE_PATH
  ?? (process.env.HOME + '/.config/google-chrome');
```

- [ ] **Step 2: Update linkedin-playwright.ts**

```typescript
// Replace the hardcoded constant:
import { DATA_DIR, CHROME_PROFILE_PATH } from '../config';
// Remove: const CHROME_PROFILE = process.env.HOME + '/.config/google-chrome';
// Use: CHROME_PROFILE_PATH everywhere CHROME_PROFILE was used
```

- [ ] **Step 3: Add to .env.example**

```bash
# Path to Chrome/Chromium user profile for LinkedIn scraping
# Defaults to ~/.config/google-chrome
# CHROME_PROFILE_PATH=/home/youruser/.config/google-chrome
```

- [ ] **Step 4: Run tests and commit**

```bash
bun test
git add src/server/config.ts src/server/sources/linkedin-playwright.ts .env.example
git commit -m "config: CHROME_PROFILE_PATH env var for LinkedIn Playwright scraper"
```

---

## Notes

- **LinkedIn DOM changes**: LinkedIn updates their HTML structure regularly. If scraping breaks, inspect the live page with `playwright-cli snapshot` to find new selectors and update `parseJobCards`/`parseJobDetail`.
- **Session expiry**: If the Chrome profile session expires, the scraper hits the auth wall and falls back to the guest API. The user re-logs into LinkedIn normally in their browser to restore.
- **Headless detection**: If LinkedIn starts blocking headless requests, change `headless: true` to `headless: false` (headed but in background). This is less elegant but more reliable.
- **Volume**: 3 pages × N keywords × 3s delay = ~10–15 min for a full fetch. Consider running the Playwright scraper less frequently (e.g. every 6h) while the guest API runs every 2h.
