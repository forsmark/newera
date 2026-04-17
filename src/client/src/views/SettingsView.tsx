import { useEffect, useState } from "react";
import { toast } from "../components/Toast";
import {
  type Preferences, EMPTY_PREFS, inputClass,
  Field, NumberInput, Accordion, saveBtn,
} from "../components/SettingsShared";

interface SystemInfo {
  llm_available: boolean | null;
  unscored_jobs: number;
}

interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
}

const ALL_SOURCES = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'jobindex', label: 'Jobindex' },
  { key: 'remotive', label: 'Remotive' },
  { key: 'arbeitnow', label: 'Arbeitnow' },
  { key: 'remoteok', label: 'RemoteOK' },
] as const;

export default function SettingsView({ staleCount = 0 }: { staleCount?: number }) {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);
  const [rejectingLow, setRejectingLow] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const prefsDirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

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
      })
      .catch(() => toast("Failed to load settings"));

    const fetchStatus = () =>
      fetch("/api/status")
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => setSystem({ llm_available: d.llm_available ?? null, unscored_jobs: d.unscored_jobs ?? 0 }))
        .catch(() => {});
    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 15_000);

    fetch("/api/backups")
      .then(r => r.json())
      .then((d: { backups: BackupInfo[] }) => setBackups(d.backups ?? []))
      .catch(() => {});

    return () => clearInterval(statusInterval);
  }, []);

  function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(p => ({ ...p, [key]: value }));
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
      toast("Settings saved", "info");
    } catch {
      toast("Failed to save settings");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function sendTelegramTest() {
    setTestingTelegram(true);
    try {
      const res = await fetch("/api/settings/telegram-test", { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) toast("Test message sent — check Telegram", "info");
      else toast(data.error ?? "Failed to send test message");
    } catch {
      toast("Failed to send test message");
    } finally {
      setTestingTelegram(false);
    }
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

  async function doRestore(name: string) {
    setRestoringBackup(name);
    setRestoreConfirm(null);
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(name)}/restore`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        toast("Backup restored — reloading…", "info");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast(data.error ?? "Restore failed");
      }
    } catch {
      toast("Restore failed");
    } finally {
      setRestoringBackup(null);
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

  return (
    <div className="max-w-[800px] mx-auto px-4 py-6 flex flex-col gap-3">
      <h1 className="text-text font-semibold text-base mb-1">Settings</h1>

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
          <Field label="llama.cpp model">
            <input className={inputClass}
              value={prefs.model}
              onChange={e => updatePref('model', e.target.value)}
              placeholder="unsloth/gemma-4-26B-A4B-it-GGUF" />
          </Field>
        </div>

        <div className="flex flex-col gap-3 pt-1 border-t border-border">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
              <input
                type="checkbox"
                checked={prefs.defaultHideLowScore}
                onChange={e => updatePref('defaultHideLowScore', e.target.checked)}
                className="checkbox-styled"
              />
              "Hide &lt;{prefs.lowScoreThreshold}" on by default
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
              <input
                type="checkbox"
                checked={prefs.defaultHideUnscored}
                onChange={e => updatePref('defaultHideUnscored', e.target.checked)}
                className="checkbox-styled"
              />
              "Hide unscored" on by default
            </label>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
        </div>
      </Accordion>

      {/* Sources */}
      <Accordion title="Sources" defaultOpen={false} action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
        <p className="text-[0.75rem] text-text-3 m-0">
          Disabled sources are skipped during fetch. Existing jobs from disabled sources are not removed.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {ALL_SOURCES.map(({ key, label }) => {
            const enabled = !prefs.disabledSources.includes(key);
            return (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  aria-label={label}
                  onChange={e => {
                    const next = e.target.checked
                      ? prefs.disabledSources.filter(s => s !== key)
                      : [...prefs.disabledSources, key];
                    updatePref('disabledSources', next);
                  }}
                  className="checkbox-styled"
                />
                {label}
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
          <input
            type="checkbox"
            checked={prefs.hideJobsFromDisabledSources}
            onChange={e => updatePref('hideJobsFromDisabledSources', e.target.checked)}
            disabled={prefs.disabledSources.length === 0}
            className="checkbox-styled"
          />
          Hide jobs from disabled sources in job list
        </label>
      </Accordion>

      {/* Notifications */}
      <Accordion title="Notifications" defaultOpen={false} action={saveBtn(prefsDirty, savingPrefs, savePrefs)}>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-text-2">
          <input
            type="checkbox"
            checked={prefs.telegramEnabled}
            onChange={e => updatePref('telegramEnabled', e.target.checked)}
            className="checkbox-styled"
          />
          Enable Telegram notifications
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Bot token" hint="(from @BotFather)">
            <input type="password" className={inputClass}
              value={prefs.telegramBotToken}
              onChange={e => updatePref('telegramBotToken', e.target.value)}
              placeholder="123456:ABC-DEF1234..." />
          </Field>
          <Field label="Chat ID">
            <input className={inputClass}
              value={prefs.telegramChatId}
              onChange={e => updatePref('telegramChatId', e.target.value)}
              placeholder="e.g. 123456789" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Notify threshold" hint="(min score to include in detail)">
            <NumberInput
              value={prefs.telegramNotifyThreshold}
              onChange={v => updatePref('telegramNotifyThreshold', v ?? 80)}
              min={0} max={100} step={1} placeholder="80"
            />
          </Field>
          <Field label="App base URL" hint="(for links in messages)">
            <input className={inputClass}
              value={prefs.appBaseUrl}
              onChange={e => updatePref('appBaseUrl', e.target.value)}
              placeholder="http://localhost:3000" />
          </Field>
        </div>

        <button
          type="button"
          onClick={sendTelegramTest}
          disabled={testingTelegram || !prefs.telegramBotToken || !prefs.telegramChatId}
          className={[
            "w-fit px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
            testingTelegram || !prefs.telegramBotToken || !prefs.telegramChatId
              ? "bg-transparent text-text-3 border-border cursor-not-allowed"
              : "bg-surface-raised text-text-2 border-border cursor-pointer btn-ghost",
          ].join(" ")}
        >
          {testingTelegram ? "Sending…" : "Send test message"}
        </button>
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
            {backups.map(b => {
              const date = new Date(b.created_at);
              const time = date.toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              });
              const isConfirming = restoreConfirm === b.name;
              const isRestoring = restoringBackup === b.name;
              return (
                <div key={b.name} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-0">
                  <span className="text-text-2 flex-1">{time}</span>
                  <span className="text-text-3 shrink-0">{(b.size / 1024).toFixed(0)} KB</span>
                  {isConfirming ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-text-3">Restore this backup?</span>
                      <button type="button" onClick={() => doRestore(b.name)}
                        className="px-2 py-0.5 text-xs font-medium rounded-sm border border-border-red bg-transparent text-red cursor-pointer">
                        Yes
                      </button>
                      <button type="button" onClick={() => setRestoreConfirm(null)}
                        className="px-2 py-0.5 text-xs rounded-sm border border-border bg-transparent text-text-3 cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => setRestoreConfirm(b.name)}
                      disabled={isRestoring}
                      className={[
                        "shrink-0 px-3 py-0.5 text-xs font-medium rounded-sm border",
                        isRestoring
                          ? "bg-transparent text-text-3 border-border cursor-not-allowed"
                          : "bg-transparent text-accent border-border cursor-pointer btn-ghost",
                      ].join(" ")}
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Accordion>

      {/* System */}
      <Accordion title="System" defaultOpen={false}>
        {system && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${system.llm_available ? "bg-green" : "bg-red"}`} />
              <span className="text-text-2">llama.cpp {system.llm_available ? "Connected" : "Unavailable"}</span>
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
            {rescoring ? "Re-scoring…" : staleCount > 0 ? `Re-score (${staleCount} stale)` : "Re-score all jobs"}
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
