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
