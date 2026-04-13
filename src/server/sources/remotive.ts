import type { Job } from '../types';

type JobPartial = Omit<Job, 'id' | 'match_score' | 'match_reasoning' | 'match_summary' | 'tags' | 'status' | 'seen_at'>;

const REMOTIVE_API = 'https://remotive.com/api/remote-jobs';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function formatLocation(candidateLocation: string): string {
  if (!candidateLocation || candidateLocation.toLowerCase() === 'worldwide') {
    return 'Remote';
  }
  return `Remote — ${candidateLocation}`;
}

export function parseRemotiveJobs(data: RemotiveResponse): JobPartial[] {
  const fetchedAt = new Date().toISOString();
  const jobs: JobPartial[] = [];

  for (const item of data.jobs) {
    if (!item.id || !item.title) continue;

    let description: string | null = stripHtml(item.description);
    if (description.length === 0) {
      description = null;
    } else if (description.length > 6000) {
      description = description.slice(0, 6000) + '\n[truncated]';
    }

    jobs.push({
      source: 'remotive',
      external_id: `remotive_${item.id}`,
      title: item.title.trim(),
      company: item.company_name.trim(),
      location: formatLocation(item.candidate_required_location),
      url: item.url,
      description,
      posted_at: item.publication_date ? new Date(item.publication_date).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }

  return jobs;
}

export async function fetchRemotive(): Promise<JobPartial[]> {
  const url = `${REMOTIVE_API}?category=software-dev`;
  console.log('[remotive] Fetching software-dev jobs...');

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[remotive] API returned ${response.status}`);
  }

  const data = (await response.json()) as RemotiveResponse;
  const jobs = parseRemotiveJobs(data);

  console.log(`[remotive] Fetch complete — ${jobs.length} jobs`);
  return jobs;
}
