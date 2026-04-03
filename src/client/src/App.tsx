import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";
import { AppStatus } from "./types";
import ToastContainer from "./components/Toast";

function formatLastFetch(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "1h ago";
  return `${diffHours}h ago`;
}

interface NavProps {
  status: AppStatus | null;
  onFetchNow: () => void;
  fetching: boolean;
}

function Nav({ status, onFetchNow, fetching }: NavProps) {
  const isBusy = fetching || (status?.is_fetching ?? false);

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      gap: "0.25rem",
      padding: "0 1.25rem",
      height: "48px",
      borderBottom: "1px solid #1a2840",
      background: "#060f1e",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <span style={{ color: "#dde6f0", fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.02em", marginRight: "0.75rem" }}>
        New Era
      </span>

      {/* Nav links */}
      <NavLink to="/jobs" className="nav-link" style={({ isActive }) => ({
        padding: "0.25rem 0.625rem",
        borderRadius: "var(--radius-sm)",
        textDecoration: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        color: isActive ? "#dde6f0" : "#405a74",
        background: isActive ? "#1a2840" : "transparent",
      })}>
        Jobs
      </NavLink>
      <NavLink to="/kanban" className="nav-link" style={({ isActive }) => ({
        padding: "0.25rem 0.625rem",
        borderRadius: "var(--radius-sm)",
        textDecoration: "none",
        fontSize: "0.875rem",
        fontWeight: 500,
        color: isActive ? "#dde6f0" : "#405a74",
        background: isActive ? "#1a2840" : "transparent",
      })}>
        Kanban
      </NavLink>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Score distribution — compact dots */}
      {status?.score_distribution && (() => {
        const { green, amber, grey } = status.score_distribution;
        const total = green + amber + grey;
        if (total === 0) return null;
        return (
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", fontSize: "0.75rem", marginRight: "0.25rem" }}>
            {green > 0 && (
              <span title={`${green} strong matches`} style={{ color: "#22c55e", fontWeight: 600 }}>
                {green}<span style={{ opacity: 0.5 }}>●</span>
              </span>
            )}
            {amber > 0 && (
              <span title={`${amber} partial matches`} style={{ color: "#f59e0b", fontWeight: 600 }}>
                {amber}<span style={{ opacity: 0.5 }}>●</span>
              </span>
            )}
            {grey > 0 && (
              <span title={`${grey} weak matches`} style={{ color: "#405a74", fontWeight: 600 }}>
                {grey}<span style={{ opacity: 0.5 }}>●</span>
              </span>
            )}
          </div>
        );
      })()}

      {/* Warning badges */}
      {status?.data_files && (!status.data_files.resume || !status.data_files.preferences) && (
        <span
          title={[
            !status.data_files.resume && "data/resume.md is missing",
            !status.data_files.preferences && "data/preferences.md is missing",
          ].filter(Boolean).join(" · ")}
          style={{
            fontSize: "0.75rem",
            color: "#f59e0b",
            border: "1px solid #3a2200",
            borderRadius: "var(--radius-sm)",
            padding: "0.125rem 0.4rem",
            fontWeight: 500,
            cursor: "help",
          }}
        >
          data ⚠
        </span>
      )}
      {status?.ollama_available === false && (
        <span
          title="Ollama is not reachable — job scoring is disabled"
          style={{
            fontSize: "0.75rem",
            color: "#ef4444",
            border: "1px solid #3a0808",
            borderRadius: "var(--radius-sm)",
            padding: "0.125rem 0.4rem",
            fontWeight: 500,
          }}
        >
          ollama ✗
        </span>
      )}

      {/* Last fetch */}
      <span style={{ color: "#405a74", fontSize: "0.75rem", marginLeft: "0.25rem" }}>
        {formatLastFetch(status?.last_fetch_at ?? null)}
      </span>
      {status?.is_fetching && (
        <span style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "#3b82f6", animation: "pulse 1s ease-in-out infinite",
          display: "inline-block", flexShrink: 0,
        }} />
      )}

      {/* Fetch button */}
      <button
        onClick={onFetchNow}
        disabled={isBusy}
        style={{
          marginLeft: "0.375rem",
          padding: "0.3125rem 0.75rem",
          fontSize: "0.8125rem",
          fontWeight: 500,
          borderRadius: "var(--radius-sm)",
          border: "1px solid #1a2840",
          background: isBusy ? "transparent" : "#0f1e34",
          color: isBusy ? "#405a74" : "#7a95b0",
          cursor: isBusy ? "not-allowed" : "pointer",
        }}
        className={isBusy ? "" : "btn-ghost"}
      >
        {isBusy ? "Fetching…" : "Fetch now"}
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
      if (res.ok) setStatus(await res.json());
    } catch { /* silently ignore */ }
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
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
      <ToastContainer />
      <Nav status={status} onFetchNow={handleFetchNow} fetching={fetching} />

      {fetchNotification && (
        <div style={{
          position: "fixed",
          top: "3.25rem",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#0b1628",
          border: "1px solid #1a2840",
          borderRadius: "var(--radius)",
          padding: "0.5rem 1.25rem",
          color: "#dde6f0",
          fontSize: "0.875rem",
          fontWeight: 500,
          zIndex: 200,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          animation: "fadeSlideIn 0.18s ease",
          whiteSpace: "nowrap",
        }}>
          {fetchNotification}
        </div>
      )}

      <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 48px)", color: "var(--text)" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} />} />
          <Route path="/kanban" element={<KanbanView refreshKey={jobsRefreshKey} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
