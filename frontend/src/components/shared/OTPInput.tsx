import { ClipboardEvent, KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
}

export function OTPInput({ value, onChange, length = 6, autoFocus, disabled, error }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  const setDigit = (i: number, d: string) => {
    const arr = value.padEnd(length, " ").split("");
    arr[i] = d;
    const next = arr.join("").trimEnd();
    onChange(next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    onChange(text);
    setTimeout(() => {
      const idx = Math.min(text.length, length - 1);
      refs.current[idx]?.focus();
    }, 0);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[i] || ""}
          onPaste={onPaste}
          onKeyDown={(e) => onKey(e, i)}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 1);
            if (!d) {
              setDigit(i, "");
              return;
            }
            setDigit(i, d);
            if (i < length - 1) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "w-12 h-14 text-center text-headline font-display font-semibold rounded-xl border bg-surface-lowest text-ink",
            "focus:outline-none focus:ring-4",
            error
              ? "border-danger focus:border-danger focus:ring-danger/10"
              : "border-ink-outlineVariant focus:border-primary focus:ring-primary-container/30",
            "transition-all"
          )}
        />
      ))}
    </div>
  );
}
