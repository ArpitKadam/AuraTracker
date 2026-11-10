import { LB_PER_KG, type Units } from './db/profile.ts';

/** kg (storage) to the user's display unit, rounded to 0.1 (kg) or 0.5 (lb plates). */
export function toDisplay(kg: number, units: Units): number {
  if (units === 'kg') return Math.round(kg * 10) / 10;
  return Math.round(kg * LB_PER_KG * 2) / 2;
}

export const formatWeight = (kg: number, units: Units) => `${toDisplay(kg, units)} ${units}`;

/** Stepper increment in display units. */
export const displayStep = (units: Units) => (units === 'kg' ? 2.5 : 5);
