export interface Job {
  id: string;
  source: 'jsearch' | 'jobindex';
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  description: string | null;
  posted_at: string | null;
  match_score: number | null;
  match_reasoning: string | null;
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
}

export interface Application {
  job_id: string;
  kanban_column: 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
  job: Job;
}
