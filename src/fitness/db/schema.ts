// fitness.db migrations. Weights are always stored in kg; lb is a display setting.
// Lists (muscle slugs, groups) are JSON text columns, like mybites.db.
import { applyMigrations, type MigrateDb } from '../../lib/migrate.ts';

export const MIGRATIONS: Record<number, string> = {
  1: `
CREATE TABLE profile (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  units       TEXT    NOT NULL DEFAULT 'kg' CHECK (units IN ('kg','lb')),
  equipment   TEXT    NOT NULL DEFAULT 'gym' CHECK (equipment IN ('gym','dumbbells','bodyweight')),
  experience  TEXT    NOT NULL DEFAULT 'intermediate' CHECK (experience IN ('beginner','intermediate','advanced')),
  body_weight REAL    CHECK (body_weight IS NULL OR body_weight BETWEEN 20 AND 400),
  weight_step REAL    NOT NULL DEFAULT 2.5 CHECK (weight_step > 0),
  rep_min     INTEGER NOT NULL DEFAULT 13,
  rep_max     INTEGER NOT NULL DEFAULT 15 CHECK (rep_max >= rep_min),
  onboarded   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO profile (id) VALUES (1);

CREATE TABLE custom_exercises (
  id         TEXT    PRIMARY KEY NOT NULL,
  name       TEXT    NOT NULL,
  primary_m  TEXT    NOT NULL DEFAULT '[]',
  secondary  TEXT    NOT NULL DEFAULT '[]',
  groups     TEXT    NOT NULL DEFAULT '[]',
  equipment  TEXT    NOT NULL DEFAULT 'other',
  photo_uri  TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  groups      TEXT    NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_sessions_started ON sessions(started_at);

CREATE TABLE session_exercises (
  id          INTEGER PRIMARY KEY NOT NULL,
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT    NOT NULL,
  position    INTEGER NOT NULL
);
CREATE INDEX idx_session_exercises_exercise ON session_exercises(exercise_id, session_id);

CREATE TABLE sets (
  id                  INTEGER PRIMARY KEY NOT NULL,
  session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  weight_kg           REAL    NOT NULL CHECK (weight_kg >= 0),
  reps                INTEGER NOT NULL CHECK (reps > 0),
  is_warmup           INTEGER NOT NULL DEFAULT 0 CHECK (is_warmup IN (0,1)),
  done_at             INTEGER NOT NULL
);
CREATE INDEX idx_sets_session_exercise ON sets(session_exercise_id, position);
`,
};

export const DATABASE_VERSION = 1;

export async function migrate(db: MigrateDb) {
  await applyMigrations(db, MIGRATIONS);
}
