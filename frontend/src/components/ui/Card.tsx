import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lift + deepen shadow on hover (only on fine-pointer devices). Use for clickable cards. */
  interactive?: boolean;
}

export function Card({ className, interactive, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl shadow-card",
        interactive && "hover-lift hover:shadow-card-hover hover:border-ink-outlineVariant/70 cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5 border-b border-ink-outlineVariant/30", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5 border-t border-ink-outlineVariant/30", className)} {...rest}>
      {children}
    </div>
  );
}
