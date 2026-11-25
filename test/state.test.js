import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, loadState, saveState, addIngredient, removeIngredient, toggleDevice, addCustomDevice, toggleFavorite, isFavorite, searchBody } from '../public/state.js';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

test('adding trims, ignores empty and duplicates (case-insensitive)', () => {
  let s = defaultState();
  s = addIngredient(s, '  Tomate ');
  s = addIngredient(s, 'tomate');
  s = addIngredient(s, '   ');
  assert.deepEqual(s.ingredients, ['Tomate']);
});

test('entries are cut to 60 characters and the list to 30 items', () => {
  let s = addIngredient(defaultState(), 'x'.repeat(100));
  assert.equal(s.ingredients[0].length, 60);
  s = defaultState();
  for (let i = 0; i < 40; i++) s = addIngredient(s, `zutat${i}`);
  assert.equal(s.ingredients.length, 30);
});

test('state functions do not mutate their input', () => {
  const s = defaultState();
  addIngredient(s, 'ei');
  toggleDevice(s, 'wok');
  assert.deepEqual(s.ingredients, []);
});

test('remove ingredient and toggle device', () => {
  let s = addIngredient(addIngredient(defaultState(), 'ei'), 'milch');
  s = removeIngredient(s, 'ei');
  assert.deepEqual(s.ingredients, ['milch']);
  assert.ok(!toggleDevice(toggleDevice(s, 'wok'), 'wok').devices.includes('wok'));
  assert.ok(toggleDevice(s, 'wok').devices.includes('wok'));
});

test('custom devices are trimmed, deduplicated and capped', () => {
  let s = addCustomDevice(defaultState(), ' Zauberstab ');
  s = addCustomDevice(s, 'zauberstab');
  assert.deepEqual(s.customDevices, ['Zauberstab']);
});

test('backofen is preselected by default', () => {
  assert.deepEqual(defaultState().devices, ['backofen']);
});

test('save and load roundtrip', () => {
  const storage = fakeStorage();
  const s = addIngredient(defaultState(), 'ei');
  saveState(storage, s);
  assert.deepEqual(loadState(storage).ingredients, ['ei']);
});

test('broken or foreign storage content falls back to the default state', () => {
  assert.deepEqual(loadState(fakeStorage({ 'food-finder:v1': '{kaputt' })), defaultState());
  assert.deepEqual(loadState(fakeStorage({ 'food-finder:v1': '"text"' })), defaultState());
  assert.deepEqual(loadState(fakeStorage({ 'food-finder:v1': JSON.stringify({ ingredients: 'x', devices: 5, favorites: [1, null] }) })), defaultState());
  assert.deepEqual(loadState({ getItem: () => { throw new Error('blocked'); } }), defaultState());
  assert.doesNotThrow(() => saveState({ setItem: () => { throw new Error('full'); } }, defaultState()));
});

test('loaded favorites with unsafe urls are dropped', () => {
  const stored = { favorites: [{ id: 'a', title: 'Gut', url: 'https://x.example/a', source: 's' }, { id: 'b', title: 'Böse', url: 'javascript:alert(1)', source: 's' }] };
  const s = loadState(fakeStorage({ 'food-finder:v1': JSON.stringify(stored) }));
  assert.deepEqual(s.favorites.map((f) => f.id), ['a']);
});

test('favorites toggle and keep a compact copy', () => {
  const recipe = { id: 'r1', title: 'Suppe', url: 'https://x.example/r1', source: 'stub', image: 'https://x.example/i.jpg', ingredients: [1, 2, 3], coverage: 1 };
  let s = toggleFavorite(defaultState(), recipe);
  assert.equal(isFavorite(s, 'r1'), true);
  assert.equal(s.favorites[0].ingredients, undefined);
  s = toggleFavorite(s, recipe);
  assert.equal(isFavorite(s, 'r1'), false);
});

test('search body contains only what the api expects', () => {
  let s = addIngredient(defaultState(), 'ei');
  s = { ...s, filters: { diet: { vegan: true }, maxTimeMin: 30, difficulty: 'einfach' } };
  assert.deepEqual(searchBody(s, { showBlocked: true }), {
    ingredients: ['ei'], devices: ['backofen'], customDevices: [], diet: { vegan: true }, maxTimeMin: 30, difficulty: 'einfach', showBlocked: true,
  });
  assert.equal('maxTimeMin' in searchBody(defaultState(), {}), false);
  assert.equal('difficulty' in searchBody(defaultState(), {}), false);
});
