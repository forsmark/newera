import { Hono } from 'hono';
import { resolve } from 'path';
import { createBackup, listBackups, deleteBackup, restoreBackup } from '../backup';

const app = new Hono();

// GET /api/backups
app.get('/', (c) => {
  return c.json({ backups: listBackups() });
});

// POST /api/backups — trigger manual backup
app.post('/', (c) => {
  try {
    const info = createBackup();
    return c.json(info, 201);
  } catch (err) {
    console.error('[backups] Manual backup failed:', err);
    return c.json({ error: 'Backup failed' }, 500);
  }
});

// GET /api/backups/:name — download a backup file
app.get('/:name', (c) => {
  const name = c.req.param('name');
  if (!/^jobs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(name)) {
    return c.json({ error: 'Invalid backup name' }, 400);
  }
  const backupDir = process.env.BACKUP_DIR ?? resolve(import.meta.dir, '../../../backups');
  const path = resolve(backupDir, name);
  const file = Bun.file(path);
  return new Response(file, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
});

// POST /api/backups/:name/restore — restore from a backup
app.post('/:name/restore', (c) => {
  const name = c.req.param('name');
  const result = restoreBackup(name);
  return c.json(result, result.ok ? 200 : 400);
});

// DELETE /api/backups/:name
app.delete('/:name', (c) => {
  const name = c.req.param('name');
  if (!deleteBackup(name)) {
    return c.json({ error: 'Not found or invalid name' }, 404);
  }
  return c.json({ deleted: name });
});

export default app;
