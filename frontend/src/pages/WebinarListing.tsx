import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { WebinarCard, WebinarCardSkeleton } from "@/components/webinar/WebinarCard";
import { MetaTags } from "@/components/shared/MetaTags";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { qk } from "@/lib/queryKeys";
import { listPublicWebinars } from "@/services/webinar.service";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "past", label: "Past" },
] as const;

export default function WebinarListing() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("upcoming");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk.public.webinars(tab, debounced),
    queryFn: () => listPublicWebinars(tab, debounced),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const webinars = data ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 space-y-6">
      <MetaTags
        title="Webinars"
        description="Join live and upcoming webinars hosted on Silicon Mango Academy — free and paid sessions across technology, data science, careers and more."
      />

      <div className="animate-slide-up">
        <p className="text-caption text-tertiary mb-1 uppercase tracking-wide">Live events</p>
        <h1 className="font-display font-bold text-display-md text-ink">Webinars</h1>
        <p className="text-body-sm text-ink-variant">
          Browse upcoming and past sessions, then register in seconds.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-ink-outlineVariant/40">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 h-10 text-body-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-variant hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search webinars…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon="search"
          containerClassName="w-full sm:w-72"
        />
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <WebinarCardSkeleton key={i} />
          ))}
        </div>
      ) : webinars.length === 0 ? (
        <EmptyState
          title={debounced ? "No matches" : `No ${tab} webinars`}
          description={
            debounced ? "Try a different search term." : "Check back soon — new sessions are added regularly."
          }
          icon="videocam_off"
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {webinars.map((w) => (
            <WebinarCard key={w.id} webinar={w} />
          ))}
        </div>
      )}

      {isFetching && !isLoading && (
        <p className="text-label text-ink-outline text-center">Updating…</p>
      )}
    </div>
  );
}
