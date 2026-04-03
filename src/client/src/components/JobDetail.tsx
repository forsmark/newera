import { useState } from "react";
import { Job } from "../types";

interface Props {
  job: Job;
  onRescore?: (id: string) => void;
}

const DESC_LIMIT = 500;

const sectionLabel: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#405a74",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "0.375rem",
};

export default function JobDetail({ job, onRescore }: Props) {
  const [copied, setCopied] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  async function handleCopy() {
    const text = [`${job.title} — ${job.company}`, job.url, `Match score: ${job.match_score ?? 'pending'}`].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasLongDesc = job.description !== null && job.description.length > DESC_LIMIT;
  const descText = job.description
    ? (hasLongDesc && !descExpanded ? job.description.slice(0, DESC_LIMIT) + '…' : job.description)
    : null;

  const isPending = job.match_score === null;

  return (
    <div style={{ borderTop: "1px solid #1a2840", background: "#060f1e" }}>

      {/* LLM analysis */}
      {isPending ? (
        <div style={{ padding: "0.75rem 1rem", color: "#405a74", fontSize: "0.8125rem", fontStyle: "italic" }}>
          Analysis pending…
        </div>
      ) : (job.match_summary || job.match_reasoning) ? (
        <div style={{ padding: "0.875rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

          {/* Summary */}
          {job.match_summary && (
            <div>
              <div style={sectionLabel}>Role Summary</div>
              <div style={{
                background: "#0b1628",
                border: "1px solid #1a2840",
                borderRadius: "var(--radius-sm)",
                padding: "0.625rem 0.75rem",
                color: "#dde6f0",
                fontSize: "0.875rem",
                lineHeight: 1.6,
              }}>
                {job.match_summary}
              </div>
            </div>
          )}

          {/* Fit reasoning */}
          {job.match_reasoning && (
            <div>
              <div style={sectionLabel}>Fit Analysis</div>
              <div style={{
                background: "#0b1628",
                borderLeft: `3px solid ${
                  job.match_score !== null && job.match_score >= 80 ? '#22c55e'
                  : job.match_score !== null && job.match_score >= 50 ? '#f59e0b'
                  : '#243653'
                }`,
                borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                padding: "0.5rem 0.75rem",
                color: "#7a95b0",
                fontSize: "0.875rem",
                lineHeight: 1.6,
              }}>
                {job.match_reasoning}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Job description */}
      {descText && (
        <div style={{ padding: "0 1rem 0.875rem", borderTop: job.match_summary || job.match_reasoning ? "1px solid #1a2840" : "none", paddingTop: job.match_summary || job.match_reasoning ? "0.875rem" : undefined }}>
          <div style={sectionLabel}>Description</div>
          <div style={{ color: "#7a95b0", fontSize: "0.875rem", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {descText}
          </div>
          {hasLongDesc && (
            <button
              onClick={() => setDescExpanded(v => !v)}
              style={{ marginTop: "0.375rem", padding: 0, border: "none", background: "transparent", color: "#405a74", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline" }}
            >
              {descExpanded ? "Show less" : "Show full description"}
            </button>
          )}
        </div>
      )}

      {/* Tags (if not shown in row) */}
      {job.tags && job.tags.length > 0 && (
        <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {job.tags.map(tag => (
            <span key={tag} style={{
              background: "#030b17", border: "1px solid #1a2840", color: "#405a74",
              borderRadius: "var(--radius-sm)", padding: "0.0625rem 0.3125rem", fontSize: "0.75rem",
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: "0.625rem 1rem", borderTop: "1px solid #1a2840", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={async () => {
            const res = await fetch(`/api/jobs/${job.id}/analyze`, { method: 'POST' });
            if (res.ok) onRescore?.(job.id);
          }}
          style={{
            padding: "0.25rem 0.625rem", fontSize: "0.75rem", borderRadius: "var(--radius-sm)",
            border: "1px solid #1a2840", background: "transparent", color: "#405a74", cursor: "pointer",
          }}
          className="btn-ghost"
        >
          Re-score ↺
        </button>
        <button
          onClick={handleCopy}
          style={{
            padding: "0.25rem 0.625rem", fontSize: "0.75rem", borderRadius: "var(--radius-sm)",
            border: `1px solid ${copied ? '#0d2e1a' : '#1a2840'}`,
            background: copied ? '#081a10' : 'transparent',
            color: copied ? '#22c55e' : '#405a74',
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
