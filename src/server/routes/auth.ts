import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { isAuthEnabled, checkPassword, createSession, destroySession, validateSession } from '../auth';

const app = new Hono();

// GET /api/auth/status — public, used by frontend to check auth state
app.get('/status', (c) => {
  if (!isAuthEnabled()) return c.json({ authenticated: true, auth_enabled: false });
  const token = getCookie(c, 'session');
  return c.json({ authenticated: validateSession(token), auth_enabled: true });
});

// POST /api/auth/login
app.post('/login', async (c) => {
  if (!isAuthEnabled()) return c.json({ authenticated: true });
  let body: { password?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request' }, 400); }
  if (!checkPassword(body.password ?? '')) {
    return c.json({ error: 'Incorrect password' }, 401);
  }
  const token = createSession();
  setCookie(c, 'session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return c.json({ authenticated: true });
});

// POST /api/auth/logout
app.post('/logout', (c) => {
  const token = getCookie(c, 'session');
  destroySession(token);
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ authenticated: false });
});

export default app;
