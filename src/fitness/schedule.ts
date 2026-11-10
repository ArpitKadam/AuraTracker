// Weekly split + per-date overrides (skip / postpone). Pure: the DB layer and the launcher feed it rows.
import type { MuscleGroup } from './catalog-types.ts';

export type DayPlan = { primary: MuscleGroup[]; secondary: MuscleGroup[] };
/** Index = Date.getDay() (0 = Sunday). A day with no primary groups is a rest day. */
export type Split = DayPlan[];

export const DEFAULT_SPLIT: Split = [
  { primary: [], secondary: [] },
  { primary: ['legs'], secondary: ['shoulders'] },
  { primary: ['chest'], secondary: ['triceps', 'abs'] },
  { primary: ['back'], secondary: ['biceps', 'forearms'] },
  { primary: ['shoulders'], secondary: ['legs', 'abs'] },
  { primary: ['biceps', 'triceps'], secondary: ['forearms'] },
  { primary: ['chest', 'back'], secondary: ['abs'] },
];

/**
 * skip: the day is marked off, nothing moves.
 * postponed: the day's plan was moved to `other` (a later rest day).
 * moved: this day carries the plan postponed from `other`.
 */
export type Override = { date: string; kind: 'skip' | 'postponed' | 'moved'; plan: DayPlan; other: string | null };

export type DayStatus =
  | { kind: 'planned'; plan: DayPlan }
  | { kind: 'rest' }
  | { kind: 'skipped'; plan: DayPlan }
  | { kind: 'postponed'; plan: DayPlan; to: string }
  | { kind: 'moved'; plan: DayPlan; from: string };

/** Local calendar date, not UTC (a 23:30 workout belongs to today). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const isRest = (p: DayPlan) => p.primary.length === 0;
export const groupsOf = (p: DayPlan): MuscleGroup[] => [...new Set([...p.primary, ...p.secondary])];

export function dayStatus(date: Date, split: Split, overrides: Map<string, Override>): DayStatus {
  const base = split[date.getDay()];
  const ov = overrides.get(isoDate(date));
  if (ov?.kind === 'skip') return { kind: 'skipped', plan: base };
  if (ov?.kind === 'postponed') return { kind: 'postponed', plan: ov.plan, to: ov.other ?? '' };
  if (ov?.kind === 'moved') return { kind: 'moved', plan: ov.plan, from: ov.other ?? '' };
  return isRest(base) ? { kind: 'rest' } : { kind: 'planned', plan: base };
}

/** First rest day in the next 14 days that isn't already holding a moved workout (2 weeks covers a busy week). */
export function postponeTarget(date: Date, split: Split, overrides: Map<string, Override>): Date | null {
  for (let i = 1; i <= 14; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
    if (isRest(split[d.getDay()]) && !overrides.has(isoDate(d))) return d;
  }
  return null;
}
