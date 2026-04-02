import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";
import { AppStatus } from "./types";

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
  const refreshJobsRef = useRef<(() => void) | null>(null);

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

  async function handleFetchNow() {
    setFetching(true);
    try {
      await fetch("/api/fetch", { method: "POST" });
      await fetchStatus();
      refreshJobsRef.current?.();
    } finally {
      setFetching(false);
    }
  }

  function onJobsRefresh() {
    fetchStatus();
  }

  return (
    <BrowserRouter>
      <Nav status={status} onFetchNow={handleFetchNow} fetching={fetching} />
      <div style={{ background: "#0f172a", minHeight: "calc(100vh - 49px)", color: "#f1f5f9" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsView onRefresh={onJobsRefresh} />} />
          <Route path="/kanban" element={<KanbanView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
