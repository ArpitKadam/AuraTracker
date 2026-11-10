// "Next time" reminders (TASK.md 10b). Pure: decides which notifications to schedule; notify.ts does the scheduling.
// Four a day, 4 h apart, the last one before the evening workout (default 19:00 -> 07:00, 11:00, 15:00, 19:00).
import type { DayStatus } from './schedule.ts';

export const DEFAULT_LAST_MINUTES = 19 * 60;
export const SLOTS = 4;
const GAP_MINUTES = 4 * 60;

export type ReminderDay = {
  date: Date;
  status: DayStatus;
  /** A session was already started this day: the user is training, stop nagging. */
  trained: boolean;
  /** Group names for the title, e.g. "Chest + Triceps + Abs". */
  title: string;
  /** One overload target per line, e.g. "Bench Press: push for 5-6 reps at 30 kg". */
  targets: string[];
};

export type Reminder = { at: Date; title: string; body: string };

/** Minutes after midnight for each slot; earlier slots that would fall before 00:00 are dropped. */
export function slotMinutes(lastMinutes: number): number[] {
  return Array.from({ length: SLOTS }, (_, i) => lastMinutes - (SLOTS - 1 - i) * GAP_MINUTES).filter((m) => m >= 0);
}

export function planReminders(days: ReminderDay[], lastMinutes: number, now: Date): Reminder[] {
  const out: Reminder[] = [];
  for (const day of days) {
    // Only days with a workout still to do: skipped, postponed-away and rest days stay quiet.
    if (day.status.kind !== 'planned' && day.status.kind !== 'moved') continue;
    if (day.trained) continue;
    const slots = slotMinutes(lastMinutes);
    slots.forEach((m, i) => {
      const at = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), Math.floor(m / 60), m % 60);
      if (at <= now) return;
      const last = i === slots.length - 1;
      if (day.targets.length) {
        // Rotate through the targets so each notification says something new.
        out.push({ at, title: last ? `${day.title} in a bit` : `${day.title} today`, body: day.targets[i % day.targets.length] });
      } else if (last) {
        // No history for these muscles yet: one plain reminder, not four.
        out.push({ at, title: `${day.title} today`, body: 'First time logging these: pick weights you can move for 13-15 clean reps.' });
      }
    });
  }
  return out;
}

/** Stored last-reminder time (minutes after midnight). Missing or invalid -> 19:00. Note Number(null) is 0, so check first. */
export function parseLastMinutes(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_LAST_MINUTES;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 24 * 60 ? n : DEFAULT_LAST_MINUTES;
}

export const formatClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
