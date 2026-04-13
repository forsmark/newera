import { getPreferences } from './settings';
import type { Job } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const MAX_DETAILED_JOBS = 10;

/** Escape special characters for Telegram MarkdownV2 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export interface ScoredJob {
  job: Job;
  score: number;
  matchSummary: string;
}

/**
 * Send a batch summary of newly scored jobs to Telegram.
 * Called after each fetch run completes scoring.
 * Fire-and-forget — never throws.
 */
export async function sendFetchSummary(scoredJobs: ScoredJob[]): Promise<void> {
  try {
    const prefs = getPreferences();
    if (!prefs.telegramEnabled || !prefs.telegramBotToken || !prefs.telegramChatId) return;
    if (scoredJobs.length === 0) return;

    const above = scoredJobs
      .filter(j => j.score >= prefs.telegramNotifyThreshold)
      .sort((a, b) => b.score - a.score);
    const belowCount = scoredJobs.length - above.length;

    // Only notify when at least one job is above the threshold
    if (above.length === 0) return;

    const lines: string[] = [];

    const detailed = above.slice(0, MAX_DETAILED_JOBS);
    for (const { job, score, matchSummary } of detailed) {
      const title = escapeMarkdownV2(job.title);
      const company = escapeMarkdownV2(job.company);
      const summary = escapeMarkdownV2(matchSummary || '');
      lines.push(`🟢 *${title}* — ${company} \\(${score}\\)`);
      if (summary) lines.push(summary);
      lines.push(`→ [Open](${escapeMarkdownV2(`${prefs.appBaseUrl}/jobs/${job.id}`)})`);
      lines.push('');
    }

    // If we capped the detailed list, roll extras into the below count
    const extraAbove = above.length - detailed.length;
    const totalBelow = belowCount + extraAbove;

    if (totalBelow > 0) {
      lines.push(`\\+ ${totalBelow} other new job${totalBelow === 1 ? '' : 's'} below threshold`);
    }

    const text = lines.join('\n').trim();
    if (!text) return;

    await postTelegram(prefs.telegramBotToken, prefs.telegramChatId, text);
    console.log(`[telegram] Sent fetch summary (${above.length} above threshold, ${belowCount} below)`);
  } catch (err) {
    console.error('[telegram] Failed to send fetch summary:', err);
  }
}

/**
 * Send a test message to verify Telegram bot configuration.
 * Returns a result object for the Settings UI.
 */
export async function sendTestMessage(): Promise<{ ok: boolean; error?: string }> {
  const prefs = getPreferences();
  if (!prefs.telegramBotToken || !prefs.telegramChatId) {
    return { ok: false, error: 'Bot token and chat ID are required' };
  }

  try {
    const text = 'New Era notifications active ✅';
    const result = await postTelegram(prefs.telegramBotToken, prefs.telegramChatId, escapeMarkdownV2(text));
    if (result.ok) return { ok: true };
    return { ok: false, error: result.description || 'Telegram API error' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function postTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    }),
  });
  return res.json() as Promise<{ ok: boolean; description?: string }>;
}
