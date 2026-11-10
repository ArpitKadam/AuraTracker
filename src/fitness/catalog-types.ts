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
  /** File names under assets/catalog/media; first is the start pose, second (if any) the peak. */
  media: string[];
  sources: ('repdb' | 'fedb' | 'custom')[];
  /** Custom exercises only: a photo the user picked, copied into the app's files. */
  photoUri?: string | null;
};
