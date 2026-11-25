import { readFileSync } from 'node:fs';
import { normalizeIngredient } from './normalize.js';

const diet = JSON.parse(readFileSync(new URL('../../data/diet.json', import.meta.url), 'utf8'));

function tokenMatches(token, keyword) {
  return token === keyword || (keyword.length >= 5 && token.endsWith(keyword));
}

function hasAny(names, keywords, { stems = false } = {}) {
  return names.some((name) =>
    name.split(/\s+/).some((token) => {
      if (diet.plantBasedExceptions.some((e) => token.includes(e))) return false;
      return keywords.some((k) => (stems && k.length >= 5 ? token.includes(k) : tokenMatches(token, k)));
    }),
  );
}

export function dietFlags(ingredientNames, tags = []) {
  const names = [...new Set((ingredientNames ?? []).map(normalizeIngredient).filter(Boolean))];
  if (!names.length) return { vegetarian: false, vegan: false, glutenFree: false, lactoseFree: false };
  const lowerTags = (tags ?? []).map((t) => String(t).toLowerCase());
  const tagged = (key) => diet.tags[key].some((k) => lowerTags.some((t) => t.includes(k)));
  const meat = hasAny(names, diet.meat) || hasAny(names, diet.fish) || hasAny(names, diet.animal);
  const dairy = hasAny(names, diet.dairy);
  const egg = hasAny(names, diet.egg);
  const honey = hasAny(names, diet.honey);
  const vegetarian = !meat && (!hasAny(names, diet.maybe.vegetarian) || tagged('vegetarian') || tagged('vegan'));
  const vegan = vegetarian && !dairy && !egg && !honey && (!hasAny(names, diet.maybe.vegan) || tagged('vegan'));
  const glutenFree =
    !hasAny(names, diet.gluten) && !hasAny(names, diet.glutenStems, { stems: true }) &&
    (!hasAny(names, diet.maybe.glutenFree) || tagged('glutenFree'));
  const lactoseFree = !dairy && (!hasAny(names, diet.maybe.lactoseFree) || tagged('lactoseFree') || tagged('vegan'));
  return { vegetarian, vegan, glutenFree, lactoseFree };
}
