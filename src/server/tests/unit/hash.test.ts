import { describe, it, expect } from 'bun:test';
import { computePrefsHash } from '../../utils/hash';

describe('computePrefsHash', () => {
  it('returns a 16-char hex string', () => {
    const h = computePrefsHash('resume text', '{"location":"Copenhagen"}');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same hash for identical inputs', () => {
    const a = computePrefsHash('resume', '{"location":"Copenhagen"}');
    const b = computePrefsHash('resume', '{"location":"Copenhagen"}');
    expect(a).toBe(b);
  });

  it('returns different hashes when resume changes', () => {
    const a = computePrefsHash('resume v1', '{"location":"Copenhagen"}');
    const b = computePrefsHash('resume v2', '{"location":"Copenhagen"}');
    expect(a).not.toBe(b);
  });

  it('returns different hashes when scoring-relevant prefs change', () => {
    const a = computePrefsHash('resume', '{"location":"Copenhagen"}');
    const b = computePrefsHash('resume', '{"location":"Aarhus"}');
    expect(a).not.toBe(b);
  });

  it('returns the same hash when only non-scoring prefs change', () => {
    const a = computePrefsHash('resume', '{"location":"Copenhagen","telegramBotToken":"abc"}');
    const b = computePrefsHash('resume', '{"location":"Copenhagen","telegramBotToken":"xyz"}');
    expect(a).toBe(b);
  });
});
