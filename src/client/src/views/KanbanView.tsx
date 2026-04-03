import { useEffect, useState } from "react";
import { Application } from "../types";
import KanbanColumn from "../components/KanbanColumn";
import { toast } from "../components/Toast";

type KanbanCol = Application["kanban_column"];

const COLUMNS: { key: KanbanCol; title: string; color: string }[] = [
  { key: "applied",   title: "Applied",   color: "#3b82f6" },
  { key: "interview", title: "Interview", color: "#a855f7" },
  { key: "offer",     title: "Offer",     color: "#22c55e" },
  { key: "rejected",  title: "Rejected",  color: "#ef4444" },
];

interface Props { refreshKey?: number; }

export default function KanbanView({ refreshKey }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/kanban");
        if (!res.ok) toast('Failed to load kanban');
        else setApplications(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  async function handleDrop(jobId: string, column: KanbanCol) {
    const original = applications;
    setApplications(prev => prev.map(a => a.job_id === jobId ? { ...a, kanban_column: column } : a));
    const res = await fetch(`/api/kanban/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: column }),
    });
    if (!res.ok) {
      setApplications(original);
      toast('Failed to move card — try again');
    }
  }

  function handleCardUpdate(updated: Application) {
    setApplications(prev => prev.map(a => a.job_id === updated.job_id ? updated : a));
  }

  const filtered = searchQuery
    ? applications.filter(a => {
        const q = searchQuery.toLowerCase();
        return a.job.title.toLowerCase().includes(q) || a.job.company.toLowerCase().includes(q);
      })
    : applications;

  if (loading) {
    return <div style={{ color: "#405a74", textAlign: "center", padding: "4rem 0", fontSize: "0.875rem" }}>Loading…</div>;
  }

  if (applications.length === 0) {
    return (
      <div style={{ color: "#405a74", textAlign: "center", padding: "5rem 1rem" }}>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "#7a95b0", marginBottom: "0.5rem" }}>No applications yet</div>
        <div style={{ fontSize: "0.875rem" }}>
          Mark a job as <strong style={{ color: "#7a95b0", fontWeight: 600 }}>Applied →</strong> in the Jobs view to track it here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem 1rem" }}>
      <div style={{ maxWidth: "320px", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search applications…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: "100%", padding: "0.375rem 0.75rem",
            borderRadius: "var(--radius-sm)", border: "1px solid #1a2840",
            background: "#0b1628", color: "#dde6f0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", alignItems: "flex-start", minHeight: "calc(100vh - 120px)" }}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            title={col.title}
            column={col.key}
            color={col.color}
            cards={filtered.filter(a => a.kanban_column === col.key)}
            onDrop={handleDrop}
            onCardUpdate={handleCardUpdate}
          />
        ))}
      </div>
      {searchQuery && filtered.length === 0 && (
        <div style={{ color: "#405a74", textAlign: "center", padding: "2rem", fontSize: "0.875rem" }}>
          No applications match "{searchQuery}"
        </div>
      )}
    </div>
  );
}
