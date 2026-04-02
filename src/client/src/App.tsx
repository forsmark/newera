import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";
import { AppStatus } from "./types";

function getCount(status: AppStatus | null, statusKey: string): number {
  return status?.counts.find(c => c.status === statusKey)?.count ?? 0;
}

function formatLastFetch(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "1 hour ago";
  return `${diffHours} hours ago`;
}

interface NavProps {
  status: AppStatus | null;
  onFetchNow: () => void;
  fetching: boolean;
}

function Nav({ status, onFetchNow, fetching }: NavProps) {
  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    color: isActive ? "#60a5fa" : "#94a3b8",
    textDecoration: "none",
    fontWeight: isActive ? 600 : 400,
    fontSize: "0.9375rem",
  });

  return (
    <nav
      style={{
        display: "flex",
        gap: "1rem",
        padding: "0.75rem 1.25rem",
        borderBottom: "1px solid #334155",
        background: "#0f172a",
        alignItems: "center",
      }}
    >
      <strong style={{ marginRight: "auto", color: "#f1f5f9", fontSize: "1rem" }}>New Era</strong>

      <NavLink to="/jobs" style={navLinkStyle}>Jobs</NavLink>
      <NavLink to="/kanban" style={navLinkStyle}>Kanban</NavLink>

      {status && (() => {
        const stats = [
          { key: 'new', color: '#94a3b8' },
          { key: 'saved', color: '#60a5fa' },
          { key: 'applied', color: '#a855f7' },
        ].map(({ key, color }) => ({ key, color, n: getCount(status, key) }))
         .filter(({ n }) => n > 0);

        if (stats.length === 0) return null;

        return (
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', fontSize: '0.75rem', color: '#475569' }}>
            {stats.map(({ key, color, n }, i) => (
              <span key={key}>
                {i > 0 && <span style={{ marginRight: '0.375rem', color: '#334155' }}>·</span>}
                <span style={{ color, fontWeight: 600 }}>{n}</span>
                {' '}{key}
              </span>
            ))}
          </div>
        );
      })()}

      <span style={{ color: "#475569", fontSize: "0.8125rem" }}>
        Last fetch: {formatLastFetch(status?.last_fetch_at ?? null)}
      </span>

      <button
        onClick={onFetchNow}
        disabled={fetching}
        style={{
          padding: "0.3rem 0.75rem",
          fontSize: "0.8125rem",
          borderRadius: "0.375rem",
          border: "1px solid #334155",
          background: fetching ? "#1e293b" : "#1e293b",
          color: fetching ? "#475569" : "#94a3b8",
          cursor: fetching ? "not-allowed" : "pointer",
          fontWeight: 500,
        }}
      >
        {fetching ? "Fetching..." : "Fetch now"}
      </button>
    </nav>
  );
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [fetching, setFetching] = useState(false);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [fetchNotification, setFetchNotification] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleFetchNow = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/fetch", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const n = data.new_jobs ?? 0;
        setFetchNotification(n > 0 ? `${n} new job${n === 1 ? "" : "s"} found` : "No new jobs");
        setTimeout(() => setFetchNotification(null), 4000);
      }
      setJobsRefreshKey((k) => k + 1);
      await fetchStatus();
    } finally {
      setFetching(false);
    }
  }, [fetchStatus]);

  return (
    <BrowserRouter>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(-4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      <Nav status={status} onFetchNow={handleFetchNow} fetching={fetching} />
      {fetchNotification && (
        <div style={{
          position: "fixed",
          top: "3.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "0.5rem",
          padding: "0.5rem 1.25rem",
          color: "#f1f5f9",
          fontSize: "0.875rem",
          fontWeight: 500,
          zIndex: 200,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          animation: "fadeIn 0.2s ease",
        }}>
          {fetchNotification}
        </div>
      )}
      <div style={{ background: "#0f172a", minHeight: "calc(100vh - 49px)", color: "#f1f5f9" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} />} />
          <Route path="/kanban" element={<KanbanView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
