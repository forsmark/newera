import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { escapeMarkdownV2, sendFetchSummary, sendTestMessage, type ScoredJob } from '../../telegram';
import { setSetting } from '../../settings';
import db from '../../db';
import type { Job } from '../../types';

const originalFetch = globalThis.fetch;

function clearSettings() {
  db.run('DELETE FROM settings');
}

function setPrefs(overrides: Record<string, unknown>) {
  setSetting('preferences', JSON.stringify(overrides));
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    source: 'linkedin',
    external_id: 'ext-1',
    title: 'Frontend Developer',
    company: 'Acme Corp',
    location: 'Copenhagen',
    url: 'https://example.com/job/1',
    description: 'Great job',
    posted_at: '2026-04-01',
    match_score: 85,
    match_reasoning: 'Strong match',
    match_summary: 'React/TS role at a product company',
    tags: ['react', 'typescript'],
    work_type: 'hybrid',
    prefs_hash: null,
    content_fingerprint: null,
    duplicate_of: null,
    link_status: 'unchecked',
    link_checked_at: null,
    status: 'new',
    seen_at: null,
    fetched_at: '2026-04-05',
    ...overrides,
  };
}

function makeScoredJob(overrides: Partial<Job> = {}, score = 85): ScoredJob {
  return {
    job: makeJob(overrides),
    score,
    matchSummary: 'React/TS role at a product company',
  };
}

beforeEach(() => {
  clearSettings();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── escapeMarkdownV2 ─────────────────────────────────────────────────────────

describe('escapeMarkdownV2', () => {
  it('escapes all MarkdownV2 special characters', () => {
    // Each special char individually
    expect(escapeMarkdownV2('a_b')).toBe('a\\_b');
    expect(escapeMarkdownV2('a*b')).toBe('a\\*b');
    expect(escapeMarkdownV2('a[b')).toBe('a\\[b');
    expect(escapeMarkdownV2('a]b')).toBe('a\\]b');
    expect(escapeMarkdownV2('a(b')).toBe('a\\(b');
    expect(escapeMarkdownV2('a)b')).toBe('a\\)b');
    expect(escapeMarkdownV2('a~b')).toBe('a\\~b');
    expect(escapeMarkdownV2('a`b')).toBe('a\\`b');
    expect(escapeMarkdownV2('a>b')).toBe('a\\>b');
    expect(escapeMarkdownV2('a#b')).toBe('a\\#b');
    expect(escapeMarkdownV2('a+b')).toBe('a\\+b');
    expect(escapeMarkdownV2('a-b')).toBe('a\\-b');
    expect(escapeMarkdownV2('a=b')).toBe('a\\=b');
    expect(escapeMarkdownV2('a|b')).toBe('a\\|b');
    expect(escapeMarkdownV2('a{b')).toBe('a\\{b');
    expect(escapeMarkdownV2('a}b')).toBe('a\\}b');
    expect(escapeMarkdownV2('a.b')).toBe('a\\.b');
    expect(escapeMarkdownV2('a!b')).toBe('a\\!b');
    expect(escapeMarkdownV2('a\\b')).toBe('a\\\\b');
  });

  it('leaves plain text untouched', () => {
    expect(escapeMarkdownV2('Hello World 123')).toBe('Hello World 123');
  });
});

// ─── sendFetchSummary ─────────────────────────────────────────────────────────

describe('sendFetchSummary', () => {
  it('does nothing when telegram is disabled', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('{}')) as any);
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramEnabled: false, telegramBotToken: 'tok', telegramChatId: '123' });

    await sendFetchSummary([makeScoredJob()]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when bot token is empty', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('{}')) as any);
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramEnabled: true, telegramBotToken: '', telegramChatId: '123' });

    await sendFetchSummary([makeScoredJob()]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when chat ID is empty', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('{}')) as any);
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramEnabled: true, telegramBotToken: 'tok', telegramChatId: '' });

    await sendFetchSummary([makeScoredJob()]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when scoredJobs is empty', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('{}')) as any);
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramEnabled: true, telegramBotToken: 'tok', telegramChatId: '123' });

    await sendFetchSummary([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a message when jobs score above threshold', async () => {
    let sentBody: any = null;
    const fetchMock = mock((url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });
    globalThis.fetch = fetchMock as any;
    setPrefs({
      telegramEnabled: true,
      telegramBotToken: 'test-token',
      telegramChatId: '999',
      telegramNotifyThreshold: 80,
      appBaseUrl: 'http://100.1.2.3:3000',
    });

    await sendFetchSummary([makeScoredJob({}, 92)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = (fetchMock as any).mock.calls[0][0];
    expect(url).toContain('test-token/sendMessage');
    expect(sentBody.chat_id).toBe('999');
    expect(sentBody.parse_mode).toBe('MarkdownV2');
    expect(sentBody.text).toContain('Frontend Developer');
    expect(sentBody.text).toContain('92');
    expect(sentBody.text).toContain('100\\.1\\.2\\.3');
  });

  it('includes below-threshold count in footer', async () => {
    let sentBody: any = null;
    const fetchMock = mock((_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });
    globalThis.fetch = fetchMock as any;
    setPrefs({
      telegramEnabled: true,
      telegramBotToken: 'tok',
      telegramChatId: '123',
      telegramNotifyThreshold: 80,
    });

    await sendFetchSummary([
      makeScoredJob({ id: 'j1', title: 'Good Job' }, 90),
      makeScoredJob({ id: 'j2', title: 'Meh Job' }, 50),
      makeScoredJob({ id: 'j3', title: 'Bad Job' }, 30),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody.text).toContain('Good Job');
    expect(sentBody.text).not.toContain('Meh Job');
    expect(sentBody.text).not.toContain('Bad Job');
    expect(sentBody.text).toContain('2 other new jobs below threshold');
  });

  it('does not send when all jobs are below threshold', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }))),
    );
    globalThis.fetch = fetchMock as any;
    setPrefs({
      telegramEnabled: true,
      telegramBotToken: 'tok',
      telegramChatId: '123',
      telegramNotifyThreshold: 80,
    });

    await sendFetchSummary([
      makeScoredJob({ id: 'j1', title: 'Meh Job' }, 50),
      makeScoredJob({ id: 'j2', title: 'Bad Job' }, 30),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not crash on Telegram API failure', async () => {
    const fetchMock = mock(() => Promise.reject(new Error('network')));
    globalThis.fetch = fetchMock as any;
    setPrefs({
      telegramEnabled: true,
      telegramBotToken: 'tok',
      telegramChatId: '123',
      telegramNotifyThreshold: 80,
    });

    // Should not throw
    await sendFetchSummary([makeScoredJob({}, 90)]);
  });
});

// ─── sendTestMessage ──────────────────────────────────────────────────────────

describe('sendTestMessage', () => {
  it('returns error when bot token is missing', async () => {
    setPrefs({ telegramBotToken: '', telegramChatId: '123' });

    const result = await sendTestMessage();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns error when chat ID is missing', async () => {
    setPrefs({ telegramBotToken: 'tok', telegramChatId: '' });

    const result = await sendTestMessage();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns ok when Telegram API succeeds', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }))),
    );
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramBotToken: 'tok', telegramChatId: '123' });

    const result = await sendTestMessage();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns error when Telegram API fails', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }))),
    );
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramBotToken: 'bad-token', telegramChatId: '123' });

    const result = await sendTestMessage();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error on network failure', async () => {
    const fetchMock = mock(() => Promise.reject(new Error('connect failed')));
    globalThis.fetch = fetchMock as any;
    setPrefs({ telegramBotToken: 'tok', telegramChatId: '123' });

    const result = await sendTestMessage();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('connect failed');
  });
});
