import { useEffect, useState } from "react";
import { motion, AnimatePresence, useAnimate, useReducedMotion } from "framer-motion";
import { Job } from "../types";
import JobDetail from "./JobDetail";

interface Props {
  job: Job;
  onStatusChange: (id: string, status: string) => void;
  onSeen?: (id: string) => void;
  compact?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onRescore?: (id: string) => void;
  focused?: boolean;
  onFocusRequest?: () => void;
  onTagClick?: (tag: string) => void;
  activeTag?: string;
  isFetching?: boolean;
}

function scoreAccentColor(score: number | null): string {
  if (score === null) return "#243653";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#1a2840";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function JobRow({ job, onStatusChange, onSeen, compact, selected, onToggleSelect, onRescore, focused, onFocusRequest, onTagClick, activeTag, isFetching }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scope, animate] = useAnimate();
  const prefersReducedMotion = useReducedMotion();

  const isLowScore = job.match_score !== null && job.match_score < 50;
  const accent = scoreAccentColor(job.match_score);

  useEffect(() => {
    if (focused && scope.current) {
      scope.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focused]);

  useEffect(() => {
    if (!focused) return;
    function onKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key) {
        case 'Enter': case ' ':
          e.preventDefault();
          setExpanded(v => !v);
          if (!expanded && job.seen_at === null) markSeen();
          break;
        case 's': if (job.status === 'new') patchStatus('saved'); break;
        case 'r': if (job.status === 'new' || job.status === 'saved') patchStatus('rejected'); break;
        case 'a': if (job.status === 'new' || job.status === 'saved') patchStatus('applied'); break;
        case 'n': if (job.status === 'saved') patchStatus('new'); break;
        case 'u': window.open(job.url, '_blank', 'noopener,noreferrer'); break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, job, expanded]);

  function markSeen() {
    fetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen_at: new Date().toISOString() }),
    }).then(res => { if (res.ok) onSeen?.(job.id); }).catch(() => {});
  }

  async function patchStatus(status: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        onStatusChange(job.id, status);
        if (!prefersReducedMotion && scope.current) {
          animate(scope.current, { scale: [1, 1.015, 1] }, { duration: 0.15 });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) return;
    onFocusRequest?.();
    if (!expanded && job.seen_at === null) markSeen();
    setExpanded(v => !v);
  }

  const scoreBadgeClass = job.match_score === null
    ? "bg-surface-raised text-text-3"
    : job.match_score >= 80
      ? "bg-green-bg text-green"
      : job.match_score >= 50
        ? "bg-amber-bg text-amber"
        : "bg-surface text-text-3";

  const scoreBadge = (
    <div className="relative shrink-0">
      <div className={`${scoreBadgeClass} min-w-[2.75rem] text-center px-2 py-1.5 rounded-sm font-bold text-[0.875rem] tabular-nums`}>
        {job.match_score === null
          ? <span style={{ animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }}>···</span>
          : job.match_score}
      </div>
      {job.seen_at === null && (
        <span className="absolute -top-[4px] -right-[4px] w-[10px] h-[10px] rounded-full bg-amber border-2 border-bg" />
      )}
    </div>
  );

  const actionButtons = (
    <div className="flex gap-1.5 shrink-0 items-center" onClick={e => e.stopPropagation()}>
      <a href={job.url} target="_blank" rel="noopener noreferrer"
        className="px-2.5 py-1.5 text-[0.75rem] rounded-sm border border-border text-text-3 no-underline font-medium leading-none">
        ↗
      </a>

      {(job.status === "new" || job.status === "saved") && (
        <>
          <button onClick={() => patchStatus("applied")} disabled={loading}
            className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border-accent bg-accent-bg text-accent font-medium leading-none cursor-pointer">
            Applied →
          </button>
          <button onClick={() => patchStatus("rejected")} disabled={loading}
            className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border-red text-red font-medium leading-none bg-transparent cursor-pointer">
            Reject
          </button>
        </>
      )}

      {(job.status === "new" || job.status === "saved") && (
        <button
          onClick={() => patchStatus(job.status === "new" ? "saved" : "new")}
          disabled={loading}
          className={job.status === "saved"
            ? "px-3 py-1.5 text-[0.75rem] rounded-sm border border-accent bg-accent-bg text-accent font-medium leading-none cursor-pointer"
            : "px-3 py-1.5 text-[0.75rem] rounded-sm border border-border-accent text-accent font-medium leading-none bg-transparent cursor-pointer"
          }
        >
          {job.status === "saved" ? "Saved" : "Save"}
        </button>
      )}
    </div>
  );

  const rowContent = compact ? (
    <div
      onClick={handleRowClick}
      className="row-hover flex items-center gap-[0.625rem] px-3 py-2.5 cursor-pointer"
    >
      {onToggleSelect && (
        <div onClick={e => e.stopPropagation()} className="shrink-0 flex items-center self-stretch px-2 -mx-1">
          <input type="checkbox" checked={selected ?? false} onChange={() => onToggleSelect(job.id)}
            className="checkbox-styled" />
        </div>
      )}
      {scoreBadge}
      <div className="flex-1 min-w-0 flex items-center gap-[0.375rem] overflow-hidden">
        <span className="font-semibold text-text text-sm whitespace-nowrap overflow-hidden text-ellipsis">{job.title}</span>
        <span className="text-border shrink-0">·</span>
        <span className="text-text-2 text-[0.8125rem] whitespace-nowrap overflow-hidden text-ellipsis">{job.company}</span>
        {job.location && (
          <>
            <span className="text-border shrink-0">·</span>
            <span className="text-text-3 text-[0.75rem] whitespace-nowrap overflow-hidden text-ellipsis">{job.location}</span>
          </>
        )}
      </div>
      {actionButtons}
    </div>
  ) : (
    <div
      onClick={handleRowClick}
      className="row-hover flex items-start gap-3 px-3 sm:px-4 py-4 cursor-pointer"
    >
      {onToggleSelect && (
        <div onClick={e => e.stopPropagation()} className="shrink-0 flex items-center self-stretch px-2 -mx-1">
          <input type="checkbox" checked={selected ?? false} onChange={() => onToggleSelect(job.id)}
            className="checkbox-styled" />
        </div>
      )}
      {scoreBadge}

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold text-text text-[0.9375rem]">{job.title}</span>
              <span className="text-text-2 text-sm">{job.company}</span>
              {job.location && <span className="text-text-3 text-[0.8125rem]">{job.location}</span>}
            </div>
            <div className="flex gap-2 mt-1 flex-wrap items-center">
              <span className="bg-bg border border-border rounded-sm px-2 py-1 uppercase tracking-[0.05em] font-semibold text-[0.625rem] text-text-3">
                {job.source}
              </span>
              {job.posted_at && <span className="text-text-3 text-[0.75rem]">{formatDate(job.posted_at)}</span>}
              {job.tags && job.tags.length > 0 && job.tags.map(tag => (
                <span
                  key={tag}
                  onClick={e => { e.stopPropagation(); onTagClick?.(tag); }}
                  className={onTagClick ? "tag-btn" : ""}
                  style={{
                    background: activeTag === tag ? '#0d1e38' : '#030b17',
                    border: `1px solid ${activeTag === tag ? '#243653' : '#1a2840'}`,
                    color: activeTag === tag ? '#3b82f6' : '#6b8aa3',
                    borderRadius: "var(--radius-sm)",
                    padding: "0.1875rem 0.4375rem",
                    fontSize: "0.6875rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    cursor: onTagClick ? "pointer" : "default",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {actionButtons}
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={scope}
      className={`border-l-[3px] rounded mb-4 overflow-hidden ${selected ? 'bg-selected' : 'bg-surface'}`}
      style={{
        borderLeftColor: selected ? '#3b82f6' : accent,
        borderTop: `1px solid ${selected ? '#243653' : '#1a2840'}`,
        borderRight: `1px solid ${selected ? '#243653' : '#1a2840'}`,
        borderBottom: `1px solid ${selected ? '#243653' : '#1a2840'}`,
        opacity: isLowScore ? 0.6 : 1,
      }}
    >
      {rowContent}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <JobDetail job={job} onRescore={onRescore} isFetching={isFetching} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
