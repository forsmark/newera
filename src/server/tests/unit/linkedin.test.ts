import { describe, it, expect } from 'bun:test';
import { parseJobCards, extractJobId, stripHtml } from '../../sources/linkedin';

// Minimal LinkedIn guest-API HTML card (matches the cardPattern regex in linkedin.ts)
const SAMPLE_HTML = `
<li>
<div data-entity-urn="urn:li:jobPosting:1234567890" class="base-card">
<h3 class="base-search-card__title">Senior Frontend Developer</h3>
<a class="hidden-nested-link" href="#">Acme Corp</a>
<span class="job-search-card__location">Copenhagen, Denmark</span>
<time class="job-search-card__listdate" datetime="2026-04-05T10:00:00.000Z">1 day ago</time>
<a class="base-card__full-link" href="https://dk.linkedin.com/jobs/view/1234567890/?trk=abc">View</a>
</div>
</li>
<li>
<div data-entity-urn="urn:li:jobPosting:9876543210" class="base-card">
<h3 class="base-search-card__title">Backend Engineer</h3>
<a class="hidden-nested-link" href="#">Beta Ltd</a>
<span class="job-search-card__location">Remote</span>
<a class="base-card__full-link" href="https://dk.linkedin.com/jobs/view/9876543210/">View</a>
</div>
</li>
`;

describe('parseJobCards', () => {
  it('returns one result per job card', () => {
    expect(parseJobCards(SAMPLE_HTML)).toHaveLength(2);
  });

  it('extracts job title', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[0].title).toBe('Senior Frontend Developer');
  });

  it('extracts company from hidden-nested-link', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[0].company).toBe('Acme Corp');
  });

  it('extracts location', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[0].location).toBe('Copenhagen, Denmark');
  });

  it('extracts LinkedIn URL', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[0].url).toContain('linkedin.com/jobs/view/1234567890');
  });

  it('extracts postedAt from datetime attribute', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[0].postedAt).toBe('2026-04-05T10:00:00.000Z');
  });

  it('returns null postedAt when no time element', () => {
    const jobs = parseJobCards(SAMPLE_HTML);
    expect(jobs[1].postedAt).toBeNull();
  });

  it('ignores cards without a URL', () => {
    const html = `<div data-entity-urn="urn:li:jobPosting:111"><h3 class="base-search-card__title">No URL Job</h3></div>`;
    expect(parseJobCards(html)).toHaveLength(0);
  });
});

describe('extractJobId', () => {
  it('extracts job ID from /jobs/view/ URL', () => {
    expect(extractJobId('https://www.linkedin.com/jobs/view/1234567890/')).toBe('li_1234567890');
  });

  it('extracts job ID from URL with tracking params', () => {
    expect(extractJobId('https://www.linkedin.com/jobs/view/1234567890/?trk=abc&currentJobId=1234567890')).toBe('li_1234567890');
  });

  it('falls back to currentJobId param when no /view/ path', () => {
    expect(extractJobId('https://www.linkedin.com/jobs/search/?currentJobId=999')).toBe('li_999');
  });

  it('produces stable IDs for the same URL', () => {
    const url = 'https://www.linkedin.com/jobs/view/42/';
    expect(extractJobId(url)).toBe(extractJobId(url));
  });
});

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('collapses multiple spaces', () => {
    expect(stripHtml('<p>  lots   of   space  </p>')).toBe('lots of space');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('just text')).toBe('just text');
  });
});
