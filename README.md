# AuraTracker

Android app with two experiences behind one launcher: **Fitness** (workout logging, progressive-overload hints) and **MyBites** (recipes and meal plans, forked from MyBites).

```bash
npm ci
git clone --depth 1 https://github.com/RepDB/exercise-dataset.git data/raw/repdb
git clone --depth 1 https://github.com/yuhonas/free-exercise-db.git data/raw/fedb
python -I scripts/build_catalog.py   # needs Pillow; writes assets/catalog (gitignored)
npx expo run:android   # dev build on a connected device
npx tsc --noEmit && npx expo lint
```

Backlog: `TASK.md`. Structure: `ARCHITECTURE.md`.

Exercise data by [RepDB](https://repdb.co). Additional exercises and photos from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).

## Release build

Signed with a private key kept outside the repo (`~/.auratracker/auratracker-release.jks`, credentials in `~/.gradle/gradle.properties`). Back both up: every update must be signed with the same key.

```bash
cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a
# -> android/app/build/outputs/apk/release/app-release.apk
```
