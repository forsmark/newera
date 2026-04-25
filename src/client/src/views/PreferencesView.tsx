import { useEffect, useState } from "react";
import { toast } from "../components/Toast";
import {
  type Preferences, EMPTY_PREFS, inputClass, labelClass,
  Field, NumberInput, Accordion, saveBtn,
} from "../components/SettingsShared";

const WORK_STYLES = [
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

export default function PreferencesView() {
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

  const COUNTRY_SOURCE_DEFAULTS: Record<string, { disable: string[]; enable: string[] }> = {
    denmark: { disable: ['infojobs', 'tecnoempleo'], enable: ['jobindex'] },
    spain:   { disable: ['jobindex'], enable: ['infojobs', 'tecnoempleo'] },
  };

  function handleCountryChange(country: 'denmark' | 'spain') {
    const rules = COUNTRY_SOURCE_DEFAULTS[country];
    const current = new Set(prefs.disabledSources);
    rules.disable.forEach(s => current.add(s));
    rules.enable.forEach(s => current.delete(s));
    setPrefs(p => ({ ...p, country, disabledSources: [...current] }));
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

  return (
    <div className="max-w-[800px] mx-auto px-4 py-6 flex flex-col gap-3">
      <h1 className="text-text font-semibold text-base mb-1">Preferences</h1>

      {/* Job preferences */}
      <Accordion title="Job preferences" action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
        {/* Country / Job Market */}
        <div className="mb-4">
          <label className={labelClass}>Job market</label>
          <select
            className={inputClass}
            value={prefs.country}
            onChange={e => handleCountryChange(e.target.value as 'denmark' | 'spain')}
          >
            <option value="denmark">🇩🇰 Denmark</option>
            <option value="spain">🇪🇸 Spain</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2 mt-2">
            <input
              type="checkbox"
              checked={prefs.includeRemote}
              onChange={e => updatePref('includeRemote', e.target.checked)}
              className="checkbox-styled"
            />
            Include remote / global jobs
          </label>
        </div>

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
          <Field label="Min salary / month">
            <div className="flex gap-2">
              <select
                className={inputClass + " w-28 shrink-0"}
                value={prefs.salaryCurrency}
                onChange={e => updatePref('salaryCurrency', e.target.value as 'dkk' | 'eur' | 'usd')}
              >
                <option value="dkk">kr (DKK)</option>
                <option value="eur">€ (EUR)</option>
                <option value="usd">$ (USD)</option>
              </select>
              <NumberInput
                value={prefs.minSalary}
                onChange={v => updatePref('minSalary', v)}
                min={0} step={1000} placeholder="e.g. 55000"
              />
            </div>
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
          <Field label="Known languages" hint="(comma-separated — jobs requiring others are penalised in scoring)">
            <input className={inputClass} value={prefs.knownLanguages}
              onChange={e => updatePref('knownLanguages', e.target.value)}
              placeholder="English, Danish" />
          </Field>
        </div>

        <div>
          <Field label="Search terms" hint="(one per line)">
            <textarea className={inputClass} style={{ height: '80px', resize: 'vertical' }}
              value={prefs.searchTerms ?? ''}
              onChange={e => updatePref('searchTerms', e.target.value)}
              placeholder={"software engineer\nfrontend developer\nengineering manager"} />
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
    </div>
  );
}

