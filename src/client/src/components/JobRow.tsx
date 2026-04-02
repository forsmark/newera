import { useState } from "react";
import { Job } from "../types";
import JobDetail from "./JobDetail";

interface Props {
  job: Job;
  onStatusChange: (id: string, status: string) => void;
  onSeen?: (id: string) => void;
  compact?: boolean;
}

function scoreBadgeStyle(score: number | null): React.CSSProperties {
  if (score === null) {
    return {
      background: "#374151",
      color: "#9ca3af",
    };
  }
  if (score >= 80) {
    return {
      background: "#14532d",
      color: "#22c55e",
    };
  }
  if (score >= 50) {
    return {
      background: "#451a03",
      color: "#f59e0b",
    };
  }
  return {
    background: "#1f2937",
    color: "#6b7280",
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const btnBase: React.CSSProperties = {
  padding: "0.25rem 0.625rem",
  fontSize: "0.75rem",
  borderRadius: "0.25rem",
  border: "1px solid",
  cursor: "pointer",
  fontWeight: 500,
  lineHeight: 1.4,
};

export default function JobRow({ job, onStatusChange, onSeen, compact }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLowScore = job.match_score !== null && job.match_score < 50;

  async function patchStatus(status: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        console.error(`Failed to update job status: ${res.status} ${res.statusText}`);
        return;
      }
      onStatusChange(job.id, status);
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    if (!expanded && job.seen_at === null) {
      fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen_at: new Date().toISOString() }),
      }).then(res => {
        if (res.ok) onSeen?.(job.id);
      }).catch(() => {});
    }
    setExpanded((v) => !v);
  }

  const score = job.match_score;
  const badgeStyle = scoreBadgeStyle(score);

  const scoreBadge = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          ...badgeStyle,
          minWidth: "2.75rem",
          textAlign: "center",
          padding: "0.25rem 0.375rem",
          borderRadius: "0.375rem",
          fontWeight: 700,
          fontSize: "0.875rem",
          marginTop: "0.125rem",
        }}
      >
        {score === null ? "..." : score}
      </div>
      {job.seen_at === null && (
        <span
          style={{
            position: "absolute",
            top: "-3px",
            right: "-3px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#f59e0b",
            border: "1px solid #1e293b",
          }}
        />
      )}
    </div>
  );

  const actionButtons = (
    <div
      style={{ display: "flex", gap: "0.375rem", flexShrink: 0, alignItems: "center" }}
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...btnBase,
          background: "transparent",
          borderColor: "#475569",
          color: "#94a3b8",
          textDecoration: "none",
        }}
      >
        View ↗
      </a>

      {job.status === "new" && (
        <button
          onClick={() => patchStatus("saved")}
          disabled={loading}
          style={{
            ...btnBase,
            background: "transparent",
            borderColor: "#1d4ed8",
            color: "#60a5fa",
          }}
        >
          Save
        </button>
      )}

      {(job.status === "new" || job.status === "saved") && (
        <>
          <button
            onClick={() => patchStatus("applied")}
            disabled={loading}
            style={{
              ...btnBase,
              background: "#1d4ed8",
              borderColor: "#1d4ed8",
              color: "#fff",
            }}
          >
            Applied →
          </button>
          <button
            onClick={() => patchStatus("rejected")}
            disabled={loading}
            style={{
              ...btnBase,
              background: "transparent",
              borderColor: "#7f1d1d",
              color: "#f87171",
            }}
          >
            Reject
          </button>
        </>
      )}

      {job.status === "saved" && (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#60a5fa",
            fontWeight: 600,
            padding: "0.25rem 0.375rem",
          }}
        >
          Saved
        </span>
      )}
    </div>
  );

  if (compact) {
    return (
      <div
        style={{
          border: "1px solid #334155",
          borderRadius: "0.5rem",
          marginBottom: "0.375rem",
          background: "#1e293b",
          opacity: isLowScore ? 0.65 : 1,
          overflow: "hidden",
        }}
      >
        <div
          onClick={handleRowClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.5rem 0.875rem",
            cursor: "pointer",
          }}
        >
          {scoreBadge}

          {/* Title + company + location inline */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "0.375rem", overflow: "hidden" }}>
            <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job.title}
            </span>
            <span style={{ color: "#64748b", fontSize: "0.8125rem", flexShrink: 0 }}>·</span>
            <span style={{ color: "#94a3b8", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job.company}
            </span>
            {job.location && (
              <>
                <span style={{ color: "#64748b", fontSize: "0.8125rem", flexShrink: 0 }}>·</span>
                <span style={{ color: "#64748b", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {job.location}
                </span>
              </>
            )}
          </div>

          {actionButtons}
        </div>

        {expanded && <JobDetail job={job} />}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #334155",
        borderRadius: "0.5rem",
        marginBottom: "0.5rem",
        background: "#1e293b",
        opacity: isLowScore ? 0.65 : 1,
        overflow: "hidden",
      }}
    >
      <div
        onClick={handleRowClick}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          cursor: "pointer",
        }}
      >
        {scoreBadge}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.9375rem" }}>
              {job.title}
            </span>
            <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{job.company}</span>
            {job.location && (
              <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>{job.location}</span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginTop: "0.25rem",
              fontSize: "0.75rem",
              color: "#64748b",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "0.25rem",
                padding: "0.1rem 0.375rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontWeight: 600,
              }}
            >
              {job.source}
            </span>
            {job.posted_at && <span>{formatDate(job.posted_at)}</span>}
          </div>
        </div>

        {actionButtons}
      </div>

      {expanded && <JobDetail job={job} />}
    </div>
  );
}
