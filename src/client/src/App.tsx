import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";
import SettingsView from "./views/SettingsView";
import { AppStatus } from "./types";
import ToastContainer from "./components/Toast";
import Logo from "./components/Logo";

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

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: "0.375rem 0.75rem",
  borderRadius: "var(--radius-sm)",
  textDecoration: "none",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: isActive ? "var(--color-text)" : "var(--color-text-3)",
  background: isActive ? "var(--color-border)" : "transparent",
  whiteSpace: "nowrap",
});

function Nav({ status, onFetchNow, fetching }: NavProps) {
  const isBusy = fetching || (status?.is_fetching ?? false);

  return (
    <nav className="flex items-center gap-1 px-4 h-14 border-b border-border bg-nav sticky top-0 z-50 overflow-hidden">
      <div className="mr-2 shrink-0">
        <Logo size="sm" />
      </div>

      <NavLink to="/jobs" className="nav-link shrink-0" style={navLinkStyle}>Jobs</NavLink>
      <NavLink to="/kanban" className="nav-link shrink-0" style={navLinkStyle}>Applications</NavLink>
      <NavLink to="/settings" title="Settings" style={({ isActive }) => ({
        ...navLinkStyle({ isActive }),
        padding: "0.375rem 0.5rem",
        fontSize: "1rem",
        lineHeight: 1,
      })}>⚙</NavLink>

      <div className="flex-1" />

      {/* Score distribution — hidden on mobile */}
      {status?.score_distribution && (() => {
        const { green, amber, grey } = status.score_distribution;
        const total = green + amber + grey;
        if (total === 0) return null;
        return (
          <div className="hidden sm:flex gap-[0.625rem] items-center text-[0.75rem] mr-1 shrink-0">
            {green > 0 && <span title={`${green} strong matches`} className="text-green font-semibold">{green}<span className="opacity-50">●</span></span>}
            {amber > 0 && <span title={`${amber} partial matches`} className="text-amber font-semibold">{amber}<span className="opacity-50">●</span></span>}
            {grey > 0 && <span title={`${grey} weak matches`} className="text-text-3 font-semibold">{grey}<span className="opacity-50">●</span></span>}
          </div>
        );
      })()}

      {/* Warning badges — hidden on mobile */}
      {status?.data_files && (!status.data_files.resume || !status.data_files.preferences) && (
        <span
          title={[
            !status.data_files.resume && "data/resume.md is missing",
            !status.data_files.preferences && "data/preferences.md is missing",
          ].filter(Boolean).join(" · ")}
          className="hidden sm:inline text-[0.75rem] text-amber border border-[#3a2200] rounded-sm px-[0.4rem] py-[0.125rem] font-medium cursor-help shrink-0"
        >
          data ⚠
        </span>
      )}
      {status?.ollama_available === false && (
        <span
          title="Ollama is not reachable — job scoring is disabled"
          className="hidden sm:inline text-[0.75rem] text-red border border-[#3a0808] rounded-sm px-[0.4rem] py-[0.125rem] font-medium shrink-0"
        >
          ollama ✗
        </span>
      )}

      {/* Last fetch — hidden on mobile */}
      <span className="hidden sm:inline text-text-3 text-[0.75rem] ml-1 shrink-0">
        {formatLastFetch(status?.last_fetch_at ?? null)}
      </span>
      {status?.is_fetching && (
        <span className="w-[6px] h-[6px] rounded-full bg-accent shrink-0 inline-block" style={{ animation: "pulse 1s ease-in-out infinite" }} />
      )}

      {/* Fetch button */}
      <button
        onClick={onFetchNow}
        disabled={isBusy}
        className={[
          "ml-1 shrink-0 px-4 py-2 text-[0.8125rem] font-medium rounded-sm border border-border",
          isBusy
            ? "bg-transparent text-text-3 cursor-not-allowed"
            : "bg-surface-raised text-text-2 cursor-pointer btn-ghost",
        ].join(" ")}
      >
        {isBusy ? "Fetching…" : "Fetch now"}
      </button>
    </nav>
  );
}

function AnimatedRoutes({ jobsRefreshKey, isFetching }: { jobsRefreshKey: number; isFetching: boolean }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-bg min-h-[calc(100vh_-_56px)] text-text"
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} isFetching={isFetching} />} />
          <Route path="/kanban" element={<KanbanView refreshKey={jobsRefreshKey} />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
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

  const isBusy = fetching || (status?.is_fetching ?? false);

  return (
    <BrowserRouter>
      <ToastContainer />
      <Nav status={status} onFetchNow={handleFetchNow} fetching={fetching} />

      <AnimatePresence>
        {fetchNotification && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="fixed top-[3.25rem] left-1/2 -translate-x-1/2 bg-surface border border-border rounded px-5 py-2 text-text text-sm font-medium z-[200] shadow-[0_4px_20px_rgba(0,0,0,0.5)] whitespace-nowrap"
          >
            {fetchNotification}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatedRoutes jobsRefreshKey={jobsRefreshKey} isFetching={isBusy} />
    </BrowserRouter>
  );
}
