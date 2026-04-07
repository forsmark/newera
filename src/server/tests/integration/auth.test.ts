import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import authRoute from '../../routes/auth';

function makeApp() {
  return new Hono().route('/api/auth', authRoute);
}

// Helpers to set/clear AUTH_SECRET between tests
function setSecret(secret: string | undefined) {
  if (secret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = secret;
  }
}

beforeEach(() => setSecret(undefined));
afterEach(() => setSecret(undefined));

// ─── /api/auth/status ─────────────────────────────────────────────────────────

describe('GET /api/auth/status', () => {
  it('returns authenticated:true and auth_enabled:false when no secret set', async () => {
    const res = await makeApp().request('/api/auth/status');
    const body = await res.json() as { authenticated: boolean; auth_enabled: boolean };
    expect(res.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.auth_enabled).toBe(false);
  });

  it('returns authenticated:false and auth_enabled:true when secret set and no cookie', async () => {
    setSecret('hunter2');
    const res = await makeApp().request('/api/auth/status');
    const body = await res.json() as { authenticated: boolean; auth_enabled: boolean };
    expect(res.status).toBe(200);
    expect(body.authenticated).toBe(false);
    expect(body.auth_enabled).toBe(true);
  });
});

// ─── /api/auth/login ──────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('succeeds without secret (auth disabled)', async () => {
    const res = await makeApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(true);
  });

  it('returns 401 for wrong password', async () => {
    setSecret('correct-horse');
    const res = await makeApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets session cookie for correct password', async () => {
    setSecret('correct-horse');
    const res = await makeApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'correct-horse' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(true);
    expect(res.headers.get('set-cookie')).toMatch(/session=/);
  });

  it('returns 400 for malformed body', async () => {
    setSecret('correct-horse');
    const res = await makeApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

// ─── /api/auth/logout ─────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns authenticated:false and clears cookie', async () => {
    setSecret('correct-horse');
    const app = makeApp();

    // Login first to get a session token
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'correct-horse' }),
    });
    const cookie = loginRes.headers.get('set-cookie') ?? '';
    const token = cookie.match(/session=([^;]+)/)?.[1] ?? '';

    // Logout with the session cookie
    const logoutRes = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `session=${token}` },
    });
    expect(logoutRes.status).toBe(200);
    const body = await logoutRes.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(false);

    // Session should now be invalid
    const statusRes = await app.request('/api/auth/status', {
      headers: { Cookie: `session=${token}` },
    });
    const statusBody = await statusRes.json() as { authenticated: boolean };
    expect(statusBody.authenticated).toBe(false);
  });
});

// ─── Auth middleware integration ──────────────────────────────────────────────

describe('auth middleware', () => {
  it('blocks protected routes with 401 when auth enabled and no session', async () => {
    setSecret('secret');
    // Build a minimal app mimicking the real server's middleware setup
    const { isAuthEnabled, validateSession } = await import('../../auth');
    const { getCookie } = await import('hono/cookie');
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      if (!isAuthEnabled()) return next();
      if (c.req.path.startsWith('/api/auth/')) return next();
      const token = getCookie(c, 'session');
      if (!validateSession(token)) return c.json({ error: 'Unauthorized' }, 401);
      return next();
    });
    app.get('/api/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/api/protected');
    expect(res.status).toBe(401);
  });

  it('allows auth routes through regardless of session', async () => {
    setSecret('secret');
    const { isAuthEnabled, validateSession } = await import('../../auth');
    const { getCookie } = await import('hono/cookie');
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      if (!isAuthEnabled()) return next();
      if (c.req.path.startsWith('/api/auth/')) return next();
      const token = getCookie(c, 'session');
      if (!validateSession(token)) return c.json({ error: 'Unauthorized' }, 401);
      return next();
    });
    app.route('/api/auth', authRoute);

    const res = await app.request('/api/auth/status');
    expect(res.status).toBe(200);
  });
});
