import { describe, it, expect } from 'bun:test';
import { computePrefsHash } from '../../utils/hash';

describe('computePrefsHash', () => {
  it('returns a 16-char hex string', () => {
    const h = computePrefsHash('resume text', '{"location":"Copenhagen"}');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same hash for identical inputs', () => {
    const a = computePrefsHash('resume', '{"x":1}');
    const b = computePrefsHash('resume', '{"x":1}');
    expect(a).toBe(b);
  });

  it('returns different hashes when resume changes', () => {
    const a = computePrefsHash('resume v1', '{"x":1}');
    const b = computePrefsHash('resume v2', '{"x":1}');
    expect(a).not.toBe(b);
  });

  it('returns different hashes when prefs change', () => {
    const a = computePrefsHash('resume', '{"x":1}');
    const b = computePrefsHash('resume', '{"x":2}');
    expect(a).not.toBe(b);
  });
});
