import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../components/Toast";

interface LogEntry {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
}

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<string, string> = {
  info:  'var(--color-text-3)',
  warn:  '#f59e0b',
  error: '#f87171',
};

const LEVEL_BG: Record<string, string> = {
  warn:  'rgba(245,158,11,0.07)',
  error: 'rgba(248,113,113,0.07)',
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('sv-SE', { hour12: false }).replace('T', ' ');
}

export default function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const url = levelFilter === 'all' ? '/api/logs?limit=2000' : `/api/logs?limit=2000&level=${levelFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
    const interval = setInterval(fetchLogs, 5_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  async function handleClear() {
    if (!confirm('Clear all logs? This cannot be undone.')) return;
    const res = await fetch('/api/logs', { method: 'DELETE' });
    if (res.ok) {
      setLogs([]);
      toast('Logs cleared');
    } else {
      toast('Failed to clear logs');
    }
  }

  function handleExport() {
    window.open('/api/logs/export', '_blank');
  }

  async function handleArchive() {
    if (!confirm('Archive logs? This will download all logs and then clear them.')) return;
    const res = await fetch('/api/logs/archive', { method: 'POST' });
    if (!res.ok) { toast('Archive failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disp = res.headers.get('Content-Disposition') ?? '';
    const match = disp.match(/filename="([^"]+)"/);
    a.download = match?.[1] ?? 'logs.txt';
    a.click();
    URL.revokeObjectURL(url);
    setLogs([]);
    toast('Logs archived and cleared');
  }

  const filtered = logs.filter(l => {
    if (search) return l.message.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const warnCount = logs.filter(l => l.level === 'warn').length;
  const errorCount = logs.filter(l => l.level === 'error').length;

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 sm:py-6 flex flex-col gap-4" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1">
          <h2 className="m-0 text-[1rem] font-semibold text-text">Server Logs</h2>
          <p className="m-0 text-[0.75rem] text-text-3 mt-0.5">
            {logs.length} entries · {errorCount > 0 && <span className="text-red">{errorCount} error{errorCount !== 1 ? 's' : ''} · </span>}
            {warnCount > 0 && <span className="text-amber">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
            {warnCount === 0 && errorCount === 0 && 'no warnings or errors'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAutoScroll(v => !v)}
            className={`px-3 py-1.5 rounded-sm border text-[0.8125rem] cursor-pointer font-medium ${autoScroll ? 'border-border-2 bg-border text-text-2' : 'border-border bg-transparent text-text-3'}`}
          >
            Auto-scroll {autoScroll ? 'on' : 'off'}
          </button>
          <button onClick={handleExport}
            className="px-3 py-1.5 rounded-sm border border-border bg-transparent text-text-2 text-[0.8125rem] cursor-pointer font-medium">
            Export
          </button>
          <button onClick={handleArchive}
            className="px-3 py-1.5 rounded-sm border border-border bg-transparent text-text-2 text-[0.8125rem] cursor-pointer font-medium">
            Archive &amp; clear
          </button>
          <button onClick={handleClear}
            className="px-3 py-1.5 rounded-sm border border-border-red bg-transparent text-red text-[0.8125rem] cursor-pointer font-medium">
            Clear
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-0 border-b border-border">
          {(['all', 'info', 'warn', 'error'] as LevelFilter[]).map(l => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className="px-3 py-1.5 border-none bg-transparent cursor-pointer text-[0.8125rem] whitespace-nowrap -mb-px"
              style={{
                borderBottom: `2px solid ${levelFilter === l ? '#3b82f6' : 'transparent'}`,
                color: levelFilter === l ? 'var(--color-text)' : LEVEL_COLORS[l] ?? 'var(--color-text-3)',
                fontWeight: levelFilter === l ? 600 : 400,
              }}
            >
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter messages…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-1.5 rounded-sm border border-border bg-surface text-text text-[0.8125rem] outline-none"
        />
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto rounded border border-border bg-bg font-mono text-[0.75rem] leading-relaxed min-h-0">
        {loading ? (
          <div className="text-text-3 p-4">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-text-3 p-4">No log entries.</div>
        ) : (
          filtered.map(entry => (
            <div
              key={entry.id}
              className="flex gap-3 px-3 py-[0.2rem] border-b border-border/40"
              style={{ background: LEVEL_BG[entry.level] ?? 'transparent' }}
            >
              <span className="shrink-0 text-text-3 select-none tabular-nums" style={{ minWidth: '11rem' }}>
                {formatTs(entry.created_at)}
              </span>
              <span
                className="shrink-0 uppercase font-semibold select-none"
                style={{ color: LEVEL_COLORS[entry.level], minWidth: '2.5rem' }}
              >
                {entry.level}
              </span>
              <span className="text-text-2 whitespace-pre-wrap break-all">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
