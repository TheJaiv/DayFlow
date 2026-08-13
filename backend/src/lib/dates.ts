// Calendar-day helpers.
//
// Every "day" in DayFlow is a plain YYYY-MM-DD string on the wire and a
// @db.Date column in Postgres. Prisma hands @db.Date back as a JS Date pinned
// to UTC midnight, so all conversion happens in UTC and never touches the
// server's local timezone. The *client* decides what "today" means and sends
// it explicitly -- a phone in IST and a server in UTC disagree for 5.5 hours
// a day, and the user's local date is the one that matters.

export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-08-13" -> Date(2026-08-13T00:00:00.000Z) */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> "2026-08-13" */
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Server-side fallback for "today" when the client does not supply one. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD string by whole days. */
export function addDays(value: string, days: number): string {
  const d = parseDateOnly(value);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = parseDateOnly(to).getTime() - parseDateOnly(from).getTime();
  return Math.round(ms / 86_400_000);
}
