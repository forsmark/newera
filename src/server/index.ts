import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import jobsRoute from './routes/jobs';
import kanbanRoute from './routes/kanban';
import fetchRoute from './routes/fetch';
import { startScheduler, getLastFetchAt } from './scheduler';
import db from './db';

const app = new Hono();

// API routes
app.route('/api/jobs', jobsRoute);
app.route('/api/kanban', kanbanRoute);
app.route('/api/fetch', fetchRoute);

// GET /api/status
app.get('/api/status', (c) => {
  const counts = db.query('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all();
  return c.json({ last_fetch_at: getLastFetchAt(), counts });
});

// Serve static files (built React app)
app.use('/*', serveStatic({ root: './dist' }));
// Fallback: serve index.html for client-side routing
app.get('/*', serveStatic({ path: './dist/index.html' }));

// Start scheduler
startScheduler();

export default {
  port: 3000,
  fetch: app.fetch,
};
