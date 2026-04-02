import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import jobsRoute from './routes/jobs';
import kanbanRoute from './routes/kanban';
import fetchRoute from './routes/fetch';
import { startScheduler, getLastFetchAt, getIsFetching } from './scheduler';
import db from './db';

const app = new Hono();

// API routes
app.route('/api/jobs', jobsRoute);
app.route('/api/kanban', kanbanRoute);
app.route('/api/fetch', fetchRoute);

// GET /api/status
app.get('/api/status', (c) => {
  const counts = db.query('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all();
  const unscoredRow = db.query('SELECT COUNT(*) as count FROM jobs WHERE match_score IS NULL').get() as { count: number };
  return c.json({
    last_fetch_at: getLastFetchAt(),
    counts,
    is_fetching: getIsFetching(),
    unscored_jobs: unscoredRow.count,
  });
});

// Serve static files (built React app)
const DIST = resolve(import.meta.dir, '../../dist');
app.use('/*', serveStatic({ root: DIST }));
// Fallback: serve index.html for client-side routing
app.get('/*', serveStatic({ path: resolve(DIST, 'index.html') }));

// Start scheduler
startScheduler();

export default {
  port: 3000,
  fetch: app.fetch,
};
