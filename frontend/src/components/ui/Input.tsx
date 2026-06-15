import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, useId, useState } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, type = "text", className, containerClassName, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && show ? "text" : type;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-label text-ink-variant font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-ink-outline text-[18px] pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          className={cn(
            "w-full h-10 rounded-md bg-surface-lowest border text-body-sm text-ink",
            "placeholder:text-ink-outline",
            "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
            error
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-ink-outlineVariant hover:border-ink-outline focus:border-primary",
            "focus:outline-none focus:ring-4",
            error ? "focus:ring-danger/10" : "focus:ring-primary-container/30",
            leftIcon ? "pl-10" : "pl-3",
            (isPassword || rightIcon) ? "pr-10" : "pr-3",
            className
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center text-ink-outline hover:text-ink"
          >
            <span className="icon text-[18px]">{show ? "visibility_off" : "visibility"}</span>
          </button>
        )}
        {!isPassword && rightIcon && (
          <span className="icon absolute right-3 top-1/2 -translate-y-1/2 text-ink-outline text-[18px]">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-label text-danger flex items-center gap-1">
          <span className="icon text-[14px]">error</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-label text-ink-outline">{hint}</p>
      ) : null}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, containerClassName, id, rows = 3, ...rest },
  ref
) {
  const autoId = useId();
  const tid = id || autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label htmlFor={tid} className="text-label text-ink-variant font-medium">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={tid}
        rows={rows}
        className={cn(
          "w-full rounded-md bg-surface-lowest border text-body-sm text-ink p-3",
          "placeholder:text-ink-outline transition-[border-color,box-shadow] duration-200 ease-out",
          error ? "border-danger" : "border-ink-outlineVariant hover:border-ink-outline focus:border-primary",
          "focus:outline-none focus:ring-4",
          error ? "focus:ring-danger/10" : "focus:ring-primary-container/30",
          className
        )}
        {...rest}
      />
      {error ? (
        <p className="text-label text-danger">{error}</p>
      ) : hint ? (
        <p className="text-label text-ink-outline">{hint}</p>
      ) : null}
    </div>
  );
});
