# ARCHITECTURE.md — AuraTracker

Status: planned target (nothing built yet). Updated as tasks land.

## Shape

One Expo 58 app, forked from MyBites. Expo Router file routes in `src/app/`:

```
src/app/
  _layout.tsx        root stack, fonts, dark theme
  index.tsx          launcher: Fitness | MyBites, "remember my choice"
  mybites/...        MyBites routes, moved verbatim from C:\MyBites
  fitness/...        onboarding, picker, session, exercise log, settings
src/theme/           shared dark tokens; per-app accent
src/recipe-module/   MyBites domain code (unchanged except theming)
src/fitness/         Fitness domain: db, catalog loader, rules (overload, ranking), export
assets/catalog/      generated catalog.json + exercise media (build output)
scripts/build-catalog  merges ExerciseDB + RepDB + free-exercise-db
modules/reel-fetcher MyBites native module (unchanged)
```

## Data

- `mybites.db` belongs to MyBites; its schema is untouched.
- `fitness.db` holds profile, sessions, session_exercises, sets (weight, reps, is_warmup) and custom_exercises.
- The catalog is read-only bundled JSON. Custom exercises live in the DB, so a rebuilt catalog never clobbers user data.
- The launcher preference (remember toggle + last app) is stored as a single key/value.

## Invariants

- The overload hint and recommendation ranking are pure functions of the DB rows: no network, no AI.
- Warm-up sets never feed hints, PRs or graphs.
- Fitness and MyBites share no tables.
- No assets from third-party commercial apps ship in the build. `GymTracker/`, `Lyfta/` and `reference/` are gitignored.

## Why

- Fork, not sync: MyBites won't ship standalone; one codebase is cheaper.
- Bundled catalog: works offline in the gym; costs about 100MB of APK.
- Separate DBs: no schema coupling between the two apps.
