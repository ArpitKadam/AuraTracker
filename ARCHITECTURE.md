# ARCHITECTURE.md — AuraTracker

Status: Task 1 built (fork + launcher). Fitness screens, dark theme and catalog are still planned.

## Shape

One Expo 58 app, forked from MyBites. Expo Router file routes in `src/app/`:

```
src/app/
  _layout.tsx        root stack + fonts/splash (no DB here)
  index.tsx          launcher: Fitness | MyBites, "remember my choice"
  mybites/_layout.tsx  SQLiteProvider(mybites.db) + modal stack
  mybites/...        MyBites routes, moved from C:\MyBites; every route string prefixed /mybites
  fitness/...        placeholder now; later onboarding, picker, session, exercise log, settings
src/launcher.ts      launcher prefs (expo-sqlite/kv-store) + openApp/openLauncher
src/components/AppSwitchButton.tsx  header icon back to the launcher (MyBites tab headers, Fitness)
src/theme/           tokens.ts (dark palette, fonts, printColors), Background, GlassSurface
src/fitness/split.ts default weekly split (editable in Task 10a)
src/recipe-module/   MyBites domain code (unchanged except theming)
src/fitness/         Fitness domain: db, catalog loader, rules (overload, ranking), export
assets/catalog/      GENERATED, gitignored: catalog.json, media/*.webp, index.ts (CATALOG + static require map)
scripts/build_catalog.py  RepDB (primary) + free-exercise-db -> assets/catalog; self-checks with asserts
data/raw/            gitignored dataset clones (RepDB licence forbids redistributing the dataset)
modules/reel-fetcher MyBites native module (unchanged)
```

## Data

- `mybites.db` belongs to MyBites; its schema is untouched.
- `fitness.db` (`src/fitness/db/schema.ts`, opened by `src/app/fitness/_layout.tsx`): `profile` (single row: units, equipment access, experience, body weight, weight step, rep range 13-15, onboarded), `sessions`, `session_exercises`, `sets` (weight_kg, reps, is_warmup; cascade with session), `custom_exercises`. Weights are always stored in kg; lb is display only.
- **Today (`/fitness`)**: multi-select muscle groups (8: chest, back, shoulders, biceps, triceps, forearms, abs, legs; `src/fitness/groups.ts`), pre-selected from today's split day. The body map (`src/fitness/ui/BodyMap.tsx`, react-native-body-highlighter) lights the selected groups' slugs. Next goes to `/fitness/plan?groups=a,b`.
- **Plan (`/fitness/plan`)**: `recommend()` (`src/fitness/recommend.ts`, pure) builds up to 6 picks per group: staples (in >= 80% of the group's last 5 sessions), other history (longest ago first), a variety pick after 3 identical sessions, then catalog fill (strength-type only, filtered by equipment access and experience). Catalog order: main target first (`primary[0]` in the group), then the user's custom exercises, then the group's lead mechanic (compound for chest/back/shoulders/legs, isolation for biceps/triceps/forearms/abs), then RepDB before free-exercise-db, then equipment rank (barbell, dumbbell, cable, machine ... other last). An exercise hitting two picked groups shows once. Swap replaces a pick with the next unshown candidate sharing its first primary muscle. "Last X × N" is the heaviest working set of that exercise's latest finished session (`src/fitness/db/history.ts`). `scripts/check-recommend.ts` covers every rule.
- **Sessions (`src/fitness/db/session.ts`)**: at most one open session (`finished_at IS NULL`); logging the first set starts it, and later starts reuse it (widening its groups). The picker shows a "Workout in progress, Resume" banner while one is open, so closing the app never loses sets. Finish deletes an empty session, drops exercises opened but never logged, then stamps `finished_at` and opens `/fitness/summary`.
- **Crash safety (verified on device with `am kill` after Home, the low-memory-killer path)**: every Log set is its own committed transaction; fitness.db runs `PRAGMA synchronous = FULL` so commits also survive power loss. The typed-but-unlogged entry is saved per exercise in kv-store (`fitness.draft.<id>`) and restored only while a workout is open and within 6 h. Deleting the last set of an open session deletes the session, so no empty "in progress" banner is left.
- **Exercise log (`/fitness/exercise/[id]`)**: start/peak illustrations alternate every 900 ms (still under reduce-motion), overload hint card, weight/reps steppers (2.5 kg or 5 lb, reps by 1, typed input clamped to 0-1000 and 1-200), warm-up switch, today's sets with delete, then the exercise's instructions. Entry is pre-filled from the hint.
- **Overload hint (`src/fitness/overload.ts`, pure)**: baseline is the working sets of the exercise's last finished session. If every set at the top weight reached `repMin` (13): add one step. Otherwise keep the top weight and target best reps +1 to +2. First time: no numbers. `scripts/check-overload.ts` covers each case incl. lb.
- **Progress (exercise screen card)**: last 12 finished sessions of the exercise (`exerciseSessions`, warm-ups and the open session excluded) as one series; metric switch Top set / Est. 1RM (Epley, 1 rep = the lift) / Volume, never a dual axis. `src/fitness/ui/ProgressChart.tsx` (react-native-svg): round y ticks (`niceTicks`), hairline grid, first/last date, direct label on the latest point, tap to read any session; whole series exposed as the accessibility label. `scripts/check-progress.ts`.
- **Custom exercises (`src/fitness/db/custom.ts`, `/fitness/custom`)**: name (2-60 chars, unique case-insensitively), muscle groups (first = main target; slugs derived from the groups), equipment, optional gallery photo copied into `Paths.document/custom/` so it outlives the picker cache. Ids are `c:<time><rand>`. `src/fitness/exercises.ts` merges them ahead of the catalog; every screen resolves ids through `loadExercises`, so custom exercises get recommendations, swap, logging, hints, charts and summaries like any other. Delete is only offered while the exercise has no logged sets. Plan screen has "Add your own <group> exercise" per section and rebuilds its picks only when the custom list changes. `scripts/check-custom.ts`.
- **Settings (`/fitness/settings`, gear on the picker)**: units (switching also sets the step to 2.5 kg or 5 lb), equipment, experience; read-only step, rep range, body weight; Export / Import; credits with the RepDB attribution link its licence requires.
- **Backup (`src/fitness/db/backup.ts`)**: export = profile, custom exercises (without photos: those stay on the phone), every session with its exercises and sets, as JSON `{ app: 'auratracker-fitness', schema, exportedAt, ... }`, written to cache and handed to the Android share sheet. Import picks a file (expo-document-picker), `validateBackup` checks every field at the trust boundary (types, ranges, enums, id pattern, list sizes, at most one open workout, schema not newer than the app), shows the backup date and counts in a confirm dialog, then `importData` replaces all fitness data in one transaction (rollback on any failure). MyBites data is not part of the file. `scripts/check-backup.ts`: export -> import into a DB with other data -> identical export; 10 malformed files rejected with nothing written; mid-import failure rolls back.
- **Summary (`/fitness/summary`)**: duration, working volume, working sets, a PR card per exercise whose top set beats its previous best (heavier, or more reps at the same weight; a first-ever session is never a PR), and "Next time" targets from today's sets. `src/fitness/stats.ts` + `scripts/check-session.ts`.
- Both DBs migrate through `src/lib/migrate.ts` (PRAGMA user_version, one transaction per step). `scripts/check-schema.ts` and `scripts/check-fitness-schema.ts` run the real migrations under node:sqlite.
- Fitness routes: `/fitness` redirects to `/fitness/onboarding` until `profile.onboarded`. Onboarding has 4 skippable steps (units, equipment, experience, optional body weight); finishing or skipping the last step saves and marks onboarded.
- The catalog is read-only bundled JSON. Custom exercises live in the DB, so a rebuilt catalog never clobbers user data.
- Launcher prefs are `launcher.remember` / `launcher.last` in kv-store. The skip decision is cached in module state, so it is computed once per JS runtime (= once per cold launch). `openLauncher()` clears it, so the switch icon always shows the launcher. Resuming from background keeps the JS runtime, so you land where you were.
- Deep-link scheme is `auratracker://`, and MyBites import is `auratracker://mybites/import?url=…`.

## Invariants

- The overload hint and recommendation ranking are pure functions of the DB rows: no network, no AI.
- Warm-up sets never feed hints, PRs or graphs.
- Fitness and MyBites share no tables.
- No assets from third-party commercial apps ship in the build. `GymTracker/`, `Lyfta/` and `reference/` are gitignored.

## Design system

Source of truth: Figma https://www.figma.com/design/0gzT4kJHYZcWtOA2ayEfL3 (variables collection `Aura`, mode `Dark`).

- **Theme:** dark only. Base `#0D0E10`, surface `#16171A`, raised `#1E2024`, hairline `#2A2D33`; text `#ECEDEE` / muted `#8A8F98` / faint `#5C616B`.
- **Accent per app, locked:** Fitness lime `#C6EE52` (dim `#6E8233`); MyBites blue `#7FA6FF` (dim `#33456B`). Text on an accent is `#0D0E10`.
- **Type:** Barlow Condensed (numbers, titles) + Geist (UI). No Inter.
- **Shape:** cards 20px radius; every interactive control is a pill.
- **Icons:** Ionicons (already shipped via `@expo/vector-icons`), one family.
- **Code:** every color lives in `src/theme/tokens.ts`; no raw hex/rgba anywhere else. The exception is `printColors`, which stays light on purpose for the exported share card and PDF.
- **Launcher Fitness card:** body map of today's split day (primary lime, secondary dim).
- **Launcher data:** reads today's MyBites meal count straight from `mybites.db` (0 on a fresh install), and shows the planned split day for Fitness. No fake numbers.
- **Body map:** `react-native-body-highlighter` (MIT) paths; selected muscles in accent, assisting muscles in accent-dim.
- **Charts:** one series per chart, no legend, direct label on the latest point, hairline grid, metric switch (top set / e1RM / volume) instead of a dual axis.

## Why

- Fork, not sync: MyBites won't ship standalone; one codebase is cheaper.
- Bundled catalog: works offline in the gym. 1,417 exercises, 2,948 WebP images at 320px, about 17 MB.
- Catalog is built locally, never committed: the repo is public and RepDB's free tier forbids redistributing the dataset. A fresh clone must run `scripts/build_catalog.py` before `tsc` or Metro (the app imports `@/assets/catalog`).
- ExerciseDB is not in the catalog: the Kaggle "open source" set is a 30-exercise sample behind a Kaggle login, and the 1,500-exercise repo it links to is AGPL with no data.
- Equipment comes from the icons on RepDB's exercise pages (name heuristics only as fallback). Near-duplicates are collapsed by a normalised name key ("barbell" and "medium grip" are implied).
- Separate DBs: no schema coupling between the two apps.

## Build (Windows)

- `android/` is generated by `npx expo prebuild` and gitignored. After every `prebuild --clean`, `android/local.properties` must pin `cmake.dir=…/Android/Sdk/cmake/3.31.0`. The default CMake 3.22 bundles an old ninja that fails on paths over 260 characters (`C:\Projects\AuraTracker` is long enough to hit it). Windows LongPathsEnabled is already 1.
- Local native module `modules/reel-fetcher` (Kotlin, under `android/`) is tracked. The root `.gitignore` ignores only `/android/`.
