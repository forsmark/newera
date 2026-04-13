import { describe, test, expect } from 'bun:test';
import { parseRemotiveJobs } from '../remotive';

const SAMPLE_API_RESPONSE = {
  'job-count': 2,
  jobs: [
    {
      id: 1234567,
      url: 'https://remotive.com/remote-jobs/software-dev/senior-frontend-1234567',
      title: 'Senior Frontend Engineer',
      company_name: 'Acme Corp',
      category: 'Software Development',
      tags: ['react', 'typescript'],
      job_type: 'full_time',
      publication_date: '2026-04-10T12:00:00',
      candidate_required_location: 'Europe',
      salary: '$80k - $120k',
      description: '<p>We are looking for a <strong>senior frontend engineer</strong> to join our team.</p><ul><li>React</li><li>TypeScript</li></ul>',
    },
    {
      id: 7654321,
      url: 'https://remotive.com/remote-jobs/software-dev/backend-dev-7654321',
      title: 'Backend Developer',
      company_name: '  SpaceCo  ',
      category: 'Software Development',
      tags: [],
      job_type: 'full_time',
      publication_date: '2026-04-09T08:30:00',
      candidate_required_location: 'Worldwide',
      salary: '',
      description: '<div>Build APIs with <b>Node.js</b>.</div>',
    },
  ],
};

describe('parseRemotiveJobs', () => {
  test('maps API response to JobPartial array', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs).toHaveLength(2);

    expect(jobs[0].source).toBe('remotive');
    expect(jobs[0].external_id).toBe('remotive_1234567');
    expect(jobs[0].title).toBe('Senior Frontend Engineer');
    expect(jobs[0].company).toBe('Acme Corp');
    expect(jobs[0].url).toBe('https://remotive.com/remote-jobs/software-dev/senior-frontend-1234567');
    expect(jobs[0].posted_at).toBe('2026-04-10T12:00:00.000Z');
    expect(jobs[0].location).toBe('Remote — Europe');
  });

  test('strips HTML from description', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[0].description).not.toContain('<p>');
    expect(jobs[0].description).not.toContain('<strong>');
    expect(jobs[0].description).toContain('senior frontend engineer');
    expect(jobs[0].description).toContain('React');
  });

  test('trims company name whitespace', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].company).toBe('SpaceCo');
  });

  test('truncates long descriptions to 6000 chars', () => {
    const longResponse = {
      'job-count': 1,
      jobs: [{
        ...SAMPLE_API_RESPONSE.jobs[0],
        description: '<p>' + 'A'.repeat(7000) + '</p>',
      }],
    };
    const jobs = parseRemotiveJobs(longResponse);
    expect(jobs[0].description!.length).toBeLessThanOrEqual(6012); // 6000 + '\n[truncated]'
    expect(jobs[0].description).toEndWith('\n[truncated]');
  });

  test('skips jobs with missing title or id', () => {
    const badResponse = {
      'job-count': 2,
      jobs: [
        { ...SAMPLE_API_RESPONSE.jobs[0], id: 0 },
        { ...SAMPLE_API_RESPONSE.jobs[1], title: '' },
      ],
    };
    const jobs = parseRemotiveJobs(badResponse);
    expect(jobs).toHaveLength(0);
  });

  test('handles empty jobs array', () => {
    const jobs = parseRemotiveJobs({ 'job-count': 0, jobs: [] });
    expect(jobs).toHaveLength(0);
  });

  test('sets location to "Remote" when candidate_required_location is Worldwide', () => {
    const jobs = parseRemotiveJobs(SAMPLE_API_RESPONSE);
    expect(jobs[1].location).toBe('Remote');
  });
});
