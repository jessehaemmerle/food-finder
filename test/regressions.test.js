import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIngredient } from '../server/core/normalize.js';
import { dietFlags } from '../server/core/diet.js';
import { detectDevices, deviceVerdict } from '../server/core/devices.js';
import { rankRecipes } from '../server/core/rank.js';

test('seitan stays its own ingredient and is not gluten free', () => {
  assert.equal(normalizeIngredient('Seitan'), 'seitan');
  assert.equal(dietFlags(['Seitan', 'Tomate', 'Zwiebel']).glutenFree, false);
});

test('compound fallback does not turn unrelated words into common ingredients', () => {
  for (const [input, wrong] of [['Meerrettich', 'radieschen'], ['Granatapfel', 'apfel'], ['Bärlauch', 'lauch'], ['Sojasahne', 'sahne'], ['Hafersahne', 'sahne'], ['Kokosjoghurt', 'joghurt'], ['Rosenwasser', 'wasser'], ['Kakaobutter', 'butter'], ['Reismilch', 'milch'], ['Ingwersirup', 'ahornsirup']]) {
    assert.notEqual(normalizeIngredient(input), wrong, input);
  }
});

test('safe compounds still resolve', () => {
  assert.equal(normalizeIngredient('Kirschtomaten'), 'tomate');
  assert.equal(normalizeIngredient('Grünkohl'), 'kohl');
  assert.equal(normalizeIngredient('Speisekartoffeln'), 'kartoffel');
});

test('animal products under unmapped names are not vegetarian', () => {
  for (const name of ['Veal', 'Lard', 'Suet', 'Anchovies', 'Kidney', 'Black Pudding', 'Clams', 'Monkfish', 'Oyster Sauce', 'Mortadella', 'Kalbsfond', 'Fischfond', 'Leberkäse', 'Frikadellen', 'Kassler', 'Gyros']) {
    assert.equal(dietFlags([name, 'Tomate']).vegetarian, false, name);
  }
});

test('gluten under unmapped names is not gluten free', () => {
  for (const name of ['Barley', 'Graupen', 'Zwieback', 'Kekse', 'Cracker', 'Maultaschen', 'Croutons', 'Beer', 'Brioche']) {
    assert.equal(dietFlags([name, 'Tomate']).glutenFree, false, name);
  }
  assert.equal(dietFlags(['Himbeeren', 'Reis']).glutenFree, true);
});

test('dairy under unmapped names is not lactose free', () => {
  for (const name of ['Stilton', 'Paneer', 'Custard', 'Hüttenkäse']) {
    assert.equal(dietFlags([name, 'Tomate']).lactoseFree, false, name);
  }
});

test('plant based look-alikes stay vegan, vegetable stock stays vegetarian', () => {
  assert.equal(dietFlags(['Hafersahne', 'Tomate']).vegan, true);
  assert.equal(dietFlags(['Kokosjoghurt', 'Tomate']).vegan, true);
  assert.equal(dietFlags(['Kokosjoghurt', 'Tomate']).lactoseFree, true);
  assert.equal(dietFlags(['Gemüsebrühe', 'Tomate']).vegetarian, true);
  assert.equal(dietFlags(['Hühnerbrühe', 'Tomate']).vegetarian, false);
});

const verdict = (text, owned = []) => deviceVerdict(detectDevices(text), owned, [], text);

test('alternatives do not make a device required', () => {
  assert.equal(verdict('Blend in a blender or food processor', ['standmixer']).blocked, false);
  assert.equal(verdict('Im Ofen oder in der Mikrowelle erhitzen.').blocked, false);
  assert.equal(verdict('Alternatively, microwave for 2 minutes.').blocked, false);
  assert.equal(verdict('Kann auch im Slow Cooker gegart werden.').blocked, false);
  assert.equal(verdict('In einer Pfanne oder im Wok braten.').blocked, false);
});

test('an alternative in one sentence does not excuse another sentence', () => {
  assert.equal(verdict('Im Ofen oder in der Mikrowelle erhitzen. Danach im Thermomix pürieren.').blocked, true);
});

test('british "grill" is not a barbecue, electric mixer is not a stand mixer', () => {
  assert.equal(verdict('Preheat the grill. Place under a hot grill for 5 minutes.').blocked, false);
  assert.equal(verdict('Cook on the barbecue for 10 minutes.').blocked, true);
  assert.equal(verdict('Use an electric mixer to whisk the eggs.').blocked, false);
});

const recipe = (over = {}) => ({
  id: 'r', source: 's', title: 'Nudeln', url: 'https://x.example/r', language: 'de', tags: [],
  ingredients: [{ raw: '200 g Wok-Nudeln', name: 'Wok-Nudeln' }, { raw: '1 Zwiebel', name: 'Zwiebel' }], ...over,
});

test('ingredient lines never count as device mentions', () => {
  const out = rankRecipes([recipe()], { ingredients: ['nudeln', 'zwiebel'], devices: [], customDevices: [], diet: {} });
  assert.equal(out.recipes.length, 1);
  assert.equal(out.hiddenByDevice, 0);
});

const many = (n) => Array.from({ length: n }, (_, i) => ({ raw: `z${i}`, name: `z${i}` }));
const owns = (n) => Array.from({ length: n }, (_, i) => `z${i}`);

test('difficulty filter works on an estimate when the source gives none', () => {
  const simple = recipe({ id: 'simple', title: 'Simple', timeMin: 20, ingredients: many(5) });
  const hard = recipe({ id: 'hard', title: 'Hard', timeMin: 150, ingredients: many(20) });
  const q = { ingredients: owns(20), devices: [], customDevices: [], diet: {} };
  const easy = rankRecipes([simple, hard], { ...q, difficulty: 'einfach' }).recipes;
  assert.deepEqual(easy.map((r) => r.id), ['simple']);
  assert.equal(easy[0].difficulty, 'einfach');
  assert.equal(easy[0].difficultyEstimated, true);
  assert.equal(easy[0].unknown.difficulty, false);
  assert.equal(rankRecipes([simple, hard], { ...q, difficulty: 'schwer' }).recipes.length, 2);
});

test('a difficulty given by the source wins over the estimate', () => {
  const r = recipe({ id: 'g', title: 'Given', difficulty: 'schwer', timeMin: 10, ingredients: many(3) });
  const out = rankRecipes([r], { ingredients: owns(3), devices: [], customDevices: [], diet: {}, difficulty: 'einfach' });
  assert.equal(out.recipes.length, 0);
});
