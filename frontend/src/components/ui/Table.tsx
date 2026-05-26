import { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-ink-outlineVariant/40 bg-surface-lowest">
      <table className={cn("w-full text-body-sm", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("bg-surface-containerLow", className)} {...rest}>
      {children}
    </thead>
  );
}

export function TR({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-t border-ink-outlineVariant/30 hover:bg-surface-containerLow/60 transition-colors", className)} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "text-left px-4 py-3 text-label font-semibold text-ink-variant uppercase tracking-wide",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 text-ink", className)} {...rest}>
      {children}
    </td>
  );
}
