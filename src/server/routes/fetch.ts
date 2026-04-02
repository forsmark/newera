import { Hono } from 'hono';
import { fetchJobs } from '../scheduler';

const app = new Hono();

// POST /api/fetch — trigger an immediate fetch from all sources
app.post('/', async (c) => {
  // Run fetch and return new job count (LLM analysis continues in background)
  const newCount = await fetchJobs().catch((err) => {
    console.error('[fetch route] fetchJobs failed:', err);
    return 0;
  });
  return c.json({ new_jobs: newCount }, 200);
});

export default app;
