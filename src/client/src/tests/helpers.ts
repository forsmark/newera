import type { Job, Application } from '../types';

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    source: 'linkedin',
    external_id: 'ext-1',
    title: 'Frontend Developer',
    company: 'Acme Corp',
    location: 'Copenhagen',
    url: 'https://example.com/jobs/1',
    description: 'A great job opportunity.',
    posted_at: '2026-04-01T00:00:00Z',
    match_score: 85,
    match_reasoning: 'Strong React skills match the requirements.',
    match_summary: 'This role builds React components for a fintech app.',
    tags: ['React', 'TypeScript'],
    work_type: null,
    duplicate_of: null,
    link_status: 'unchecked' as const,
    status: 'new',
    seen_at: null,
    fetched_at: '2026-04-05T00:00:00Z',
    ...overrides,
  };
}

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    job_id: 'job-1',
    kanban_column: 'applied',
    notes: null,
    interview_at: null,
    applied_at: '2026-04-05T00:00:00Z',
    updated_at: '2026-04-05T00:00:00Z',
    job: makeJob(),
    ...overrides,
  };
}
