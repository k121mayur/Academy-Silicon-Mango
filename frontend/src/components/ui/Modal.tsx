import { ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closable?: boolean;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ open, onClose, title, description, children, footer, size = "md", closable = true }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, closable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm animate-fade-in p-4"
      onClick={() => closable && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-surface-lowest rounded-2xl shadow-modal w-full overflow-hidden animate-slide-up",
          sizes[size]
        )}
      >
        {(title || closable) && (
          <div className="flex items-start justify-between p-5 border-b border-ink-outlineVariant/30">
            <div>
              {title && <h3 className="text-headline text-ink font-display font-semibold">{title}</h3>}
              {description && <p className="text-body-sm text-ink-variant mt-1">{description}</p>}
            </div>
            {closable && (
              <button
                onClick={onClose}
                className="w-8 h-8 grid place-items-center rounded-md hover:bg-surface-container text-ink-variant"
                aria-label="Close"
              >
                <span className="icon">close</span>
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="p-5 border-t border-ink-outlineVariant/30 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
