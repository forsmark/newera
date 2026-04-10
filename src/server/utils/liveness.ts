const EXPIRY_SIGNALS = ['expired', 'closed', 'no-longer', 'job-no-longer', 'not-available', 'position-filled'];

export type LivenessResult = 'active' | 'expired' | 'unknown';

export async function classifyLiveness(url: string): Promise<LivenessResult> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; link-check/1.0)' },
    });

    if (res.status === 404 || res.status === 410) return 'expired';
    if (res.status === 405) {
      // Server doesn't support HEAD — treat as unknown rather than wasting a GET
      return 'unknown';
    }
    if (res.status >= 400) return 'unknown';

    const finalUrl = res.url.toLowerCase();
    if (EXPIRY_SIGNALS.some(s => finalUrl.includes(s))) return 'expired';

    return 'active';
  } catch {
    return 'unknown';
  }
}
