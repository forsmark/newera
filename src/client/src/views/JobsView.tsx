import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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

const selectClass = "px-2.5 py-2 rounded-sm border border-border bg-surface text-text-2 text-[0.8125rem] cursor-pointer outline-none";

// Stagger animation for list items
const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
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
  const [rescoring, setRescoring] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Track filter identity to re-trigger list animation
  const filterKey = `${filterStatus}|${filterSource}|${activeTag}|${searchQuery}|${postedWithin}|${sortBy}`;
  const prevFilterKey = useRef(filterKey);

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

  async function handleRescoreAll() {
    if (rescoring) return;
    setRescoring(true);
    try {
      const res = await fetch('/api/jobs/rescore-all', { method: 'POST' });
      if (!res.ok) {
        toast('Re-score failed — please try again');
      } else {
        setJobs(prev => prev.map(j =>
          j.status !== 'rejected' ? { ...j, match_score: null, match_reasoning: null, match_summary: null } : j
        ));
      }
    } finally {
      setRescoring(false);
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

  // Determine whether to animate the list (filter changed)
  const shouldAnimate = !prefersReducedMotion && filterKey !== prevFilterKey.current;
  if (filterKey !== prevFilterKey.current) prevFilterKey.current = filterKey;

  // Cap stagger at 15 items
  const animatedItems = Math.min(filtered.length, 15);

  return (
    <div className="max-w-[940px] mx-auto px-3 sm:px-4 py-4 sm:py-6">

      {/* Filter bar */}
      <div className="mb-4 sm:mb-5 flex flex-col gap-2 sm:gap-3">

        {/* Row 1: search + view controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            placeholder="Search jobs…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 rounded-sm border border-border bg-surface text-text text-sm outline-none"
          />
          <div className="flex gap-2 items-center">
            <select
              value={postedWithin}
              onChange={e => { const v = e.target.value as PostedWithin; localStorage.setItem('jobs-posted-within', v); setPostedWithin(v); }}
              className={`${selectClass} flex-1 sm:flex-none ${postedWithin !== 'any' ? 'text-text' : 'text-text-2'}`}
            >
              <option value="any">Any time</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <select
              value={sortBy}
              onChange={e => { const v = e.target.value as SortBy; localStorage.setItem('jobs-sort-by', v); setSortBy(v); }}
              className={`${selectClass} flex-1 sm:flex-none`}
            >
              <option value="score">↓ Score</option>
              <option value="posted">↓ Posted</option>
              <option value="fetched">↓ Fetched</option>
            </select>
            <button
              onClick={toggleCompact}
              title={compact ? "Switch to detailed view" : "Switch to compact view"}
              className={`shrink-0 px-2.5 py-2 rounded-sm border border-border text-[0.8125rem] font-medium cursor-pointer ${compact ? 'bg-border text-text' : 'bg-transparent text-text-3'}`}
            >
              {compact ? "≡" : "⊞"}
            </button>
            <button
              onClick={handleRescoreAll}
              disabled={rescoring}
              title="Re-score all jobs"
              className="shrink-0 px-2.5 py-2 rounded-sm border border-border bg-transparent text-text-3 cursor-pointer text-[0.8125rem] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rescoring ? "…" : "↻"}
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts"
              className="shrink-0 px-2.5 py-2 rounded-sm border border-border bg-transparent text-text-3 cursor-pointer text-[0.8125rem] font-semibold"
            >
              ?
            </button>
          </div>
        </div>

        {/* Row 2: status tabs + source/tag pills */}
        <div className="flex gap-2 sm:gap-3 items-center flex-wrap">
          {/* Status tabs */}
          <div className="flex gap-0 border-b border-border overflow-x-auto shrink-0 w-full sm:w-auto">
            {(["all", "unread", "new", "saved", "applied"] as FilterStatus[]).map(s => {
              const count = s === "unread" ? unreadCount : s === "new" ? newCount : s === "saved" ? savedCount : s === "applied" ? appliedCount : null;
              const isActive = filterStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className="px-3 py-2 border-none bg-transparent cursor-pointer text-[0.8125rem] whitespace-nowrap -mb-px"
                  style={{
                    borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                    color: isActive ? '#dde6f0' : '#6b8aa3',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  {count !== null && count > 0 && (
                    <span className="ml-[0.3rem] rounded-full px-[0.3rem] text-[0.6875rem] font-semibold"
                      style={{
                        background: isActive ? '#1a2840' : '#0b1628',
                        color: isActive ? '#7a95b0' : '#6b8aa3',
                      }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Source pills + active tag + show rejected — second line on mobile */}
          <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto sm:contents">
            {/* Source pills */}
            {jsearchCount > 0 && jobindexCount > 0 && (
              <div className="flex gap-1">
                {(["all", "jsearch", "jobindex"] as FilterSource[]).map(key => (
                  <button
                    key={key}
                    onClick={() => setFilterSource(key)}
                    className="px-3 py-1.5 rounded-full border cursor-pointer text-[0.75rem] font-medium"
                    style={{
                      borderColor: filterSource === key ? '#243653' : '#1a2840',
                      background: filterSource === key ? '#1a2840' : 'transparent',
                      color: filterSource === key ? '#7a95b0' : '#6b8aa3',
                    }}
                  >
                    {key === 'all' ? 'All sources' : key === 'jsearch' ? 'JSearch' : 'Jobindex'}
                  </button>
                ))}
              </div>
            )}

            {/* Active tag chip */}
            {activeTag && (
              <div className="flex items-center gap-1">
                <span className="bg-accent-bg border border-border-2 text-accent rounded-sm px-2 py-[0.125rem] text-[0.75rem] font-medium">
                  {activeTag}
                </span>
                <button onClick={() => setActiveTag(null)}
                  className="px-[0.375rem] py-[0.125rem] rounded-sm border border-border bg-transparent text-text-3 cursor-pointer text-[0.75rem]">
                  ✕
                </button>
              </div>
            )}

            {/* Show rejected */}
            <label className="flex items-center gap-[0.375rem] text-[0.8125rem] text-text-3 cursor-pointer select-none sm:ml-auto">
              <input
                type="checkbox"
                checked={showRejected}
                onChange={e => setShowRejected(e.target.checked)}
                className="checkbox-styled"
              />
              Show rejected
            </label>
          </div>
        </div>
      </div>

      {/* Scoring status */}
      {hasPendingScores && (
        <div className="text-[0.75rem] text-text-3 mb-3 flex items-center gap-[0.375rem]">
          <span className="inline-block w-[5px] h-[5px] rounded-full bg-amber" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
          Scoring {jobs.filter(j => j.match_score === null).length} jobs…
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="text-text-3 text-center py-16 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-text-3 text-center py-16">
          {jobs.length === 0 ? (
            <>
              <div className="text-base font-semibold text-text-2 mb-2">No jobs yet</div>
              <div className="text-sm">
                Click <strong className="text-text-2 font-semibold">Fetch now</strong> in the nav to pull from all sources.
              </div>
            </>
          ) : (
            <span className="text-sm">No jobs match the current filters.</span>
          )}
        </div>
      ) : (
        <>
          {/* Select all row */}
          <div className="flex items-center gap-2 py-1 mb-1">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
              onChange={toggleSelectAll}
              className="checkbox-styled"
            />
            <span className="text-[0.75rem] text-text-3">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} jobs`}
            </span>
          </div>

          <motion.div
            key={filterKey}
            variants={shouldAnimate ? listVariants : undefined}
            initial={shouldAnimate ? "hidden" : false}
            animate={shouldAnimate ? "visible" : undefined}
          >
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
          </motion.div>

          {jobs.length < totalJobs && (
            <div className="text-center py-5">
              <button
                onClick={() => fetchJobs()}
                className="px-5 py-[0.4375rem] rounded border border-border bg-transparent text-text-2 cursor-pointer text-sm btn-ghost"
              >
                Load more ({totalJobs - jobs.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* Keyboard shortcuts modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowShortcuts(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface border border-border rounded p-6 min-w-[280px] text-text shadow-[0_24px_48px_rgba(0,0,0,0.6)]"
            >
              <h3 className="m-0 mb-4 text-[0.9375rem] font-semibold">Keyboard Shortcuts</h3>
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
                <div key={key} className="flex justify-between gap-8 mb-2 text-sm">
                  <kbd className="bg-bg border border-border-2 rounded-sm px-2 py-[0.125rem] font-mono text-text-2 text-[0.8125rem]">{key}</kbd>
                  <span className="text-text-2">{desc}</span>
                </div>
              ))}
              <p className="mt-4 mb-0 text-[0.75rem] text-text-3">Click outside to close</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-border rounded px-4 py-[0.625rem] flex items-center gap-[0.625rem] shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100]"
          >
            <span className="text-text-2 text-sm font-medium">{selectedIds.size} selected</span>
            <button
              onClick={() => bulkSetStatus('saved')}
              disabled={bulkLoading}
              className="px-3.5 py-1.5 rounded-sm border border-border-accent bg-transparent text-accent cursor-pointer text-[0.8125rem] font-medium"
            >
              Save all
            </button>
            <button
              onClick={() => bulkSetStatus('rejected')}
              disabled={bulkLoading}
              className="px-3.5 py-1.5 rounded-sm border border-border-red bg-transparent text-red cursor-pointer text-[0.8125rem] font-medium"
            >
              Reject all
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1.5 rounded-sm border-none bg-transparent text-text-3 cursor-pointer text-sm"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
