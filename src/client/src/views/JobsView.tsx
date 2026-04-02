import { useCallback, useEffect, useState } from "react";
import { Job } from "../types";
import JobRow from "../components/JobRow";

interface Props {
  refreshKey?: number;
}

type FilterStatus = "all" | "new" | "saved";

export default function JobsView({ refreshKey }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRejected, setShowRejected] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  const hasPendingScores = jobs.some(j => j.match_score === null);

  // Auto-poll while any jobs have pending scores (max 10 min)
  useEffect(() => {
    if (!hasPendingScores) return;

    const MAX_POLL_MS = 10 * 60 * 1000;
    const startedAt = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(interval);
        return;
      }
      // Refresh silently (don't set loading=true — avoid flickering the list)
      fetch('/api/jobs')
        .then(r => r.json())
        .then((data: Job[]) => setJobs(data))
        .catch(() => {}); // ignore errors during background poll
    }, 5000);

    return () => clearInterval(interval);
  }, [hasPendingScores]);

  function handleStatusChange(id: string, status: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: status as Job["status"] } : j))
    );
  }

  const filtered = jobs
    .filter((j) => {
      if (!showRejected && j.status === "rejected") return false;
      if (filterStatus === "new" && j.status !== "new") return false;
      if (filterStatus === "saved" && j.status !== "saved") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (a.match_score === null && b.match_score === null) return 0;
      if (a.match_score === null) return 1;
      if (b.match_score === null) return -1;
      return b.match_score - a.match_score;
    });

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.375rem 0.875rem",
    borderRadius: "0.375rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 400,
    background: active ? "#1d4ed8" : "transparent",
    color: active ? "#fff" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search title or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "0.4rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f1f5f9",
            fontSize: "0.875rem",
            outline: "none",
          }}
        />

        {/* Status tabs */}
        <div style={{ display: "flex", gap: "0.25rem", background: "#0f172a", borderRadius: "0.5rem", padding: "0.25rem" }}>
          {(["all", "new", "saved"] as FilterStatus[]).map((s) => (
            <button key={s} style={tabStyle(filterStatus === s)} onClick={() => setFilterStatus(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.875rem",
            color: "#94a3b8",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
            style={{ accentColor: "#6b7280" }}
          />
          Show rejected
        </label>
      </div>

      {/* Scoring status indicator */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {hasPendingScores && (
        <div style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#f59e0b',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          Scoring jobs…
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: "3rem 0" }}>
          Loading jobs...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: "3rem 0" }}>
          No jobs found.
        </div>
      ) : (
        filtered.map((job) => (
          <JobRow key={job.id} job={job} onStatusChange={handleStatusChange} />
        ))
      )}
    </div>
  );
}
