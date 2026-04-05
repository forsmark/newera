import { describe, it, expect } from 'bun:test';
import { extractJson } from '../../llm';

describe('extractJson', () => {
  it('parses a valid response', () => {
    const raw = JSON.stringify({
      match_score: 85,
      match_reasoning: 'Strong React skills match the requirements.',
      summary: 'This role builds React components for a fintech app.',
      tags: ['React', 'TypeScript', 'Node.js'],
    });
    const result = extractJson(raw);
    expect(result.match_score).toBe(85);
    expect(result.match_reasoning).toBe('Strong React skills match the requirements.');
    expect(result.match_summary).toBe('This role builds React components for a fintech app.');
    expect(result.tags).toEqual(['React', 'TypeScript', 'Node.js']);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"match_score":72,"match_reasoning":"Good fit.","summary":"Backend role.","tags":[]}\n```';
    const result = extractJson(raw);
    expect(result.match_score).toBe(72);
    expect(result.tags).toEqual([]);
  });

  it('handles empty tags array', () => {
    const raw = JSON.stringify({ match_score: 50, match_reasoning: 'Partial match.', summary: 'Generic role.', tags: [] });
    expect(extractJson(raw).tags).toEqual([]);
  });

  it('caps tags at 8 and trims whitespace', () => {
    const tags = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', ' I '];
    const raw = JSON.stringify({ match_score: 60, match_reasoning: 'ok', summary: 'ok', tags });
    expect(extractJson(raw).tags).toHaveLength(8);
  });

  it('handles missing tags field — returns empty array', () => {
    const raw = JSON.stringify({ match_score: 60, match_reasoning: 'ok', summary: 'ok' });
    expect(extractJson(raw).tags).toEqual([]);
  });

  it('throws when match_score is out of range', () => {
    const raw = JSON.stringify({ match_score: 150, match_reasoning: 'ok', summary: 'ok', tags: [] });
    expect(() => extractJson(raw)).toThrow('Invalid match_score');
  });

  it('throws when match_score is negative', () => {
    const raw = JSON.stringify({ match_score: -5, match_reasoning: 'ok', summary: 'ok', tags: [] });
    expect(() => extractJson(raw)).toThrow('Invalid match_score');
  });

  it('throws when match_reasoning is missing', () => {
    const raw = JSON.stringify({ match_score: 70, match_reasoning: '', summary: 'ok', tags: [] });
    expect(() => extractJson(raw)).toThrow('Empty match_reasoning');
  });

  it('throws when no JSON object is found', () => {
    expect(() => extractJson('Sorry, I cannot help with that.')).toThrow('No JSON object found');
  });

  it('extracts JSON embedded in surrounding text', () => {
    const raw = 'Here is the result: {"match_score":55,"match_reasoning":"Reasonable fit.","summary":"Role overview.","tags":["Python"]} Hope that helps!';
    const result = extractJson(raw);
    expect(result.match_score).toBe(55);
    expect(result.tags).toEqual(['Python']);
  });
});
