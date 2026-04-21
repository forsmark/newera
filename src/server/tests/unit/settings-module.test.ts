import { describe, it, expect, beforeEach } from 'bun:test';
import db from '../../db';
import { getSetting, setSetting, getPreferences, getResume } from '../../settings';

function clearSettings() {
  db.run('DELETE FROM settings');
}

// ─── getSetting / setSetting ──────────────────────────────────────────────────

describe('getSetting', () => {
  beforeEach(clearSettings);

  it('returns null for unknown key', () => {
    expect(getSetting('nonexistent')).toBeNull();
  });

  it('returns stored value', () => {
    setSetting('mykey', 'myvalue');
    expect(getSetting('mykey')).toBe('myvalue');
  });
});

describe('setSetting', () => {
  beforeEach(clearSettings);

  it('stores a value retrievable by getSetting', () => {
    setSetting('k', 'v');
    expect(getSetting('k')).toBe('v');
  });

  it('overwrites an existing value', () => {
    setSetting('k', 'first');
    setSetting('k', 'second');
    expect(getSetting('k')).toBe('second');
  });
});

// ─── getPreferences ───────────────────────────────────────────────────────────

describe('getPreferences', () => {
  beforeEach(clearSettings);

  it('returns all defaults when nothing is stored', () => {
    const p = getPreferences();
    expect(p.remote).toEqual([]);
    expect(p.seniority).toBe('any');
    expect(p.lowScoreThreshold).toBe(20);
    expect(p.autoRejectLowScore).toBe(false);
    expect(p.model).toBe('gemma4:26b');
    expect(p.fetchIntervalHours).toBe(2);
    expect(p.minSalaryDkk).toBeNull();
    expect(p.location).toBe('');
  });

  it('merges stored values over defaults', () => {
    setSetting('preferences', JSON.stringify({ location: 'Copenhagen', lowScoreThreshold: 35 }));
    const p = getPreferences();
    expect(p.location).toBe('Copenhagen');
    expect(p.lowScoreThreshold).toBe(35);
    expect(p.model).toBe('gemma4:26b'); // default preserved
  });

  it('migrates old remote "any" string to empty array', () => {
    setSetting('preferences', JSON.stringify({ remote: 'any' }));
    expect(getPreferences().remote).toEqual([]);
  });

  it('migrates old remote "hybrid" string to single-element array', () => {
    setSetting('preferences', JSON.stringify({ remote: 'hybrid' }));
    expect(getPreferences().remote).toEqual(['hybrid']);
  });

  it('migrates old remote "onsite" string to single-element array', () => {
    setSetting('preferences', JSON.stringify({ remote: 'onsite' }));
    expect(getPreferences().remote).toEqual(['onsite']);
  });

  it('migrates old remote "remote" string to single-element array', () => {
    setSetting('preferences', JSON.stringify({ remote: 'remote' }));
    expect(getPreferences().remote).toEqual(['remote']);
  });

  it('preserves remote that is already an array', () => {
    setSetting('preferences', JSON.stringify({ remote: ['onsite', 'hybrid'] }));
    expect(getPreferences().remote).toEqual(['onsite', 'hybrid']);
  });

  it('returns defaults when stored JSON is invalid', () => {
    setSetting('preferences', 'this is not json {{{');
    const p = getPreferences();
    expect(p.lowScoreThreshold).toBe(20);
    expect(p.remote).toEqual([]);
  });
});

// ─── getResume ────────────────────────────────────────────────────────────────

describe('getResume', () => {
  beforeEach(clearSettings);

  it('returns empty string when not set', () => {
    expect(getResume()).toBe('');
  });

  it('returns the stored resume content', () => {
    setSetting('resume', '# My Resume\n\n## Experience');
    expect(getResume()).toBe('# My Resume\n\n## Experience');
  });
});
