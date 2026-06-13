import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label?: string;
  placeholder?: string;
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  loading?: boolean;
  emptyText?: string;
  containerClassName?: string;
}

/**
 * Dropdown that lists every option (scrollable) with an inline filter box.
 * The panel expands in-flow so it works inside modals with overflow-hidden.
 */
export function SearchableSelect({
  label,
  placeholder = "Select…",
  options,
  value,
  onChange,
  error,
  loading,
  emptyText = "No options found",
  containerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && <label className="text-label text-ink-variant font-medium">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full h-10 pl-3 pr-9 rounded-md bg-surface-lowest border text-body-sm text-left relative cursor-pointer",
          error ? "border-danger" : "border-ink-outlineVariant focus:border-primary",
          "focus:outline-none focus:ring-4",
          error ? "focus:ring-danger/10" : "focus:ring-primary-container/30"
        )}
      >
        <span className={cn("block truncate", selected ? "text-ink" : "text-ink-outline")}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
        </span>
        <span className="icon absolute right-2 top-1/2 -translate-y-1/2 text-ink-outline text-[18px] pointer-events-none">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="border border-ink-outlineVariant rounded-md bg-surface-lowest overflow-hidden">
          <div className="p-2 border-b border-ink-outlineVariant/40">
            <div className="relative">
              <span className="icon absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-outline text-[16px] pointer-events-none">search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to filter…"
                className="w-full h-9 pl-8 pr-3 rounded-md bg-surface-container text-body-sm text-ink placeholder:text-ink-outline focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto scrollbar-thin">
            {loading ? (
              <p className="p-3 text-body-sm text-ink-outline">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-body-sm text-ink-outline">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-surface-containerLow transition-colors",
                    o.value === value && "bg-primary/5"
                  )}
                >
                  <p className="text-body-sm font-medium text-ink">{o.label}</p>
                  {o.sublabel && <p className="text-label text-ink-outline">{o.sublabel}</p>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="text-label text-danger">{error}</p>}
    </div>
  );
}
