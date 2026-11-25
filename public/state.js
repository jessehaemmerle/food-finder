export const STORAGE_KEY = 'food-finder:v1';
export const MAX_ENTRY = 60;
export const MAX_INGREDIENTS = 30;
export const MAX_DEVICES = 20;
export const MAX_FAVORITES = 100;

export const defaultState = () => ({
  ingredients: [],
  devices: ['backofen'],
  customDevices: [],
  filters: { diet: {}, maxTimeMin: null, difficulty: '' },
  favorites: [],
});

const clean = (text) => String(text ?? '').trim().slice(0, MAX_ENTRY);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const isHttps = (url) => typeof url === 'string' && url.startsWith('https://');

function addTo(list, value, max) {
  const text = clean(value);
  if (!text || list.some((x) => same(x, text)) || list.length >= max) return list;
  return [...list, text];
}

export const addIngredient = (state, name) => ({ ...state, ingredients: addTo(state.ingredients, name, MAX_INGREDIENTS) });
export const removeIngredient = (state, name) => ({ ...state, ingredients: state.ingredients.filter((x) => !same(x, name)) });
export const toggleDevice = (state, id) => ({
  ...state,
  devices: state.devices.includes(id) ? state.devices.filter((d) => d !== id) : [...state.devices, id],
});
export const addCustomDevice = (state, name) => ({ ...state, customDevices: addTo(state.customDevices, name, MAX_DEVICES) });
export const removeCustomDevice = (state, name) => ({ ...state, customDevices: state.customDevices.filter((x) => !same(x, name)) });

export const isFavorite = (state, id) => state.favorites.some((f) => f.id === id);

export function toggleFavorite(state, recipe) {
  if (isFavorite(state, recipe.id)) return { ...state, favorites: state.favorites.filter((f) => f.id !== recipe.id) };
  const copy = { id: recipe.id, title: recipe.title, url: recipe.url, source: recipe.source, image: recipe.image, language: recipe.language };
  return { ...state, favorites: [copy, ...state.favorites].slice(0, MAX_FAVORITES) };
}

const strings = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map(clean).filter(Boolean).slice(0, max) : []);

export function loadState(storage) {
  const fallback = defaultState();
  let raw;
  try { raw = JSON.parse(storage.getItem(STORAGE_KEY)); } catch { return fallback; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  return {
    ingredients: strings(raw.ingredients, MAX_INGREDIENTS),
    devices: Array.isArray(raw.devices) ? strings(raw.devices, MAX_DEVICES) : fallback.devices,
    customDevices: strings(raw.customDevices, MAX_DEVICES),
    filters: {
      diet: Object.fromEntries(['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'].map((k) => [k, filters.diet?.[k] === true]).filter(([, v]) => v)),
      maxTimeMin: typeof filters.maxTimeMin === 'number' && filters.maxTimeMin > 0 ? filters.maxTimeMin : null,
      difficulty: ['einfach', 'mittel', 'schwer'].includes(filters.difficulty) ? filters.difficulty : '',
    },
    favorites: (Array.isArray(raw.favorites) ? raw.favorites : [])
      .filter((f) => f && typeof f.id === 'string' && typeof f.title === 'string' && isHttps(f.url))
      .map((f) => ({ id: f.id, title: f.title, url: f.url, source: String(f.source ?? ''), image: isHttps(f.image) ? f.image : undefined, language: f.language === 'en' ? 'en' : 'de' }))
      .slice(0, MAX_FAVORITES),
  };
}

export function saveState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage may be blocked or full */ }
}

export function searchBody(state, { showBlocked = false } = {}) {
  const body = {
    ingredients: state.ingredients,
    devices: state.devices,
    customDevices: state.customDevices,
    diet: state.filters.diet,
    showBlocked,
  };
  if (state.filters.maxTimeMin) body.maxTimeMin = state.filters.maxTimeMin;
  if (state.filters.difficulty) body.difficulty = state.filters.difficulty;
  return body;
}
