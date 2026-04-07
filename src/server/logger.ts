import db from './db';

const MAX_LOGS = 2000;

function formatArgs(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

function writeLog(level: string, args: unknown[]) {
  const message = formatArgs(args);
  const created_at = new Date().toISOString();
  try {
    db.run('INSERT INTO logs (level, message, created_at) VALUES (?, ?, ?)', [level, message, created_at]);
    // Prune oldest entries when over limit
    db.run(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ${MAX_LOGS})`);
  } catch { /* never crash on log write */ }
}

let installed = false;

export function setupLogger() {
  if (installed) return;
  installed = true;

  const _log   = console.log.bind(console);
  const _info  = console.info.bind(console);
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);

  console.log   = (...args) => { _log(...args);   writeLog('info',  args); };
  console.info  = (...args) => { _info(...args);  writeLog('info',  args); };
  console.warn  = (...args) => { _warn(...args);  writeLog('warn',  args); };
  console.error = (...args) => { _error(...args); writeLog('error', args); };
}
