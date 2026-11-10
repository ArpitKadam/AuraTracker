// MyBites backup: every table plus the recipe photos (base64) in one JSON file, so the app can move to a
// differently-signed build (or another phone) without re-importing recipes through Gemini.
// Import is a trust boundary: validateMyBitesBackup checks every field, photo names can't escape the thumbs dir.
import type { Db } from './recipes.ts';
import { DATABASE_VERSION } from './schema.ts';

export const MYBITES_APP = 'auratracker-mybites';

type RecipeRow = {
  id: number;
  title: string;
  source_type: 'instagram' | 'image' | 'manual';
  source_url: string | null;
  /** File name inside the thumbs dir (not a device path, which differs per install). */
  photo: string | null;
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
export type MyBitesBackup = {
  app: typeof MYBITES_APP;
  schema: number;
  exportedAt: number;
  recipes: RecipeRow[];
  cookbooks: { id: number; name: string; pinned: number; created_at: number }[];
  cookbookRecipes: { cookbook_id: number; recipe_id: number }[];
  mealPlan: { id: number; plan_date: string; slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'; recipe_id: number }[];
  chat: { id: number; recipe_id: number; role: 'user' | 'model'; content: string; created_at: number }[];
  /** file name -> base64 */
  photos: Record<string, string>;
};

type TxDb = Db & { execAsync(sql: string): Promise<unknown> };
const PHOTO_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}\.(jpg|jpeg|png|webp)$/;
const photoName = (uri: string | null) => (uri ? (uri.split('/').pop() ?? null) : null);

/** readPhoto returns base64 or null when the file is gone. */
export async function exportMyBites(db: Db, now: number, readPhoto: (uri: string) => Promise<string | null>): Promise<MyBitesBackup> {
  const raw = await db.getAllAsync<Omit<RecipeRow, 'photo'> & { thumbnail_uri: string | null }>('SELECT * FROM recipes ORDER BY id', []);
  const photos: Record<string, string> = {};
  const recipes: RecipeRow[] = [];
  for (const { thumbnail_uri, ...r } of raw) {
    let photo = photoName(thumbnail_uri);
    if (thumbnail_uri && photo && PHOTO_NAME.test(photo)) {
      const b64 = await readPhoto(thumbnail_uri);
      if (b64) photos[photo] = b64;
      else photo = null;
    } else photo = null;
    recipes.push({ ...r, photo });
  }
  return {
    app: MYBITES_APP,
    schema: DATABASE_VERSION,
    exportedAt: now,
    recipes,
    cookbooks: await db.getAllAsync('SELECT id, name, pinned, created_at FROM cookbooks ORDER BY id', []),
    cookbookRecipes: await db.getAllAsync('SELECT cookbook_id, recipe_id FROM cookbook_recipes ORDER BY cookbook_id, recipe_id', []),
    mealPlan: await db.getAllAsync('SELECT id, plan_date, slot, recipe_id FROM meal_plan ORDER BY id', []),
    chat: await db.getAllAsync('SELECT id, recipe_id, role, content, created_at FROM chat_messages ORDER BY id', []),
    photos,
  };
}

// ---- validation -------------------------------------------------------------------------------

class BackupError extends Error {}
const fail = (path: string, what: string): never => {
  throw new BackupError(`Not a valid MyBites backup (${path}: ${what})`);
};
const obj = (v: unknown, p: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(p, 'expected an object'));
const list = (v: unknown, p: string, max: number) => (Array.isArray(v) ? (v.length <= max ? v : fail(p, `more than ${max} items`)) : fail(p, 'expected a list'));
const int = (v: unknown, p: string, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fail(p, `expected a whole number ${min}-${max}`));
const num = (v: unknown, p: string, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(p, `expected a number ${min}-${max}`));
const text = (v: unknown, p: string, max: number) => (typeof v === 'string' && v.length <= max ? v : fail(p, `expected text up to ${max} characters`));
const opt = <T>(v: unknown, f: (v: unknown) => T) => (v === null ? null : f(v));
const oneOf = <T extends string>(v: unknown, p: string, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : fail(p, `expected one of ${allowed.join(', ')}`));
/** JSON-in-text columns must hold parseable JSON of the right shape. */
const jsonText = (v: unknown, p: string, shape: 'array' | 'object') => {
  const s = text(v, p, 200_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return fail(p, 'not valid JSON');
  }
  if (shape === 'array' ? !Array.isArray(parsed) : !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(p, `expected a JSON ${shape}`);
  return s;
};
const TIME = 4_102_444_800_000;
// Same anchored pattern as normalizeReelUrl (fetch/reel.ts, not importable here: it pulls native modules).
// source_url is later passed to Linking.openURL, so only canonical https Instagram links get through.
const REEL = /^https?:\/\/(?:www\.)?instagram\.com\/(reels?|p|tv)\/([A-Za-z0-9_-]+)\/?$/i;
function sourceUrl(type: 'instagram' | 'image' | 'manual', v: unknown, p: string): string | null {
  if (type !== 'instagram') return v === null ? null : fail(p, 'only Instagram recipes have a link');
  const m = text(v, p, 300).trim().match(REEL);
  if (!m) return fail(p, 'not an Instagram reel or post link');
  return `https://www.instagram.com/${m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase()}/${m[2]}/`;
}
const ID = 2_147_483_647;

export function validateMyBitesBackup(input: unknown): MyBitesBackup {
  const root = obj(input, 'file');
  if (root.app !== MYBITES_APP) fail('app', 'this file is not a MyBites backup');
  const schema = int(root.schema, 'schema', 1, 1000);
  if (schema > DATABASE_VERSION) fail('schema', 'made by a newer version of the app; update first');

  const photosIn = obj(root.photos, 'photos');
  const photos: Record<string, string> = {};
  let bytes = 0;
  for (const [name, b64] of Object.entries(photosIn)) {
    if (!PHOTO_NAME.test(name)) fail(`photos.${name.slice(0, 40)}`, 'bad file name');
    if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) fail(`photos.${name}`, 'not base64');
    bytes += (b64 as string).length;
    if (bytes > 150_000_000) fail('photos', 'too large');
    photos[name] = b64 as string;
  }

  const recipeIds = new Set<number>();
  const recipes = list(root.recipes, 'recipes', 10_000).map((r0, i) => {
    const p = `recipes[${i}]`;
    const r = obj(r0, p);
    const id = int(r.id, `${p}.id`, 1, ID);
    if (recipeIds.has(id)) fail(`${p}.id`, 'duplicate');
    recipeIds.add(id);
    const photo = opt(r.photo, (v) => text(v, `${p}.photo`, 100));
    if (photo !== null && !(photo in photos)) fail(`${p}.photo`, 'photo missing from the file');
    const sourceType = oneOf(r.source_type, `${p}.source_type`, ['instagram', 'image', 'manual'] as const);
    return {
      id,
      title: text(r.title, `${p}.title`, 500),
      source_type: sourceType,
      source_url: r.source_url === null && sourceType === 'instagram' ? null : sourceUrl(sourceType, r.source_url, `${p}.source_url`),
      photo,
      servings: opt(r.servings, (v) => num(v, `${p}.servings`, 0, 1000)),
      prep_minutes: opt(r.prep_minutes, (v) => int(v, `${p}.prep_minutes`, 0, 100_000)),
      cook_minutes: opt(r.cook_minutes, (v) => int(v, `${p}.cook_minutes`, 0, 100_000)),
      total_minutes: opt(r.total_minutes, (v) => int(v, `${p}.total_minutes`, 0, 100_000)),
      ingredients: jsonText(r.ingredients, `${p}.ingredients`, 'array'),
      steps: jsonText(r.steps, `${p}.steps`, 'array'),
      nutrition: opt(r.nutrition, (v) => jsonText(v, `${p}.nutrition`, 'object')),
      allergens: jsonText(r.allergens, `${p}.allergens`, 'array'),
      tags: jsonText(r.tags, `${p}.tags`, 'array'),
      cooked: int(r.cooked, `${p}.cooked`, 0, 1),
      rating: opt(r.rating, (v) => int(v, `${p}.rating`, 1, 5)),
      note: opt(r.note, (v) => text(v, `${p}.note`, 50_000)),
      created_at: int(r.created_at, `${p}.created_at`, 0, TIME),
    };
  });

  const cookbookIds = new Set<number>();
  const cookbooks = list(root.cookbooks, 'cookbooks', 2_000).map((c0, i) => {
    const p = `cookbooks[${i}]`;
    const c = obj(c0, p);
    const id = int(c.id, `${p}.id`, 1, ID);
    if (cookbookIds.has(id)) fail(`${p}.id`, 'duplicate');
    cookbookIds.add(id);
    return { id, name: text(c.name, `${p}.name`, 200), pinned: int(c.pinned, `${p}.pinned`, 0, 1), created_at: int(c.created_at, `${p}.created_at`, 0, TIME) };
  });
  const ref = (v: unknown, p: string, ids: Set<number>) => {
    const id = int(v, p, 1, ID);
    return ids.has(id) ? id : fail(p, 'points at something not in the file');
  };
  const cookbookRecipes = list(root.cookbookRecipes, 'cookbookRecipes', 100_000).map((l0, i) => {
    const l = obj(l0, `cookbookRecipes[${i}]`);
    return { cookbook_id: ref(l.cookbook_id, `cookbookRecipes[${i}].cookbook_id`, cookbookIds), recipe_id: ref(l.recipe_id, `cookbookRecipes[${i}].recipe_id`, recipeIds) };
  });
  const mealPlan = list(root.mealPlan, 'mealPlan', 100_000).map((m0, i) => {
    const p = `mealPlan[${i}]`;
    const m = obj(m0, p);
    const date = text(m.plan_date, `${p}.plan_date`, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`${p}.plan_date`, 'expected YYYY-MM-DD');
    return { id: int(m.id, `${p}.id`, 1, ID), plan_date: date, slot: oneOf(m.slot, `${p}.slot`, ['breakfast', 'lunch', 'dinner', 'snack'] as const), recipe_id: ref(m.recipe_id, `${p}.recipe_id`, recipeIds) };
  });
  const chat = list(root.chat, 'chat', 200_000).map((c0, i) => {
    const p = `chat[${i}]`;
    const c = obj(c0, p);
    return {
      id: int(c.id, `${p}.id`, 1, ID),
      recipe_id: ref(c.recipe_id, `${p}.recipe_id`, recipeIds),
      role: oneOf(c.role, `${p}.role`, ['user', 'model'] as const),
      content: text(c.content, `${p}.content`, 100_000),
      created_at: int(c.created_at, `${p}.created_at`, 0, TIME),
    };
  });

  return { app: MYBITES_APP, schema, exportedAt: int(root.exportedAt, 'exportedAt', 0, TIME), recipes, cookbooks, cookbookRecipes, mealPlan, chat, photos };
}

export function parseMyBitesBackup(s: string): MyBitesBackup {
  let json: unknown;
  try {
    json = JSON.parse(s);
  } catch {
    throw new BackupError('Not a valid MyBites backup (the file is not JSON)');
  }
  return validateMyBitesBackup(json);
}

export const myBitesCounts = (b: MyBitesBackup) => ({ recipes: b.recipes.length, cookbooks: b.cookbooks.length, meals: b.mealPlan.length, photos: Object.keys(b.photos).length });

/**
 * Replaces all MyBites data. writePhoto stores one photo and returns its new uri; photos are written first,
 * then the tables are replaced in one transaction (rolled back on any failure).
 */
export async function importMyBites(db: TxDb, b: MyBitesBackup, writePhoto: (name: string, base64: string) => Promise<string>): Promise<void> {
  const uris: Record<string, string> = {};
  for (const [name, b64] of Object.entries(b.photos)) uris[name] = await writePhoto(name, b64);
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.execAsync('DELETE FROM chat_messages; DELETE FROM meal_plan; DELETE FROM cookbook_recipes; DELETE FROM cookbooks; DELETE FROM recipes;');
    for (const r of b.recipes) {
      await db.runAsync(
        `INSERT INTO recipes (id, title, source_type, source_url, thumbnail_uri, servings, prep_minutes, cook_minutes, total_minutes,
           ingredients, steps, nutrition, allergens, tags, cooked, rating, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.title, r.source_type, r.source_url, r.photo ? uris[r.photo] : null, r.servings, r.prep_minutes, r.cook_minutes, r.total_minutes,
          r.ingredients, r.steps, r.nutrition, r.allergens, r.tags, r.cooked, r.rating, r.note, r.created_at],
      );
    }
    for (const c of b.cookbooks) await db.runAsync('INSERT INTO cookbooks (id, name, pinned, created_at) VALUES (?, ?, ?, ?)', [c.id, c.name, c.pinned, c.created_at]);
    for (const l of b.cookbookRecipes) await db.runAsync('INSERT INTO cookbook_recipes (cookbook_id, recipe_id) VALUES (?, ?)', [l.cookbook_id, l.recipe_id]);
    for (const m of b.mealPlan) await db.runAsync('INSERT INTO meal_plan (id, plan_date, slot, recipe_id) VALUES (?, ?, ?, ?)', [m.id, m.plan_date, m.slot, m.recipe_id]);
    for (const c of b.chat) await db.runAsync('INSERT INTO chat_messages (id, recipe_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)', [c.id, c.recipe_id, c.role, c.content, c.created_at]);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
