import { useEffect, useState } from "react";
import { toast } from "../components/Toast";

interface SettingsData {
  resume: string;
  preferences: string;
}

interface SystemInfo {
  ollama_available: boolean | null;
  unscored_jobs: number;
}

interface EditorProps {
  label: string;
  filename: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  height: string;
}

function FileEditor({ label, filename, value, onChange, onSave, saving, dirty, height }: EditorProps) {
  return (
    <div className="bg-surface rounded border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-text font-semibold text-sm">{label}</h2>
          <p className="text-text-3 text-xs mt-0.5">{filename}</p>
        </div>
        <button
          onClick={onSave}
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
      </div>
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height, resize: "vertical" }}
        className="w-full bg-surface-deep text-text text-xs font-mono border border-border rounded-sm p-3 outline-none focus:border-accent"
      />
    </div>
  );
}

export default function SettingsView() {
  const [original, setOriginal] = useState<SettingsData>({ resume: "", preferences: "" });
  const [current, setCurrent] = useState<SettingsData>({ resume: "", preferences: "" });
  const [saving, setSaving] = useState({ resume: false, preferences: false });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsData) => {
        setOriginal(data);
        setCurrent(data);
      })
      .catch(() => toast("Failed to load settings"));

    fetch("/api/status")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setSystem({
        ollama_available: data.ollama_available ?? null,
        unscored_jobs: data.unscored_jobs ?? 0,
      }))
      .catch(() => {});
  }, []);

  async function save(key: "resume" | "preferences") {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`/api/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: current[key] }),
      });
      if (!res.ok) throw new Error();
      setOriginal((o) => ({ ...o, [key]: current[key] }));
      toast(key === "resume" ? "Resume saved" : "Preferences saved", "info");
    } catch {
      toast(`Failed to save ${key}`);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
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
    <div className="max-w-[800px] mx-auto px-4 py-6 flex flex-col gap-6">
      <h1 className="text-text font-semibold text-base">Settings</h1>

      <FileEditor
        label="Resume"
        filename="data/resume.md"
        value={current.resume}
        onChange={(v) => setCurrent((c) => ({ ...c, resume: v }))}
        onSave={() => save("resume")}
        saving={saving.resume}
        dirty={current.resume !== original.resume}
        height="400px"
      />

      <FileEditor
        label="Preferences"
        filename="data/preferences.md"
        value={current.preferences}
        onChange={(v) => setCurrent((c) => ({ ...c, preferences: v }))}
        onSave={() => save("preferences")}
        saving={saving.preferences}
        dirty={current.preferences !== original.preferences}
        height="300px"
      />

      <div className="bg-surface rounded border border-border p-4 flex flex-col gap-3">
        <h2 className="text-text font-semibold text-sm">System</h2>
        {system && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${system.ollama_available ? "bg-green" : "bg-red"}`} />
              <span className="text-text-2">
                Ollama {system.ollama_available ? "Connected" : "Unavailable"}
              </span>
            </div>
            <p className="text-xs text-text-3">
              {system.unscored_jobs > 0
                ? `${system.unscored_jobs} job${system.unscored_jobs === 1 ? "" : "s"} pending LLM analysis`
                : "All jobs scored"}
            </p>
          </div>
        )}
        <button
          onClick={rescore}
          disabled={rescoring}
          className={[
            "mt-1 w-fit px-4 py-1.5 text-[0.8125rem] font-medium rounded-sm border",
            rescoring
              ? "bg-transparent text-text-3 border-border cursor-not-allowed"
              : "bg-surface-raised text-amber border-[#3a2200] cursor-pointer hover:bg-amber-bg",
          ].join(" ")}
        >
          {rescoring ? "Re-scoring…" : "Re-score all jobs"}
        </button>
      </div>
    </div>
  );
}
