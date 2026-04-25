export interface Job {
  id: string;
  source: 'jobindex' | 'linkedin' | 'remotive' | 'arbeitnow' | 'remoteok' | 'infojobs' | 'tecnoempleo';
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
  prefs_hash: string | null;
  content_fingerprint: string | null;
  duplicate_of: string | null;
  link_status: 'unchecked' | 'active' | 'expired' | 'unknown';
  link_checked_at: string | null;
  status: 'new' | 'saved' | 'applied' | 'rejected';
  seen_at: string | null;
  fetched_at: string;
}

export interface Preferences {
  location: string;            // e.g. "Copenhagen / Greater Copenhagen"
  commutableLocations: string; // e.g. "Malmö, Sweden"
  remote: string[];  // subset of ['onsite','hybrid','remote'], empty = any
  seniority: 'any' | 'junior' | 'mid' | 'senior' | 'lead';
  minSalary: number | null;
  salaryCurrency: 'dkk' | 'eur' | 'usd';
  techInterests: string;       // comma-separated
  techAvoid: string;           // comma-separated
  companyBlacklist: string;    // newline-separated
  country: 'denmark' | 'spain';
  includeRemote: boolean;
  searchTerms: string; // newline-separated; used by all sources that support keyword search
  knownLanguages: string;       // comma-separated spoken languages (e.g. "English, Danish")
  notes: string;
  lowScoreThreshold: number;       // jobs below this score are considered "low score" (0-100)
  defaultHideLowScore: boolean;    // initial state of the "Hide <N" checkbox
  defaultHideUnscored: boolean;    // initial state of the "Hide unscored" checkbox
  autoRejectLowScore: boolean;     // automatically reject new jobs that score below the threshold
  model: string;               // llama.cpp model used for scoring/analysis
  llmProvider: 'ollama' | 'lmstudio' | 'llamacpp';
  llmBaseUrl: string;
  fetchIntervalHours: number;  // how often to auto-fetch jobs (hours)
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  telegramNotifyThreshold: number;  // minimum score to include in Telegram notification
  appBaseUrl: string;               // base URL for links in notifications (e.g. Tailscale IP)
  disabledSources: string[];            // sources to skip during fetch, empty = all active
  hideJobsFromDisabledSources: boolean; // hide jobs from disabled sources in job list
}

export const DEFAULT_PREFERENCES: Preferences = {
  location: '',
  commutableLocations: '',
  remote: [],
  seniority: 'any',
  minSalary: null,
  salaryCurrency: 'dkk',
  techInterests: '',
  techAvoid: '',
  companyBlacklist: '',
  country: 'denmark',
  includeRemote: true,
  searchTerms: '',
  knownLanguages: 'English',
  notes: '',
  lowScoreThreshold: 20,
  defaultHideLowScore: true,
  defaultHideUnscored: false,
  autoRejectLowScore: false,
  model: 'gemma4:26b',
  llmProvider: 'ollama',
  llmBaseUrl: '',
  fetchIntervalHours: 2,
  telegramBotToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  telegramNotifyThreshold: 80,
  appBaseUrl: 'http://localhost:3000',
  disabledSources: ['infojobs', 'tecnoempleo'],
  hideJobsFromDisabledSources: false,
};

export interface Application {
  job_id: string;
  kanban_column: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  notes: string | null;
  interview_at: string | null;
  applied_at: string;
  updated_at: string;
  cover_letter: string | null;
  archived_description: string | null;
}

export interface ApplicationWithJob extends Application {
  job: Job;
}
