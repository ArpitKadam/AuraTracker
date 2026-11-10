# TASK.md — AuraTracker

One Android app, two experiences: **Fitness** (new) and **MyBites** (one-time fork of `C:\MyBites`). Whole app dark. Gated mode: one task per "Go for Task n".

## Locked requirements (from grill session, 2026-11-10)

- **Stack:** fork of MyBites (Expo 58, expo-router, expo-sqlite). Package `com.auratracker.app`. Android only, sideloaded APK.
- **Launcher:** on cold launch, two choices: Fitness / MyBites. A "remember my choice" toggle skips straight to the last-used app. Both apps have a header switch icon back to the launcher. Coming back from background resumes in place.
- **Data:** separate SQLite files (`mybites.db`, `fitness.db`). No cloud and no automatic backup. Settings has a manual JSON export/import (sessions, sets, custom exercises, profile) through the share sheet.
- **Exercise catalog:** ExerciseDB open-source (MIT, 180p GIFs) is primary. RepDB free (start/peak WebP, attribution "Exercise data by RepDB (repdb.co)" in About) and free-exercise-db (Unlicense) are merged in. Duplicates are removed by normalised name, and all three map to one muscle vocabulary. The catalog is bundled for offline use. Exercise detail shows every media item available.
- **No assets from Gym Workout / Lyfta.** Those apps are used only as flow reference (ADB screenshots in `reference/`, gitignored).
- **Onboarding (all steps skippable):** units (kg default, lb option), equipment (full gym / dumbbells / bodyweight), experience (beginner / intermediate / advanced), optional body weight.
- **Session flow:** "What are we working today?" multi-select muscle groups. The body diagram highlights the selection, and recommended exercises are listed below. Tapping an exercise opens the logging screen (GIF, overload hint, sets, progress graph). Finishing shows a summary (volume, PRs) and the trained muscles lit up. An unfinished session is auto-saved and resumed.
- **Set:** weight + reps + a warm-up toggle. Warm-ups are excluded from hints and graphs.
- **Overload rule (rule-based, no AI), compared to the last session of the same exercise:**
  - if any working set is ≤ 12 reps: same weight, target last reps +1 to +2 ("30kg × 4 → push for 5–6")
  - if all working sets are ≥ 13 reps (target range 13–15): motivate +2.5kg (lb mode: +5lb)
- **Recommendations (about 6 per muscle group):** staples (in ≥ 80% of the last 5 sessions for that group) first, then other history with the longest-ago first, then catalog fill (compound before isolation, filtered by equipment and experience). Variety nudge after 3 identical sessions. Swap button (same target muscle).
- **Graph per exercise:** top working-set weight and Epley e1RM over time; volume is a toggle.
- **Custom exercises:** name, muscle groups, equipment, optional gallery photo.
- **Design:** Figma-first, original, dark. Fitness and MyBites share a base and differ by accent. Run through design-taste-frontend / high-end-visual-design / minimalist-ui; no AI-slop tropes.
- **Component sources:** pull multiple components from https://bencho.dev/ and https://21st.dev/. They are web React (Tailwind/Framer Motion), so each one is ported to React Native (Reanimated + react-native-svg). Check each component's license before porting and note its source in a comment.
- **Workout split (added 2026-11-10), editable in Settings:**

  | Day | Primary | Secondary |
  |-----|---------|-----------|
  | Mon | Legs | Shoulder |
  | Tue | Chest | Triceps, Abs |
  | Wed | Back | Biceps, Forearms |
  | Thu | Shoulder | Legs, Abs |
  | Fri | Biceps, Triceps | Forearms |
  | Sat | Chest, Back | Abs |
  | Sun | Rest / make-up day | |

  - Every day's groups can be edited, and the default is the table above.
  - The split is a plan, not a lock. "What are we working today?" pre-selects today's planned groups, but you can change them freely.
  - **Skip:** today is marked skipped and nothing moves.
  - **Postpone:** today's plan moves to the next rest day (Sunday by default), and that day's picker pre-selects it.
- **"Next time" notifications (added 2026-11-10):**
  - Local notifications only (no server), sent on days with a planned, not-yet-done workout.
  - 4 per day, every 4 hours, with the last at 19:00 so it lands before the 19:30–20:30 workout: **07:00, 11:00, 15:00, 19:00**.
  - Each notification carries one overload target for today's planned groups ("Bench: push for 5–6 at 30 kg", "Rope pushdown: add 2.5 kg"), rotating through the targets.
  - Notifications stop for the day once a session is started. They don't fire on skipped days. Postponed days fire on the new day.
  - Settings has an on/off switch and an editable last-notification time; the other three are derived from it at 4-hour intervals.
- **Honest empty states (added 2026-11-10):**
  - The launcher MyBites card with no meals planned today reads "What are we eating today?", never a fake count.
  - The Fitness card with no history reads "What are we working today?" plus today's planned groups.
- **Docs:** maintain `TASK.md` + `ARCHITECTURE.md` only (no `EXPLANATION.md`).
- **Git:** the agent commits and pushes itself after each task.

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Fork + launcher | done |
| 2 | Reference capture + Figma design | done (awaiting design approval) |
| 2b | Follow-up: verify yt-dlp download in `src/recipe-module/fetch/reel.ts` (pinned SHA-256 or bundled binary) | todo |
| 3 | Dark theme across MyBites | done |
| 4 | Exercise catalog build | done |
| 5 | Fitness DB + onboarding | done |
| 6 | Muscle picker + recommendations | done |
| 7 | Session + set logging + overload hint | done |
| 8 | Progress graph | done |
| 9 | Custom exercises | todo |
| 10 | Export / import | todo |
| 10a | Workout split settings + skip/postpone | todo |
| 10b | "Next time" local notifications (needs `expo-notifications`) | todo |
| 11 | Release APK | todo |

### 1. Fork + launcher
- Copy `C:\MyBites` into the repo, excluding `node_modules`, `.git`, `.expo`, `android`. Rename the app and package. Move MyBites routes under `src/app/mybites/`. Add `src/app/index.tsx` as the launcher with the remember toggle. Add a placeholder `src/app/fitness/` route. Gitignore `GymTracker/`, `Lyfta/`, `reference/`.
- **Accept:** cold launch shows the launcher; both apps open; every MyBites screen works as before; the toggle persists; the switch icon returns to the launcher.
- **Verify:** `npx tsc --noEmit`, `npx expo lint`, `npx expo run:android`, then click through every MyBites screen.

### 2. Reference capture + Figma design
- REA/ADB screenshots of the relevant Gym Workout + Lyfta flows go to `reference/`. In Figma: dark tokens (variables), launcher, onboarding, muscle picker, recommendations, logging + graph, summary, settings, and dark MyBites screens.
- **Accept:** user approves the Figma file. **Verify:** Figma screenshots reviewed.
- **Result:** Figma file https://www.figma.com/design/0gzT4kJHYZcWtOA2ayEfL3 has 8 screens (onboarding, launcher, today picker, recommendations, log + chart, summary, MyBites recipes, settings) plus foundations (variables, Icon/*, Body/Front + Body/Back, Button, Chip, ExerciseRow, SetRow). Reference shots and `reference/NOTES.md` are local only.
- **Component candidates for porting (bencho.dev, licence not published, confirm before porting):** Rolling counter / Drag stepper (weight & reps), Liquid toggle (warm-up, remember), Jelly tabs (chart metric switch), Slide to confirm (finish workout), Card swap (exercise swap). For 21st.dev, pick per component on its page and check each licence.

### 3. Dark theme across MyBites
- Dark `tokens.ts`. Replace the hard-coded hex in the 12 MyBites files with tokens.
- **Accept:** no raw hex outside `src/theme/`; screens match Figma. **Verify:** grep for hex, tsc, lint, device screenshots.

### 4. Exercise catalog build
- `scripts/build-catalog` downloads the three datasets, merges and de-duplicates them, maps muscles to one vocabulary, and writes `assets/catalog/catalog.json` + media. Attribution goes in About.
- **Accept:** one entry per unique exercise; every entry has ≥ 1 media item and ≥ 1 primary muscle in the vocabulary. **Verify:** script self-check asserts; APK size noted.

### 5. Fitness DB + onboarding
- `fitness.db` schema (profile, sessions, session_exercises, sets, custom_exercises) and the 4-step skippable onboarding.
- **Accept:** profile persists across restarts. **Verify:** device run.

### 6. Muscle picker + recommendations
- Multi-select picker with the highlighted body diagram, and the ranking rule above as a pure function.
- **Accept:** ranking rule correct. **Verify:** runnable check on the ranking function plus a device run.

### 7. Session + set logging + overload hint
- Session lifecycle (auto-save/resume, finish summary), set rows pre-filled from the last session, warm-up toggle, overload hint as a pure function.
- **Accept:** hint matches the rule in every case. **Verify:** runnable check on the hint function plus a device run.

### 8. Progress graph
- Top-set weight / e1RM / volume per exercise, warm-ups excluded. Read `dataviz` first.
- **Verify:** device run with seeded data.

### 9. Custom exercises
- Create/edit with a gallery photo; usable everywhere catalog exercises are.
- **Verify:** device run.

### 10. Export / import
- JSON export via the share sheet; import validates and replaces after a confirmation.
- **Accept:** export → wipe → import round-trip is identical. **Verify:** round-trip check.

### 11. Release APK
- Signed release build to sideload.
- **Verify:** install on the phone and run a full flow.
