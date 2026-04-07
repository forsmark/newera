import db from './db';
import type { Preferences } from './types';
import { DEFAULT_PREFERENCES } from './types';

export function getSetting(key: string): string | null {
  const row = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date().toISOString()],
  );
}

export function getPreferences(): Preferences {
  const raw = getSetting('preferences');
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences> & { remote?: unknown };
    // Migrate old single-string remote format → array
    if (typeof parsed.remote === 'string') {
      parsed.remote = parsed.remote === 'any' ? [] : [parsed.remote];
    }
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function getResume(): string {
  return getSetting('resume') ?? '';
}
