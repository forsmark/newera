const COMPANY_SUFFIXES = /\b(a\/s|aps|as|ltd|limited|inc|gmbh|llc|co|corporation|corp|group)\b\.?/gi;
const SENIORITY_WORDS = /\b(senior|junior|lead|sr|jr|staff|principal|associate|mid|head of)\b/gi;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(COMPANY_SUFFIXES, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(SENIORITY_WORDS, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentFingerprint(title: string, company: string): string {
  return `${normalizeTitle(title)}|${normalizeCompany(company)}`;
}

/**
 * Check whether two jobs are likely the same posting across sources.
 * Returns true when the company matches and titles overlap significantly.
 */
export function isFuzzyDuplicate(
  titleA: string, companyA: string,
  titleB: string, companyB: string,
): boolean {
  if (normalizeCompany(companyA) !== normalizeCompany(companyB)) return false;

  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);

  // Exact match after normalization — already caught by contentFingerprint
  if (normA === normB) return true;

  // One title contains the other (e.g. "developer" vs "developer copenhagen")
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Word-overlap: if ≥60% of words in the shorter title appear in the longer one
  const wordsA = new Set(normA.split(' ').filter(w => w.length > 1));
  const wordsB = new Set(normB.split(' ').filter(w => w.length > 1));
  const [smaller, larger] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  if (smaller.size === 0) return false;

  let overlap = 0;
  for (const w of smaller) {
    if (larger.has(w)) overlap++;
  }
  return overlap / smaller.size >= 0.6;
}
