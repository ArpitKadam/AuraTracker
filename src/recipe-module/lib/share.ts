import type { Recipe } from '../db/recipes.ts';
import type { NutritionKey } from '../extraction/types.ts';
import { formatMinutes, formatQuantity, showIngredient, type UnitSystem } from './format.ts';
import { printColors as pc } from '../../theme/tokens.ts';

export type ShareRow = { emoji: string; amount: string | null; name: string; note: string | null };
export type ShareModel = {
  title: string;
  chips: string[];
  groups: { section: string | null; rows: ShareRow[] }[];
  steps: { n: number; text: string; emoji: string }[];
  nutrition: { label: string; value: string }[];
  tags: string[];
  sourceUrl: string | null;
  sourceLabel: string | null;
};

const FALLBACK_STEP_EMOJI = '🍴';

/** Everything the three outputs print, already scaled to `servings` and converted to `system`. */
export function buildShareModel(r: Recipe, servings: number, system: UnitSystem): ShareModel {
  const base = Math.max(1, Math.round(r.servings ?? 1));
  const factor = servings / base;

  const chips: string[] = [];
  if (r.prepMinutes) chips.push(`⏱️ Prep ${formatMinutes(r.prepMinutes)}`);
  if (r.cookMinutes) chips.push(`🔥 Cook ${formatMinutes(r.cookMinutes)}`);
  if (!r.prepMinutes && !r.cookMinutes && r.totalMinutes) chips.push(`⏱️ ${formatMinutes(r.totalMinutes)}`);
  chips.push(`🍽️ Serves ${formatQuantity(servings)}`);

  const groups: ShareModel['groups'] = [];
  for (const i of r.ingredients) {
    const s = showIngredient(i, factor, system);
    const g = groups[groups.length - 1];
    const row = { emoji: i.emoji, amount: s.amount, name: s.name, note: s.note };
    if (g && g.section === s.section) g.rows.push(row);
    else groups.push({ section: s.section, rows: [row] });
  }

  const n = r.nutrition;
  const nutrition: ShareModel['nutrition'] = [];
  if (n) {
    const add = (key: NutritionKey, label: string, unit: string) => {
      const v = n[key];
      if (v !== null) nutrition.push({ label, value: `${n.estimated?.includes(key) ? '≈' : ''}${Math.round(v)} ${unit}` });
    };
    add('calories', 'Calories', 'kcal');
    add('proteinG', 'Protein', 'g');
    add('carbsG', 'Carbs', 'g');
    add('fatG', 'Fat', 'g');
    add('fiberG', 'Fiber', 'g');
  }

  return {
    title: r.title,
    chips,
    groups,
    steps: r.steps.map((s, i) => ({ n: i + 1, text: s.text, emoji: s.emoji ?? FALLBACK_STEP_EMOJI })),
    nutrition,
    tags: r.tags,
    sourceUrl: r.sourceUrl,
    sourceLabel: r.sourceType === 'instagram' ? 'Instagram' : null,
  };
}

const line = (row: ShareRow) => `${row.emoji} ${[row.amount, row.name, row.note ? `(${row.note})` : ''].filter(Boolean).join(' ')}`;

export function renderText(m: ShareModel): string {
  const out = [m.title, m.chips.join('  ·  '), '', 'Ingredients'];
  for (const g of m.groups) {
    if (g.section) out.push(`\n${g.section}:`);
    out.push(...g.rows.map(line));
  }
  out.push('', 'Method', ...m.steps.map((s) => `${s.n}. ${s.text} ${s.emoji}`));
  if (m.nutrition.length) out.push('', `Per serving: ${m.nutrition.map((x) => `${x.label} ${x.value}`).join(', ')}`);
  if (m.sourceUrl) out.push('', m.sourceUrl);
  out.push('', 'Shared from MyBites');
  return out.join('\n');
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Self-contained A4 page. `heroDataUri` is embedded because the print engine cannot read app files. */
export function renderHtml(m: ShareModel, heroDataUri: string | null): string {
  const e = escapeHtml;
  const ingredients = m.groups
    .map(
      (g) =>
        `${g.section ? `<h3>${e(g.section)}:</h3>` : ''}${g.rows
          .map(
            (r) =>
              `<div class="ing"><span class="em">${e(r.emoji)}</span><span class="tx">${r.amount ? `<b>${e(r.amount)}</b> ` : ''}${e(r.name)}${r.note ? ` <i>(${e(r.note)})</i>` : ''}</span></div>`,
          )
          .join('')}`,
    )
    .join('');
  const steps = m.steps
    .map((s) => `<div class="step"><span class="num">${s.n}</span><span class="tx">${e(s.text)}</span><span class="em">${e(s.emoji)}</span></div>`)
    .join('');
  const nutrition = m.nutrition.length
    ? `<h2>Per serving</h2><div class="nut">${m.nutrition.map((x) => `<div><b>${e(x.value)}</b><span>${e(x.label)}</span></div>`).join('')}</div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { margin: 28px 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: sans-serif; color: ${pc.ink}; background: ${pc.page}; }
.top { background: linear-gradient(135deg, ${pc.gradient[0]}, ${pc.gradient[1]} 60%, ${pc.gradient[2]}); padding: 20px 36px 20px; border-radius: 0 0 36px 36px; margin-top: -28px; padding-top: 48px; }
.hero { width: 100%; height: 190px; object-fit: cover; border-radius: 24px; display: block; margin-bottom: 18px; }
h1 { font-size: 30px; line-height: 1.15; margin: 0 0 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { background: ${pc.chip}; border: 1px solid ${pc.border}; border-radius: 999px; padding: 5px 12px; font-size: 13px; font-weight: 600; }
.body { padding: 4px 36px 12px; }
h2 { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: ${pc.brand}; margin: 18px 0 6px; break-after: avoid; }
h3 { font-size: 15px; color: ${pc.brand}; margin: 16px 0 2px; }
.ing, .step { display: flex; align-items: center; gap: 12px; padding: 7px 0; border-top: 1px solid ${pc.hairline}; break-inside: avoid; }
.ing:first-of-type { border-top: 0; }
.em { font-size: 22px; width: 30px; text-align: center; flex: none; }
.tx { flex: 1; font-size: 15px; line-height: 1.4; }
.tx i { color: ${pc.inkMuted}; font-style: normal; }
.step .em { width: 34px; font-size: 24px; }
.num { flex: none; width: 26px; height: 26px; border-radius: 13px; background: ${pc.brandSoft}; color: ${pc.brand}; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.nut { display: flex; gap: 10px; flex-wrap: wrap; }
.nut div { background: ${pc.tile}; border: 1px solid ${pc.border}; border-radius: 16px; padding: 10px 16px; min-width: 92px; }
.nut b { display: block; font-size: 18px; }
.nut span { font-size: 12px; color: ${pc.brand}; font-weight: 600; }
.foot { margin-top: 16px; break-inside: avoid; font-size: 12px; color: ${pc.inkMuted}; display: flex; justify-content: space-between; gap: 12px; }
.brand { color: ${pc.brand}; font-weight: 800; font-style: italic; }
</style></head><body>
<div class="top">${heroDataUri ? `<img class="hero" src="${e(heroDataUri)}">` : ''}<h1>${e(m.title)}</h1><div class="chips">${m.chips.map((c) => `<span class="chip">${e(c)}</span>`).join('')}${m.tags.slice(0, 3).map((t) => `<span class="chip">🌿 ${e(t)}</span>`).join('')}</div></div>
<div class="body">
<h2>Ingredients</h2>${ingredients}
<h2>Method</h2>${steps || '<div class="tx">No method in the source.</div>'}
${nutrition}
<div class="foot"><span>${m.sourceUrl ? e(m.sourceUrl) : ''}</span><span class="brand">MyBites</span></div>
</div></body></html>`;
}

export const shareFileName = (title: string) =>
  `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'recipe'}`;
