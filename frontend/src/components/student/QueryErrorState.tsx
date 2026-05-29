import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api";

interface Props {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

/** Friendly inline error card for a failed query, with a Retry CTA. */
export function QueryErrorState({ error, onRetry, title = "Couldn't load this", className }: Props) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center text-center py-12 px-4 bg-surface-containerLow rounded-2xl border border-dashed border-danger/30 " +
        (className ?? "")
      }
    >
      <span className="icon text-[40px] text-danger/70 mb-3">cloud_off</span>
      <p className="text-title-md text-ink font-semibold">{title}</p>
      <p className="text-body-sm text-ink-variant mt-1 max-w-sm">
        {extractErrorMessage(error, "Please check your connection and try again.")}
      </p>
      {onRetry && (
        <Button className="mt-4" variant="outline" leftIcon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
