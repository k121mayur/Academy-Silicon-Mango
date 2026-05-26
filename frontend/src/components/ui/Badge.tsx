import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "secondary" | "tertiary" | "neutral" | "success" | "danger" | "warning";

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: string;
  size?: "sm" | "md";
}

const tones: Record<Tone, string> = {
  primary: "bg-primary-container/30 text-primary-onContainer border border-primary-container/40",
  secondary: "bg-secondary-container text-secondary border border-secondary/10",
  tertiary: "bg-tertiary-container/30 text-tertiary border border-tertiary/20",
  neutral: "bg-surface-container text-ink-variant border border-ink-outlineVariant",
  success: "bg-[#b3ecf5]/40 text-tertiary border border-tertiary/20",
  danger: "bg-danger-container text-danger border border-danger/20",
  warning: "bg-[#fff1c2] text-[#6b4c00] border border-primary-container/30",
};

export function Badge({ tone = "neutral", icon, size = "sm", className, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        tones[tone],
        size === "sm" ? "px-2 py-0.5 text-label" : "px-3 py-1 text-body-sm",
        className
      )}
      {...rest}
    >
      {icon && <span className="icon" style={{ fontSize: size === "sm" ? 12 : 16 }}>{icon}</span>}
      {children}
    </span>
  );
}
