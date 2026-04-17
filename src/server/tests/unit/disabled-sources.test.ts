import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

// Module mocks must be declared before any imports that resolve the mocked modules
const mockFetchLinkedIn = mock(() => Promise.resolve([]));
const mockFetchJobDescription = mock(() => Promise.resolve(null));
const mockFetchJobindex = mock(() => Promise.resolve([]));
const mockFetchRemotive = mock(() => Promise.resolve([]));
const mockFetchArbeitnow = mock(() => Promise.resolve([]));
const mockFetchRemoteOK = mock(() => Promise.resolve([]));

mock.module('../../sources/linkedin', () => ({
  fetchLinkedIn: mockFetchLinkedIn,
  fetchJobDescription: mockFetchJobDescription,
}));
mock.module('../../sources/jobindex', () => ({
  fetchJobindex: mockFetchJobindex,
}));
mock.module('../../sources/remotive', () => ({
  fetchRemotive: mockFetchRemotive,
}));
mock.module('../../sources/arbeitnow', () => ({
  fetchArbeitnow: mockFetchArbeitnow,
}));
mock.module('../../sources/remoteok', () => ({
  fetchRemoteOK: mockFetchRemoteOK,
}));
mock.module('../../telegram', () => ({
  sendFetchSummary: mock(() => Promise.resolve()),
}));
mock.module('../../llm', () => ({
  analyzeJob: mock(() => Promise.resolve(null)),
}));

import { setSetting } from '../../settings';
import { fetchJobs } from '../../scheduler';

// Remove 30-second inter-source delays during tests
const _orig = globalThis.setTimeout;
// @ts-ignore
globalThis.setTimeout = (fn: TimerHandler, _delay?: number, ...args: unknown[]) =>
  _orig(fn, 0, ...args);
afterAll(() => { globalThis.setTimeout = _orig; });

describe('fetchJobs — disabledSources', () => {
  beforeEach(() => {
    mockFetchLinkedIn.mockClear();
    mockFetchJobindex.mockClear();
    mockFetchRemotive.mockClear();
    mockFetchArbeitnow.mockClear();
    mockFetchRemoteOK.mockClear();
    setSetting('preferences', JSON.stringify({ disabledSources: [] }));
  });

  it('calls all source fetchers when disabledSources is empty', async () => {
    await fetchJobs();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchLinkedIn).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).toHaveBeenCalledTimes(1);
    expect(mockFetchArbeitnow).toHaveBeenCalledTimes(1);
    expect(mockFetchRemoteOK).toHaveBeenCalledTimes(1);
  });

  it('skips LinkedIn when it is in disabledSources', async () => {
    setSetting('preferences', JSON.stringify({ disabledSources: ['linkedin'] }));
    await fetchJobs();
    expect(mockFetchLinkedIn).not.toHaveBeenCalled();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).toHaveBeenCalledTimes(1);
    expect(mockFetchArbeitnow).toHaveBeenCalledTimes(1);
    expect(mockFetchRemoteOK).toHaveBeenCalledTimes(1);
  });

  it('skips multiple sources when listed in disabledSources', async () => {
    setSetting('preferences', JSON.stringify({ disabledSources: ['remotive', 'arbeitnow', 'remoteok'] }));
    await fetchJobs();
    expect(mockFetchJobindex).toHaveBeenCalledTimes(1);
    expect(mockFetchLinkedIn).toHaveBeenCalledTimes(1);
    expect(mockFetchRemotive).not.toHaveBeenCalled();
    expect(mockFetchArbeitnow).not.toHaveBeenCalled();
    expect(mockFetchRemoteOK).not.toHaveBeenCalled();
  });
});
