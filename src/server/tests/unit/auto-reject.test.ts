import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';
import db from '../../db';
import { setSetting } from '../../settings';
import { maybeAutoReject, analyzeUnscoredJobs } from '../../scheduler';
import { clearDb, seedJob } from '../helpers/db';

function clearSettings() {
  db.run('DELETE FROM settings');
}

function setPrefs(overrides: Record<string, unknown>) {
  setSetting('preferences', JSON.stringify(overrides));
}

function jobStatus(id: string): string {
  const row = db.query<{ status: string }, [string]>('SELECT status FROM jobs WHERE id = ?').get(id);
  return row!.status;
}

beforeEach(() => {
  clearSettings();
  clearDb();
});

// ─── maybeAutoReject ──────────────────────────────────────────────────────────

describe('maybeAutoReject', () => {
  it('does nothing when autoRejectLowScore is false', () => {
    setPrefs({ autoRejectLowScore: false, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: 10 });

    maybeAutoReject(id, 10);

    expect(jobStatus(id)).toBe('new');
  });

  it('does nothing when score is at the threshold', () => {
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: 50 });

    maybeAutoReject(id, 50);

    expect(jobStatus(id)).toBe('new');
  });

  it('does nothing when score is above the threshold', () => {
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: 75 });

    maybeAutoReject(id, 75);

    expect(jobStatus(id)).toBe('new');
  });

  it('rejects a new job when score is below threshold and auto-reject is on', () => {
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: 30 });

    maybeAutoReject(id, 30);

    expect(jobStatus(id)).toBe('rejected');
  });

  it('does not reject a saved job even if score is below threshold', () => {
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'saved', match_score: 10 });

    maybeAutoReject(id, 10);

    expect(jobStatus(id)).toBe('saved');
  });

  it('does not reject an applied job even if score is below threshold', () => {
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'applied', match_score: 5 });

    maybeAutoReject(id, 5);

    expect(jobStatus(id)).toBe('applied');
  });

  it('uses the default threshold (20) when not configured', () => {
    setPrefs({ autoRejectLowScore: true }); // no lowScoreThreshold → default 20
    const { id } = seedJob({ status: 'new', match_score: 15 });

    maybeAutoReject(id, 15);

    expect(jobStatus(id)).toBe('rejected');
  });

  it('does not reject when score equals default threshold', () => {
    setPrefs({ autoRejectLowScore: true });
    const { id } = seedJob({ status: 'new', match_score: 20 });

    maybeAutoReject(id, 20);

    expect(jobStatus(id)).toBe('new');
  });
});

// ─── analyzeUnscoredJobs — autoReject flag ────────────────────────────────────

// Mocks the Ollama fetch response returning a score below the threshold.
function ollamaResponse(score: number) {
  const llmJson = JSON.stringify({
    match_score: score,
    match_reasoning: 'test reasoning',
    match_summary: 'test summary',
    tags: ['React', 'TypeScript'], // non-empty to skip second tag-extraction pass
    work_type: null,
  });
  return Promise.resolve(
    new Response(JSON.stringify({ content: llmJson }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('analyzeUnscoredJobs — autoReject flag', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('regression: does not auto-reject new jobs when autoReject=false (rescore-all path)', async () => {
    // This is the bug that was fixed: rescore-all called analyzeUnscoredJobs()
    // without autoReject=false, causing all new-status jobs to be rejected whenever
    // autoRejectLowScore was enabled and scores dropped below threshold on rescore.
    setSetting('resume', 'Software engineer with 5 years experience');
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: null });

    globalThis.fetch = mock(() => ollamaResponse(5)) as typeof fetch;

    await analyzeUnscoredJobs(false);

    expect(jobStatus(id)).toBe('new'); // must NOT be auto-rejected
  });

  it('auto-rejects new jobs below threshold when autoReject=true (fresh-fetch path)', async () => {
    setSetting('resume', 'Software engineer with 5 years experience');
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'new', match_score: null });

    globalThis.fetch = mock(() => ollamaResponse(5)) as typeof fetch;

    await analyzeUnscoredJobs(true);

    expect(jobStatus(id)).toBe('rejected');
  });

  it('never auto-rejects saved jobs regardless of autoReject flag', async () => {
    setSetting('resume', 'Software engineer with 5 years experience');
    setPrefs({ autoRejectLowScore: true, lowScoreThreshold: 50 });
    const { id } = seedJob({ status: 'saved', match_score: null });

    globalThis.fetch = mock(() => ollamaResponse(5)) as typeof fetch;

    await analyzeUnscoredJobs(true);

    expect(jobStatus(id)).toBe('saved');
  });
});
