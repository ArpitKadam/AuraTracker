// Migrations for the on-device recipe database. Pure SQL strings so the same
// text is exercised by scripts/check-schema.ts under node:sqlite.
// Lists (ingredients, steps, tags, allergens) and nutrition are JSON text columns.

import { applyMigrations, type MigrateDb } from '../../lib/migrate.ts';

export const DATABASE_VERSION = 1;

export const MIGRATIONS: Record<number, string> = {
  1: `
CREATE TABLE recipes (
  id            INTEGER PRIMARY KEY NOT NULL,
  title         TEXT    NOT NULL,
  source_type   TEXT    NOT NULL DEFAULT 'manual' CHECK (source_type IN ('instagram','image','manual')),
  source_url    TEXT,
  thumbnail_uri TEXT,
  servings      REAL,
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  total_minutes INTEGER,
  ingredients   TEXT    NOT NULL DEFAULT '[]',
  steps         TEXT    NOT NULL DEFAULT '[]',
  nutrition     TEXT,
  allergens     TEXT    NOT NULL DEFAULT '[]',
  tags          TEXT    NOT NULL DEFAULT '[]',
  cooked        INTEGER NOT NULL DEFAULT 0,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  note          TEXT,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_recipes_source_url ON recipes(source_url) WHERE source_url IS NOT NULL;

CREATE TABLE cookbooks (
  id         INTEGER PRIMARY KEY NOT NULL,
  name       TEXT    NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE cookbook_recipes (
  cookbook_id INTEGER NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id)   ON DELETE CASCADE,
  PRIMARY KEY (cookbook_id, recipe_id)
);

CREATE TABLE meal_plan (
  id        INTEGER PRIMARY KEY NOT NULL,
  plan_date TEXT    NOT NULL,
  slot      TEXT    NOT NULL CHECK (slot IN ('breakfast','lunch','dinner','snack')),
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE
);
CREATE INDEX idx_meal_plan_date ON meal_plan(plan_date);

CREATE TABLE chat_messages (
  id         INTEGER PRIMARY KEY NOT NULL,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('user','model')),
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_chat_recipe ON chat_messages(recipe_id, id);
`,
};

export async function migrate(db: MigrateDb) {
  await applyMigrations(db, MIGRATIONS);
}
