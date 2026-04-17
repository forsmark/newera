import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Job } from "../types";
import JobDetail from "../components/JobDetail";

const WORK_TYPE_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  remote:  { label: 'Remote',  color: '#34d399', bg: '#022b1e', border: '#0a3d2a' },
  hybrid:  { label: 'Hybrid',  color: '#a78bfa', bg: '#1a0a38', border: '#2d1558' },
  onsite:  { label: 'On-site', color: '#6b8aa3', bg: '#0b1628', border: '#1a2840' },
};

function inferWorkType(location: string | null): 'remote' | 'hybrid' | 'onsite' | null {
  if (!location) return null;
  const l = location.toLowerCase();
  if (l.includes('remote')) return 'remote';
  if (l.includes('hybrid')) return 'hybrid';
  if (l.includes('on-site') || l.includes('onsite') || l.includes('in-office')) return 'onsite';
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function scoreAccentColor(score: number | null): string {
  if (score === null) return "#243653";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#1a2840";
}

export default function JobDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/jobs/${id}`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        return res.json();
      })
      .then(data => { if (data) { setJob(data as Job); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  async function patchStatus(status: string) {
    if (!job) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setJob(prev => prev ? { ...prev, status: status as Job['status'] } : prev);
    } finally {
      setStatusLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-[740px] mx-auto px-4 py-12 text-center text-text-3">
        Loading…
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="max-w-[740px] mx-auto px-4 py-12 text-center">
        <div className="text-text-3 text-lg mb-4">Job not found</div>
        <button onClick={() => navigate(-1)} className="text-accent bg-transparent border-none cursor-pointer p-0 hover:underline">← Back</button>
      </div>
    );
  }

  const scoreBadgeClass = job.match_score === null
    ? "bg-surface-raised text-text-3"
    : job.match_score >= 80
      ? "bg-green-bg text-green"
      : job.match_score >= 50
        ? "bg-amber-bg text-amber"
        : "bg-surface text-text-3";

  const wt = job.work_type ?? inferWorkType(job.location) ?? 'onsite';
  const wtStyle = WORK_TYPE_STYLES[wt];

  return (
    <div className="max-w-[740px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Back link */}
      <button onClick={() => navigate(-1)} className="text-text-3 text-[0.8125rem] bg-transparent border-none cursor-pointer p-0 hover:text-text-2 mb-4 inline-block">
        ← Back
      </button>

      {/* Header card */}
      <div
        className="rounded overflow-hidden bg-surface mb-4"
        style={{
          borderLeft: `3px solid ${scoreAccentColor(job.match_score)}`,
          border: `1px solid #1a2840`,
          borderLeftWidth: '3px',
          borderLeftColor: scoreAccentColor(job.match_score),
        }}
      >
        <div className="px-4 sm:px-5 py-4 sm:py-5">
          {/* Title row */}
          <div className="flex items-start gap-3">
            <div className={`${scoreBadgeClass} min-w-[2.75rem] text-center px-2 py-1.5 rounded-sm font-bold text-[0.875rem] tabular-nums shrink-0`}>
              {job.match_score === null
                ? <span style={{ animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }}>···</span>
                : job.match_score}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-text text-lg font-semibold m-0 leading-tight">{job.title}</h1>
              <div className="text-text-2 text-[0.9375rem] mt-0.5">{job.company}</div>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <span className="bg-bg border border-border rounded-sm px-2 py-1 uppercase tracking-[0.05em] font-semibold text-[0.625rem] text-text-3">
              {job.source}
            </span>
            {job.posted_at && <span className="text-text-3 text-[0.75rem]">{formatDate(job.posted_at)}</span>}
            {job.location && <span className="text-text-3 text-[0.8125rem]">{job.location}</span>}
            <span style={{ color: wtStyle.color, background: wtStyle.bg, border: `1px solid ${wtStyle.border}`, borderRadius: 'var(--radius-sm)', padding: '0.1875rem 0.4375rem', fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              {wtStyle.label}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <a href={job.url} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-accent bg-accent-bg text-accent no-underline font-medium">
              View original posting ↗
            </a>

            {(job.status === "new" || job.status === "saved") && (
              <button
                onClick={() => patchStatus(job.status === "new" ? "saved" : "new")}
                disabled={statusLoading}
                className={job.status === "saved"
                  ? "px-3 py-1.5 text-[0.8125rem] rounded-sm border border-accent bg-accent-bg text-accent font-medium cursor-pointer"
                  : "px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border-accent text-accent font-medium bg-transparent cursor-pointer"
                }
              >
                {job.status === "saved" ? "Saved" : "Save"}
              </button>
            )}

            {(job.status === "new" || job.status === "saved") && (
              <button
                onClick={() => patchStatus("rejected")}
                disabled={statusLoading}
                className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border-red text-red font-medium bg-transparent cursor-pointer"
              >
                Discard
              </button>
            )}

            {job.status === "rejected" && (
              <button
                onClick={() => patchStatus("new")}
                disabled={statusLoading}
                className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border text-text-3 font-medium bg-transparent cursor-pointer"
              >
                Restore
              </button>
            )}
          </div>
        </div>

        {/* Reuse existing JobDetail for LLM analysis, tags, re-score, copy */}
        <JobDetail job={job} onRescore={() => {
          fetch(`/api/jobs/${job.id}`)
            .then(r => r.json())
            .then(data => setJob(data as Job))
            .catch(() => {});
        }} />
      </div>
    </div>
  );
}
