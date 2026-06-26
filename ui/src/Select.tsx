import { useState, useEffect, useRef } from "react";

export default function Select({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#0E1320] border border-[#222B3D] rounded-lg px-3 py-2 text-xs font-mono text-left transition-colors hover:border-[#FF00FF]/50 focus:border-[#FF00FF]/50 outline-none flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-[#F8FAFC]' : 'text-[#7B8AA0]/50'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`w-3 h-3 text-[#7B8AA0] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#151C2E] border border-[#222B3D] rounded-xl overflow-hidden z-[100] shadow-xl shadow-black/50">
          {options.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-[#7B8AA0]/50 font-mono text-center">{placeholder}</div>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-2 text-xs font-mono text-left transition-colors hover:bg-[#FF00FF]/10 ${value === opt.value ? 'text-[#FF00FF] bg-[#FF00FF]/5 font-bold' : 'text-[#F8FAFC]'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
