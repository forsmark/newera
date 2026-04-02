import { useEffect, useState } from "react";
import { Application } from "../types";
import KanbanColumn from "../components/KanbanColumn";

type KanbanCol = Application["kanban_column"];

const COLUMNS: { key: KanbanCol; title: string; color: string }[] = [
  { key: "applied", title: "Applied", color: "#3b82f6" },
  { key: "interview", title: "Interview", color: "#a855f7" },
  { key: "offer", title: "Offer", color: "#22c55e" },
  { key: "rejected", title: "Rejected", color: "#ef4444" },
];

export default function KanbanView() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKanban() {
      setLoading(true);
      try {
        const res = await fetch("/api/kanban");
        if (res.ok) {
          const data = await res.json();
          setApplications(data);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchKanban();
  }, []);

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
    }
  }

  function handleCardUpdate(updated: Application) {
    setApplications((prev) =>
      prev.map((a) => (a.job_id === updated.job_id ? updated : a))
    );
  }

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
    <div
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1.5rem 1rem",
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
          cards={applications.filter((a) => a.kanban_column === col.key)}
          onDrop={handleDrop}
          onCardUpdate={handleCardUpdate}
        />
      ))}
    </div>
  );
}
