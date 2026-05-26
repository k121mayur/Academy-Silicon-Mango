import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title = "Nothing here yet", description, icon = "inbox", action, className, ...rest }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4 bg-surface-containerLow rounded-2xl border border-dashed border-ink-outlineVariant/60",
        className
      )}
      {...rest}
    >
      <span className="icon text-[40px] text-ink-outline mb-3">{icon}</span>
      <p className="text-title-md text-ink font-semibold">{title}</p>
      {description && <p className="text-body-sm text-ink-variant mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
