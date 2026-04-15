import { useEffect, useRef, useState } from "react";

const WORK_TYPES = [
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'onsite', label: 'On-site' },
];

interface WorkTypeFilterProps {
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function WorkTypeFilter({ selected, onChange }: WorkTypeFilterProps) {
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
    if (selected.size === 0) return "All types";
    const names = WORK_TYPES.filter(t => selected.has(t.key)).map(t => t.label);
    if (names.length <= 2) return names.join(", ");
    return `${names.length} types`;
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
          className="absolute left-0 top-full mt-1 rounded border z-50 min-w-[140px] py-1"
          style={{ background: '#0d1117', borderColor: '#1a2840', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
        >
          {WORK_TYPES.map(type => (
            <label
              key={type.key}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[0.75rem] select-none"
              style={{ color: selected.has(type.key) ? '#7a95b0' : '#6b8aa3' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#131d2b')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input
                type="checkbox"
                checked={selected.has(type.key)}
                onChange={() => toggle(type.key)}
                className="checkbox-styled"
              />
              <span>{type.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
