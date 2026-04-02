import { useEffect, useState } from "react";
import { Application } from "../types";

interface Props {
  application: Application;
  onUpdate: (updated: Application) => void;
}

function scoreBadgeStyle(score: number | null): React.CSSProperties {
  if (score === null) {
    return { background: "#374151", color: "#9ca3af" };
  }
  if (score >= 80) {
    return { background: "#14532d", color: "#22c55e" };
  }
  if (score >= 50) {
    return { background: "#451a03", color: "#f59e0b" };
  }
  return { background: "#1f2937", color: "#6b7280" };
}

function daysAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function formatInterviewDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

export default function KanbanCard({ application, onUpdate }: Props) {
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
      const body: Record<string, string | null> = {
        notes: notes || null,
        interview_at: interviewAt || null,
      };
      const res = await fetch(`/api/kanban/${application.job_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setNotes(application.notes ?? "");
    setInterviewAt(
      application.interview_at ? application.interview_at.slice(0, 10) : ""
    );
    setEditing(false);
  }

  const { job } = application;
  const score = job.match_score;
  const badgeStyle = scoreBadgeStyle(score);

  return (
    <div
      draggable={!saving}
      onDragStart={handleDragStart}
      style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {/* Title + score */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
          marginBottom: "0.375rem",
        }}
      >
        <div
          style={{
            ...badgeStyle,
            padding: "0.125rem 0.375rem",
            borderRadius: "0.25rem",
            fontWeight: 700,
            fontSize: "0.75rem",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          {score === null ? "..." : score}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              color: "#f1f5f9",
              fontSize: "0.875rem",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {job.title}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.8125rem" }}>
            {job.company}
          </div>
        </div>
      </div>

      {/* Applied date */}
      <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
        Applied: {daysAgo(application.applied_at)}
      </div>

      {/* View job link */}
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          display: 'inline-block',
          color: '#475569',
          fontSize: '0.75rem',
          textDecoration: 'none',
          marginBottom: '0.25rem',
        }}
      >
        View job ↗
      </a>

      {/* Interview date */}
      {application.interview_at && !editing && (
        <div
          style={{
            color: "#a855f7",
            fontSize: "0.75rem",
            fontWeight: 600,
            marginBottom: "0.25rem",
          }}
        >
          Interview: {formatInterviewDate(application.interview_at)}
        </div>
      )}

      {/* Notes preview */}
      {application.notes && !editing && (
        <div
          style={{
            color: "#94a3b8",
            fontSize: "0.75rem",
            marginBottom: "0.375rem",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {application.notes.slice(0, 100)}
          {application.notes.length > 100 ? "..." : ""}
        </div>
      )}

      {/* Match reasoning */}
      {job.match_reasoning && !editing && (
        <div
          style={{
            marginTop: '0.375rem',
            padding: '0.375rem 0.5rem',
            background: '#0f172a',
            borderRadius: '0.25rem',
            borderLeft: '2px solid #334155',
            color: '#64748b',
            fontSize: '0.75rem',
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          {job.match_reasoning}
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes..."
            rows={3}
            style={{
              width: "100%",
              padding: "0.375rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f1f5f9",
              fontSize: "0.75rem",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <input
            type="date"
            value={interviewAt}
            onChange={(e) => setInterviewAt(e.target.value)}
            style={{
              width: "100%",
              padding: "0.3rem 0.5rem",
              borderRadius: "0.25rem",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f1f5f9",
              fontSize: "0.75rem",
              outline: "none",
              boxSizing: "border-box",
              colorScheme: "dark",
            }}
          />
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...btnBase,
                background: "#1d4ed8",
                borderColor: "#1d4ed8",
                color: "#fff",
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              style={{
                ...btnBase,
                background: "transparent",
                borderColor: "#475569",
                color: "#94a3b8",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          style={{
            ...btnBase,
            marginTop: "0.375rem",
            background: "transparent",
            borderColor: "#475569",
            color: "#94a3b8",
          }}
        >
          Edit
        </button>
      )}
    </div>
  );
}
