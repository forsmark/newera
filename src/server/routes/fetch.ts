import { Hono } from 'hono';
import { fetchJobs } from '../scheduler';

const app = new Hono();

// POST /api/fetch — trigger an immediate fetch from all sources
app.post('/', (c) => {
  // Fire and forget — do not await
  fetchJobs().catch((err) => console.error('[fetch route] fetchJobs failed:', err));
  return c.json({ message: 'Fetch triggered' }, 202);
});

export default app;
