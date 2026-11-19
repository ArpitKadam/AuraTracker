// Shape of assets/catalog/catalog.json (written by scripts/build_catalog.py).
export type MuscleSlug =
  | 'chest' | 'upper-back' | 'lower-back' | 'trapezius' | 'deltoids' | 'biceps' | 'triceps' | 'forearm'
  | 'abs' | 'obliques' | 'quadriceps' | 'hamstring' | 'gluteal' | 'calves' | 'adductors' | 'tibialis' | 'neck';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'abs' | 'legs';

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'kettlebell' | 'band' | 'bodyweight' | 'ez-bar' | 'other';

export type CatalogExercise = {
  id: string;
  name: string;
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  groups: MuscleGroup[];
  equipment: Equipment;
  mechanic: 'compound' | 'isolation' | null;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  category: string | null;
  instructions: string[];
  tips: string[];
  /** File names under assets/catalog/media: the poster frame of `video`, or empty when there is no video. */
  media: string[];
  /** Demo clip file name under assets/catalog/videos (key of VIDEOS), or null when none exists yet. */
  video: string | null;
  /** Position in the owner's must-have list (scripts/curated.json); null for everything else. */
  curated: number | null;
  sources: ('repdb' | 'fedb' | 'custom' | 'curated')[];
  /** Custom exercises only: a photo the user picked, copied into the app's files. */
  photoUri?: string | null;
};
