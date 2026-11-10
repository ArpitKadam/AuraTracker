import { cleanWords } from './highlight';

const ALIASES: Record<string, string> = {
  chilli: 'chili', chillies: 'chili', chilies: 'chili', chile: 'chili', chiles: 'chili',
  capsicum: 'bellpepper', scallion: 'greenonion', scallions: 'greenonion', aubergine: 'eggplant', courgette: 'zucchini',
  yoghurt: 'yogurt', curd: 'yogurt',
};

function variants(key: string): string[] {
  const out = [key];
  if (key.endsWith('ies')) out.push(`${key.slice(0, -3)}y`);
  if (key.endsWith('es')) out.push(key.slice(0, -2));
  if (key.endsWith('s')) out.push(key.slice(0, -1));
  return out;
}

/**
 * Picks the icon key for an ingredient name from the available keys.
 * Longest phrase wins; among equal lengths the earliest wins ("tomato puree" -> tomato, "greek yogurt" -> yogurt).
 */
export function iconKeyFor(name: string, keys: ReadonlySet<string>): string | null {
  const words = cleanWords(name).map((w) => ALIASES[w] ?? w);
  for (let n = words.length; n >= 1; n--) {
    for (let start = 0; start + n <= words.length; start++) {
      const joined = words.slice(start, start + n).join('');
      for (const v of variants(joined)) {
        const hit = keys.has(v) ? v : ALIASES[v] && keys.has(ALIASES[v]) ? ALIASES[v] : null;
        if (hit) return hit;
      }
    }
  }
  return null;
}
