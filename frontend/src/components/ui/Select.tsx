import { HTMLAttributes, SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
  options?: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, hint, options, className, containerClassName, id, children, ...rest },
  ref
) {
  const autoId = useId();
  const sid = id || autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label htmlFor={sid} className="text-label text-ink-variant font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={sid}
          className={cn(
            "w-full h-10 pl-3 pr-9 rounded-md bg-surface-lowest border text-body-sm text-ink appearance-none cursor-pointer",
            error ? "border-danger" : "border-ink-outlineVariant focus:border-primary",
            "focus:outline-none focus:ring-4",
            error ? "focus:ring-danger/10" : "focus:ring-primary-container/30",
            className
          )}
          {...rest}
        >
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <span className="icon absolute right-2 top-1/2 -translate-y-1/2 text-ink-outline text-[18px] pointer-events-none">
          expand_more
        </span>
      </div>
      {error ? (
        <p className="text-label text-danger">{error}</p>
      ) : hint ? (
        <p className="text-label text-ink-outline">{hint}</p>
      ) : null}
    </div>
  );
});
