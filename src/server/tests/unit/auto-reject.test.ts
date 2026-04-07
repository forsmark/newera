import { describe, it, expect, beforeEach } from 'bun:test';
import db from '../../db';
import { setSetting } from '../../settings';
import { maybeAutoReject } from '../../scheduler';
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
