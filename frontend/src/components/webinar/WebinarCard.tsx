import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { absoluteApiUrl } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  PublicWebinarListItem,
  WebinarStatus,
  formatWebinarWhen,
  countdownTo,
} from "@/services/webinar.service";

const STATUS_TONE: Record<WebinarStatus, "primary" | "danger" | "neutral"> = {
  upcoming: "primary",
  live: "danger",
  past: "neutral",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<WebinarStatus, string> = {
  upcoming: "Upcoming",
  live: "Live now",
  past: "Ended",
  cancelled: "Cancelled",
};

export function WebinarCard({ webinar }: { webinar: PublicWebinarListItem }) {
  const cd = webinar.status === "upcoming" ? countdownTo(webinar.start_at) : "";

  return (
    <Link
      to={`/webinars/${webinar.slug}`}
      className="group relative bg-surface-lowest rounded-2xl overflow-hidden border border-ink-outlineVariant/30 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:shadow-card-hover hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex flex-col"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container">
        {webinar.flyer_url || webinar.banner_url ? (
          <img
            src={absoluteApiUrl((webinar.flyer_url || webinar.banner_url) as string)}
            alt={webinar.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-primary-onContainer opacity-50">
            <span className="icon text-[56px]">videocam</span>
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <Badge tone={STATUS_TONE[webinar.status]} className="shadow-sm">
            {webinar.status === "live" && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-0.5" />
            )}
            {STATUS_LABEL[webinar.status]}
          </Badge>
          <span className="px-2.5 py-1 rounded-full text-label font-semibold bg-white/95 text-ink backdrop-blur-sm shadow-sm">
            {webinar.is_free ? "Free" : formatCurrency(webinar.price, webinar.currency)}
          </span>
        </div>
        {cd && (
          <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-label font-medium bg-black/55 text-white backdrop-blur-sm inline-flex items-center gap-1">
            <span className="icon text-[13px]">schedule</span>
            starts in {cd}
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        {webinar.category && (
          <span className="text-caption text-tertiary font-medium uppercase tracking-wide">{webinar.category}</span>
        )}
        <h3 className="font-display font-semibold text-title-md text-ink line-clamp-2 group-hover:text-primary transition-colors mt-1 min-h-[3rem]">
          {webinar.title}
        </h3>

        {webinar.host && (
          <div className="flex items-center gap-2 mt-2">
            {webinar.host.logo_url ? (
              <img
                src={absoluteApiUrl(webinar.host.logo_url)}
                alt={webinar.host.name}
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <span className="icon text-[16px] text-ink-outline">apartment</span>
            )}
            <span className="text-body-sm text-ink-variant truncate">{webinar.host.name}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink-outlineVariant/30 text-body-sm text-ink-variant">
          <span className="flex items-center gap-1">
            <span className="icon text-[16px]">event</span>
            {formatWebinarWhen(webinar.start_at, webinar.timezone)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function WebinarCardSkeleton() {
  return (
    <div className="bg-surface-containerLow rounded-2xl overflow-hidden animate-pulse">
      <div className="h-44 bg-surface-container" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-surface-container rounded w-3/4" />
        <div className="h-3 bg-surface-container rounded w-1/2" />
        <div className="h-3 bg-surface-container rounded w-2/3 mt-2" />
      </div>
    </div>
  );
}
