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
  work_type: 'remote' | 'hybrid' | 'onsite' | null; // work arrangement, null until analyzed
  status: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at: string | null;
  fetched_at: string;
}

export interface Preferences {
  location: string;            // e.g. "Copenhagen / Greater Copenhagen"
  commutableLocations: string; // e.g. "Malmö, Sweden"
  remote: string[];  // subset of ['onsite','hybrid','remote'], empty = any
  seniority: 'any' | 'junior' | 'mid' | 'senior' | 'lead';
  minSalaryDkk: number | null;
  techInterests: string;       // comma-separated
  techAvoid: string;           // comma-separated
  companyBlacklist: string;    // newline-separated
  linkedinSearchTerms: string; // newline-separated
  jobindexSearchTerms: string; // newline-separated
  notes: string;
  lowScoreThreshold: number;   // jobs below this score are considered "low score" (0-100)
  autoRejectLowScore: boolean; // automatically reject new jobs that score below the threshold
  ollamaModel: string;         // Ollama model used for scoring/analysis
  fetchIntervalHours: number;  // how often to auto-fetch jobs (hours)
}

export const DEFAULT_PREFERENCES: Preferences = {
  location: '',
  commutableLocations: '',
  remote: [],
  seniority: 'any',
  minSalaryDkk: null,
  techInterests: '',
  techAvoid: '',
  companyBlacklist: '',
  linkedinSearchTerms: '',
  jobindexSearchTerms: '',
  notes: '',
  lowScoreThreshold: 20,
  autoRejectLowScore: false,
  ollamaModel: 'gemma4:26b',
  fetchIntervalHours: 2,
};

export interface Application {
  job_id: string;
  kanban_column: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
  cover_letter: string | null;
}

export interface ApplicationWithJob extends Application {
  job: Job;
}
