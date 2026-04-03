import { useCallback, useEffect, useState } from "react";
import { Job } from "../types";
import JobRow from "../components/JobRow";
import { toast } from "../components/Toast";

interface Props {
  refreshKey?: number;
}

type FilterStatus = "all" | "unread" | "new" | "saved" | "applied";
type FilterSource = "all" | "jsearch" | "jobindex";
type PostedWithin = 'any' | '7d' | '30d';
type SortBy = 'score' | 'posted' | 'fetched';

const selectStyle: React.CSSProperties = {
  padding: "0.3125rem 0.5rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid #1a2840",
  background: "#0b1628",
  color: "#7a95b0",
  fontSize: "0.8125rem",
  cursor: "pointer",
  outline: "none",
};

export default function JobsView({ refreshKey }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalJobs, setTotalJobs] = useState(0);
  const [offset, setOffset] = useState(0);
  const [showRejected, setShowRejected] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [postedWithin, setPostedWithin] = useState<PostedWithin>(() =>
    (localStorage.getItem('jobs-posted-within') as PostedWithin | null) ?? 'any'
  );
  const [sortBy, setSortBy] = useState<SortBy>(() =>
    (localStorage.getItem('jobs-sort-by') as SortBy | null) ?? 'score'
  );
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(() =>
    localStorage.getItem("jobs-compact-view") === "true"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const fetchJobs = useCallback(async (resetOffset?: number) => {
    const useOffset = resetOffset ?? offset;
    const isReset = resetOffset !== undefined;
    if (isReset) setLoading(true);
    try {
      const res = await fetch(`/api/jobs?limit=100&offset=${useOffset}`);
      if (!res.ok) {
        toast('Failed to load jobs');
      } else {
        const data = await res.json();
        if (isReset) {
          setJobs(data.jobs);
          setOffset(100);
        } else {
          setJobs(prev => [...prev, ...data.jobs]);
          setOffset(prev => prev + data.jobs.length);
        }
        setTotalJobs(data.total);
      }
    } finally {
      if (isReset) setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchJobs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasPendingScores = jobs.some(j => j.match_score === null);

  useEffect(() => {
    if (!hasPendingScores) return;
    const MAX_POLL_MS = 10 * 60 * 1000;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) { clearInterval(interval); return; }
      fetch('/api/jobs?limit=100&offset=0')
        .then(r => r.json())
        .then((data: { jobs: Job[]; total: number }) => {
          setJobs(prev => {
            const fresh = data.jobs;
            const rest = prev.slice(fresh.length);
            return [...fresh, ...rest];
          });
          setTotalJobs(data.total);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [hasPendingScores]);

  function handleStatusChange(id: string, status: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: status as Job["status"] } : j));
  }

  function handleSeen(id: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, seen_at: new Date().toISOString() } : j));
  }

  function handleRescore(id: string) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, match_score: null, match_reasoning: null, match_summary: null } : j));
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
      if (!res.ok) {
        toast('Bulk update failed — please try again');
      } else {
        const s = status as Job['status'];
        const now = new Date().toISOString();
        setJobs(prev => prev.map(j =>
          selectedIds.has(j.id) ? { ...j, status: s, seen_at: j.seen_at ?? now } : j
        ));
        setSelectedIds(new Set());
      }
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleCompact() {
    setCompact(v => {
      const next = !v;
      localStorage.setItem("jobs-compact-view", String(next));
      return next;
    });
  }

  const filtered = jobs
    .filter(j => {
      if (!showRejected && j.status === "rejected") return false;
      if (filterStatus === "unread" && j.seen_at !== null) return false;
      if (filterStatus === "new" && j.status !== "new") return false;
      if (filterStatus === "saved" && j.status !== "saved") return false;
      if (filterStatus === "applied" && j.status !== "applied") return false;
      if (filterSource !== "all" && j.source !== filterSource) return false;
      if (activeTag && !(j.tags?.includes(activeTag))) return false;
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
        if (!a.posted_at && !b.posted_at) return 0;
        if (!a.posted_at) return 1;
        if (!b.posted_at) return -1;
        return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
      }
      return new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime();
    });

  useEffect(() => {
    setSelectedIds(new Set());
    setFocusedIndex(-1);
  }, [filterStatus, filterSource, activeTag, searchQuery, postedWithin]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const total = filtered.length;
      if (total === 0 && e.key !== '?') return;
      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(i => Math.min(i + 1, total - 1));
          break;
        case 'k': case 'ArrowUp':
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

  const jsearchCount = jobs.filter(j => j.source === 'jsearch').length;
  const jobindexCount = jobs.filter(j => j.source === 'jobindex').length;
  const unreadCount = jobs.filter(j => j.seen_at === null && j.status !== 'rejected').length;
  const newCount = jobs.filter(j => j.status === 'new').length;
  const savedCount = jobs.filter(j => j.status === 'saved').length;
  const appliedCount = jobs.filter(j => j.status === 'applied').length;

  return (
    <div style={{ maxWidth: "940px", margin: "0 auto", padding: "1.25rem 1rem" }}>

      {/* ── Filter bar ── */}
      <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>

        {/* Row 1: search + view controls */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search jobs…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #1a2840",
              background: "#0b1628",
              color: "#dde6f0",
              fontSize: "0.875rem",
              outline: "none",
            }}
          />
          <select
            value={postedWithin}
            onChange={e => { const v = e.target.value as PostedWithin; localStorage.setItem('jobs-posted-within', v); setPostedWithin(v); }}
            style={{ ...selectStyle, color: postedWithin !== 'any' ? '#dde6f0' : '#7a95b0' }}
          >
            <option value="any">Any time</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
          <select
            value={sortBy}
            onChange={e => { const v = e.target.value as SortBy; localStorage.setItem('jobs-sort-by', v); setSortBy(v); }}
            style={selectStyle}
          >
            <option value="score">↓ Score</option>
            <option value="posted">↓ Posted</option>
            <option value="fetched">↓ Fetched</option>
          </select>
          <button
            onClick={toggleCompact}
            title={compact ? "Switch to detailed view" : "Switch to compact view"}
            style={{
              padding: "0.3125rem 0.625rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #1a2840",
              background: compact ? "#1a2840" : "transparent",
              color: compact ? "#dde6f0" : "#405a74",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            {compact ? "≡ Compact" : "⊞ Detail"}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            style={{
              padding: "0.3125rem 0.5rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #1a2840",
              background: "transparent",
              color: "#405a74",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
          >
            ?
          </button>
        </div>

        {/* Row 2: status tabs + source pills + show rejected */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Status tabs */}
          <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #1a2840" }}>
            {(["all", "unread", "new", "saved", "applied"] as FilterStatus[]).map(s => {
              const count = s === "unread" ? unreadCount : s === "new" ? newCount : s === "saved" ? savedCount : s === "applied" ? appliedCount : null;
              const isActive = filterStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{
                    padding: "0.25rem 0.625rem",
                    border: "none",
                    borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                    background: "transparent",
                    color: isActive ? "#dde6f0" : "#405a74",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    fontWeight: isActive ? 600 : 400,
                    marginBottom: "-1px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  {count !== null && count > 0 && (
                    <span style={{
                      marginLeft: "0.3rem",
                      background: isActive ? "#1a2840" : "#0b1628",
                      color: isActive ? "#7a95b0" : "#405a74",
                      borderRadius: "9999px",
                      padding: "0 0.3rem",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Source pills */}
          {jsearchCount > 0 && jobindexCount > 0 && (
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {(["all", "jsearch", "jobindex"] as FilterSource[]).map(key => (
                <button
                  key={key}
                  onClick={() => setFilterSource(key)}
                  style={{
                    padding: "0.1875rem 0.5rem",
                    borderRadius: "9999px",
                    border: `1px solid ${filterSource === key ? '#243653' : '#1a2840'}`,
                    background: filterSource === key ? '#1a2840' : 'transparent',
                    color: filterSource === key ? '#7a95b0' : '#405a74',
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                  }}
                >
                  {key === 'all' ? 'All sources' : key === 'jsearch' ? 'JSearch' : 'Jobindex'}
                </button>
              ))}
            </div>
          )}

          {/* Active tag chip */}
          {activeTag && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{
                background: "#0d1e38", border: "1px solid #243653", color: "#3b82f6",
                borderRadius: "var(--radius-sm)", padding: "0.125rem 0.5rem", fontSize: "0.75rem", fontWeight: 500,
              }}>
                {activeTag}
              </span>
              <button onClick={() => setActiveTag(null)} style={{
                padding: "0.125rem 0.375rem", borderRadius: "var(--radius-sm)",
                border: "1px solid #1a2840", background: "transparent",
                color: "#405a74", cursor: "pointer", fontSize: "0.75rem",
              }}>✕</button>
            </div>
          )}

          {/* Show rejected */}
          <label style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            fontSize: "0.8125rem", color: "#405a74", cursor: "pointer", userSelect: "none",
            marginLeft: "auto",
          }}>
            <input
              type="checkbox"
              checked={showRejected}
              onChange={e => setShowRejected(e.target.checked)}
              style={{ accentColor: "#405a74", width: "13px", height: "13px" }}
            />
            Show rejected
          </label>
        </div>
      </div>

      {/* Scoring status */}
      {hasPendingScores && (
        <div style={{ fontSize: "0.75rem", color: "#405a74", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <span style={{
            display: "inline-block", width: "5px", height: "5px", borderRadius: "50%",
            background: "#f59e0b", animation: "pulse 1.5s ease-in-out infinite",
          }} />
          Scoring {jobs.filter(j => j.match_score === null).length} jobs…
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div style={{ color: "#405a74", textAlign: "center", padding: "4rem 0", fontSize: "0.875rem" }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#405a74", textAlign: "center", padding: "4rem 0" }}>
          {jobs.length === 0 ? (
            <>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "#7a95b0", marginBottom: "0.5rem" }}>No jobs yet</div>
              <div style={{ fontSize: "0.875rem" }}>
                Click <strong style={{ color: "#7a95b0", fontWeight: 600 }}>Fetch now</strong> in the nav to pull from all sources.
              </div>
            </>
          ) : (
            <span style={{ fontSize: "0.875rem" }}>No jobs match the current filters.</span>
          )}
        </div>
      ) : (
        <>
          {/* Select all row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0", marginBottom: "0.25rem" }}>
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
              onChange={toggleSelectAll}
              style={{ accentColor: "#3b82f6", width: "13px", height: "13px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.75rem", color: "#405a74" }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} jobs`}
            </span>
          </div>

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
              onTagClick={tag => setActiveTag(prev => prev === tag ? null : tag)}
              activeTag={activeTag ?? undefined}
            />
          ))}

          {jobs.length < totalJobs && (
            <div style={{ textAlign: "center", padding: "1.25rem 0" }}>
              <button
                onClick={() => fetchJobs()}
                style={{
                  padding: "0.4375rem 1.25rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid #1a2840",
                  background: "transparent",
                  color: "#7a95b0",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
                className="btn-ghost"
              >
                Load more ({totalJobs - jobs.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 300, backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0b1628", border: "1px solid #1a2840",
              borderRadius: "var(--radius)", padding: "1.5rem",
              minWidth: "280px", color: "#dde6f0",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 600 }}>Keyboard Shortcuts</h3>
            {[
              ["j / ↓", "Next job"],
              ["k / ↑", "Previous job"],
              ["Enter", "Expand/collapse"],
              ["s", "Save job"],
              ["n", "Un-save job"],
              ["r", "Reject job"],
              ["a", "Mark applied"],
              ["u", "Open URL"],
              ["?", "This help"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "2rem", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                <kbd style={{ background: "#030b17", border: "1px solid #243653", borderRadius: "var(--radius-sm)", padding: "0.125rem 0.5rem", fontFamily: "monospace", color: "#7a95b0", fontSize: "0.8125rem" }}>{key}</kbd>
                <span style={{ color: "#7a95b0" }}>{desc}</span>
              </div>
            ))}
            <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", color: "#405a74" }}>Click outside to close</p>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
          background: "#0b1628", border: "1px solid #1a2840", borderRadius: "var(--radius)",
          padding: "0.625rem 1rem",
          display: "flex", alignItems: "center", gap: "0.625rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 100,
        }}>
          <span style={{ color: "#7a95b0", fontSize: "0.875rem", fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => bulkSetStatus('saved')}
            disabled={bulkLoading}
            style={{
              padding: "0.3125rem 0.75rem", borderRadius: "var(--radius-sm)",
              border: "1px solid #1a3060", background: "transparent",
              color: "#3b82f6", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500,
            }}
          >
            Save all
          </button>
          <button
            onClick={() => bulkSetStatus('rejected')}
            disabled={bulkLoading}
            style={{
              padding: "0.3125rem 0.75rem", borderRadius: "var(--radius-sm)",
              border: "1px solid #3a0808", background: "transparent",
              color: "#ef4444", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500,
            }}
          >
            Reject all
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: "0.3125rem 0.4rem", borderRadius: "var(--radius-sm)",
              border: "none", background: "transparent",
              color: "#405a74", cursor: "pointer", fontSize: "0.875rem",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
