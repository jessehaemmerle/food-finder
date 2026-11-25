import { readFileSync } from 'node:fs';
import { normalizeIngredient, isStaple } from '../core/normalize.js';

const names = JSON.parse(readFileSync(new URL('../../data/mealdb-names.json', import.meta.url), 'utf8'));
const BASE = 'https://www.themealdb.com/api/json/v1/1';
const MAX_INGREDIENT_QUERIES = 5;
const MAX_RECIPES = 12;

function mealdbIngredients(ingredients) {
  const owned = [...new Set((ingredients ?? []).map(normalizeIngredient).filter((n) => n && !isStaple(n)))];
  return owned.flatMap((n) => [names[n] ?? []].flat()).slice(0, MAX_INGREDIENT_QUERIES);
}

function toRecipe(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = String(meal[`strIngredient${i}`] ?? '').trim();
    if (!name) continue;
    ingredients.push({ raw: `${String(meal[`strMeasure${i}`] ?? '').trim()} ${name}`.trim(), name });
  }
  const steps = String(meal.strInstructions ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(step\s*)?\d+[.:]?$/i.test(s));
  const image = typeof meal.strMealThumb === 'string' && meal.strMealThumb.startsWith('https://') ? meal.strMealThumb : undefined;
  const tags = [meal.strCategory, meal.strArea, ...String(meal.strTags ?? '').split(',')].map((t) => String(t ?? '').trim()).filter(Boolean);
  return {
    id: `themealdb:${meal.idMeal}`,
    source: 'themealdb',
    title: String(meal.strMeal ?? '').trim(),
    url: `https://www.themealdb.com/meal/${encodeURIComponent(meal.idMeal)}`,
    image,
    ingredients,
    language: 'en',
    steps,
    tags,
  };
}

export const themealdb = {
  id: 'themealdb',
  label: 'TheMealDB',
  async search(query, ctx) {
    const wanted = mealdbIngredients(query.ingredients);
    if (!wanted.length) return [];
    const lists = await Promise.allSettled(wanted.map((n) => ctx.fetchJson(`${BASE}/filter.php?i=${encodeURIComponent(n.replace(/ /g, '_'))}`)));
    const ok = lists.filter((l) => l.status === 'fulfilled');
    if (!ok.length) throw lists[0].reason;
    const counts = new Map();
    for (const { value } of ok) for (const m of value?.meals ?? []) counts.set(m.idMeal, (counts.get(m.idMeal) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_RECIPES).map(([id]) => id);
    const details = await Promise.allSettled(top.map((id) => ctx.fetchJson(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`)));
    return details.flatMap((d) => (d.status === 'fulfilled' && d.value?.meals?.[0] ? [toRecipe(d.value.meals[0])] : []));
  },
};
