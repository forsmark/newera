import { useEffect, useState } from "react";
import { Application } from "../types";

interface Props {
  application: Application;
  onUpdate: (updated: Application) => void;
  columnColor?: string;
}

function scoreBadgeStyle(score: number | null): React.CSSProperties {
  if (score === null) return { background: "#0f1e34", color: "#405a74" };
  if (score >= 80) return { background: "#081a10", color: "#22c55e" };
  if (score >= 50) return { background: "#1a1000", color: "#f59e0b" };
  return { background: "#0b1628", color: "#405a74" };
}

function daysAgo(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
}

function formatInterviewDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const btnBase: React.CSSProperties = {
  padding: "0.25rem 0.5625rem",
  fontSize: "0.75rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid",
  cursor: "pointer",
  fontWeight: 500,
  lineHeight: 1.4,
};

export default function KanbanCard({ application, onUpdate, columnColor = "#243653" }: Props) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(application.notes ?? "");
  const [interviewAt, setInterviewAt] = useState(
    application.interview_at ? application.interview_at.slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setNotes(application.notes ?? '');
      setInterviewAt(application.interview_at ?? '');
    }
  }, [application.notes, application.interview_at, editing]);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", application.job_id);
    e.dataTransfer.effectAllowed = "move";
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/kanban/${application.job_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes || null, interview_at: interviewAt || null }),
      });
      if (res.ok) {
        onUpdate(await res.json());
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setNotes(application.notes ?? "");
    setInterviewAt(application.interview_at ? application.interview_at.slice(0, 10) : "");
    setEditing(false);
  }

  const { job } = application;
  const badgeStyle = scoreBadgeStyle(job.match_score);

  return (
    <div
      draggable={!saving}
      onDragStart={handleDragStart}
      style={{
        background: "#0b1628",
        border: "1px solid #1a2840",
        borderLeft: `3px solid ${columnColor}40`,
        borderRadius: "var(--radius-sm)",
        padding: "0.6875rem 0.75rem",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {/* Score + title */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <div style={{
          ...badgeStyle,
          padding: "0.125rem 0.3125rem",
          borderRadius: "var(--radius-sm)",
          fontWeight: 700,
          fontSize: "0.6875rem",
          flexShrink: 0,
          marginTop: "2px",
          fontVariantNumeric: "tabular-nums",
        }}>
          {job.match_score === null ? "…" : job.match_score}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "#dde6f0", fontSize: "0.875rem", lineHeight: 1.35, wordBreak: "break-word" }}>
            {job.title}
          </div>
          <div style={{ color: "#7a95b0", fontSize: "0.8125rem", marginTop: "0.0625rem" }}>
            {job.company}
          </div>
        </div>
      </div>

      {/* Location */}
      {job.location && (
        <div style={{ color: "#405a74", fontSize: "0.75rem", marginBottom: "0.25rem" }}>{job.location}</div>
      )}

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.375rem" }}>
        <span style={{
          background: "#030b17", border: "1px solid #1a2840", borderRadius: "var(--radius-sm)",
          padding: "0.0625rem 0.3125rem", fontSize: "0.6rem", color: "#405a74",
          textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, flexShrink: 0,
        }}>
          {job.source}
        </span>
        <span style={{ color: "#405a74", fontSize: "0.75rem" }}>Applied {daysAgo(application.applied_at)}</span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: "#405a74", fontSize: "0.75rem", textDecoration: "none", marginLeft: "auto", flexShrink: 0 }}
        >
          ↗
        </a>
      </div>

      {/* Interview date */}
      {application.interview_at && !editing && (
        <div style={{ color: "#a855f7", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
          Interview: {formatInterviewDate(application.interview_at)}
        </div>
      )}

      {/* Summary (factual role overview — more useful for tracking than fit reasoning) */}
      {job.match_summary && !editing && (
        <div style={{
          marginBottom: "0.375rem",
          padding: "0.375rem 0.5rem",
          background: "#060f1e",
          borderRadius: "var(--radius-sm)",
          color: "#405a74",
          fontSize: "0.75rem",
          lineHeight: 1.5,
        }}>
          {job.match_summary.length > 120 ? job.match_summary.slice(0, 120) + '…' : job.match_summary}
        </div>
      )}

      {/* Notes preview */}
      {application.notes && !editing && (
        <div style={{ color: "#7a95b0", fontSize: "0.75rem", marginBottom: "0.375rem", fontStyle: "italic", lineHeight: 1.4 }}>
          {application.notes.slice(0, 100)}{application.notes.length > 100 ? "…" : ""}
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }} onClick={e => e.stopPropagation()}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes…"
            rows={3}
            style={{
              width: "100%", padding: "0.375rem 0.5rem", borderRadius: "var(--radius-sm)",
              border: "1px solid #1a2840", background: "#030b17",
              color: "#dde6f0", fontSize: "0.75rem", resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
          />
          <input
            type="date"
            value={interviewAt}
            onChange={e => setInterviewAt(e.target.value)}
            style={{
              width: "100%", padding: "0.3125rem 0.5rem", borderRadius: "var(--radius-sm)",
              border: "1px solid #1a2840", background: "#030b17",
              color: "#dde6f0", fontSize: "0.75rem", outline: "none", boxSizing: "border-box", colorScheme: "dark",
            }}
          />
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btnBase, background: "#0d1e38", borderColor: "#1a3060", color: "#3b82f6" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} disabled={saving} style={{ ...btnBase, background: "transparent", borderColor: "#1a2840", color: "#7a95b0" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setEditing(true); }}
          style={{ ...btnBase, marginTop: "0.25rem", background: "transparent", borderColor: "#1a2840", color: "#405a74" }}
          className="btn-ghost"
        >
          Edit
        </button>
      )}
    </div>
  );
}
