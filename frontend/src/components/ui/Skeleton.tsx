import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder that matches the shape of the content it stands in for.
 * Skeletons that mirror the final layout feel faster than a centred spinner
 * because the eye already sees where content will land.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...rest} />;
}

/** A card-shaped skeleton used while course / webinar grids load. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl overflow-hidden",
        className
      )}
    >
      <Skeleton className="h-40 rounded-none" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
    </div>
  );
}
