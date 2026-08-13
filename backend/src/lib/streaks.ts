import { addDays } from "./dates";

export interface StreakResult {
  current: number;
  longest: number;
  completedToday: boolean;
  totalCompletions: number;
}

/**
 * Streak maths for a DAILY habit.
 *
 * `completedDates` is the set of YYYY-MM-DD days the habit was marked done.
 * `today` is the *client's* local date, so a user in IST ticking a box at 11pm
 * gets credit for that day rather than for tomorrow in UTC.
 *
 * The one subtlety: not having ticked today does not break the current streak,
 * because the day is not over yet. A streak only dies once a full day passes
 * with no completion, so counting starts at yesterday when today is unticked.
 */
export function computeDailyStreak(
  completedDates: string[],
  today: string,
): StreakResult {
  const done = new Set(completedDates);

  const completedToday = done.has(today);

  let current = 0;
  let cursor = completedToday ? today : addDays(today, -1);
  while (done.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest run anywhere in the history. Sorting ascending means a run breaks
  // exactly when the next date is not the previous date plus one.
  const sorted = [...done].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of sorted) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  return { current, longest, completedToday, totalCompletions: done.size };
}
