import { Hono } from 'hono';
import db from '../db';

const app = new Hono();

interface LogRow {
  id: number;
  level: string;
  message: string;
  created_at: string;
}

// GET /api/logs?limit=200&level=error
app.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const level = c.req.query('level');
  const limit = Math.min(parseInt(limitParam ?? '500', 10) || 500, 2000);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (level && ['info', 'warn', 'error'].includes(level)) {
    conditions.push('level = ?');
    params.push(level);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = db.query(`SELECT id, level, message, created_at FROM logs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as LogRow[];

  return c.json({ logs: rows.reverse(), total: rows.length });
});

// GET /api/logs/export — download all logs as plain text
app.get('/export', (c) => {
  const rows = db.query('SELECT level, message, created_at FROM logs ORDER BY id ASC').all() as LogRow[];
  const text = rows
    .map(r => `[${r.created_at}] [${r.level.toUpperCase().padEnd(5)}] ${r.message}`)
    .join('\n');
  const filename = `new-era-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// DELETE /api/logs — clear all logs
app.delete('/', (c) => {
  const result = db.run('DELETE FROM logs');
  return c.json({ deleted: result.changes });
});

// POST /api/logs/archive — export then clear
app.post('/archive', (c) => {
  const rows = db.query('SELECT level, message, created_at FROM logs ORDER BY id ASC').all() as LogRow[];
  const text = rows
    .map(r => `[${r.created_at}] [${r.level.toUpperCase().padEnd(5)}] ${r.message}`)
    .join('\n');
  db.run('DELETE FROM logs');
  const filename = `new-era-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export default app;
