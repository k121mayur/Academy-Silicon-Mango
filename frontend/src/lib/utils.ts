import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Weekday labels indexed Monday-first (Mon=0 … Sun=6) to match the backend,
 * which stores `slot.weekday` using Python's `date.weekday()` convention.
 * ALWAYS use this to render a stored weekday integer — never a Sunday-first
 * array, or days render shifted by one (e.g. Saturday shown as Friday).
 */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(
    "en-IN",
    options ?? { day: "2-digit", month: "short", year: "numeric" }
  ).format(d);
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function relativeTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

/** Convert a JS `Date.getDay()` (Sun=0…Sat=6) to the Mon-first index used by
 * WEEKDAY_LABELS / the backend (Mon=0…Sun=6). */
export function mondayFirstWeekday(value: string | Date): number {
  const d = typeof value === "string" ? new Date(value) : value;
  return (d.getDay() + 6) % 7;
}

/** "Mon, 06 Jul 2026" — the weekday name plus the date. */
export function formatWeekdayDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

// ---- Week → Day grouping for the instructor dashboard ----

export interface PlanLike {
  id: string;
  plan_index: number;
  title: string;
}

export interface SessionLike {
  id: string;
  plan_id: string | null;
  scheduled_at: string | null;
}

export interface WeekDayEntry<S extends SessionLike> {
  /** 1-based position of this day within its week. */
  dayIndex: number;
  /** Mon-first weekday index (0–6), or null when the session has no date. */
  weekday: number | null;
  /** "Day 1 — Mon, 06 Jul 2026" */
  label: string;
  session: S;
}

export interface WeekGroup<S extends SessionLike> {
  /** 1-based week number (position among plans). */
  week: number;
  planId: string;
  title: string;
  days: WeekDayEntry<S>[];
}

export interface WeekDayGrouping<S extends SessionLike> {
  weeks: WeekGroup<S>[];
  /** Manual / unplanned sessions that don't belong to any week. */
  ungrouped: S[];
}

/**
 * Group a batch's sessions under their week (plan), each ordered into days by
 * scheduled date. Within a week, sessions are sorted ascending by date and
 * labelled "Day N — <Weekday>, <date>". Sessions with no plan (manual) or whose
 * plan is missing land in `ungrouped`.
 */
export function groupSessionsByWeekDay<S extends SessionLike>(
  plans: PlanLike[],
  sessions: S[]
): WeekDayGrouping<S> {
  const byPlan = new Map<string, S[]>();
  const ungrouped: S[] = [];
  const planIds = new Set(plans.map((p) => p.id));

  for (const s of sessions) {
    if (s.plan_id && planIds.has(s.plan_id)) {
      const arr = byPlan.get(s.plan_id) ?? [];
      arr.push(s);
      byPlan.set(s.plan_id, arr);
    } else {
      ungrouped.push(s);
    }
  }

  const orderedPlans = [...plans].sort((a, b) => a.plan_index - b.plan_index);
  const weeks: WeekGroup<S>[] = orderedPlans.map((p, idx) => {
    const sess = (byPlan.get(p.id) ?? []).sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return ta - tb;
    });
    const days: WeekDayEntry<S>[] = sess.map((s, i) => ({
      dayIndex: i + 1,
      weekday: s.scheduled_at ? mondayFirstWeekday(s.scheduled_at) : null,
      label: s.scheduled_at
        ? `Day ${i + 1} — ${formatWeekdayDate(s.scheduled_at)}`
        : `Day ${i + 1}`,
      session: s,
    }));
    return { week: idx + 1, planId: p.id, title: p.title, days };
  });

  return { weeks, ungrouped };
}

export function initials(name?: string | null): string {
  return (name?.trim() || "User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
