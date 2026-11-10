import { parseStep } from '../extraction/step.ts';
import type { Ingredient, Nutrition, RecipeDraft, Step } from '../extraction/types.ts';

// Minimal slice of expo-sqlite's SQLiteDatabase, so scripts/check-import.ts can run this under node:sqlite.
export type Db = {
  runAsync(sql: string, params: (string | number | null)[]): Promise<{ lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null>;
};

export type SourceType = 'instagram' | 'image' | 'manual';

export type Recipe = Omit<RecipeDraft, 'isRecipe'> & {
  id: number;
  sourceType: SourceType;
  sourceUrl: string | null;
  thumbnailUri: string | null;
  cooked: boolean;
  rating: number | null;
  note: string | null;
  createdAt: number;
};

export type Row = {
  id: number;
  title: string;
  source_type: SourceType;
  source_url: string | null;
  thumbnail_uri: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  ingredients: string;
  steps: string;
  nutrition: string | null;
  allergens: string;
  tags: string;
  cooked: number;
  rating: number | null;
  note: string | null;
  created_at: number;
};

// A corrupt JSON column must not take the whole library down: fall back to the empty value.
function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function toRecipe(r: Row): Recipe {
  return {
    id: r.id,
    title: r.title,
    sourceType: r.source_type,
    sourceUrl: r.source_url,
    thumbnailUri: r.thumbnail_uri,
    servings: r.servings,
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    totalMinutes: r.total_minutes,
    ingredients: parseJson<Ingredient[]>(r.ingredients, []),
    // rows saved before step emojis hold plain strings
    steps: parseJson<unknown[]>(r.steps, []).map(parseStep).filter((x): x is Step => x !== null),
    nutrition: parseJson<Nutrition | null>(r.nutrition, null),
    allergens: parseJson<string[]>(r.allergens, []),
    tags: parseJson<string[]>(r.tags, []),
    cooked: r.cooked === 1,
    rating: r.rating,
    note: r.note,
    createdAt: r.created_at,
  };
}

export type NewRecipeSource = {
  type: SourceType;
  url: string | null;
  thumbnailUri: string | null;
};

export async function insertRecipe(db: Db, draft: RecipeDraft, src: NewRecipeSource): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO recipes (title, source_type, source_url, thumbnail_uri, servings, prep_minutes, cook_minutes,
       total_minutes, ingredients, steps, nutrition, allergens, tags, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      draft.title,
      src.type,
      src.url,
      src.thumbnailUri,
      draft.servings,
      draft.prepMinutes,
      draft.cookMinutes,
      draft.totalMinutes,
      JSON.stringify(draft.ingredients),
      JSON.stringify(draft.steps),
      draft.nutrition ? JSON.stringify(draft.nutrition) : null,
      JSON.stringify(draft.allergens),
      JSON.stringify(draft.tags),
      Date.now(),
    ],
  );
  return res.lastInsertRowId;
}

export async function listRecipes(db: Db): Promise<Recipe[]> {
  return (await db.getAllAsync<Row>('SELECT * FROM recipes ORDER BY created_at DESC, id DESC', [])).map(toRecipe);
}

/** Recipes in one cookbook, newest first. `uncategorized` (id 0) means recipes that are in no cookbook. */
export async function listRecipesInCookbook(db: Db, cookbookId: number): Promise<Recipe[]> {
  const rows =
    cookbookId === 0
      ? await db.getAllAsync<Row>(
          'SELECT r.* FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM cookbook_recipes c WHERE c.recipe_id = r.id) ORDER BY r.created_at DESC, r.id DESC',
          [],
        )
      : await db.getAllAsync<Row>(
          'SELECT r.* FROM recipes r JOIN cookbook_recipes c ON c.recipe_id = r.id WHERE c.cookbook_id = ? ORDER BY r.created_at DESC, r.id DESC',
          [cookbookId],
        );
  return rows.map(toRecipe);
}

export async function getRecipe(db: Db, id: number): Promise<Recipe | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM recipes WHERE id = ?', [id]);
  return r ? toRecipe(r) : null;
}

export async function updateRecipeSteps(db: Db, id: number, steps: Step[]): Promise<void> {
  await db.runAsync('UPDATE recipes SET steps = ? WHERE id = ?', [JSON.stringify(steps), id]);
}

export async function updateRecipeNutrition(db: Db, id: number, nutrition: Nutrition): Promise<void> {
  await db.runAsync('UPDATE recipes SET nutrition = ? WHERE id = ?', [JSON.stringify(nutrition), id]);
}

/** Links, plan entries and chat rows go with it (ON DELETE CASCADE). */
export async function deleteRecipe(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
}

export async function findRecipeIdBySourceUrl(db: Db, url: string): Promise<number | null> {
  const r = await db.getFirstAsync<{ id: number }>('SELECT id FROM recipes WHERE source_url = ?', [url]);
  return r?.id ?? null;
}

export const MAX_TAGS = 8;

/** Trim, drop empties, dedupe ignoring case (first spelling wins), cap length and count. */
export function cleanTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

export type Journal = { cooked: boolean; rating: number | null; note: string | null; tags: string[] };

/** Saves only the fields given. A rating outside 1-5 is rejected; a blank note becomes null. */
export async function updateJournal(db: Db, id: number, patch: Partial<Journal>): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.cooked !== undefined) {
    sets.push('cooked = ?');
    params.push(patch.cooked ? 1 : 0);
  }
  if (patch.rating !== undefined) {
    if (patch.rating !== null && !(Number.isInteger(patch.rating) && patch.rating >= 1 && patch.rating <= 5)) {
      throw new RangeError('rating must be 1 to 5');
    }
    sets.push('rating = ?');
    params.push(patch.rating);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    params.push(patch.note?.trim() ? patch.note.trim() : null);
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?');
    params.push(JSON.stringify(cleanTags(patch.tags)));
  }
  if (sets.length === 0) return;
  await db.runAsync(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}
