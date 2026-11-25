import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../data/ingredients.json', import.meta.url), 'utf8'));

const STAPLES = new Set(['salz', 'pfeffer', 'öl', 'olivenöl', 'wasser', 'zucker', 'mehl']);

const UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'el', 'tl', 'prise', 'prisen', 'stück', 'stücke', 'stk', 'bund', 'bündel',
  'dose', 'dosen', 'packung', 'päckchen', 'pck', 'pkg', 'becher', 'glas', 'gläser', 'scheibe', 'scheiben',
  'handvoll', 'schuss', 'spritzer', 'msp', 'messerspitze', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon',
  'tablespoons', 'teaspoon', 'teaspoons', 'oz', 'lb', 'lbs', 'pound', 'pounds', 'ounce', 'ounces', 'pinch',
  'dash', 'can', 'cans', 'tin', 'tins', 'slice', 'slices', 'piece', 'pieces', 'bunch', 'handful', 'of', 'von',
  'x', 'etwa', 'ca', 'circa', 'about', 'approx',
]);
const NUMBER_UNIT_ONLY = new Set(['clove', 'cloves', 'zehe', 'zehen', 'head', 'heads', 'stalk', 'stalks', 'stange', 'stangen', 'zweig', 'zweige', 'sprig', 'sprigs']);
const NUMBER = /^[\d½¼¾⅓⅔.,/\-–]+$/;
const NUMBER_WITH_UNIT = /^\d+([.,]\d+)?(g|kg|mg|ml|l|cl|dl|el|tl|oz|lb|lbs|cup|cups|tbsp|tsp|x)$/;

const aliasToCanonical = new Map();
for (const [canonical, aliases] of Object.entries(data)) {
  aliasToCanonical.set(canonical, canonical);
  for (const alias of aliases) if (!aliasToCanonical.has(alias)) aliasToCanonical.set(alias, canonical);
}
// Compound words (Kirschtomaten) are only resolved through heads that are safe: Meerrettich, Granatapfel or Hafersahne must not collapse into radieschen, apfel or sahne.
const compoundHeads = new Set(JSON.parse(readFileSync(new URL('../../data/compound-heads.json', import.meta.url), 'utf8')));
const compoundTargets = [...aliasToCanonical]
  .filter(([k, canonical]) => compoundHeads.has(canonical) && k.length >= 4 && !k.includes(' '))
  .map(([k]) => k)
  .sort((a, b) => b.length - a.length);

function singularCandidates(s) {
  const out = [s];
  for (const suffix of ['en', 'n', 'e', 'er', 's', 'es']) {
    if (s.length > suffix.length + 2 && s.endsWith(suffix)) out.push(s.slice(0, -suffix.length));
  }
  return out;
}

function lookup(text) {
  for (const candidate of singularCandidates(text)) {
    const hit = aliasToCanonical.get(candidate);
    if (hit) return hit;
  }
  return null;
}

function stripQuantity(tokens) {
  let sawNumber = false;
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (NUMBER.test(t) || NUMBER_WITH_UNIT.test(t)) { sawNumber = true; continue; }
    if (UNITS.has(t)) continue;
    if (sawNumber && NUMBER_UNIT_ONLY.has(t)) continue;
    break;
  }
  return tokens.slice(i);
}

export function normalizeIngredient(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.toLowerCase().replace(/\([^)]*\)/g, ' ');
  text = text.split(',')[0].replace(/[^\p{L}\p{N}\s'’\-/.½¼¾⅓⅔]/gu, ' ');
  const tokens = stripQuantity(text.split(/\s+/).filter(Boolean));
  if (!tokens.length) return '';
  const phrase = tokens.join(' ');
  const whole = lookup(phrase);
  if (whole) return whole;
  for (let size = tokens.length - 1; size >= 1; size--) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const hit = lookup(tokens.slice(start, start + size).join(' '));
      if (hit) return hit;
    }
  }
  if (tokens.length === 1) {
    for (const candidate of singularCandidates(tokens[0])) {
      const target = compoundTargets.find((k) => candidate.endsWith(k) && candidate !== k);
      if (target) return aliasToCanonical.get(target);
    }
  }
  return phrase;
}

export function isStaple(name) {
  return STAPLES.has(name);
}

export function suggestIngredients(prefix, limit = 8) {
  const p = typeof prefix === 'string' ? prefix.toLowerCase().trim() : '';
  if (!p) return [];
  const scored = new Map();
  for (const [name, canonical] of aliasToCanonical) {
    if (!name.startsWith(p)) continue;
    const score = name === canonical ? 0 : 1;
    if (!scored.has(canonical) || scored.get(canonical) > score) scored.set(canonical, score);
  }
  return [...scored].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'de')).slice(0, limit).map(([c]) => c);
}
