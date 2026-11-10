import type { Recipe } from '../db/recipes.ts';

export type ChatMessage = { id: number; role: 'user' | 'model'; content: string };
type Turn = { role: 'user' | 'model'; parts: { text: string }[] };

const MAX_TURNS = 20;

const num = (n: number) => String(Math.round(n * 100) / 100);

type RecipeText = Pick<
  Recipe,
  'title' | 'servings' | 'prepMinutes' | 'cookMinutes' | 'totalMinutes' | 'ingredients' | 'steps' | 'nutrition' | 'note' | 'tags'
>;

/** The recipe as plain text: this is all the model is allowed to treat as "the recipe". */
export function recipeContext(r: RecipeText): string {
  const lines = [`Title: ${r.title}`];
  if (r.servings) lines.push(`Servings: ${num(r.servings)}`);
  const times = [
    r.prepMinutes ? `prep ${r.prepMinutes} min` : null,
    r.cookMinutes ? `cook ${r.cookMinutes} min` : null,
    !r.prepMinutes && !r.cookMinutes && r.totalMinutes ? `total ${r.totalMinutes} min` : null,
  ].filter(Boolean);
  if (times.length) lines.push(`Time: ${times.join(', ')}`);
  lines.push('Ingredients:');
  if (r.ingredients.length === 0) lines.push('(none listed)');
  let section: string | null = null;
  for (const i of r.ingredients) {
    if (i.section !== section) {
      section = i.section;
      if (section) lines.push(`[${section}]`);
    }
    const qty = i.quantity === null ? '' : i.quantityMax ? `${num(i.quantity)}-${num(i.quantityMax)}` : num(i.quantity);
    lines.push(`- ${[qty, i.unit, i.name].filter(Boolean).join(' ')}${i.note ? ` (${i.note})` : ''}`);
  }
  lines.push('Steps:');
  if (r.steps.length === 0) lines.push('(no method given)');
  r.steps.forEach((s, n) => lines.push(`${n + 1}. ${s.text}`));
  if (r.nutrition) {
    const n = r.nutrition;
    const parts = [
      n.calories !== null ? `${num(n.calories)} kcal` : null,
      n.proteinG !== null ? `${num(n.proteinG)} g protein` : null,
      n.carbsG !== null ? `${num(n.carbsG)} g carbs` : null,
      n.fatG !== null ? `${num(n.fatG)} g fat` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Nutrition per serving: ${parts.join(', ')}`);
  }
  if (r.tags.length) lines.push(`Tags: ${r.tags.join(', ')}`);
  if (r.note) lines.push(`Cook's own note: ${r.note}`);
  return lines.join('\n');
}

export function chatSystem(recipeText: string): string {
  return `You are a friendly cooking assistant inside a recipe app. The user is looking at ONE saved recipe, given below. Answer questions about it: substitutions, scaling amounts, timing, techniques, what to serve, storage, fixing mistakes.

Rules:
- Ground answers in the recipe. When you rely on general cooking knowledge instead of what the recipe says, say so in a few words.
- If the recipe lacks something asked (an amount, a step), say it is not in the recipe, then offer a sensible suggestion labelled as a suggestion.
- Be short: a few sentences or a tight list. Plain text, no tables, no headings. Light markdown (**bold**, "-" lists) is fine.
- Never invent nutrition numbers as fact; label estimates as estimates.

--- RECIPE ---
${recipeText}
--- END RECIPE ---`;
}

/** Last MAX_TURNS messages as Gemini turns. Consecutive same-role messages (a failed reply leaves two user turns) merge; the list must start with a user turn. */
export function buildContents(history: Pick<ChatMessage, 'role' | 'content'>[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of history.slice(-MAX_TURNS)) {
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.parts[0].text += `\n\n${m.content}`;
    else turns.push({ role: m.role, parts: [{ text: m.content }] });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

/**
 * Incremental parser for a Gemini `alt=sse` stream. Feed raw text chunks; each call returns the new
 * text deltas. Events can be split across chunks, so the unfinished tail is kept in `buffer`.
 */
export function createSseParser() {
  let buffer = '';
  return (chunk: string): string[] => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    const out: string[] = [];
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // a malformed event must not kill the stream
      }
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text) out.push(text);
    }
    return out;
  };
}
