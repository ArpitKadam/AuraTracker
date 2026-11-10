import type { Db } from './recipes.ts';

/** Virtual cookbook: every recipe that is in no cookbook. Never stored. */
export const UNCATEGORIZED_ID = 0;
export const UNCATEGORIZED_NAME = 'Uncategorized';
const MAX_NAME = 40;
const COVER_TILES = 4;

export type Cookbook = {
  id: number;
  name: string;
  pinned: boolean;
  count: number;
  /** Thumbnail URIs of its newest recipes (up to 4) for the collage cover; fewer when it has fewer. */
  covers: string[];
  createdAt: number;
};

export class CookbookError extends Error {
  readonly code: 'EMPTY' | 'TOO_LONG' | 'DUPLICATE';
  constructor(code: 'EMPTY' | 'TOO_LONG' | 'DUPLICATE', message: string) {
    super(message);
    this.name = 'CookbookError';
    this.code = code;
  }
}

export async function cleanName(db: Db, raw: string, exceptId: number | null): Promise<string> {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) throw new CookbookError('EMPTY', 'Give the cookbook a name');
  if ([...name].length > MAX_NAME) throw new CookbookError('TOO_LONG', `Keep the name under ${MAX_NAME} characters`);
  const clash =
    name.toLowerCase() === UNCATEGORIZED_NAME.toLowerCase() ||
    (await db.getFirstAsync<{ id: number }>('SELECT id FROM cookbooks WHERE lower(name) = lower(?) AND id != ?', [name, exceptId ?? -1]));
  if (clash) throw new CookbookError('DUPLICATE', 'You already have a cookbook with that name');
  return name;
}

type Row = { id: number; name: string; pinned: number; created_at: number };

/** Pinned first, then newest. Uncategorized comes last and only when something is in it. */
export async function listCookbooks(db: Db): Promise<Cookbook[]> {
  const rows = await db.getAllAsync<Row>('SELECT id, name, pinned, created_at FROM cookbooks ORDER BY pinned DESC, created_at DESC, id DESC', []);
  const links = await db.getAllAsync<{ cookbook_id: number; thumbnail_uri: string | null }>(
    'SELECT c.cookbook_id, r.thumbnail_uri FROM cookbook_recipes c JOIN recipes r ON r.id = c.recipe_id ORDER BY r.created_at DESC, r.id DESC',
    [],
  );
  const stats = new Map<number, { count: number; covers: string[] }>();
  for (const l of links) {
    const s = stats.get(l.cookbook_id) ?? { count: 0, covers: [] };
    s.count += 1;
    // a recipe without a photo still counts but adds no tile
    if (l.thumbnail_uri && s.covers.length < COVER_TILES) s.covers.push(l.thumbnail_uri);
    stats.set(l.cookbook_id, s);
  }
  const books: Cookbook[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    pinned: r.pinned === 1,
    count: stats.get(r.id)?.count ?? 0,
    covers: stats.get(r.id)?.covers ?? [],
    createdAt: r.created_at,
  }));

  const loose = await db.getAllAsync<{ thumbnail_uri: string | null }>(
    'SELECT r.thumbnail_uri FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM cookbook_recipes c WHERE c.recipe_id = r.id) ORDER BY r.created_at DESC, r.id DESC',
    [],
  );
  if (loose.length > 0) {
    books.push({
      id: UNCATEGORIZED_ID,
      name: UNCATEGORIZED_NAME,
      pinned: false,
      count: loose.length,
      covers: loose.flatMap((l) => (l.thumbnail_uri ? [l.thumbnail_uri] : [])).slice(0, COVER_TILES),
      createdAt: 0,
    });
  }
  return books;
}

export async function getCookbook(db: Db, id: number): Promise<Cookbook | null> {
  return (await listCookbooks(db)).find((c) => c.id === id) ?? null;
}

export async function createCookbook(db: Db, rawName: string): Promise<number> {
  const name = await cleanName(db, rawName, null);
  const res = await db.runAsync('INSERT INTO cookbooks (name, pinned, created_at) VALUES (?, 0, ?)', [name, Date.now()]);
  return res.lastInsertRowId;
}

export async function renameCookbook(db: Db, id: number, rawName: string): Promise<void> {
  const name = await cleanName(db, rawName, id);
  await db.runAsync('UPDATE cookbooks SET name = ? WHERE id = ?', [name, id]);
}

export async function setCookbookPinned(db: Db, id: number, pinned: boolean): Promise<void> {
  await db.runAsync('UPDATE cookbooks SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
}

/** Deletes the cookbook and its links only; the recipes stay (they fall back to Uncategorized). */
export async function deleteCookbook(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM cookbooks WHERE id = ?', [id]);
}

export async function getRecipeCookbookIds(db: Db, recipeId: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ cookbook_id: number }>('SELECT cookbook_id FROM cookbook_recipes WHERE recipe_id = ?', [recipeId]);
  return rows.map((r) => r.cookbook_id);
}

export async function setRecipeInCookbook(db: Db, recipeId: number, cookbookId: number, inside: boolean): Promise<void> {
  if (cookbookId === UNCATEGORIZED_ID) return; // virtual: it is just "in no cookbook"
  if (inside) await db.runAsync('INSERT OR IGNORE INTO cookbook_recipes (cookbook_id, recipe_id) VALUES (?, ?)', [cookbookId, recipeId]);
  else await db.runAsync('DELETE FROM cookbook_recipes WHERE cookbook_id = ? AND recipe_id = ?', [cookbookId, recipeId]);
}
