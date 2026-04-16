import { describe, it, expect } from 'bun:test';
import { normalizeCompany, normalizeTitle, contentFingerprint, isFuzzyDuplicate } from '../../utils/normalize';

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

describe('isFuzzyDuplicate', () => {
  it('matches when one title contains the other (same company)', () => {
    expect(isFuzzyDuplicate(
      'Application Specialist', 'DSV A/S',
      'IT Application Specialist', 'DSV',
    )).toBe(true);
  });

  it('matches with sufficient word overlap', () => {
    expect(isFuzzyDuplicate(
      'Frontend React Developer', 'Maersk A/S',
      'React Developer Frontend', 'Maersk',
    )).toBe(true);
  });

  it('rejects when companies differ', () => {
    expect(isFuzzyDuplicate(
      'Application Specialist', 'DSV A/S',
      'Application Specialist', 'Maersk',
    )).toBe(false);
  });

  it('rejects when titles have low overlap', () => {
    expect(isFuzzyDuplicate(
      'Application Specialist', 'DSV',
      'Warehouse Manager', 'DSV',
    )).toBe(false);
  });

  it('matches exact normalized titles', () => {
    expect(isFuzzyDuplicate(
      'Senior React Developer', 'Maersk A/S',
      'React Developer', 'Maersk',
    )).toBe(true);
  });
});
