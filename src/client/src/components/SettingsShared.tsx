import { useEffect, useRef, useState } from "react";

export interface Preferences {
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
  defaultHideLowScore: boolean;
  defaultHideUnscored: boolean;
  autoRejectLowScore: boolean;
  model: string;
  llmProvider: 'ollama' | 'lmstudio' | 'llamacpp';
  llmBaseUrl: string;
  fetchIntervalHours: number;
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  telegramNotifyThreshold: number;
  appBaseUrl: string;
  disabledSources: string[];
  hideJobsFromDisabledSources: boolean;
}

export const EMPTY_PREFS: Preferences = {
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
  defaultHideLowScore: true,
  defaultHideUnscored: false,
  autoRejectLowScore: false,
  model: 'gemma4:26b',
  llmProvider: 'ollama',
  llmBaseUrl: '',
  fetchIntervalHours: 2,
  telegramBotToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  telegramNotifyThreshold: 80,
  appBaseUrl: 'http://localhost:3000',
  disabledSources: [],
  hideJobsFromDisabledSources: false,
};

export const inputClass = "w-full bg-surface-deep text-text text-sm border border-border rounded-sm px-3 py-2 outline-none focus:border-accent";
export const labelClass = "text-[0.75rem] font-medium text-text-3 block mb-1";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
export function NumberInput({
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
      setRaw(value === null ? '' : String(value));
    } else if (result.n !== null) {
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

export function Accordion({
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

export function saveBtn(dirty: boolean, saving: boolean, onClick: () => void) {
  return (
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
}
