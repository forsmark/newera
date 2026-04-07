import { useEffect, useRef, useState } from "react";
import { toast } from "../components/Toast";

interface Preferences {
  location: string;
  commutableLocations: string;
  remote: string[];
  seniority: 'any' | 'junior' | 'mid' | 'senior' | 'lead';
  minSalaryDkk: number | null;
  techInterests: string;
  techAvoid: string;
  companyBlacklist: string;
  linkedinSearchTerms: string;
  jobindexSearchTerms: string;
  notes: string;
  lowScoreThreshold: number;
  autoRejectLowScore: boolean;
  ollamaModel: string;
  fetchIntervalHours: number;
}

interface SystemInfo {
  ollama_available: boolean | null;
  unscored_jobs: number;
}

interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
}

const EMPTY_PREFS: Preferences = {
  location: '',
  commutableLocations: '',
  remote: [],
  seniority: 'any',
  minSalaryDkk: null,
  techInterests: '',
  techAvoid: '',
  companyBlacklist: '',
  linkedinSearchTerms: '',
  jobindexSearchTerms: '',
  notes: '',
  lowScoreThreshold: 20,
  autoRejectLowScore: false,
  ollamaModel: 'gemma4:26b',
  fetchIntervalHours: 2,
};

const WORK_STYLES = [
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

const inputClass = "w-full bg-surface-deep text-text text-sm border border-border rounded-sm px-3 py-2 outline-none focus:border-accent";
const labelClass = "text-[0.75rem] font-medium text-text-3 block mb-1";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {hint && <span className="ml-1 font-normal text-text-3 opacity-70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// Controlled number input that doesn't snap to 0 when deleting the last digit
function NumberInput({
  value, onChange, min, max, step = 1, placeholder, className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(value === null ? '' : String(value));
  const focusedRef = useRef(false);

  // Sync display when value changes from outside (e.g. loaded from API)
  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(value === null ? '' : String(value));
    }
  }, [value]);

  function validate(s: string): { n: number; error: boolean } | { n: null; error: false } {
    if (s === '') return { n: null, error: false };
    const n = Number(s);
    if (isNaN(n)) return { n: NaN as unknown as number, error: true };
    if (min !== undefined && n < min) return { n, error: true };
    if (max !== undefined && n > max) return { n, error: true };
    return { n, error: false };
  }

  const { error } = validate(raw);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const s = e.target.value;
    setRaw(s);
    const result = validate(s);
    if (!result.error && result.n !== null) onChange(result.n);
    else if (!result.error && result.n === null) onChange(null);
  }

  function handleBlur() {
    focusedRef.current = false;
    const result = validate(raw);
    if (result.error) {
      // revert to last valid value
      setRaw(value === null ? '' : String(value));
    } else if (result.n !== null) {
      // clamp and normalise display
      const clamped = min !== undefined && result.n < min ? min
        : max !== undefined && result.n > max ? max
        : result.n;
      setRaw(String(clamped));
      onChange(clamped);
    } else {
      onChange(null);
    }
  }

  return (
    <input
      type="number"
      value={raw}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={`${className ?? inputClass}${error ? ' border-red' : ''}`}
      onChange={handleChange}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={handleBlur}
    />
  );
}

function Accordion({
  title, defaultOpen = true, action, children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface rounded border border-border">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer text-left"
      >
        <span className="text-text font-semibold text-sm">{title}</span>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {action}
          <span
            className="text-text-3 text-[0.625rem] select-none pointer-events-none"
            style={{ display: 'inline-block', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-4 flex flex-col gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsView() {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [resume, setResume] = useState('');
  const [savedResume, setSavedResume] = useState('');
  const [savingResume, setSavingResume] = useState(false);

  const [ingestText, setIngestText] = useState('');
  const [ingestResult, setIngestResult] = useState('');
  const [ingesting, setIngesting] = useState(false);

  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [ingestingLinkedin, setIngestingLinkedin] = useState(false);

  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [rejectingLow, setRejectingLow] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const prefsDirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);
  const resumeDirty = resume !== savedResume;

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: { preferences: Preferences; resume: string }) => {
        const p: Preferences = {
          ...EMPTY_PREFS,
          ...data.preferences,
          remote: Array.isArray(data.preferences?.remote) ? data.preferences.remote : [],
        };
        setPrefs(p);
        setSavedPrefs(p);
        setResume(data.resume ?? '');
        setSavedResume(data.resume ?? '');
      })
      .catch(() => toast("Failed to load settings"));

    fetch("/api/status")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setSystem({ ollama_available: d.ollama_available ?? null, unscored_jobs: d.unscored_jobs ?? 0 }))
      .catch(() => {});

    fetch("/api/backups")
      .then(r => r.json())
      .then((d: { backups: BackupInfo[] }) => setBackups(d.backups))
      .catch(() => {});
  }, []);

  function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(p => ({ ...p, [key]: value }));
  }

  function toggleWorkStyle(style: string) {
    setPrefs(p => {
      const has = p.remote.includes(style);
      return { ...p, remote: has ? p.remote.filter(s => s !== style) : [...p.remote, style] };
    });
  }

  async function savePrefs() {
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      setSavedPrefs({ ...prefs });
      toast("Preferences saved", "info");
    } catch {
      toast("Failed to save preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function saveResume() {
    setSavingResume(true);
    try {
      const res = await fetch("/api/settings/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: resume }),
      });
      if (!res.ok) throw new Error();
      setSavedResume(resume);
      toast("Resume saved", "info");
    } catch {
      toast("Failed to save resume");
    } finally {
      setSavingResume(false);
    }
  }

  async function ingestResume() {
    if (ingestText.trim().length < 50) { toast("Paste at least 50 characters of CV text"); return; }
    setIngesting(true);
    setIngestResult('');
    try {
      const res = await fetch("/api/settings/resume/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: ingestText }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      const data = await res.json() as { parsed: string };
      setIngestResult(data.parsed);
    } catch (err) {
      toast((err as Error).message || "Ingest failed — is Ollama running?");
    } finally {
      setIngesting(false);
    }
  }

  function applyIngestResult() {
    setResume(ingestResult);
    setIngestText('');
    setIngestResult('');
    toast("Parsed resume loaded — review and save", "info");
  }

  async function ingestLinkedin() {
    const url = linkedinUrl.trim();
    if (!url.includes('linkedin.com/in/')) { toast("Enter a LinkedIn profile URL (linkedin.com/in/…)"); return; }
    setIngestingLinkedin(true);
    setIngestResult('');
    try {
      const res = await fetch("/api/settings/resume/ingest-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { parsed?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setIngestResult(data.parsed!);
    } catch (err) {
      toast((err as Error).message || "LinkedIn import failed");
    } finally {
      setIngestingLinkedin(false);
    }
  }

  async function createBackup() {
    setBackingUp(true);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      if (!res.ok) throw new Error();
      const b = await res.json() as BackupInfo;
      setBackups(prev => [b, ...prev]);
      toast("Backup created", "info");
    } catch {
      toast("Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  async function deleteBackup(name: string) {
    const res = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (res.ok) setBackups(prev => prev.filter(b => b.name !== name));
    else toast("Failed to delete backup");
  }

  async function rejectLowScore() {
    setRejectingLow(true);
    try {
      const res = await fetch("/api/settings/reject-low-score", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { rejected: number };
      toast(data.rejected > 0
        ? `Rejected ${data.rejected} low-score job${data.rejected === 1 ? "" : "s"}`
        : "No new jobs below threshold", "info");
    } catch {
      toast("Failed to reject low-score jobs");
    } finally {
      setRejectingLow(false);
    }
  }

  async function clearAllJobs() {
    setClearing(true);
    try {
      const res = await fetch("/api/jobs/clear", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { deleted: number };
      toast(`Cleared ${data.deleted} job${data.deleted === 1 ? "" : "s"}`, "info");
      setClearConfirm(false);
    } catch {
      toast("Failed to clear jobs");
    } finally {
      setClearing(false);
    }
  }

  async function rescore() {
    setRescoring(true);
    try {
      const res = await fetch("/api/settings/rescore", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { queued: number };
      toast(`Re-scoring ${data.queued} job${data.queued === 1 ? "" : "s"}`, "info");
    } catch {
      toast("Failed to start re-score");
    } finally {
      setRescoring(false);
    }
  }

  const saveBtn = (dirty: boolean, saving: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty || saving}
      className={[
        "px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border",
        dirty && !saving
          ? "bg-surface-raised text-text-2 cursor-pointer btn-ghost"
          : "bg-transparent text-text-3 cursor-not-allowed",
      ].join(" ")}
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );

  return (
    <div className="max-w-[800px] mx-auto px-4 py-6 flex flex-col gap-3">
      <h1 className="text-text font-semibold text-base mb-1">Settings</h1>

      {/* Job preferences */}
      <Accordion title="Job preferences" action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Preferred location">
            <input className={inputClass} value={prefs.location}
              onChange={e => updatePref('location', e.target.value)}
              placeholder="Copenhagen / Greater Copenhagen" />
          </Field>
          <Field label="Also commutable to">
            <input className={inputClass} value={prefs.commutableLocations}
              onChange={e => updatePref('commutableLocations', e.target.value)}
              placeholder="Malmö, Sweden" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Work style" hint="(any if none selected)">
            <div className="flex flex-wrap gap-2 pt-1">
              {WORK_STYLES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 cursor-pointer text-sm text-text-2 select-none">
                  <input
                    type="checkbox"
                    checked={prefs.remote.includes(value)}
                    onChange={() => toggleWorkStyle(value)}
                    className="checkbox-styled"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Seniority">
            <select className={inputClass} value={prefs.seniority}
              onChange={e => updatePref('seniority', e.target.value as Preferences['seniority'])}>
              <option value="any">Any</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / Principal</option>
            </select>
          </Field>
          <Field label="Min salary (DKK/month)">
            <NumberInput
              value={prefs.minSalaryDkk}
              onChange={v => updatePref('minSalaryDkk', v)}
              min={0} step={1000} placeholder="e.g. 55000"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tech interests" hint="(comma-separated)">
            <input className={inputClass} value={prefs.techInterests}
              onChange={e => updatePref('techInterests', e.target.value)}
              placeholder="React, TypeScript, Node.js" />
          </Field>
          <Field label="Tech to avoid" hint="(comma-separated)">
            <input className={inputClass} value={prefs.techAvoid}
              onChange={e => updatePref('techAvoid', e.target.value)}
              placeholder="PHP, WordPress, Salesforce" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="LinkedIn search terms" hint="(one per line)">
            <textarea className={inputClass} style={{ height: '80px', resize: 'vertical' }}
              value={prefs.linkedinSearchTerms}
              onChange={e => updatePref('linkedinSearchTerms', e.target.value)}
              placeholder={"frontend developer\nweb developer"} />
          </Field>
          <Field label="Jobindex search terms" hint="(one per line)">
            <textarea className={inputClass} style={{ height: '80px', resize: 'vertical' }}
              value={prefs.jobindexSearchTerms}
              onChange={e => updatePref('jobindexSearchTerms', e.target.value)}
              placeholder={"frontend udvikler\nwebudvikler"} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company blacklist" hint="(one per line)">
            <textarea className={inputClass} style={{ height: '80px', resize: 'vertical' }}
              value={prefs.companyBlacklist}
              onChange={e => updatePref('companyBlacklist', e.target.value)}
              placeholder={"Company A\nCompany B"} />
          </Field>
          <Field label="Additional notes">
            <textarea className={inputClass} style={{ height: '80px', resize: 'vertical' }}
              value={prefs.notes}
              onChange={e => updatePref('notes', e.target.value)}
              placeholder="Looking for product companies, not consulting" />
          </Field>
        </div>
      </Accordion>

      {/* App config */}
      <Accordion title="App config" defaultOpen={true} action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Low score threshold" hint="(0–100)">
            <NumberInput
              value={prefs.lowScoreThreshold}
              onChange={v => updatePref('lowScoreThreshold', v ?? 20)}
              min={0} max={100} step={1} placeholder="20"
            />
          </Field>
          <Field label="Fetch interval" hint="(hours, 1–24)">
            <NumberInput
              value={prefs.fetchIntervalHours}
              onChange={v => updatePref('fetchIntervalHours', v ?? 2)}
              min={1} max={24} step={1} placeholder="2"
            />
          </Field>
          <Field label="Ollama model">
            <input className={inputClass}
              value={prefs.ollamaModel}
              onChange={e => updatePref('ollamaModel', e.target.value)}
              placeholder="gemma4:26b" />
          </Field>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
            <input
              type="checkbox"
              checked={prefs.autoRejectLowScore}
              onChange={e => updatePref('autoRejectLowScore', e.target.checked)}
              className="checkbox-styled"
            />
            Auto-reject new jobs scored below threshold
          </label>
          <button
            type="button"
            onClick={rejectLowScore}
            disabled={rejectingLow}
            title={`Reject all unreviewed jobs currently below ${prefs.lowScoreThreshold}`}
            className={[
              "sm:ml-auto shrink-0 px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
              rejectingLow
                ? "bg-transparent text-text-3 border-border cursor-not-allowed"
                : "bg-transparent text-red border-border-red cursor-pointer",
            ].join(" ")}
          >
            {rejectingLow ? "Rejecting…" : `Reject all below ${prefs.lowScoreThreshold}`}
          </button>
        </div>
      </Accordion>

      {/* Resume */}
      <Accordion title="Resume" action={saveBtn(resumeDirty, savingResume, saveResume)}>
        <textarea
          aria-label="Resume"
          value={resume}
          onChange={e => setResume(e.target.value)}
          style={{ height: '260px', resize: 'vertical' }}
          className={inputClass + " font-mono text-xs"}
          placeholder="Paste your resume in markdown, or use 'Ingest resume' below to parse it from raw text…"
        />

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.8125rem] text-text-2 font-medium">Ingest resume</p>
            <p className="text-[0.75rem] text-text-3">Paste raw CV text — AI will clean and structure it</p>
          </div>
          <textarea
            value={ingestText}
            onChange={e => setIngestText(e.target.value)}
            style={{ height: '120px', resize: 'vertical' }}
            className={inputClass + " text-xs"}
            placeholder="Paste raw CV text here (copied from PDF, Word, LinkedIn, etc.)…"
          />
          <button
            type="button"
            onClick={ingestResume}
            disabled={ingesting || ingestText.trim().length < 50}
            className={[
              "w-fit px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
              ingesting || ingestText.trim().length < 50
                ? "bg-transparent text-text-3 border-border cursor-not-allowed"
                : "bg-surface-raised text-text-2 border-border cursor-pointer btn-ghost",
            ].join(" ")}
          >
            {ingesting ? "Parsing…" : "Parse with AI"}
          </button>

          {ingestResult && (
            <div className="flex flex-col gap-2">
              <p className="text-[0.75rem] text-text-3">Preview — looks right?</p>
              <pre className="bg-surface-deep border border-border rounded-sm p-3 text-xs text-text-2 overflow-auto max-h-[200px] whitespace-pre-wrap">{ingestResult}</pre>
              <div className="flex gap-2">
                <button type="button" onClick={applyIngestResult}
                  className="px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border-accent bg-accent-bg text-accent cursor-pointer">
                  Use this
                </button>
                <button type="button" onClick={() => setIngestResult('')}
                  className="px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border text-text-3 bg-transparent cursor-pointer btn-ghost">
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.8125rem] text-text-2 font-medium">Import from LinkedIn</p>
            <p className="text-[0.75rem] text-text-3">Public profiles only — may not work if login is required</p>
          </div>
          <div className="flex gap-2">
            <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
              className={inputClass} placeholder="https://www.linkedin.com/in/your-profile/" />
            <button
              type="button"
              onClick={ingestLinkedin}
              disabled={ingestingLinkedin || !linkedinUrl.trim()}
              className={[
                "shrink-0 px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
                ingestingLinkedin || !linkedinUrl.trim()
                  ? "bg-transparent text-text-3 border-border cursor-not-allowed"
                  : "bg-surface-raised text-text-2 border-border cursor-pointer btn-ghost",
              ].join(" ")}
            >
              {ingestingLinkedin ? "Fetching…" : "Fetch"}
            </button>
          </div>
        </div>
      </Accordion>

      {/* Backups */}
      <Accordion title="Database backups" defaultOpen={false} action={
        <button
          type="button"
          onClick={createBackup}
          disabled={backingUp}
          className={[
            "px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border",
            backingUp
              ? "bg-transparent text-text-3 cursor-not-allowed"
              : "bg-surface-raised text-text-2 cursor-pointer btn-ghost",
          ].join(" ")}
        >
          {backingUp ? "Backing up…" : "Back up now"}
        </button>
      }>
        <p className="text-[0.75rem] text-text-3 m-0">
          Automatic backups run every 6 hours. Last {Math.min(backups.length, 10)} kept.
        </p>
        {backups.length === 0 ? (
          <p className="text-[0.75rem] text-text-3">No backups yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {backups.map(b => (
              <div key={b.name} className="flex items-center gap-3 text-xs py-1 border-b border-border last:border-0">
                <span className="text-text-2 font-mono flex-1">{b.name}</span>
                <span className="text-text-3 shrink-0">{(b.size / 1024).toFixed(1)} KB</span>
                <a href={`/api/backups/${b.name}`} download={b.name} className="text-accent no-underline shrink-0">
                  ↓ Download
                </a>
                <button type="button" onClick={() => deleteBackup(b.name)}
                  className="text-red bg-transparent border-none cursor-pointer text-xs shrink-0 p-0">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Accordion>

      {/* System */}
      <Accordion title="System" defaultOpen={false}>
        {system && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${system.ollama_available ? "bg-green" : "bg-red"}`} />
              <span className="text-text-2">Ollama {system.ollama_available ? "Connected" : "Unavailable"}</span>
            </div>
            <p className="text-xs text-text-3 m-0">
              {system.unscored_jobs > 0
                ? `${system.unscored_jobs} job${system.unscored_jobs === 1 ? "" : "s"} pending LLM analysis`
                : "All jobs scored"}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={rescore}
            disabled={rescoring}
            className={[
              "w-fit px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
              rescoring
                ? "bg-transparent text-text-3 border-border cursor-not-allowed"
                : "bg-surface-raised text-amber border-[#3a2200] cursor-pointer hover:bg-amber-bg",
            ].join(" ")}
          >
            {rescoring ? "Re-scoring…" : "Re-score all jobs"}
          </button>

          <div className="flex items-center gap-2">
            {clearConfirm ? (
              <>
                <span className="text-[0.8125rem] text-text-3">Are you sure? This cannot be undone.</span>
                <button
                  type="button"
                  onClick={clearAllJobs}
                  disabled={clearing}
                  className="px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border-red bg-transparent text-red cursor-pointer"
                >
                  {clearing ? "Clearing…" : "Yes, clear all"}
                </button>
                <button
                  type="button"
                  onClick={() => setClearConfirm(false)}
                  className="px-3 py-1.5 text-[0.8125rem] rounded-sm border border-border bg-transparent text-text-3 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setClearConfirm(true)}
                className="px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border border-border bg-transparent text-text-3 cursor-pointer btn-ghost"
              >
                Clear all jobs…
              </button>
            )}
          </div>
        </div>
      </Accordion>
    </div>
  );
}
