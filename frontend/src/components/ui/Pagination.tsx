import { cn } from "@/lib/utils";

interface Props {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Build a compact page-number window with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Pagination({ page, pages, total, limit, onPageChange, className }: Props) {
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const items = pageWindow(page, pages);

  const btn =
    "min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-md text-body-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-3 mt-4", className)}>
      <p className="text-body-sm text-ink-variant">
        Showing <span className="font-semibold text-ink">{from}</span>–
        <span className="font-semibold text-ink">{to}</span> of{" "}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            className={cn(btn, "text-ink hover:bg-surface-container")}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <span className="icon text-[18px]">chevron_left</span>
          </button>
          {items.map((it, idx) =>
            it === "…" ? (
              <span key={`e${idx}`} className="min-w-9 h-9 inline-flex items-center justify-center text-ink-variant">
                …
              </span>
            ) : (
              <button
                key={it}
                type="button"
                onClick={() => onPageChange(it)}
                aria-current={it === page ? "page" : undefined}
                className={cn(
                  btn,
                  it === page
                    ? "bg-primary-fill text-primary-on"
                    : "text-ink hover:bg-surface-container"
                )}
              >
                {it}
              </button>
            )
          )}
          <button
            type="button"
            className={cn(btn, "text-ink hover:bg-surface-container")}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
          >
            <span className="icon text-[18px]">chevron_right</span>
          </button>
        </nav>
      )}
    </div>
  );
}
