export interface Job {
  id: string;
  source: 'jobindex' | 'linkedin';
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  description: string | null;
  posted_at: string | null;
  match_score: number | null;
  match_reasoning: string | null;
  match_summary: string | null;
  tags: string[] | null;
  work_type: 'remote' | 'hybrid' | 'onsite' | null;
  duplicate_of: string | null;
  link_status: 'unchecked' | 'active' | 'expired' | 'unknown';
  status: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at: string | null;
  fetched_at: string;
}

export interface AppStatus {
  last_fetch_at: string | null;
  counts: { status: string; count: number }[];
  is_fetching?: boolean;
  unscored_jobs?: number;
  score_distribution?: {
    green: number;
    amber: number;
    grey: number;
    pending: number;
  };
  ollama_available?: boolean | null;
  last_fetch_new_jobs?: number;
  stale_count?: number;
  data_files?: { resume: boolean; preferences: boolean };
}

export interface Artifact {
  id: string;
  job_id: string;
  type: 'file' | 'link';
  name: string;
  url: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface ApplicationEvent {
  id: number;
  job_id: string;
  from_column: string | null;
  to_column: string;
  created_at: string;
}

export interface Application {
  job_id: string;
  kanban_column: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
  archived_description: string | null;
  cover_letter: string | null;
  job: Job;
  events: ApplicationEvent[];
}
