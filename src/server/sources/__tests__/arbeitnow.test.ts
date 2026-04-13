import { describe, test, expect } from 'bun:test';
import { parseArbeitnowJobs } from '../arbeitnow';

const SAMPLE_API_RESPONSE = {
  data: [
    {
      slug: 'senior-frontend-dev-12345',
      company_name: 'Acme Corp',
      title: 'Senior Frontend Developer',
      description: '<p>We are looking for a <strong>senior frontend developer</strong> to join our team.</p><ul><li>React</li><li>TypeScript</li></ul>',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/acme/senior-frontend-dev-12345',
      tags: ['React', 'TypeScript'],
      job_types: ['full_time'],
      location: 'Berlin',
      created_at: 1776090628,
    },
    {
      slug: 'backend-engineer-67890',
      company_name: '  SpaceCo  ',
      title: 'Backend Engineer',
      description: '<div>Build APIs with <b>Node.js</b>.</div>',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/spaceco/backend-engineer-67890',
      tags: [],
      job_types: ['full_time'],
      location: '',
      created_at: 1776004228,
    },
  ],
  links: { next: null, prev: null },
  meta: { current_page: 1, last_page: 1 },
};

describe('parseArbeitnowJobs', () => {
  test('maps API response to JobPartial array', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs).toHaveLength(2);

    expect(jobs[0].source).toBe('arbeitnow');
    expect(jobs[0].external_id).toBe('arbeitnow_senior-frontend-dev-12345');
    expect(jobs[0].title).toBe('Senior Frontend Developer');
    expect(jobs[0].company).toBe('Acme Corp');
    expect(jobs[0].url).toBe('https://www.arbeitnow.com/jobs/acme/senior-frontend-dev-12345');
    expect(jobs[0].location).toBe('Remote — Berlin');
  });

  test('strips HTML from description', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs[0].description).not.toContain('<p>');
    expect(jobs[0].description).not.toContain('<strong>');
    expect(jobs[0].description).toContain('senior frontend developer');
    expect(jobs[0].description).toContain('React');
  });

  test('trims company name whitespace', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].company).toBe('SpaceCo');
  });

  test('truncates long descriptions to 6000 chars', () => {
    const longResponse = {
      ...SAMPLE_API_RESPONSE,
      data: [{
        ...SAMPLE_API_RESPONSE.data[0],
        description: '<p>' + 'A'.repeat(7000) + '</p>',
      }],
    };
    const jobs = parseArbeitnowJobs(longResponse);
    expect(jobs[0].description!.length).toBeLessThanOrEqual(6012); // 6000 + '\n[truncated]'
    expect(jobs[0].description).toEndWith('\n[truncated]');
  });

  test('skips jobs with missing slug or title', () => {
    const badResponse = {
      ...SAMPLE_API_RESPONSE,
      data: [
        { ...SAMPLE_API_RESPONSE.data[0], slug: '' },
        { ...SAMPLE_API_RESPONSE.data[1], title: '' },
      ],
    };
    const jobs = parseArbeitnowJobs(badResponse);
    expect(jobs).toHaveLength(0);
  });

  test('handles empty data array', () => {
    const jobs = parseArbeitnowJobs({
      data: [],
      links: { next: null, prev: null },
      meta: { current_page: 1, last_page: 1 },
    });
    expect(jobs).toHaveLength(0);
  });

  test('sets location to "Remote" when location is empty', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].location).toBe('Remote');
  });

  test('sets location to "Remote — {location}" when location is provided', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs[0].location).toBe('Remote — Berlin');
  });

  test('skips non-remote jobs', () => {
    const mixedResponse = {
      ...SAMPLE_API_RESPONSE,
      data: [
        { ...SAMPLE_API_RESPONSE.data[0], remote: true },
        { ...SAMPLE_API_RESPONSE.data[1], remote: false },
      ],
    };
    const jobs = parseArbeitnowJobs(mixedResponse);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].external_id).toBe('arbeitnow_senior-frontend-dev-12345');
  });

  test('converts created_at unix timestamp to ISO string', () => {
    const jobs = parseArbeitnowJobs(SAMPLE_API_RESPONSE);
    expect(jobs[0].posted_at).toBe(new Date(1776090628 * 1000).toISOString());
  });
});
