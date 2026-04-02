import { useEffect, useState } from "react";
import { Application } from "../types";
import KanbanColumn from "../components/KanbanColumn";
import { toast } from "../components/Toast";

type KanbanCol = Application["kanban_column"];

const COLUMNS: { key: KanbanCol; title: string; color: string }[] = [
  { key: "applied", title: "Applied", color: "#3b82f6" },
  { key: "interview", title: "Interview", color: "#a855f7" },
  { key: "offer", title: "Offer", color: "#22c55e" },
  { key: "rejected", title: "Rejected", color: "#ef4444" },
];

interface Props { refreshKey?: number; }

export default function KanbanView({ refreshKey }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchKanban() {
      setLoading(true);
      try {
        const res = await fetch("/api/kanban");
        if (!res.ok) {
          toast('Failed to load kanban');
        } else {
          const data = await res.json();
          setApplications(data);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchKanban();
  }, [refreshKey]); // re-fetch when parent signals a refresh

  async function handleDrop(jobId: string, column: KanbanCol) {
    const original = applications;  // snapshot before mutation
    setApplications((prev) =>
      prev.map((a) => (a.job_id === jobId ? { ...a, kanban_column: column } : a))
    );
    const res = await fetch(`/api/kanban/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_column: column }),
    });
    if (!res.ok) {
      setApplications(original);  // instant revert, no network round-trip
      toast('Failed to move card — try again');
    }
  }

  function handleCardUpdate(updated: Application) {
    setApplications((prev) =>
      prev.map((a) => (a.job_id === updated.job_id ? updated : a))
    );
  }

  const filtered = searchQuery
    ? applications.filter(a => {
        const q = searchQuery.toLowerCase();
        return a.job.title.toLowerCase().includes(q) || a.job.company.toLowerCase().includes(q);
      })
    : applications;

  if (loading) {
    return (
      <div
        style={{ color: "#64748b", textAlign: "center", padding: "4rem 0" }}
      >
        Loading applications...
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 1rem" }}>
      {/* Search bar */}
      <div style={{ maxWidth: '300px', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search title or company…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.4rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#f1f5f9',
            fontSize: '0.875rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          overflowX: "auto",
          alignItems: "flex-start",
          minHeight: "calc(100vh - 80px)",
        }}
      >
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            title={col.title}
            column={col.key}
            color={col.color}
            cards={filtered.filter((a) => a.kanban_column === col.key)}
            onDrop={handleDrop}
            onCardUpdate={handleCardUpdate}
          />
        ))}
      </div>
      {searchQuery && filtered.length === 0 && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem', fontSize: '0.875rem' }}>
          No applications match "{searchQuery}"
        </div>
      )}
    </div>
  );
}
