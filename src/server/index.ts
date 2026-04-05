import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import jobsRoute from './routes/jobs';
import kanbanRoute from './routes/kanban';
import fetchRoute from './routes/fetch';
import settingsRoute, { getResume, getPreferences } from './routes/settings';
import { startScheduler, getLastFetchAt, getIsFetching } from './scheduler';
import { checkOllamaHealth, getOllamaAvailable } from './llm';
import db from './db';

const app = new Hono();

// API routes
app.route('/api/jobs', jobsRoute);
app.route('/api/kanban', kanbanRoute);
app.route('/api/fetch', fetchRoute);
app.route('/api/settings', settingsRoute);

// GET /api/status
app.get('/api/status', (c) => {
  const counts = db.query('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all();
  const unscoredRow = db.query('SELECT COUNT(*) as count FROM jobs WHERE match_score IS NULL').get() as { count: number };
  const scoreDist = db.query(`
    SELECT
      COUNT(CASE WHEN match_score >= 80 THEN 1 END) as green,
      COUNT(CASE WHEN match_score >= 50 AND match_score < 80 THEN 1 END) as amber,
      COUNT(CASE WHEN match_score < 50 THEN 1 END) as grey,
      COUNT(CASE WHEN match_score IS NULL THEN 1 END) as pending
    FROM jobs
    WHERE status != 'rejected'
  `).get() as { green: number; amber: number; grey: number; pending: number };
  return c.json({
    last_fetch_at: getLastFetchAt(),
    counts,
    is_fetching: getIsFetching(),
    unscored_jobs: unscoredRow.count,
    score_distribution: scoreDist,
    ollama_available: getOllamaAvailable(),
    data_files: {
      resume: getResume().length > 0,
      preferences: Object.values(getPreferences()).some(v => v !== '' && v !== null && v !== 'any'),
    },
  });
});

// Serve static files (built React app)
const DIST = resolve(import.meta.dir, '../../dist');
app.use('/*', serveStatic({ root: DIST }));
// Fallback: serve index.html for client-side routing
app.get('/*', serveStatic({ path: resolve(DIST, 'index.html') }));

// Start Ollama health check and scheduler
checkOllamaHealth().catch(console.error);
startScheduler();

export default {
  port: 3000,
  fetch: app.fetch,
};
