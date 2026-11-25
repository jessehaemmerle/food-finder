import { readFileSync } from 'node:fs';
import { normalizeIngredient } from './normalize.js';

const diet = JSON.parse(readFileSync(new URL('../../data/diet.json', import.meta.url), 'utf8'));

const tokensOf = (text) => text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
const excepted = (token, list) => list.some((e) => token.includes(e));

function tokenMatches(token, keyword) {
  return token === keyword || (keyword.length >= 5 && token.endsWith(keyword));
}

function hasAny({ tokens, phrases }, { words = [], stems = [], exceptions = [] }) {
  if (phrases.some((p) => stems.some((s) => s.includes(' ') && p.includes(s)))) return true;
  return tokens.some((token) => !excepted(token, exceptions) && (words.some((k) => tokenMatches(token, k)) || stems.some((s) => token.includes(s))));
}

export function dietFlags(ingredients, tags = []) {
  const entries = [...new Set((ingredients ?? []).filter((x) => typeof x === 'string' && x.trim()))];
  if (!entries.length) return { vegetarian: false, vegan: false, glutenFree: false, lactoseFree: false };
  // Check the normalised name (english -> german) and the raw words, so unmapped names are still caught.
  const phrases = entries.map((e) => e.toLowerCase());
  const tokens = [...new Set(entries.flatMap((e) => [...tokensOf(normalizeIngredient(e)), ...tokensOf(e)]))];
  const text = { tokens, phrases };
  const lowerTags = (tags ?? []).map((t) => String(t).toLowerCase());
  const tagged = (key) => diet.tags[key].some((k) => lowerTags.some((t) => t.includes(k)));
  const ex = diet.exceptions;
  const maybe = (key, { skipExceptions = false } = {}) => hasAny(text, { words: diet.maybe[key], exceptions: skipExceptions ? [] : ex.maybe });

  const animal = hasAny(text, { words: diet.meat, stems: diet.meatStems, exceptions: ex.meat })
    || hasAny(text, { words: diet.fish, stems: diet.fishStems })
    || hasAny(text, { words: diet.animal });
  const dairy = hasAny(text, { words: diet.dairy, stems: diet.dairyStems, exceptions: ex.dairy });
  const egg = hasAny(text, { words: diet.egg });
  const honey = hasAny(text, { words: diet.honey });
  const gluten = hasAny(text, { words: diet.gluten, stems: diet.glutenStems, exceptions: ex.gluten });

  const vegetarian = !animal && (!maybe('vegetarian') || tagged('vegetarian') || tagged('vegan'));
  const vegan = vegetarian && !dairy && !egg && !honey && (!maybe('vegan') || tagged('vegan'));
  const glutenFree = !gluten && (!maybe('glutenFree', { skipExceptions: true }) || tagged('glutenFree'));
  const lactoseFree = !dairy && (!maybe('lactoseFree') || tagged('lactoseFree') || tagged('vegan'));
  return { vegetarian, vegan, glutenFree, lactoseFree };
}
