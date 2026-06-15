import { Spinner } from "@/components/ui/Spinner";

/** Branded fallback shown while a lazily-loaded route chunk downloads. */
export function RouteFallback() {
  return (
    <div className="min-h-[50vh] grid place-items-center animate-fade-in">
      <div className="flex flex-col items-center gap-3 text-ink-outline">
        <Spinner size={28} className="text-primary" />
        <p className="text-body-sm">Loading…</p>
      </div>
    </div>
  );
}
