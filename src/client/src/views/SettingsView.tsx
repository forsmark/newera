import { useEffect, useState } from "react";
import { toast } from "../components/Toast";
import {
  type Preferences, EMPTY_PREFS, inputClass,
  Field, NumberInput, Accordion, saveBtn,
} from "../components/SettingsShared";

interface SystemInfo {
  ollama_available: boolean | null;
  unscored_jobs: number;
}

interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
}

export default function SettingsView({ staleCount = 0 }: { staleCount?: number }) {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
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

    fetch("/api/status")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setSystem({ ollama_available: d.ollama_available ?? null, unscored_jobs: d.unscored_jobs ?? 0 }))
      .catch(() => {});

    fetch("/api/backups")
      .then(r => r.json())
      .then((d: { backups: BackupInfo[] }) => setBackups(d.backups ?? []))
      .catch(() => {});
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

  async function deleteBackup(name: string) {
    const res = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (res.ok) setBackups(prev => prev.filter(b => b.name !== name));
    else toast("Failed to delete backup");
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
          <Field label="Ollama model">
            <input className={inputClass}
              value={prefs.ollamaModel}
              onChange={e => updatePref('ollamaModel', e.target.value)}
              placeholder="gemma4:26b" />
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
