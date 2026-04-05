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
  match_score: number | null;   // 0-100, null until analyzed
  match_reasoning: string | null;
  match_summary: string | null; // factual role overview, null until analyzed
  tags: string[] | null;        // tech stack tags, null until analyzed
  status: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at: string | null;
  fetched_at: string;
}

export interface Preferences {
  location: string;            // e.g. "Copenhagen / Greater Copenhagen"
  commutableLocations: string; // e.g. "Malmö, Sweden"
  remote: 'any' | 'onsite' | 'hybrid' | 'remote';
  seniority: 'any' | 'junior' | 'mid' | 'senior' | 'lead';
  minSalaryDkk: number | null;
  techInterests: string;       // comma-separated
  techAvoid: string;           // comma-separated
  companyBlacklist: string;    // newline-separated
  linkedinSearchTerms: string; // newline-separated
  jobindexSearchTerms: string; // newline-separated
  notes: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  location: '',
  commutableLocations: '',
  remote: 'any',
  seniority: 'any',
  minSalaryDkk: null,
  techInterests: '',
  techAvoid: '',
  companyBlacklist: '',
  linkedinSearchTerms: '',
  jobindexSearchTerms: '',
  notes: '',
};

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
