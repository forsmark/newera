import { describe, it, expect } from 'bun:test';
import { normalizeCompany, normalizeTitle, contentFingerprint } from '../../utils/normalize';

describe('normalizeCompany', () => {
  it('lowercases and strips A/S suffix', () => {
    expect(normalizeCompany('Maersk A/S')).toBe('maersk');
  });
  it('strips ApS suffix', () => {
    expect(normalizeCompany('Novo Nordisk ApS')).toBe('novo nordisk');
  });
  it('strips Ltd and Inc', () => {
    expect(normalizeCompany('Acme Ltd.')).toBe('acme');
    expect(normalizeCompany('Widgets, Inc')).toBe('widgets');
  });
  it('collapses extra whitespace', () => {
    expect(normalizeCompany('  Foo   Bar  ')).toBe('foo bar');
  });
});

describe('normalizeTitle', () => {
  it('strips seniority words', () => {
    expect(normalizeTitle('Senior React Developer')).toBe('react developer');
    expect(normalizeTitle('Junior Frontend Engineer')).toBe('frontend engineer');
  });
  it('lowercases and trims', () => {
    expect(normalizeTitle('  Software Engineer  ')).toBe('software engineer');
  });
  it('strips special characters', () => {
    expect(normalizeTitle('Full-Stack Developer (React/Node)')).toBe('fullstack developer reactnode');
  });
});

describe('contentFingerprint', () => {
  it('produces same fingerprint for matching title+company variations', () => {
    const a = contentFingerprint('Senior React Developer', 'Maersk A/S');
    const b = contentFingerprint('React Developer', 'Maersk');
    expect(a).toBe(b);
  });
  it('produces different fingerprints for different jobs', () => {
    const a = contentFingerprint('React Developer', 'Maersk');
    const b = contentFingerprint('Backend Engineer', 'Maersk');
    expect(a).not.toBe(b);
  });
});
