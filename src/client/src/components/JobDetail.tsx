import { useState } from "react";
import { Job } from "../types";

interface Props {
  job: Job;
  onRescore?: (id: string) => void;
  isFetching?: boolean;
  isScoring?: boolean;
}


const DESCRIPTION_LIMIT = 500;

export default function JobDetail({ job, onRescore, isFetching, isScoring }: Props) {
  const [copied, setCopied] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  async function handleCopy() {
    const text = [`${job.title} — ${job.company}`, job.url, `Match score: ${job.match_score ?? 'pending'}`].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts (plain HTTP over IP/Tailscale)
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isPending = job.match_score === null;

  const sectionLabel = "text-[0.6875rem] font-semibold text-text-3 uppercase tracking-[0.08em] mb-[0.375rem]";

  return (
    <div className="border-t border-border bg-surface-deep">

      {/* LLM analysis */}
      {isPending ? (
        <div className="px-4 py-4 text-text-3 text-[0.8125rem] italic">
          Analysis pending…
        </div>
      ) : (job.match_summary || job.match_reasoning) ? (
        <div className="px-4 py-4 flex flex-col gap-4">

          {/* Summary */}
          {job.match_summary && (
            <div>
              <div className={sectionLabel}>Role Summary</div>
              <div className="bg-surface border border-border rounded-sm px-3 py-[0.625rem] text-text text-sm leading-[1.6]">
                {job.match_summary}
              </div>
            </div>
          )}

          {/* Fit reasoning */}
          {job.match_reasoning && (
            <div>
              <div className={sectionLabel}>Fit Analysis</div>
              <div
                className="bg-surface rounded-[0_4px_4px_0] px-3 py-2 text-text-2 text-sm leading-[1.6]"
                style={{
                  borderLeft: `3px solid ${
                    job.match_score !== null && job.match_score >= 80 ? '#22c55e'
                    : job.match_score !== null && job.match_score >= 50 ? '#f59e0b'
                    : '#243653'
                  }`,
                }}
              >
                {job.match_reasoning}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Description */}
      {job.description && (
        <div className="px-4 pb-3">
          <div className={sectionLabel}>Description</div>
          <div className="text-text-2 text-sm leading-[1.6] whitespace-pre-wrap">
            {job.description.length > DESCRIPTION_LIMIT && !descExpanded
              ? job.description.slice(0, DESCRIPTION_LIMIT) + '…'
              : job.description}
          </div>
          {job.description.length > DESCRIPTION_LIMIT && (
            <button
              onClick={() => setDescExpanded(e => !e)}
              className="mt-1 text-[0.75rem] text-accent bg-transparent border-0 cursor-pointer p-0"
            >
              {descExpanded ? 'Show less' : 'Show full description'}
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {job.tags.map(tag => (
            <span key={tag} className="bg-bg border border-border text-text-3 rounded-sm px-[0.3125rem] py-[0.0625rem] text-[0.75rem]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        <button
          disabled={isFetching || isScoring}
          onClick={async () => {
            const res = await fetch(`/api/jobs/${job.id}/analyze`, { method: 'POST' });
            if (res.ok) onRescore?.(job.id);
          }}
          className="px-3 py-1.5 text-[0.75rem] rounded-sm border border-border bg-transparent text-text-3 btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Re-score ↺
        </button>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 text-[0.75rem] rounded-sm cursor-pointer transition-all duration-150"
          style={{
            border: `1px solid ${copied ? '#0d2e1a' : '#1a2840'}`,
            background: copied ? '#081a10' : 'transparent',
            color: copied ? '#22c55e' : '#6b8aa3',
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
