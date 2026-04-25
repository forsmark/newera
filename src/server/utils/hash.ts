import { createHash } from 'crypto';

/**
 * Preference keys that affect LLM scoring.
 * Changes to other keys (telegram, UI defaults, fetch interval, etc.)
 * should NOT invalidate existing scores.
 */
const SCORING_KEYS = [
  'location',
  'commutableLocations',
  'remote',
  'seniority',
  'minSalary',
  'salaryCurrency',
  'techInterests',
  'techAvoid',
  'companyBlacklist',
  'notes',
  'model',
] as const;

/** SHA-256 of resume + scoring-relevant prefs, truncated to 16 hex chars. */
export function computePrefsHash(resume: string, prefsJson: string): string {
  let scoringSubset: string;
  try {
    const full = JSON.parse(prefsJson);
    const picked: Record<string, unknown> = {};
    for (const key of SCORING_KEYS) {
      if (key in full) picked[key] = full[key];
    }
    scoringSubset = JSON.stringify(picked);
  } catch {
    scoringSubset = prefsJson;
  }

  return createHash('sha256')
    .update(resume)
    .update('\0')
    .update(scoringSubset)
    .digest('hex')
    .slice(0, 16);
}
