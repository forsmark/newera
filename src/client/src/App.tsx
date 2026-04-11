import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";
import PreferencesView from "./views/PreferencesView";
import SettingsView from "./views/SettingsView";
import LogsView from "./views/LogsView";
import LoginView from "./views/LoginView";
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
  onLogout: () => void;
  authEnabled: boolean;
}

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  borderRadius: "var(--radius-sm)",
  textDecoration: "none",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: isActive ? "var(--color-text)" : "var(--color-text-3)",
  background: isActive ? "var(--color-border)" : "transparent",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
});

const IconBriefcase = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="4.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 4.5V3.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M1 9h14" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const IconKanban = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="6" y="2" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="11" y="2" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const IconWrench = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10.5 2a3.5 3.5 0 0 0-3.36 4.48L2.22 11.4a1.5 1.5 0 1 0 2.12 2.12l4.93-4.92A3.5 3.5 0 0 0 13.9 4.2l-1.97 1.97-1.06-1.06 1.97-1.97A3.5 3.5 0 0 0 10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M3 13.5c0-2.5 2.24-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconTerminal = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="2.5" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M4 6l2.5 2L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.5 10h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M12.5 2v3.5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M1.5 12V8.5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.93 5.25A5 5 0 0 1 11.5 5.5l1 1.5M11.07 8.75A5 5 0 0 1 2.5 8.5l-1-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function Nav({ status, onFetchNow, fetching, onLogout, authEnabled }: NavProps) {
  const isBusy = fetching || (status?.is_fetching ?? false);

  return (
    <nav className="flex items-center gap-1 px-4 h-14 border-b border-border bg-nav sticky top-0 z-50 overflow-hidden">
      <div className="mr-2 shrink-0">
        <Logo size="sm" />
      </div>

      <NavLink to="/jobs" className="nav-link shrink-0 py-1.5 px-2 sm:px-3" style={navLinkStyle} title="Jobs">
        <IconBriefcase />
        <span className="hidden sm:inline">Jobs</span>
      </NavLink>
      <NavLink to="/kanban" className="nav-link shrink-0 py-1.5 px-2 sm:px-3" style={navLinkStyle} title="Applications">
        <IconKanban />
        <span className="hidden sm:inline">Applications</span>
      </NavLink>
      <NavLink to="/preferences" className="nav-link shrink-0 py-1.5 px-2 sm:px-3" style={navLinkStyle} title="Preferences">
        <IconUser />
        <span className="hidden sm:inline">Preferences</span>
      </NavLink>
      <NavLink to="/settings" className="nav-link shrink-0 py-1.5 px-2 sm:px-3" style={navLinkStyle} title="Settings">
        <IconWrench />
        <span className="hidden sm:inline">Settings</span>
      </NavLink>
      <NavLink to="/logs" className="nav-link shrink-0 py-1.5 px-2 sm:px-3" style={navLinkStyle} title="Logs">
        <IconTerminal />
        <span className="hidden sm:inline">Logs</span>
      </NavLink>

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

      {authEnabled && (
        <button
          onClick={onLogout}
          title="Sign out"
          className="hidden sm:inline-flex shrink-0 px-3 py-2 text-[0.8125rem] font-medium rounded-sm border border-border bg-transparent text-text-3 cursor-pointer btn-ghost"
        >
          Sign out
        </button>
      )}

      {/* Fetch button */}
      <button
        onClick={onFetchNow}
        disabled={isBusy}
        title={isBusy ? "Fetching…" : "Fetch now"}
        className={[
          "ml-1 shrink-0 py-2 text-[0.8125rem] font-medium rounded-sm border border-border inline-flex items-center gap-1.5",
          "px-2 sm:px-4",
          isBusy
            ? "bg-transparent text-text-3 cursor-not-allowed"
            : "bg-surface-raised text-text-2 cursor-pointer btn-ghost",
        ].join(" ")}
      >
        <span style={isBusy ? { animation: "spin 1s linear infinite", display: "inline-flex" } : undefined}>
          <IconRefresh />
        </span>
        <span className="hidden sm:inline">{isBusy ? "Fetching…" : "Fetch now"}</span>
      </button>
    </nav>
  );
}

function AnimatedRoutes({ jobsRefreshKey, isFetching, status }: { jobsRefreshKey: number; isFetching: boolean; status: AppStatus | null }) {
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
          <Route path="/jobs" element={<JobsView refreshKey={jobsRefreshKey} isFetching={isFetching} status={status} />} />
          <Route path="/kanban" element={<KanbanView refreshKey={jobsRefreshKey} />} />
          <Route path="/preferences" element={<PreferencesView />} />
          <Route path="/settings" element={<SettingsView staleCount={status?.stale_count ?? 0} />} />
          <Route path="/logs" element={<LogsView />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((d: { authenticated: boolean; auth_enabled: boolean }) => {
        setAuthenticated(d.authenticated);
        setAuthEnabled(d.auth_enabled);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const [status, setStatus] = useState<AppStatus | null>(null);
  const [fetching, setFetching] = useState(false);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [fetchNotification, setFetchNotification] = useState<string | null>(null);

  const wasFetchingRef = useRef(false);

  // Request notification permission on first load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data: AppStatus = await res.json();
      setStatus(data);
      // When a background scheduled fetch completes, refresh the jobs list and notify
      if (wasFetchingRef.current && !data.is_fetching) {
        setJobsRefreshKey(k => k + 1);
        const newJobs = data.last_fetch_new_jobs ?? 0;
        if (newJobs > 0 && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('New Era — new jobs', {
            body: `${newJobs} new job${newJobs === 1 ? '' : 's'} found`,
            icon: '/favicon.ico',
          });
        }
      }
      wasFetchingRef.current = data.is_fetching ?? false;
    } catch { /* silently ignore */ }
  }, []);

  // Poll every 2s while a fetch is in progress, 30s otherwise
  const isFetching = status?.is_fetching ?? false;
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, isFetching ? 2_000 : 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus, isFetching]);

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

  if (!authChecked) return null;
  if (!authenticated) return <LoginView onLogin={() => setAuthenticated(true)} />;

  return (
    <BrowserRouter>
      <ToastContainer />
      <Nav
        status={status}
        onFetchNow={handleFetchNow}
        fetching={fetching}
        authEnabled={authEnabled}
        onLogout={() => {
          fetch('/api/auth/logout', { method: 'POST' }).then(() => setAuthenticated(false));
        }}
      />

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

      <AnimatedRoutes jobsRefreshKey={jobsRefreshKey} isFetching={isBusy} status={status} />
    </BrowserRouter>
  );
}
