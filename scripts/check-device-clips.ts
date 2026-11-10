// Run: bun scripts/check-device-clips.ts <dir with reel.part0.mp4, reel.part1.mp4 pulled from the phone>
// Sends the clips cut ON THE PHONE (MediaMuxer) to Gemini: parallel clip reads, then one merge call.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { extractFromVideoParts } from '../src/recipe-module/extraction/gemini';

const env = Object.fromEntries(
  readFileSync('C:/Projects/ReciBites/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const cfg = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => /^reel\.part\d+\.mp4$/.test(f)).sort();
assert.ok(files.length >= 2, 'need at least two reel.partN.mp4 files');

const clips = files.map((f) => ({ mimeType: 'video/mp4', base64: readFileSync(join(dir, f)).toString('base64') }));
const t0 = Date.now();
const d = await extractFromVideoParts(cfg, clips, null);
console.log(`${files.join(' + ')} -> ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`"${d.title}" isRecipe=${d.isRecipe} ingredients=${d.ingredients.length} steps=${d.steps.length} total=${d.totalMinutes}`);
console.log('ingredients:', d.ingredients.map((i) => `${i.quantity ?? ''}${i.unit ?? ''} ${i.name}`.trim()).join(' | '));
console.log('steps:\n' + d.steps.map((s, i) => `${i + 1}. ${s.text} ${s.emoji}`).join('\n'));
assert.ok(d.isRecipe);
assert.ok(d.ingredients.length >= 8, 'lost ingredients');
assert.ok(d.steps.length >= 4, 'lost steps');
const names = d.ingredients.map((i) => i.name.toLowerCase());
assert.equal(new Set(names).size, names.length, 'duplicate ingredients after merge');
console.log('device clips ok');
