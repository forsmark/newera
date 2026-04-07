// Simple session-based auth. Only active when AUTH_SECRET env var is set.
// Sessions are in-memory — server restart requires re-login (intentional: personal tool).

const sessions = new Map<string, number>(); // token → expiry timestamp

export function isAuthEnabled(): boolean {
  return !!process.env.AUTH_SECRET;
}

export function checkPassword(password: string): boolean {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return true;
  return password === secret;
}

export function createSession(): string {
  const token = crypto.randomUUID();
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  sessions.set(token, expires);
  return token;
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (Date.now() > expires) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}
