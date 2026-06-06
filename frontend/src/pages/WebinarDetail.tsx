import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetaTags } from "@/components/shared/MetaTags";
import { absoluteApiUrl } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import {
  getPublicWebinar,
  formatWebinarWhen,
  countdownTo,
  registrationStateLabel,
  WebinarStatus,
} from "@/services/webinar.service";

const STATUS_TONE: Record<WebinarStatus, "primary" | "danger" | "neutral"> = {
  upcoming: "primary",
  live: "danger",
  past: "neutral",
  cancelled: "neutral",
};

export default function WebinarDetail() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const { data: w, isLoading, isError } = useQuery({
    queryKey: qk.public.webinar(idOrSlug || ""),
    queryFn: () => getPublicWebinar(idOrSlug as string),
    enabled: !!idOrSlug,
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }

  if (isError || !w) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          title="Webinar not found"
          description="This webinar may have been unpublished or the link is incorrect."
          icon="videocam_off"
          action={
            <Link to="/webinars">
              <Button leftIcon="arrow_back">Browse webinars</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const cd = w.status === "upcoming" ? countdownTo(w.start_at) : "";
  const canRegister = ["open", "waitlist"].includes(w.registration_state);
  const heroImg = w.banner_url || w.flyer_url;

  return (
    <div className="bg-surface">
      <MetaTags title={w.meta_title} description={w.meta_description} image={w.og_image_url} />

      {/* Hero */}
      <div className="relative h-64 md:h-80 overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container">
        {heroImg && (
          <img src={absoluteApiUrl(heroImg)} alt={w.title} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 max-w-5xl mx-auto px-4 md:px-6 pb-6">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={STATUS_TONE[w.status]}>
              {w.status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-0.5" />}
              {w.status === "live" ? "Live now" : w.status === "upcoming" ? "Upcoming" : w.status === "past" ? "Ended" : "Cancelled"}
            </Badge>
            <Badge tone="warning">{w.is_free ? "Free" : formatCurrency(w.price, w.currency)}</Badge>
            {w.category && <Badge tone="neutral">{w.category}</Badge>}
          </div>
          <h1 className="font-display font-bold text-display-md text-white drop-shadow">{w.title}</h1>
          {w.subtitle && <p className="text-body-lg text-white/85 mt-1 max-w-2xl">{w.subtitle}</p>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 grid lg:grid-cols-3 gap-8">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {w.description && (
            <section>
              <h2 className="font-display font-semibold text-headline text-ink mb-2">About this webinar</h2>
              <p className="text-body-md text-ink-variant whitespace-pre-line leading-relaxed">{w.description}</p>
            </section>
          )}

          {w.host && (
            <section>
              <h2 className="font-display font-semibold text-headline text-ink mb-3">Hosted by</h2>
              <Card>
                <CardBody className="flex items-start gap-4">
                  {w.host.logo_url ? (
                    <img
                      src={absoluteApiUrl(w.host.logo_url)}
                      alt={w.host.name}
                      className="w-14 h-14 rounded-xl object-cover border border-ink-outlineVariant/40"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl grid place-items-center bg-primary/10 text-primary">
                      <span className="icon text-[28px]">apartment</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{w.host.name}</p>
                    {w.host.description && <p className="text-body-sm text-ink-variant mt-0.5">{w.host.description}</p>}
                    {w.host.website && (
                      <a
                        href={w.host.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-body-sm text-primary hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        <span className="icon text-[14px]">language</span> Website
                      </a>
                    )}
                  </div>
                </CardBody>
              </Card>
            </section>
          )}

          {w.faqs && w.faqs.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-headline text-ink mb-3">FAQs</h2>
              <div className="space-y-2">
                {w.faqs.map((f, i) => (
                  <Card key={i}>
                    <button
                      className="w-full flex items-center justify-between gap-3 p-4 text-left"
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      <span className="font-medium text-ink">{f.question}</span>
                      <span className="icon text-ink-outline">{openFaq === i ? "expand_less" : "expand_more"}</span>
                    </button>
                    {openFaq === i && <p className="px-4 pb-4 text-body-sm text-ink-variant whitespace-pre-line">{f.answer}</p>}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="icon text-primary text-[22px]">event</span>
                  <div>
                    <p className="text-label text-ink-outline uppercase tracking-wide">When</p>
                    <p className="font-medium text-ink">{formatWebinarWhen(w.start_at, w.timezone)}</p>
                    {cd && <p className="text-body-sm text-tertiary mt-0.5">Starts in {cd}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="icon text-primary text-[22px]">schedule</span>
                  <div>
                    <p className="text-label text-ink-outline uppercase tracking-wide">Duration</p>
                    <p className="font-medium text-ink">{w.duration_mins} mins</p>
                  </div>
                </div>
                {w.max_participants != null && (
                  <div className="flex items-start gap-3">
                    <span className="icon text-primary text-[22px]">group</span>
                    <div>
                      <p className="text-label text-ink-outline uppercase tracking-wide">Seats</p>
                      <p className="font-medium text-ink">
                        {w.seats_left != null ? `${w.seats_left} left` : "Limited"} of {w.max_participants}
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <Badge tone={canRegister ? "success" : "neutral"}>{registrationStateLabel(w.registration_state)}</Badge>
                </div>

                {w.status !== "past" && w.status !== "cancelled" && canRegister ? (
                  <Link to={`/webinars/${w.slug}/register`} className="block">
                    <Button fullWidth leftIcon="how_to_reg">
                      {w.registration_state === "waitlist" ? "Join waitlist" : "Register now"}
                    </Button>
                  </Link>
                ) : (
                  <Button fullWidth disabled>
                    {w.status === "past" ? "Webinar ended" : w.status === "cancelled" ? "Cancelled" : "Registration closed"}
                  </Button>
                )}

                {/* Meeting link — only when the admin made it public */}
                {w.meeting_url && (
                  <a href={w.meeting_url} target="_blank" rel="noreferrer" className="block">
                    <Button fullWidth variant="tertiary" leftIcon="videocam">
                      {w.status === "live" ? "Join the live session" : "Open meeting link"}
                    </Button>
                  </a>
                )}

                <div className="flex gap-2 pt-1">
                  <a href={w.calendar_url} target="_blank" rel="noreferrer" className="flex-1">
                    <Button fullWidth variant="outline" size="sm" leftIcon="calendar_add_on">
                      Google
                    </Button>
                  </a>
                  <a href={absoluteApiUrl(w.ics_url)} className="flex-1">
                    <Button fullWidth variant="outline" size="sm" leftIcon="download">
                      .ics
                    </Button>
                  </a>
                </div>
              </CardBody>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
