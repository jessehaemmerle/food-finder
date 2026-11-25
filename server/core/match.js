import { normalizeIngredient, isStaple } from './normalize.js';

const words = (s) => s.split(/\s+/);

function sameIngredient(a, b) {
  return a === b || words(a).includes(b) || words(b).includes(a);
}

export function matchRecipe(recipeIngredients, owned) {
  const ownedNames = [...new Set((owned ?? []).map(normalizeIngredient).filter(Boolean))];
  const needed = [...new Set((recipeIngredients ?? []).map((i) => normalizeIngredient(i.name || i.raw)).filter((n) => n && !isStaple(n)))];
  const have = needed.filter((n) => ownedNames.some((o) => sameIngredient(n, o)));
  const missing = needed.filter((n) => !have.includes(n));
  return { have, missing, coverage: needed.length ? have.length / needed.length : 0 };
}
