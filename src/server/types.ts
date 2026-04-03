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
  match_score: number | null;   // 0-100, null until analyzed
  match_reasoning: string | null;
  tags: string[] | null;        // tech stack tags, null until analyzed
  status: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at: string | null;
  fetched_at: string;
}

export interface Application {
  job_id: string;
  kanban_column: 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
}

export interface ApplicationWithJob extends Application {
  job: Job;
}
