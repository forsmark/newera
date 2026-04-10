import { createHash } from 'crypto';

/** SHA-256 of resume + prefs content, truncated to 16 hex chars. */
export function computePrefsHash(resume: string, prefsJson: string): string {
  return createHash('sha256')
    .update(resume)
    .update('\0')
    .update(prefsJson)
    .digest('hex')
    .slice(0, 16);
}
