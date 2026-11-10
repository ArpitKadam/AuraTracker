import type { MuscleGroup, MuscleSlug } from './catalog-types.ts';

// Picker groups, in display order, with the body-map slugs each one lights up.
export const GROUPS: { id: MuscleGroup; label: string; slugs: MuscleSlug[] }[] = [
  { id: 'chest', label: 'Chest', slugs: ['chest'] },
  { id: 'back', label: 'Back', slugs: ['upper-back', 'lower-back', 'trapezius'] },
  { id: 'shoulders', label: 'Shoulders', slugs: ['deltoids'] },
  { id: 'biceps', label: 'Biceps', slugs: ['biceps'] },
  { id: 'triceps', label: 'Triceps', slugs: ['triceps'] },
  { id: 'forearms', label: 'Forearms', slugs: ['forearm'] },
  { id: 'abs', label: 'Abs', slugs: ['abs', 'obliques'] },
  { id: 'legs', label: 'Legs', slugs: ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors', 'tibialis'] },
];

export const groupLabel = (id: MuscleGroup) => GROUPS.find((g) => g.id === id)?.label ?? id;

/** Names used in the workout split ("Shoulder", "Legs") to picker group ids. */
export function groupFromName(name: string): MuscleGroup | null {
  const n = name.trim().toLowerCase();
  const hit = GROUPS.find((g) => g.id === n || g.label.toLowerCase() === n || g.id === `${n}s`);
  return hit?.id ?? null;
}

export const slugsFor = (groups: MuscleGroup[]) => GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.slugs);
