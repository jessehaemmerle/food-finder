import { matchRecipe } from './match.js';
import { normalizeIngredient } from './normalize.js';
import { detectDevices, deviceVerdict } from './devices.js';
import { dietFlags } from './diet.js';

export const MIN_COVERAGE = 0.5;
const DIFFICULTY_ORDER = { einfach: 0, mittel: 1, schwer: 2 };
function estimateDifficulty(recipe, ingredientCount) {
  const minutes = recipe.timeMin ?? 0;
  if (ingredientCount <= 8 && minutes <= 40) return 'einfach';
  if (ingredientCount <= 14 && minutes <= 90) return 'mittel';
  return 'schwer';
}

const DIET_KEYS = ['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'];

function dedupe(recipes) {
  const seen = new Set();
  return recipes.filter((r) => {
    const key = `${r.source}|${String(r.title).trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function passesDiet(flags, wanted = {}) {
  return DIET_KEYS.every((k) => !wanted[k] || flags[k]);
}

export function rankRecipes(recipes, query) {
  const ranked = [];
  let hiddenByDevice = 0;
  for (const recipe of dedupe(recipes ?? [])) {
    const ingredients = (recipe.ingredients ?? []).filter((i) => normalizeIngredient(i.name || i.raw));
    if (!ingredients.length) continue;
    const match = matchRecipe(ingredients, query.ingredients);
    if (match.coverage < MIN_COVERAGE) continue;
    const flags = dietFlags(ingredients.flatMap((i) => [i.name, i.raw]), recipe.tags);
    if (!passesDiet(flags, query.diet)) continue;
    if (query.maxTimeMin != null && recipe.timeMin != null && recipe.timeMin > query.maxTimeMin) continue;
    const difficulty = recipe.difficulty ?? estimateDifficulty(recipe, ingredients.length);
    if (query.difficulty && DIFFICULTY_ORDER[difficulty] > (DIFFICULTY_ORDER[query.difficulty] ?? 2)) continue;

    const text = [recipe.title, ...(recipe.steps ?? [])].join('\n');
    const devices = detectDevices(text);
    const verdict = deviceVerdict(devices, query.devices, query.customDevices, text);
    if (verdict.blocked && !query.showBlocked) { hiddenByDevice++; continue; }

    ranked.push({
      ...recipe,
      ingredients,
      coverage: match.coverage,
      have: match.have,
      missing: match.missing,
      devices,
      missingDevices: verdict.missingDevices,
      deviceBonus: verdict.bonus,
      diet: flags,
      difficulty,
      difficultyEstimated: !recipe.difficulty,
      unknown: { time: recipe.timeMin == null, difficulty: false },
    });
  }
  ranked.sort((a, b) =>
    b.coverage - a.coverage ||
    b.deviceBonus - a.deviceBonus ||
    (a.timeMin ?? Infinity) - (b.timeMin ?? Infinity),
  );
  return { recipes: ranked, hiddenByDevice };
}
