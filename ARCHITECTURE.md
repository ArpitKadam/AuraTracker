# ARCHITECTURE.md — AuraTracker

Status: v1.0.0 released (Tasks 1-12 built).

## Shape

One Expo 58 app, forked from MyBites. Expo Router file routes in `src/app/`:

```
src/app/
  _layout.tsx        root stack + fonts/splash (no DB here)
  index.tsx          launcher: Fitness | MyBites, "remember my choice"
  mybites/_layout.tsx  SQLiteProvider(mybites.db) + modal stack
  mybites/...        MyBites routes, moved from C:\MyBites; every route string prefixed /mybites
  fitness/...        onboarding, today picker, lineup (plan), workout, exercise log, summary, stats, custom, split, settings
src/launcher.ts      launcher prefs (expo-sqlite/kv-store) + openApp/openLauncher
src/components/AppSwitchButton.tsx  header icon back to the launcher (MyBites tab headers, Fitness)
src/theme/           tokens.ts (dark palette, fonts, printColors), Background, GlassSurface
src/recipe-module/   MyBites domain code (unchanged except theming)
src/fitness/         Fitness domain: db, catalog loader, rules (overload, ranking, lineup), insights (stats math), export
assets/catalog/      GENERATED, gitignored: catalog.json, videos/*.mp4, media/v-*.webp posters, index.ts (CATALOG + MEDIA + VIDEOS require maps)
scripts/build_catalog.py  RepDB + free-exercise-db entries, scripts/curated.json must-have list, exercises/videos clips -> assets/catalog; self-checks with asserts
scripts/curated.json      must-have exercises (exercises.txt order, then abs and forearms): catalog id or new, video slug
missing-videos.txt        must-have exercises still without a demo video
exercises/, exercises.txt user-supplied source clips and list, gitignored
data/raw/            gitignored dataset clones (RepDB licence forbids redistributing the dataset)
modules/reel-fetcher MyBites native module (unchanged)
```

## Data

- `mybites.db` belongs to MyBites; its schema is untouched.
- `fitness.db` (`src/fitness/db/schema.ts`, opened by `src/app/fitness/_layout.tsx`): `profile` (single row: units, equipment access, experience, body weight, weight step, rep range 13-15, onboarded), `sessions`, `session_exercises`, `sets` (weight_kg, reps, is_warmup; cascade with session), `custom_exercises`. Weights are always stored in kg; lb is display only.
- **Today (`/fitness`)**: multi-select muscle groups (8: chest, back, shoulders, biceps, triceps, forearms, abs, legs; `src/fitness/groups.ts`), pre-selected from today's split day. The body map (`src/fitness/ui/BodyMap.tsx`, react-native-body-highlighter) lights the selected groups' slugs. Next goes to `/fitness/plan?groups=a,b`.
- **Lineup (`/fitness/plan`)**: "What's on today's hit list?" Nothing is pre-selected. `lineupOptions()` (`src/fitness/lineup.ts`, pure) lists, per picked group: exercises done before (most sessions, then most recent), then the must-have list (`curated` index) and the user's custom exercises, then "Browse N more" (the rest of `candidates()` from `recommend.ts`: strength-type, equipment and experience filtered, catalog look-alike names of listed exercises hidden). An exercise in two picked groups shows once. Search filters all tiers. Start needs at least one pick: `startWorkout` opens the session and writes the picks as its `session_exercises` rows. With a workout open the same screen adds to it ("Forgot one?"), showing what's already in it as locked. `scripts/check-lineup.ts`.
- **Workout (`/fitness/workout`)**: the open session's lineup (`lineupOf`, pick order, set counts), progress bar, tap to log, remove an unlogged pick, "Add an exercise", Finish (or "End without logging", which discards an empty session).
- **Sessions (`src/fitness/db/session.ts`)**: at most one open session (`finished_at IS NULL`); starting a lineup opens it (logging a set also would), and later starts reuse it (widening its groups). The lineup lives in its `session_exercises` rows, so it survives the app being killed. The today picker shows a "Workout in progress, Resume" banner (to `/fitness/workout`) while one is open. Finish deletes an empty session, drops exercises opened but never logged, then stamps `finished_at` and opens `/fitness/summary`.
- **Crash safety (verified on device with `am kill` after Home, the low-memory-killer path)**: every Log set is its own committed transaction; fitness.db runs `PRAGMA synchronous = FULL` so commits also survive power loss. The typed-but-unlogged entry is saved per exercise in kv-store (`fitness.draft.<id>`) and restored only while a workout is open and within 6 h. Deleting a set never closes the workout (its lineup stays); Finish discards a workout with no sets.
- **Exercise log (`/fitness/exercise/[id]`)**: demo video (`src/fitness/ui/ExerciseMedia.tsx`, expo-video: looped, muted, 16:9, paused on its first frame under reduce-motion; custom exercises show their photo), overload hint card, weight/reps steppers (2.5 kg or 5 lb, reps by 1, typed input clamped to 0-1000 and 1-200), warm-up switch, today's sets with delete, then the exercise's instructions. Entry is pre-filled from the hint.
- **Overload hint (`src/fitness/overload.ts`, pure)**: baseline is the working sets of the exercise's last finished session. If every set at the top weight reached `repMin` (13): add one step. Otherwise keep the top weight and target best reps +1 to +2. First time: no numbers. `scripts/check-overload.ts` covers each case incl. lb.
- **Progress (exercise screen card)**: last 12 finished sessions of the exercise (`exerciseSessions`, warm-ups and the open session excluded) as one series; metric switch Top set / Est. 1RM (Epley, 1 rep = the lift) / Volume, never a dual axis. `src/fitness/ui/ProgressChart.tsx` (react-native-svg): round y ticks (`niceTicks`), hairline grid, first/last date, direct label on the latest point, tap to read any session; whole series exposed as the accessibility label. `scripts/check-progress.ts`.
- **Custom exercises (`src/fitness/db/custom.ts`, `/fitness/custom`)**: name (2-60 chars, unique case-insensitively), muscle groups (first = main target; slugs derived from the groups), equipment, optional gallery photo copied into `Paths.document/custom/` so it outlives the picker cache. Ids are `c:<time><rand>`. `src/fitness/exercises.ts` merges them ahead of the catalog; every screen resolves ids through `loadExercises`, so custom exercises get recommendations, swap, logging, hints, charts and summaries like any other. Delete is only offered while the exercise has no logged sets. Plan screen has "Add your own <group> exercise" per section and rebuilds its picks only when the custom list changes. `scripts/check-custom.ts`.
- **Settings (`/fitness/settings`, gear on the picker)**: units (switching also sets the step to 2.5 kg or 5 lb), equipment, experience; read-only step, rep range, body weight; Export / Import; credits with the RepDB attribution link its licence requires.
- **Backup (`src/fitness/db/backup.ts`)**: export = profile, custom exercises (without photos: those stay on the phone), every session with its exercises and sets, as JSON `{ app: 'auratracker-fitness', schema, exportedAt, ... }`, written to cache and handed to the Android share sheet. Import picks a file (expo-document-picker), `validateBackup` checks every field at the trust boundary (types, ranges, enums, id pattern, list sizes, at most one open workout, schema not newer than the app), shows the backup date and counts in a confirm dialog, then `importData` replaces all fitness data in one transaction (rollback on any failure). MyBites data is not part of the file. `scripts/check-backup.ts`: export -> import into a DB with other data -> identical export; 10 malformed files rejected with nothing written; mid-import failure rolls back.
- **Split & schedule (`src/fitness/schedule.ts` pure, `src/fitness/db/split.ts`)**: fitness.db v2 adds `split_days` (7 rows seeded with the Mon-Sat schedule; a day with no main group is a rest day) and `plan_overrides` (per local date: `skip`, `postponed` -> `other` = target date, `moved` <- `other` = source date). `dayStatus` resolves any date to planned / rest / skipped / postponed / moved. Postpone moves the plan to the first free rest day within 14 days (refused if none). Undo removes both halves. The picker shows a "Today's plan" card with Skip / Postpone / Undo (hidden while a workout is in progress) and pre-selects the day's groups once. `/fitness/split` edits days (tap cycles main -> secondary -> off, saved per tap). The launcher reads the same status synchronously from fitness.db (default split if Fitness was never opened). Backups carry the split from schema 2; schema-1 backups import without touching it. `scripts/check-schedule.ts` (incl. the v1 -> v2 upgrade keeping existing data).
- **Reminders (`src/fitness/reminders.ts` pure, `src/fitness/notify.ts`)**: local notifications via expo-notifications (channel `next-time`, monochrome icon tinted lime). `planReminders` picks, for the next 7 days, days whose status is planned or moved-in and not yet trained, and 4 slots 4 h apart ending at the last time (default 19:00 -> 07:00/11:00/15:00/19:00; slots before midnight dropped). Each body is one overload target for that day's groups (staple/history exercises only), rotating; a day with no history gets a single plain reminder at the last slot. `rescheduleReminders` cancels and re-schedules everything; calls are serialised and errors swallowed so they never break logging. Triggers: opening Fitness and returning to foreground (`ReminderSync` in the Fitness layout), first set of the day, finishing a workout, skip/postpone/undo, split edits, settings changes, import. On/off and last time are device-local (kv-store), not in backups. POST_NOTIFICATIONS is requested on first Fitness open while reminders are on. `scripts/check-reminders.ts`.
- **MyBites backup (`src/recipe-module/db/backup.ts`, Profile tab)**: all tables plus recipe photos (base64, keyed by file name) in one JSON; the Gemini key is not included. Validation checks every column, JSON-in-text columns, references, photo names (no path traversal) and base64; `source_url` must be a canonical Instagram link (it reaches `Linking.openURL`), and the recipe screen only opens `https://www.instagram.com/` links. Import writes photos into `Paths.document/thumbs`, then replaces all tables in one transaction. `scripts/check-mybites-backup.ts`.
- **Stats (`/fitness/stats`, chart icon on the today picker)**: all math in `src/fitness/insights.ts` (pure; input = finished sessions from `src/fitness/db/insights.ts`, working sets only, weeks start Monday): weekly rings (volume, sets vs the 8 previous trained weeks' average; workouts vs 4) with overflow laps, trends (13-week vs 52-week weekly average, up if delta >= -2%), KPI tiles, 12-week volume bars, 53-week heatmap (quartile levels), week streak (a freeze earned every 4 trained weeks, bank 2), weekly sets per group vs ranges (primary 1.0, secondary 0.4 credit), recovery (per-group fatigue with 24/30/48 h half-lives), 30-day balance radar, month recap, calendar mini rings, awards. Formulas follow openGym's documented behaviour (AGPL, so no code copied) and Apple Fitness concepts. Views in `src/fitness/ui/insights/`; ring/heat colours in `insightColors` (tokens.ts). `scripts/check-insights.ts`.
- **Summary (`/fitness/summary`)**: duration, working volume, working sets, a PR card per exercise whose top set beats its previous best (heavier, or more reps at the same weight; a first-ever session is never a PR), and "Next time" targets from today's sets. `src/fitness/stats.ts` + `scripts/check-session.ts`.
- Both DBs migrate through `src/lib/migrate.ts` (PRAGMA user_version, one transaction per step). `scripts/check-schema.ts` and `scripts/check-fitness-schema.ts` run the real migrations under node:sqlite.
- Fitness routes: `/fitness` redirects to `/fitness/onboarding` until `profile.onboarded`. Onboarding has 4 skippable steps (units, equipment, experience, optional body weight); finishing or skipping the last step saves and marks onboarded.
- The catalog is read-only bundled JSON. Custom exercises live in the DB, so a rebuilt catalog never clobbers user data.
- Launcher prefs are `launcher.remember` / `launcher.last` in kv-store. The skip decision is cached in module state, so it is computed once per JS runtime (= once per cold launch). `openLauncher()` clears it, so the switch icon always shows the launcher. Resuming from background keeps the JS runtime, so you land where you were.
- Deep-link scheme is `auratracker://`, and MyBites import is `auratracker://mybites/import?url=…`.

## Invariants

- The overload hint, recommendation/lineup ranking and stats are pure functions of the DB rows: no network, no AI.
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
- **Launcher Fitness card:** body map of today's split day (primary lime, secondary dim), centred in the card between the tag and the plan text.
- **Launcher data:** reads today's MyBites meal count straight from `mybites.db` (0 on a fresh install), and shows the planned split day for Fitness. No fake numbers.
- **Body map:** `react-native-body-highlighter` (MIT) paths; selected muscles in accent, assisting muscles in accent-dim.
- **Charts:** one series per chart, no legend, direct label on the latest point, hairline grid, metric switch (top set / e1RM / volume) instead of a dual axis.

## Why

- Fork, not sync: MyBites won't ship standalone; one codebase is cheaper.
- Bundled catalog: works offline in the gym. 1,544 exercises (RepDB + free-exercise-db ids kept so history stays linked, 40 new must-have `a:` and 87 video-only `v:` entries). Demos are the user's own 312 clips re-encoded to 640px H.264, no audio (~14 MB) with a webp poster each; RepDB/fedb images are no longer shipped, so exercises without a clip show a placeholder.
- A clip can back more than one exercise (a must-have name and its catalog twin, e.g. Romanian Deadlift and Stiff-Legged Barbell Deadlift); `curated.json` picks the must-have's clip, `ALIAS` keeps it on the twin.
- Source clips are the user's own work, committed as `exercise-videos.zip` (Git LFS) rather than 312 loose mp4s. A fresh clone runs `git lfs pull`, unzips it into `exercises/` (gives `exercises/videos/*.mp4`), then `scripts/build_catalog.py`. `exercises/` itself stays gitignored.
- Catalog is built locally, never committed: the repo is public and RepDB's free tier forbids redistributing the dataset. A fresh clone must run `scripts/build_catalog.py` before `tsc` or Metro (the app imports `@/assets/catalog`).
- ExerciseDB is not in the catalog: the Kaggle "open source" set is a 30-exercise sample behind a Kaggle login, and the 1,500-exercise repo it links to is AGPL with no data.
- Equipment comes from the icons on RepDB's exercise pages (name heuristics only as fallback). Near-duplicates are collapsed by a normalised name key ("barbell" and "medium grip" are implied).
- Separate DBs: no schema coupling between the two apps.

## Build (Windows)

- `android/` is generated by `npx expo prebuild` and gitignored. After every `prebuild --clean`, `android/local.properties` must pin `cmake.dir=…/Android/Sdk/cmake/3.31.0`. The default CMake 3.22 bundles an old ninja that fails on paths over 260 characters (`C:\Projects\AuraTracker` is long enough to hit it). Windows LongPathsEnabled is already 1.
- **Release signing**: `plugins/withReleaseSigning.js` (config plugin, survives `prebuild --clean`) adds a `release` signingConfig fed by `AURA_RELEASE_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD` from `~/.gradle/gradle.properties`; the keystore is `~/.auratracker/auratracker-release.jks` (RSA 4096, alias `auratracker`). Neither is in the repo. Without the properties a release build fails instead of falling back to the public debug key. Build: `cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. Every future update must be signed with this keystore: losing it means uninstall + export/import to update.
- Local native module `modules/reel-fetcher` (Kotlin, under `android/`) is tracked. The root `.gitignore` ignores only `/android/`.
