import { useEffect, useState } from "react";
import { Application } from "../types";

interface Props {
  application: Application;
  onUpdate: (updated: Application) => void;
  columnColor?: string;
}

function scoreBadgeClass(score: number | null): string {
  if (score === null) return "bg-surface-raised text-text-3";
  if (score >= 80) return "bg-green-bg text-green";
  if (score >= 50) return "bg-amber-bg text-amber";
  return "bg-surface text-text-3";
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

export default function KanbanCard({ application, onUpdate, columnColor = "#243653" }: Props) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(application.notes ?? "");
  const [interviewAt, setInterviewAt] = useState(
    application.interview_at ? application.interview_at.slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);

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

  return (
    <div
      draggable={!saving}
      onDragStart={handleDragStart}
      className="bg-surface border border-border rounded px-3.5 py-3.5 cursor-grab select-none"
      style={{ borderLeftWidth: "3px", borderLeftColor: `${columnColor}40` }}
    >
      {/* Score + title */}
      <div className="flex items-start gap-2 mb-1">
        <div className={`${scoreBadgeClass(job.match_score)} px-2 py-1 rounded-sm font-bold text-[0.75rem] shrink-0 mt-[2px] tabular-nums`}>
          {job.match_score === null ? "…" : job.match_score}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-text text-sm leading-[1.35] break-words">{job.title}</div>
          <div className="text-text-2 text-[0.8125rem] mt-[0.0625rem]">{job.company}</div>
        </div>
      </div>

      {/* Location */}
      {job.location && (
        <div className="text-text-3 text-[0.75rem] mb-1">{job.location}</div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-[0.375rem] mb-[0.375rem]">
        <span className="bg-bg border border-border rounded-sm px-[0.3125rem] py-[0.0625rem] text-[0.6rem] text-text-3 uppercase tracking-[0.05em] font-semibold shrink-0">
          {job.source}
        </span>
        <span className="text-text-3 text-[0.75rem]">Applied {daysAgo(application.applied_at)}</span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-text-3 text-[0.75rem] no-underline ml-auto shrink-0"
        >
          ↗
        </a>
      </div>

      {/* Interview date */}
      {application.interview_at && !editing && (
        <div className="text-[#a855f7] text-[0.75rem] font-semibold mb-1">
          Interview: {formatInterviewDate(application.interview_at)}
        </div>
      )}

      {/* Summary */}
      {job.match_summary && !editing && (
        <div className="mb-[0.375rem] px-2 py-[0.375rem] bg-surface-deep rounded-sm text-text-3 text-[0.75rem] leading-[1.5]">
          {job.match_summary.length > 120 ? job.match_summary.slice(0, 120) + '…' : job.match_summary}
        </div>
      )}

      {/* Notes preview */}
      {application.notes && !editing && (
        <div className="text-text-2 text-[0.75rem] mb-[0.375rem] italic leading-[1.4]">
          {application.notes.slice(0, 100)}{application.notes.length > 100 ? "…" : ""}
        </div>
      )}

      {/* Archived posting */}
      {application.archived_description && !editing && (
        <div className="mt-1 mb-[0.375rem]">
          <button
            onClick={e => { e.stopPropagation(); setArchiveExpanded(v => !v); }}
            className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border bg-transparent text-text-3 font-medium cursor-pointer btn-ghost w-full text-left"
          >
            {archiveExpanded ? "Hide posting ↑" : "View archived posting ↓"}
          </button>
          {archiveExpanded && (
            <div
              className="mt-1.5 px-2.5 py-2 rounded-sm bg-bg border border-border text-text-3 text-[0.7rem] leading-[1.6] whitespace-pre-wrap overflow-y-auto"
              style={{ maxHeight: "300px" }}
              onClick={e => e.stopPropagation()}
            >
              {application.archived_description}
            </div>
          )}
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div className="flex flex-col gap-2 mt-2" onClick={e => e.stopPropagation()}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes…"
            rows={3}
            className="w-full px-2 py-[0.375rem] rounded-sm border border-border bg-bg text-text text-[0.75rem] resize-y outline-none"
          />
          <input
            type="date"
            value={interviewAt}
            onChange={e => setInterviewAt(e.target.value)}
            className="w-full px-2 py-[0.3125rem] rounded-sm border border-border bg-bg text-text text-[0.75rem] outline-none"
            style={{ colorScheme: "dark" }}
          />
          <div className="flex gap-[0.375rem]">
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border-accent bg-accent-bg text-accent font-medium cursor-pointer">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} disabled={saving}
              className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border bg-transparent text-text-2 font-medium cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setEditing(true); }}
          className="mt-1.5 px-3 py-1.5 text-[0.75rem] rounded-sm border border-border bg-transparent text-text-3 font-medium cursor-pointer btn-ghost"
        >
          Edit
        </button>
      )}
    </div>
  );
}
