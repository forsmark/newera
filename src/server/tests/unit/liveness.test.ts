import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { classifyLiveness } from '../../utils/liveness';

beforeEach(() => {
  // Reset fetch mock between tests
  globalThis.fetch = undefined as any;
});

describe('classifyLiveness', () => {
  it('returns expired for 404', async () => {
    globalThis.fetch = mock(async () => ({ status: 404, url: 'https://example.com/job/1' })) as any;
    const result = await classifyLiveness('https://example.com/job/1');
    expect(result).toBe('expired');
  });

  it('returns expired for 410', async () => {
    globalThis.fetch = mock(async () => ({ status: 410, url: 'https://example.com/job/1' })) as any;
    const result = await classifyLiveness('https://example.com/job/1');
    expect(result).toBe('expired');
  });

  it('returns active for 200 with unchanged URL', async () => {
    globalThis.fetch = mock(async () => ({ status: 200, url: 'https://example.com/job/1' })) as any;
    const result = await classifyLiveness('https://example.com/job/1');
    expect(result).toBe('active');
  });

  it('returns expired when final URL contains expiry signal', async () => {
    globalThis.fetch = mock(async () => ({
      status: 200, url: 'https://example.com/job-expired/123',
    })) as any;
    const result = await classifyLiveness('https://example.com/job/1');
    expect(result).toBe('expired');
  });

  it('returns unknown on network error', async () => {
    globalThis.fetch = mock(async () => { throw new Error('network'); }) as any;
    const result = await classifyLiveness('https://example.com/job/1');
    expect(result).toBe('unknown');
  });
});
