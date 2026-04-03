import { useEffect, useRef, useState } from "react";
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
}

function scoreAccentColor(score: number | null): string {
  if (score === null) return "#243653";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#1a2840";
}

function scoreBadgeStyle(score: number | null): React.CSSProperties {
  if (score === null) return { background: "#0f1e34", color: "#405a74" };
  if (score >= 80) return { background: "#081a10", color: "#22c55e" };
  if (score >= 50) return { background: "#1a1000", color: "#f59e0b" };
  return { background: "#0b1628", color: "#405a74" };
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

const actionBtn: React.CSSProperties = {
  padding: "0.1875rem 0.5rem",
  fontSize: "0.75rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid",
  cursor: "pointer",
  fontWeight: 500,
  lineHeight: 1.4,
  background: "transparent",
};

export default function JobRow({ job, onStatusChange, onSeen, compact, selected, onToggleSelect, onRescore, focused, onFocusRequest, onTagClick, activeTag }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const isLowScore = job.match_score !== null && job.match_score < 50;
  const accent = scoreAccentColor(job.match_score);

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      if (res.ok) onStatusChange(job.id, status);
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

  const badgeStyle = scoreBadgeStyle(job.match_score);

  const scoreBadge = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        ...badgeStyle,
        minWidth: "2.5rem",
        textAlign: "center",
        padding: "0.1875rem 0.375rem",
        borderRadius: "var(--radius-sm)",
        fontWeight: 700,
        fontSize: "0.8125rem",
        fontVariantNumeric: "tabular-nums",
      }}>
        {job.match_score === null
          ? <span style={{ animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }}>···</span>
          : job.match_score}
      </div>
      {job.seen_at === null && (
        <span style={{
          position: "absolute", top: "-3px", right: "-3px",
          width: "7px", height: "7px", borderRadius: "50%",
          background: "#f59e0b", border: "2px solid #030b17",
        }} />
      )}
    </div>
  );

  const actionButtons = (
    <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
        ...actionBtn, borderColor: "#1a2840", color: "#405a74", textDecoration: "none",
      }}>↗</a>

      {job.status === "new" && (
        <button onClick={() => patchStatus("saved")} disabled={loading} style={{ ...actionBtn, borderColor: "#1a3060", color: "#3b82f6" }}>
          Save
        </button>
      )}

      {(job.status === "new" || job.status === "saved") && (
        <>
          <button onClick={() => patchStatus("applied")} disabled={loading} style={{
            ...actionBtn, borderColor: "#1a3060", background: "#0d1e38", color: "#3b82f6",
          }}>
            Applied →
          </button>
          <button onClick={() => patchStatus("rejected")} disabled={loading} style={{ ...actionBtn, borderColor: "#3a0808", color: "#ef4444" }}>
            Reject
          </button>
        </>
      )}

      {job.status === "saved" && (
        <>
          <span style={{ fontSize: "0.75rem", color: "#3b82f6", fontWeight: 600, padding: "0.1875rem 0.375rem" }}>
            Saved
          </span>
          <button onClick={() => patchStatus("new")} disabled={loading} style={{ ...actionBtn, borderColor: "#1a2840", color: "#405a74", fontSize: "0.6875rem" }}>
            Unsave
          </button>
        </>
      )}
    </div>
  );

  const borderStyle = `1px solid ${selected ? '#243653' : '#1a2840'}`;
  const bgStyle = selected ? '#0b1830' : '#0b1628';

  if (compact) {
    return (
      <div
        ref={rowRef}
        style={{
          borderLeft: `3px solid ${selected ? '#3b82f6' : accent}`,
          border: borderStyle,
          borderLeftWidth: "3px",
          borderLeftColor: selected ? '#3b82f6' : accent,
          borderRadius: "var(--radius-sm)",
          marginBottom: "6px",
          background: bgStyle,
          opacity: isLowScore ? 0.6 : 1,
          overflow: "hidden",
        }}
      >
        <div
          onClick={handleRowClick}
          className="row-hover"
          style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.4375rem 0.75rem", cursor: "pointer" }}
        >
          {onToggleSelect && (
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
              <input type="checkbox" checked={selected ?? false} onChange={() => onToggleSelect(job.id)} style={{ accentColor: "#3b82f6", width: "13px", height: "13px", cursor: "pointer" }} />
            </div>
          )}
          {scoreBadge}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "0.375rem", overflow: "hidden" }}>
            <span style={{ fontWeight: 600, color: "#dde6f0", fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job.title}
            </span>
            <span style={{ color: "#1a2840", flexShrink: 0 }}>·</span>
            <span style={{ color: "#7a95b0", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job.company}
            </span>
            {job.location && (
              <>
                <span style={{ color: "#1a2840", flexShrink: 0 }}>·</span>
                <span style={{ color: "#405a74", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {job.location}
                </span>
              </>
            )}
          </div>
          {actionButtons}
        </div>
        {expanded && <JobDetail job={job} onRescore={onRescore} />}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      style={{
        borderLeft: `3px solid ${selected ? '#3b82f6' : accent}`,
        border: borderStyle,
        borderLeftWidth: "3px",
        borderLeftColor: selected ? '#3b82f6' : accent,
        borderRadius: "var(--radius-sm)",
        marginBottom: "6px",
        background: bgStyle,
        opacity: isLowScore ? 0.6 : 1,
        overflow: "hidden",
      }}
    >
      <div
        onClick={handleRowClick}
        className="row-hover"
        style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.625rem 0.875rem", cursor: "pointer" }}
      >
        {onToggleSelect && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", paddingTop: "2px" }}>
            <input type="checkbox" checked={selected ?? false} onChange={() => onToggleSelect(job.id)} style={{ accentColor: "#3b82f6", width: "13px", height: "13px", cursor: "pointer" }} />
          </div>
        )}
        {scoreBadge}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "#dde6f0", fontSize: "0.9375rem" }}>{job.title}</span>
            <span style={{ color: "#7a95b0", fontSize: "0.875rem" }}>{job.company}</span>
            {job.location && <span style={{ color: "#405a74", fontSize: "0.8125rem" }}>{job.location}</span>}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              background: "#030b17", border: "1px solid #1a2840", borderRadius: "var(--radius-sm)",
              padding: "0.0625rem 0.3125rem", textTransform: "uppercase",
              letterSpacing: "0.05em", fontWeight: 600, fontSize: "0.625rem", color: "#405a74",
            }}>
              {job.source}
            </span>
            {job.posted_at && <span style={{ color: "#405a74", fontSize: "0.75rem" }}>{formatDate(job.posted_at)}</span>}
            {job.tags && job.tags.length > 0 && job.tags.map(tag => (
              <span
                key={tag}
                onClick={e => { e.stopPropagation(); onTagClick?.(tag); }}
                className={onTagClick ? "tag-btn" : ""}
                style={{
                  background: activeTag === tag ? '#0d1e38' : '#030b17',
                  border: `1px solid ${activeTag === tag ? '#243653' : '#1a2840'}`,
                  color: activeTag === tag ? '#3b82f6' : '#405a74',
                  borderRadius: "var(--radius-sm)",
                  padding: "0.0625rem 0.3125rem",
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
      {expanded && <JobDetail job={job} onRescore={onRescore} />}
    </div>
  );
}
