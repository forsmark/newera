import { useEffect, useRef, useState } from "react";

interface SourceFilterProps {
  sources: { key: string; label: string; count: number }[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function SourceFilter({ sources, selected, onChange }: SourceFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const label = (() => {
    if (selected.size === 0) return "All sources";
    const names = sources.filter(s => selected.has(s.key)).map(s => s.label);
    if (names.length <= 2) return names.join(", ");
    return `${names.length} sources`;
  })();

  const isActive = selected.size > 0;

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1.5 rounded-full border cursor-pointer text-[0.75rem] font-medium"
        style={{
          borderColor: isActive ? '#243653' : '#1a2840',
          background: isActive ? '#1a2840' : 'transparent',
          color: isActive ? '#7a95b0' : '#6b8aa3',
        }}
      >
        {label}
        <span className="ml-1 opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 rounded border z-50 min-w-[160px] py-1"
          style={{ background: '#0d1117', borderColor: '#1a2840', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
        >
          {sources.map(source => (
            <label
              key={source.key}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[0.75rem] select-none"
              style={{ color: selected.has(source.key) ? '#7a95b0' : '#6b8aa3' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#131d2b')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input
                type="checkbox"
                checked={selected.has(source.key)}
                onChange={() => toggle(source.key)}
                className="checkbox-styled"
              />
              <span>{source.label}</span>
              <span className="ml-auto opacity-50">({source.count})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
