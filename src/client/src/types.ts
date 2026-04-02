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
}
