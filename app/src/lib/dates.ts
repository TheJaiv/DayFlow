// Client-side calendar helpers.
//
// Everything here works in the device's LOCAL timezone and then formats to a
// plain YYYY-MM-DD string. That is deliberate: the server stores calendar days
// and treats whatever date the client sends as authoritative, so "today" must
// mean the date on the user's own wall calendar. Using toISOString() here
// instead would hand back the UTC date and tick a habit for the wrong day for
// anyone east of UTC after their evening.

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** Parses YYYY-MM-DD into a Date at local midnight. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function daysBetween(from: string, to: string): number {
  const ms = fromDateKey(to).getTime() - fromDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function weekdayShort(key: string): string {
  return WEEKDAYS[fromDateKey(key).getDay()];
}

/** "Today", "Tomorrow", "Yesterday", else "Mon 18 Aug". */
export function friendlyDate(key: string, today = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const date = fromDateKey(key);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

/** "Wednesday, 13 August" -- the timetable header. */
export function longDate(key: string): string {
  const date = fromDateKey(key);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    date.getDay()
  ];
  return `${weekday}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** 570 -> "9:30 am". Minutes are stored as offsets from midnight. */
export function formatMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const mins = minute % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return mins === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}
