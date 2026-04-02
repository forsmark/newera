import { useCallback, useEffect, useState } from "react";
import { Job } from "../types";
import JobRow from "../components/JobRow";


interface Props {
  refreshKey?: number;
}

type FilterStatus = "all" | "unread" | "new" | "saved";
type PostedWithin = 'any' | '7d' | '30d';
type SortBy = 'score' | 'posted' | 'fetched';

export default function JobsView({ refreshKey }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRejected, setShowRejected] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [postedWithin, setPostedWithin] = useState<PostedWithin>('any');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [compact, setCompact] = useState<boolean>(() => {
    return localStorage.getItem("jobs-compact-view") === "true";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  const hasPendingScores = jobs.some(j => j.match_score === null);

  // Auto-poll while any jobs have pending scores (max 10 min)
  useEffect(() => {
    if (!hasPendingScores) return;

    const MAX_POLL_MS = 10 * 60 * 1000;
    const startedAt = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(interval);
        return;
      }
      // Refresh silently (don't set loading=true — avoid flickering the list)
      fetch('/api/jobs')
        .then(r => r.json())
        .then((data: Job[]) => setJobs(data))
        .catch(() => {}); // ignore errors during background poll
    }, 5000);

    return () => clearInterval(interval);
  }, [hasPendingScores]);

  function handleStatusChange(id: string, status: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: status as Job["status"] } : j))
    );
  }

  function handleSeen(id: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, seen_at: new Date().toISOString() } : j))
    );
  }

  function handleRescore(id: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, match_score: null, match_reasoning: null } : j));
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(j => j.id)));
    }
  }

  async function bulkSetStatus(status: 'saved' | 'rejected') {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/jobs/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], status }),
      });
      if (res.ok) {
        const s = status as Job['status'];
        const now = new Date().toISOString();
        setJobs(prev => prev.map(j =>
          selectedIds.has(j.id)
            ? { ...j, status: s, seen_at: j.seen_at ?? now }
            : j
        ));
        setSelectedIds(new Set());
      }
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleCompact() {
    setCompact((v) => {
      const next = !v;
      localStorage.setItem("jobs-compact-view", String(next));
      return next;
    });
  }

  const filtered = jobs
    .filter((j) => {
      if (!showRejected && j.status === "rejected") return false;
      if (filterStatus === "unread" && j.seen_at !== null) return false;
      if (filterStatus === "new" && j.status !== "new") return false;
      if (filterStatus === "saved" && j.status !== "saved") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))) return false;
      }
      if (postedWithin !== 'any' && j.posted_at) {
        const days = postedWithin === '7d' ? 7 : 30;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        if (new Date(j.posted_at).getTime() < cutoff) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') {
        if (a.match_score === null && b.match_score === null) return 0;
        if (a.match_score === null) return 1;
        if (b.match_score === null) return -1;
        return b.match_score - a.match_score;
      }
      if (sortBy === 'posted') {
        // nulls last
        if (!a.posted_at && !b.posted_at) return 0;
        if (!a.posted_at) return 1;
        if (!b.posted_at) return -1;
        return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
      }
      // fetched: newest first, always has a value
      return new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime();
    });

  useEffect(() => {
    setSelectedIds(new Set());
    setFocusedIndex(-1);
  }, [filterStatus, searchQuery, postedWithin]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      const total = filtered.length;
      if (total === 0 && e.key !== '?') return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(i => Math.min(i + 1, total - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(i => Math.max(i - 1, 0));
          break;
        case '?':
          setShowShortcuts(v => !v);
          break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtered.length]);

  const unreadCount = jobs.filter(j => j.seen_at === null && j.status !== 'rejected').length;
  const newCount = jobs.filter(j => j.status === 'new').length;
  const savedCount = jobs.filter(j => j.status === 'saved').length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.375rem 0.875rem",
    borderRadius: "0.375rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 400,
    background: active ? "#1d4ed8" : "transparent",
    color: active ? "#fff" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search title or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "0.4rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f1f5f9",
            fontSize: "0.875rem",
            outline: "none",
          }}
        />

        <select
          value={postedWithin}
          onChange={e => setPostedWithin(e.target.value as PostedWithin)}
          style={{
            padding: '0.4rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #334155',
            background: '#1e293b',
            color: postedWithin !== 'any' ? '#f1f5f9' : '#64748b',
            fontSize: '0.875rem',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="any">Any time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          style={{
            padding: '0.4rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#94a3b8',
            fontSize: '0.875rem',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="score">↓ Score</option>
          <option value="posted">↓ Posted date</option>
          <option value="fetched">↓ Fetched date</option>
        </select>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: "0.25rem", background: "#0f172a", borderRadius: "0.5rem", padding: "0.25rem" }}>
          {(["all", "unread", "new", "saved"] as FilterStatus[]).map((s) => {
            const count = s === "unread" ? unreadCount : s === "new" ? newCount : s === "saved" ? savedCount : null;
            return (
              <button key={s} style={tabStyle(filterStatus === s)} onClick={() => setFilterStatus(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {count !== null && count > 0 && (
                  <span style={{
                    marginLeft: '0.375rem',
                    background: filterStatus === s ? 'rgba(255,255,255,0.2)' : '#1e293b',
                    color: filterStatus === s ? '#fff' : '#94a3b8',
                    borderRadius: '9999px',
                    padding: '0 0.375rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    lineHeight: '1.4',
                    display: 'inline-block',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.875rem",
            color: "#94a3b8",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
            style={{ accentColor: "#6b7280" }}
          />
          Show rejected
        </label>

        <button
          onClick={toggleCompact}
          title={compact ? "Switch to detailed view" : "Switch to compact view"}
          style={{
            padding: "0.375rem 0.625rem",
            borderRadius: "0.375rem",
            border: "1px solid #334155",
            background: compact ? "#1d4ed8" : "transparent",
            color: compact ? "#fff" : "#94a3b8",
            cursor: "pointer",
            fontSize: "0.8125rem",
            fontWeight: 500,
          }}
        >
          {compact ? "⊞ Detailed" : "≡ Compact"}
        </button>
      </div>

      {/* Scoring status indicator */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {hasPendingScores && (
        <div style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#f59e0b',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          Scoring jobs…
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: "3rem 0" }}>
          Loading jobs...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: "3rem 0" }}>
          {jobs.length === 0 ? (
            <>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No jobs yet</div>
              <div style={{ fontSize: '0.875rem' }}>
                Click <strong style={{ color: '#94a3b8' }}>Fetch now</strong> in the nav bar to pull jobs from all sources.
              </div>
            </>
          ) : (
            'No jobs match the current filters.'
          )}
        </div>
      ) : (
        <>
          {filtered.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.5rem',
              marginBottom: '0.25rem',
            }}>
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                onChange={toggleSelectAll}
                style={{ accentColor: '#1d4ed8', width: '14px', height: '14px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} jobs`}
              </span>
            </div>
          )}
          {filtered.map((job, index) => (
            <JobRow
              key={job.id}
              job={job}
              focused={index === focusedIndex}
              onFocusRequest={() => setFocusedIndex(index)}
              onStatusChange={handleStatusChange}
              onSeen={handleSeen}
              compact={compact}
              selected={selectedIds.has(job.id)}
              onToggleSelect={toggleSelect}
              onRescore={handleRescore}
            />
          ))}
        </>
      )}

      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: '0.75rem', padding: '1.5rem',
              minWidth: '280px', color: '#f1f5f9',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Keyboard Shortcuts</h3>
            {[
              ['j / ↓', 'Next job'],
              ['k / ↑', 'Previous job'],
              ['Enter', 'Expand/collapse'],
              ['s', 'Save job'],
              ['n', 'Un-save job'],
              ['r', 'Reject job'],
              ['a', 'Mark applied'],
              ['u', 'Open URL'],
              ['?', 'Show/hide this help'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                <kbd style={{ background: '#0f172a', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.125rem 0.5rem', fontFamily: 'monospace', color: '#94a3b8' }}>{key}</kbd>
                <span style={{ color: '#94a3b8' }}>{desc}</span>
              </div>
            ))}
            <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', color: '#475569' }}>Click anywhere to close</p>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '0.75rem',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
        }}>
          <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => bulkSetStatus('saved')}
            disabled={bulkLoading}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '0.375rem',
              border: '1px solid #1d4ed8',
              background: 'transparent',
              color: '#60a5fa',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Save all
          </button>
          <button
            onClick={() => bulkSetStatus('rejected')}
            disabled={bulkLoading}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '0.375rem',
              border: '1px solid #7f1d1d',
              background: 'transparent',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Reject all
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: '0.375rem 0.5rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
