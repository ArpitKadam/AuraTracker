// Catalog + the user's custom exercises as one list. Every screen that resolves an exercise id goes through here.
import type { ImageSource } from 'expo-image';

import { CATALOG, MEDIA } from '@/assets/catalog';

import type { CatalogExercise } from './catalog-types';
import { listCustom } from './db/custom';
import type { Db } from '../recipe-module/db/recipes';

export async function loadExercises(db: Db): Promise<{ all: CatalogExercise[]; byId: Map<string, CatalogExercise> }> {
  const all = [...(await listCustom(db)), ...CATALOG];
  return { all, byId: new Map(all.map((e) => [e.id, e])) };
}

/** Frame `i` of the demo (catalog), the user's photo (custom), or undefined (custom without a photo). */
export function exerciseImage(e: CatalogExercise, i = 0): ImageSource | number | undefined {
  if (e.photoUri) return { uri: e.photoUri };
  const file = e.media[Math.min(i, e.media.length - 1)];
  return file ? MEDIA[file] : undefined;
}
