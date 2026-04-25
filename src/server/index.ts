import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import { setupLogger } from './logger';
import jobsRoute from './routes/jobs';
import kanbanRoute from './routes/kanban';
import fetchRoute from './routes/fetch';
import settingsRoute, { getResume, getPreferences } from './routes/settings';
import logsRoute from './routes/logs';
import authRoute from './routes/auth';
import backupsRoute from './routes/backups';
import { isAuthEnabled, validateSession } from './auth';
import { startBackupScheduler } from './backup';
import { startScheduler, getLastFetchAt, getIsFetching, getLastFetchNewJobs, getIsFetchPaused, getIsScoringPaused, toggleFetchPause, toggleScoringPause } from './scheduler';
import { checkLLMHealth, getLLMAvailable } from './llm';
import { computePrefsHash } from './utils/hash';
import { getSetting } from './settings';
import { getCookie } from 'hono/cookie';
import db from './db';

// Set up DB-backed logging before anything else writes to console
setupLogger();

const app = new Hono();

// Auth middleware — protects all /api/* except /api/auth/*
app.use('/api/*', async (c, next) => {
  if (!isAuthEnabled()) return next();
  if (c.req.path.startsWith('/api/auth/')) return next();
  const token = getCookie(c, 'session');
  if (!validateSession(token)) return c.json({ error: 'Unauthorized' }, 401);
  return next();
});

// API routes
app.route('/api/auth', authRoute);
app.route('/api/jobs', jobsRoute);
app.route('/api/kanban', kanbanRoute);
app.route('/api/fetch', fetchRoute);
app.route('/api/settings', settingsRoute);
app.route('/api/logs', logsRoute);
app.route('/api/backups', backupsRoute);

// GET /api/status
app.get('/api/status', (c) => {
  const counts = db.query('SELECT status, COUNT(*) as count FROM jobs GROUP BY status').all();
  const unscoredRow = db.query('SELECT COUNT(*) as count FROM jobs WHERE match_score IS NULL AND duplicate_of IS NULL').get() as { count: number };
  const scoreDist = db.query(`
    SELECT
      COUNT(CASE WHEN match_score >= 80 THEN 1 END) as green,
      COUNT(CASE WHEN match_score >= 50 AND match_score < 80 THEN 1 END) as amber,
      COUNT(CASE WHEN match_score < 50 THEN 1 END) as grey,
      COUNT(CASE WHEN match_score IS NULL THEN 1 END) as pending
    FROM jobs
    WHERE status != 'rejected'
    AND duplicate_of IS NULL
  `).get() as { green: number; amber: number; grey: number; pending: number };

  const resume = getResume();
  const prefsJson = getSetting('preferences') ?? '{}';
  const currentHash = computePrefsHash(resume, prefsJson);
  const staleRow = db.query<{ n: number }, [string]>(
    `SELECT COUNT(*) as n FROM jobs
     WHERE match_score IS NOT NULL
     AND status NOT IN ('rejected')
     AND (prefs_hash IS NULL OR prefs_hash != ?)
     AND description IS NOT NULL`
  ).get(currentHash);
  const stale_count = staleRow?.n ?? 0;

  return c.json({
    last_fetch_at: getLastFetchAt(),
    counts,
    is_fetching: getIsFetching(),
    is_fetch_paused: getIsFetchPaused(),
    is_scoring_paused: getIsScoringPaused(),
    unscored_jobs: unscoredRow.count,
    score_distribution: scoreDist,
    llm_available: getLLMAvailable(),
    last_fetch_new_jobs: getLastFetchNewJobs(),
    stale_count,
    data_files: {
      resume: getResume().length > 0,
      preferences: (() => {
        const p = getPreferences();
        return p.searchTerms.trim().length > 0;
      })(),
    },
  });
});

// POST /api/scheduler/pause-fetch
app.post('/api/scheduler/pause-fetch', (c) => {
  const paused = toggleFetchPause();
  return c.json({ paused });
});

// POST /api/scheduler/pause-scoring
app.post('/api/scheduler/pause-scoring', (c) => {
  const paused = toggleScoringPause();
  return c.json({ paused });
});

// Serve static files (built React app)
const DIST = resolve(import.meta.dir, '../../dist');
// Serve hashed assets and any root-level static files (favicon, etc.)
app.use('/assets/*', serveStatic({ root: DIST }));
app.use('/favicon*', serveStatic({ root: DIST }));
app.use('/robots.txt', serveStatic({ root: DIST }));
// SPA fallback: all other routes serve index.html for client-side routing
app.get('/*', (c) => new Response(Bun.file(resolve(DIST, 'index.html'))));

// Start LLM health check, job scheduler, and backup scheduler
checkLLMHealth().catch(console.error);
setInterval(() => checkLLMHealth().catch(console.error), 30_000);
if (process.env.DISABLE_SCHEDULER !== '1') {
  startScheduler();
  startBackupScheduler();
} else {
  console.log('[server] Scheduler disabled via DISABLE_SCHEDULER=1');
}

function shutdown() {
  console.log('[server] Shutting down — checkpointing WAL…');
  try {
    db.run('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (err) {
    console.error('[server] Shutdown error:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default {
  port: parseInt(process.env.PORT ?? '3000', 10),
  fetch: app.fetch,
  idleTimeout: 0, // disable idle timeout — cover letter generation can take several minutes
};
