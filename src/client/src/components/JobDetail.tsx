import { Job } from "../types";

interface Props {
  job: Job;
  onRescore?: (id: string) => void;
}

export default function JobDetail({ job, onRescore }: Props) {
  const descPreview = job.description
    ? job.description.length > 500
      ? job.description.slice(0, 500) + "..."
      : job.description
    : null;

  return (
    <div style={{ padding: "0.75rem 1rem", background: "#1e293b", borderTop: "1px solid #334155" }}>
      {job.match_reasoning ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.375rem",
            }}
          >
            LLM Analysis
          </div>
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.375rem",
              padding: "0.625rem 0.75rem",
              color: "#cbd5e1",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {job.match_reasoning}
          </div>
        </div>
      ) : job.match_score === null ? (
        <div
          style={{
            marginBottom: "0.75rem",
            color: "#64748b",
            fontStyle: "italic",
            fontSize: "0.875rem",
          }}
        >
          Analysis pending...
        </div>
      ) : null}

      {descPreview && (
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.375rem",
            }}
          >
            Description
          </div>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "0.875rem",
              lineHeight: 1.6,
            }}
          >
            {descPreview}
          </div>
        </div>
      )}

      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={async () => {
            const res = await fetch(`/api/jobs/${job.id}/analyze`, { method: 'POST' });
            if (res.ok) onRescore?.(job.id);
          }}
          style={{
            padding: '0.25rem 0.625rem',
            fontSize: '0.75rem',
            borderRadius: '0.25rem',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          Re-score ↺
        </button>
      </div>
    </div>
  );
}
