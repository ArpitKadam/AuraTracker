import { Directory, File, Paths } from 'expo-file-system';

import { findRecipeIdBySourceUrl, insertRecipe, type Db } from '../db/recipes';
import { extractFromCaption, extractFromImages, GeminiError, MAX_INLINE_BYTES, withEstimatedNutrition } from '../extraction/gemini';
import type { GeminiConfig, RecipeDraft } from '../extraction/types';
import { fetchReel, normalizeReelUrl, ReelError, saveThumbnail } from '../fetch/reel';
import { extractFromReelVideo } from '../fetch/video';

export type StageEvent = { id: string; label: string };

export class ImportError extends Error {
  constructor(
    readonly code: 'NO_KEY' | 'NO_RECIPE' | 'DUPLICATE' | 'BAD_LINK' | 'PRIVATE' | 'FAILED',
    message: string,
    /** Set for DUPLICATE: the recipe that already exists. */
    readonly recipeId?: number,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export type PickedImage = { uri: string; mimeType: string; base64: string };

const EMPTY: RecipeDraft = {
  isRecipe: false,
  title: 'Untitled recipe',
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  ingredients: [],
  steps: [],
  nutrition: null,
  allergens: [],
  tags: [],
};

function explain(e: unknown): ImportError {
  if (e instanceof ImportError) return e;
  if (e instanceof ReelError) {
    return new ImportError(e.code === 'BAD_URL' ? 'BAD_LINK' : e.code === 'PRIVATE' ? 'PRIVATE' : 'FAILED', e.message);
  }
  if (e instanceof GeminiError) {
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      return new ImportError('FAILED', 'Gemini rejected the request. Check your API key in Profile.');
    }
    if (e.status === 429) return new ImportError('FAILED', 'Gemini is rate-limiting this key. Try again in a minute.');
    return new ImportError('FAILED', e.message);
  }
  return new ImportError('FAILED', e instanceof Error ? e.message : 'Something went wrong');
}

/** Link import: video and caption read together in one call (caption alone as the fallback). Returns the new recipe id. */
export async function importFromLink(
  db: Db,
  cfg: GeminiConfig,
  rawUrl: string,
  onStage: (s: StageEvent) => void,
): Promise<number> {
  try {
    const url = normalizeReelUrl(rawUrl);
    const existing = await findRecipeIdBySourceUrl(db, url);
    if (existing !== null) throw new ImportError('DUPLICATE', 'This reel is already in your recipes.', existing);

    onStage({ id: 'link', label: 'Reading the link' });
    const meta = await fetchReel(url);

    // One call that sees the video and the caption together. Without a video (it could not be
    // fetched or read) a usable caption still imports on its own.
    let draft: RecipeDraft;
    try {
      draft = await extractFromReelVideo(cfg, url, meta.caption, (id, label) => onStage({ id, label }));
    } catch (e) {
      if (!meta.caption.trim()) throw e;
      onStage({ id: 'caption', label: 'Reading the caption' });
      draft = await extractFromCaption(cfg, { caption: meta.caption, author: meta.author });
    }
    if (!draft.isRecipe) {
      throw new ImportError('NO_RECIPE', 'No recipe found in this reel. If it is in the images, upload screenshots instead.');
    }

    onStage({ id: 'nutrition', label: 'Calculating nutrition' });
    draft = await withEstimatedNutrition(cfg, draft);

    onStage({ id: 'save', label: 'Saving your recipe' });
    // A missing thumbnail must not lose the recipe.
    const thumb = meta.thumbnailUrl
      ? await saveThumbnail(meta.thumbnailUrl, `ig-${url.split('/')[4]}`).catch(() => null)
      : null;
    return await insertRecipe(db, draft, { type: 'instagram', url, thumbnailUri: thumb });
  } catch (e) {
    throw explain(e);
  }
}

/** Screenshot import (carousel slides, cookbook pages, handwritten cards). */
export async function importFromImages(
  db: Db,
  cfg: GeminiConfig,
  images: PickedImage[],
  onStage: (s: StageEvent) => void,
): Promise<number> {
  try {
    if (images.length === 0) throw new ImportError('FAILED', 'No images selected');
    const bytes = images.reduce((n, i) => n + (i.base64.length * 3) / 4, 0);
    if (bytes > MAX_INLINE_BYTES) throw new ImportError('FAILED', 'These images are too large together. Pick fewer or smaller ones.');

    onStage({ id: 'read', label: images.length > 1 ? `Reading ${images.length} images` : 'Reading the image' });
    let draft = await extractFromImages(cfg, images);
    if (!draft.isRecipe) throw new ImportError('NO_RECIPE', 'No recipe found in these images.');

    onStage({ id: 'nutrition', label: 'Calculating nutrition' });
    draft = await withEstimatedNutrition(cfg, draft);

    onStage({ id: 'save', label: 'Saving your recipe' });
    let thumb: string | null = null;
    try {
      const dir = new Directory(Paths.document, 'thumbs');
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, `img-${Date.now()}.jpg`);
      new File(images[0].uri).copy(dest);
      thumb = dest.uri;
    } catch {
      thumb = null;
    }
    return await insertRecipe(db, draft, { type: 'image', url: null, thumbnailUri: thumb });
  } catch (e) {
    throw explain(e);
  }
}
