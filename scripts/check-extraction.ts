// Run: bun scripts/check-extraction.ts
// Real calls: yt-dlp for the 4 public reels, Gemini for caption / image / video tiers.
// Needs GEMINI_API_KEY and GEMINI_MODEL in C:\Projects\ReciBites\.env. The key is never printed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { extractFromCaption, extractFromImages, extractFromVideo, extractFromVideoParts, MAX_INLINE_BYTES, planParts } from '../src/recipe-module/extraction/gemini';
import { hasStepsButNoIngredients, isIncomplete, parseRecipeDraft } from '../src/recipe-module/extraction/schema';
import type { RecipeDraft } from '../src/recipe-module/extraction/types';

const ROOT = 'C:/Projects/ReciBites';
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
const cfg = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
assert.ok(cfg.apiKey && cfg.model, 'GEMINI_API_KEY / GEMINI_MODEL missing in .env');

const REELS: Record<string, string> = {
  fridgeCigarette: 'DdYhw6UzqW-',
  jollof: 'DaZdrS3hEV1',
  butterChickenRice: 'DQOyRuQiB3m',
  butterChicken: 'DSw-yxJCFT-',
};
const SCRATCH = process.argv[2] ?? 'C:/Users/arpit/AppData/Local/Temp/claude/C--Projects-ReciBites/dddda19d-253e-43ee-94cc-d90ac74dad0c/scratchpad';

function show(label: string, d: RecipeDraft) {
  const sections = [...new Set(d.ingredients.map((i) => i.section).filter(Boolean))];
  console.log(
    `\n## ${label}\n  "${d.title}" | isRecipe=${d.isRecipe} | servings=${d.servings} | prep=${d.prepMinutes} cook=${d.cookMinutes} total=${d.totalMinutes}` +
      `\n  ingredients=${d.ingredients.length} steps=${d.steps.length} sections=${JSON.stringify(sections)} nutrition=${JSON.stringify(d.nutrition)} incomplete=${isIncomplete(d)}` +
      `\n  e.g. ${d.ingredients.slice(0, 4).map((i) => `${i.emoji} ${i.quantity ?? ''}${i.quantityMax ? '-' + i.quantityMax : ''} ${i.unit ?? ''} ${i.name}${i.note ? ' (' + i.note + ')' : ''}`).join(' | ')}`,
  );
}

function ytdlpInfo(id: string): { description: string; uploader: string } {
  const out = execFileSync('yt-dlp', ['--skip-download', '--no-warnings', '-J', `https://www.instagram.com/reel/${id}/`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const j = JSON.parse(out);
  return { description: j.description ?? '', uploader: j.uploader ?? '' };
}

// 1. Validator unit checks (no network)
{
  const d = parseRecipeDraft({
    is_recipe: true,
    title: ' X ',
    prep_minutes: 10,
    cook_minutes: 20,
    ingredients: [
      { name: 'salt', emoji: 'a very long word' },
      { name: '  ', emoji: '🧂' },
      { name: 'egg', emoji: '🥚', quantity: '2' },
    ],
    steps: ['a', '', { text: 'b', emoji: '🔥' }, { text: 'c', emoji: 'a long word' }, { emoji: '🔥' }],
  });
  assert.equal(d.title, 'X');
  assert.equal(d.totalMinutes, 30, 'total derived from prep+cook');
  assert.equal(d.ingredients.length, 2, 'blank-name ingredient dropped');
  assert.equal(d.ingredients[0].emoji, '🍽️', 'bad emoji replaced');
  assert.equal(d.ingredients[1].quantity, null, 'string quantity rejected');
  assert.deepEqual(
    d.steps,
    [{ text: 'a', emoji: null }, { text: 'b', emoji: '🔥' }, { text: 'c', emoji: null }],
    'plain strings accepted, bad emoji dropped, textless step dropped',
  );
  assert.equal(parseRecipeDraft({ is_recipe: true, title: 't', ingredients: [], steps: [] }).isRecipe, false, 'empty recipe is not a recipe');
  assert.throws(() => parseRecipeDraft('nope'));
  const steps = [{ text: 'Boil.', emoji: '💧' }];
  const ing = [{ name: 'egg', emoji: '🥚' }];
  assert.equal(hasStepsButNoIngredients(parseRecipeDraft({ is_recipe: true, title: 't', steps, ingredients: [] })), true, 'method without ingredients is flagged');
  assert.equal(hasStepsButNoIngredients(parseRecipeDraft({ is_recipe: true, title: 't', steps, ingredients: ing })), false);
  assert.equal(hasStepsButNoIngredients(parseRecipeDraft({ is_recipe: true, title: 't', steps: [], ingredients: ing })), false, 'ingredients without a method is the normal partial recipe');
  console.log('validator ok');
}

// 2. Caption tier on the 4 reels
const captions: Record<string, { description: string; uploader: string }> = {};
const capDrafts: Record<string, RecipeDraft> = {};
for (const [name, id] of Object.entries(REELS)) {
  captions[name] = ytdlpInfo(id);
  const d = await extractFromCaption(cfg, { caption: captions[name].description, author: captions[name].uploader });
  show(`caption: ${name}`, d);
  capDrafts[name] = d;
  assert.ok(d.isRecipe, `${name}: should be a recipe`);
  assert.ok(d.ingredients.length >= 3, `${name}: too few ingredients`);
  // These two captions contain no method: steps must stay empty (no invented steps) so the video tier runs.
  if (name === 'fridgeCigarette' || name === 'butterChicken') {
    assert.equal(d.steps.length, 0, `${name}: caption has no method, steps must be empty`);
    assert.ok(isIncomplete(d), `${name}: should be flagged incomplete`);
  } else {
    assert.ok(d.steps.length >= 2, `${name}: should have steps`);
  }
  if (name === 'butterChicken') {
    assert.ok(d.ingredients.length >= 25, 'butterChicken: expected ~29 ingredients');
    assert.deepEqual([...new Set(d.ingredients.map((i) => i.section))].sort(), ['For chicken marination', 'For masala']);
  }
  const garlic = d.ingredients.find((i) => /garlic/i.test(i.name));
  if (garlic) assert.ok(!/clove/i.test(garlic.name), `${name}: unit word leaked into name "${garlic.name}"`);
}

// 3. Negative: praise-only caption is not a recipe
{
  const d = await extractFromCaption(cfg, { caption: 'Obsessed with this one 😍 Follow for more!! #foodie #yum #reels' });
  show('caption: negative', d);
  assert.equal(d.isRecipe, false);
}

// 4. Image tier on the carousel screenshot (expects the Air Fryer Bang Bang Chicken Bites post)
if (!existsSync(`${ROOT}/image.png`)) {
  console.log('\n## image: SKIPPED, C:/Projects/ReciBites/image.png not found (image tier NOT verified in this run)');
} else {
  const b64 = readFileSync(`${ROOT}/image.png`).toString('base64');
  const d = await extractFromImages(cfg, [{ mimeType: 'image/png', base64: b64 }]);
  show('image: carousel screenshot', d);
  assert.ok(d.isRecipe);
  assert.ok(d.ingredients.length >= 10, 'expected 11 ingredients');
  assert.ok(d.ingredients.some((i) => /sauce/i.test(i.section ?? '')), 'sauce section must be kept');
  assert.equal(d.prepMinutes, null, '"25 mins" is total time, not prep');
  assert.equal(d.totalMinutes, 25);
  assert.equal(d.nutrition?.calories, 340);
  assert.equal(d.servings, 3);
}

// 5. Video tier: Fridge Cigarette has no method in its caption
{
  const dir = join(SCRATCH, 'video');
  mkdirSync(dir, { recursive: true });
  execFileSync(
    'yt-dlp',
    ['--no-warnings', '-f', 'worst[ext=mp4]/worst', '-o', join(dir, 'fridge.%(ext)s'), `https://www.instagram.com/reel/${REELS.fridgeCigarette}/`],
    { stdio: 'ignore' },
  );
  const file = readdirSync(dir).find((f) => f.startsWith('fridge.'))!;
  const size = statSync(join(dir, file)).size;
  console.log(`\nvideo file ${file}: ${(size / 1048576).toFixed(1)} MB`);
  const d = await extractFromVideo(
    cfg,
    { mimeType: 'video/mp4', base64: readFileSync(join(dir, file)).toString('base64') },
    captions.fridgeCigarette.description,
  );
  show('video: fridgeCigarette', d);
  assert.ok(d.isRecipe);
  assert.ok(d.steps.length >= 2, 'video should supply the missing method');
  console.log('  steps:', d.steps.map((s, i) => `${i + 1}. ${s.text} ${s.emoji}`).join(' '));
}

// 6. Oversize video: a 24 MB / 90 s reel is cut into clips, read in parallel, then merged. No caption: video only.
{
  const dir = join(SCRATCH, 'video');
  const ffDir = readdirSync('C:/').filter((n) => n.startsWith('ffmpeg')).map((n) => `C:/${n}/bin`)[0];
  assert.ok(ffDir, 'PC ffmpeg not found under C:/ffmpeg*');
  const src = join(dir, 'jollof.mp4');
  execFileSync('yt-dlp', ['--no-warnings', '-q', '-f', 'b[ext=mp4]/b', '-o', src, `https://www.instagram.com/reel/${REELS.jollof}/`], { stdio: 'ignore' });
  const bytes = statSync(src).size;
  const n = planParts(bytes);
  console.log(`\njollof video ${(bytes / 1048576).toFixed(1)} MB (cap ${(MAX_INLINE_BYTES / 1048576).toFixed(0)} MB) -> ${n} clips`);
  assert.ok(n >= 2, 'test reel should exceed the cap');
  const dur = Number(execFileSync(`${ffDir}/ffprobe.exe`, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }));
  const clips = [];
  for (let i = 0; i < n; i++) {
    const out = join(dir, `jollof.part${i}.mp4`);
    // each clip starts 1.5 s early, like the on-device splitter, so a cut never loses a sentence
    execFileSync(`${ffDir}/ffmpeg.exe`, ['-y', '-v', 'error', '-ss', String(Math.max(0, (dur * i) / n - 1.5)), '-to', String((dur * (i + 1)) / n), '-i', src, '-c', 'copy', out]);
    const size = statSync(out).size;
    assert.ok(size <= MAX_INLINE_BYTES, `clip ${i} still too big: ${size}`);
    clips.push({ mimeType: 'video/mp4', base64: readFileSync(out).toString('base64') });
  }
  const t0 = Date.now();
  const d = await extractFromVideoParts(cfg, clips, null);
  console.log(`  clips read + merged in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  show('video parts: jollof (video only)', d);
  assert.ok(d.isRecipe);
  assert.ok(d.ingredients.length >= 8, 'merged result lost ingredients');
  assert.ok(d.steps.length >= 4, 'merged result lost steps');
  // No duplicate assertion here: video-only reads can list an ingredient twice when it is used in two places.
  // The app always sends the caption too; the joint test below is the one that guards the real path.
}

// 7. Joint strategy (what the app does): ONE call sees the video and the caption together.
{
  const dir = join(SCRATCH, 'joint');
  mkdirSync(dir, { recursive: true });
  const ffDir = readdirSync('C:/').filter((n) => n.startsWith('ffmpeg')).map((n) => `C:/${n}/bin`)[0];
  for (const [name, id] of Object.entries(REELS)) {
    const src = join(dir, `${name}.mp4`);
    if (!existsSync(src)) execFileSync('yt-dlp', ['--no-warnings', '-q', '-f', 'b[ext=mp4]/b', '-o', src, `https://www.instagram.com/reel/${id}/`], { stdio: 'ignore' });
    const n = planParts(statSync(src).size);
    const dur = Number(execFileSync(`${ffDir}/ffprobe.exe`, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }));
    const clips = [];
    for (let i = 0; i < n; i++) {
      let file = src;
      if (n > 1) {
        file = join(dir, `${name}.part${i}.mp4`);
        execFileSync(`${ffDir}/ffmpeg.exe`, ['-y', '-v', 'error', '-ss', String(Math.max(0, (dur * i) / n - 1.5)), '-to', String((dur * (i + 1)) / n), '-i', src, '-c', 'copy', file]);
      }
      clips.push({ mimeType: 'video/mp4', base64: readFileSync(file).toString('base64') });
    }
    const t0 = Date.now();
    const d = await extractFromVideoParts(cfg, clips, captions[name].description);
    show(`JOINT (${n} clip${n > 1 ? 's' : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s): ${name}`, d);
    const cap = capDrafts[name];
    assert.ok(d.isRecipe, `${name}: joint call found no recipe`);
    assert.ok(d.ingredients.length >= cap.ingredients.length, `${name}: joint call lost caption ingredients (${d.ingredients.length} < ${cap.ingredients.length})`);
    const capSections = [...new Set(cap.ingredients.map((i) => i.section).filter(Boolean))];
    const jointSections = new Set(d.ingredients.map((i) => i.section).filter(Boolean));
    for (const sec of capSections) assert.ok(jointSections.has(sec), `${name}: section "${sec}" lost`);
    assert.ok(d.steps.length >= Math.max(3, cap.steps.length), `${name}: method too thin (${d.steps.length})`);
    assert.ok(d.steps.every((s) => s.emoji), `${name}: a step has no emoji`);
    if (cap.nutrition?.calories) assert.equal(d.nutrition?.calories, cap.nutrition.calories, `${name}: caption nutrition lost`);
    console.log('  steps:', d.steps.map((s, i) => `${i + 1}. ${s.text} ${s.emoji}`).join(' | ').slice(0, 700));
  }
}

console.log('\nextraction ok');
