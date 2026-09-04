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
        "bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl overflow-hidden flex flex-col h-full",
        className
      )}
    >
      <Skeleton className="h-32 rounded-none shrink-0" />
      <div className="p-5 flex flex-col flex-1 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-1.5 py-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="space-y-2 flex-1 pt-1">
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-ink-outlineVariant/30 mt-auto">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
