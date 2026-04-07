import { useEffect, useState } from "react";
import { Application } from "../types";
import KanbanColumn from "../components/KanbanColumn";
import { toast } from "../components/Toast";

type KanbanCol = Application["kanban_column"];

const COLUMNS: { key: KanbanCol; title: string; color: string }[] = [
  { key: "saved",     title: "Saved",     color: "#f59e0b" },
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
    return <div className="text-text-3 text-center py-16 text-sm">Loading…</div>;
  }

  if (applications.length === 0) {
    return (
      <div className="text-text-3 text-center py-20 px-4">
        <div className="text-base font-semibold text-text-2 mb-2">No applications yet</div>
        <div className="text-sm">
          Save or mark a job as <strong className="text-text-2 font-semibold">Applied →</strong> in the Jobs view to track it here.
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 sm:py-6">
      <div className="max-w-full sm:max-w-[320px] mb-4">
        <input
          type="text"
          placeholder="Search applications…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-[0.375rem] rounded-sm border border-border bg-surface text-text text-sm outline-none"
        />
      </div>
      <div className="flex gap-4 overflow-x-auto items-stretch min-h-[calc(100vh_-_130px)]">
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
        <div className="text-text-3 text-center p-8 text-sm">
          No applications match "{searchQuery}"
        </div>
      )}
    </div>
  );
}
