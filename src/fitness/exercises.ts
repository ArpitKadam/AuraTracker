// Catalog + the user's custom exercises as one list. Every screen that resolves an exercise id goes through here.
import type { ImageSource } from 'expo-image';

import { CATALOG, MEDIA, VIDEOS } from '@/assets/catalog';

import type { CatalogExercise } from './catalog-types';
import { listCustom } from './db/custom';
import type { Db } from '../recipe-module/db/recipes';

export async function loadExercises(db: Db): Promise<{ all: CatalogExercise[]; byId: Map<string, CatalogExercise> }> {
  const all = [...(await listCustom(db)), ...CATALOG];
  return { all, byId: new Map(all.map((e) => [e.id, e])) };
}

/** Poster frame of the demo video (catalog), the user's photo (custom), or undefined (custom without a photo). */
export function exerciseImage(e: CatalogExercise): ImageSource | number | undefined {
  if (e.photoUri) return { uri: e.photoUri };
  return e.media[0] ? MEDIA[e.media[0]] : undefined;
}

/** Bundled demo video asset, if this exercise has one. */
export const exerciseVideo = (e: CatalogExercise): number | undefined => (e.video ? VIDEOS[e.video] : undefined);
