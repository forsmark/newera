import { describe, it, expect } from 'bun:test';
import { parseRssItems, extractJobId, stripHtml } from '../../sources/linkedin';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>LinkedIn Jobs</title>
    <item>
      <title><![CDATA[Acme Corp is hiring Senior Frontend Developer in Copenhagen]]></title>
      <link>https://www.linkedin.com/jobs/view/1234567890/?trk=abc&currentJobId=1234567890</link>
      <description><![CDATA[<p>We are looking for a <strong>Senior Frontend Developer</strong> to join our team.</p>]]></description>
      <pubDate>Sat, 05 Apr 2026 10:00:00 +0000</pubDate>
      <guid>https://www.linkedin.com/jobs/view/1234567890/</guid>
    </item>
    <item>
      <title>Junior Developer at Beta Ltd</title>
      <link>https://www.linkedin.com/jobs/view/9876543210/</link>
      <description>Plain text description here.</description>
      <pubDate>Fri, 04 Apr 2026 09:00:00 +0000</pubDate>
      <guid>https://www.linkedin.com/jobs/view/9876543210/</guid>
    </item>
  </channel>
</rss>`;

describe('parseRssItems', () => {
  it('returns one item per <item> block', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items).toHaveLength(2);
  });

  it('extracts company from "Acme Corp is hiring …" title', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[0].company).toBe('Acme Corp');
  });

  it('strips the "is hiring" prefix from the title', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[0].title).toBe('Senior Frontend Developer in Copenhagen');
  });

  it('extracts company from "… at Beta Ltd" title', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[1].company).toBe('Beta Ltd');
  });

  it('strips HTML from CDATA description', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[0].description).not.toContain('<p>');
    expect(items[0].description).toContain('Senior Frontend Developer');
  });

  it('preserves plain text description', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[1].description).toBe('Plain text description here.');
  });

  it('parses pubDate', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items[0].pubDate).toBe('Sat, 05 Apr 2026 10:00:00 +0000');
  });

  it('skips items with no link', () => {
    const rss = `<rss><channel><item><title>No Link Job</title></item></channel></rss>`;
    expect(parseRssItems(rss)).toHaveLength(0);
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
