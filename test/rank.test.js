import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecipes } from '../server/core/rank.js';

const recipe = (over = {}) => ({
  id: 'r1', source: 'test', title: 'Tomatensuppe', url: 'https://example.com/1', language: 'de', tags: [],
  ingredients: [{ raw: '2 Tomaten', name: 'Tomaten' }, { raw: '1 Zwiebel', name: 'Zwiebel' }],
  ...over,
});
const query = (over = {}) => ({ ingredients: ['tomate', 'zwiebel'], devices: [], customDevices: [], diet: {}, ...over });

test('recipes below 50 percent coverage are removed', () => {
  const r = recipe({ ingredients: [{ raw: 'a', name: 'Tomate' }, { raw: 'b', name: 'Zwiebel' }, { raw: 'c', name: 'Lachs' }, { raw: 'd', name: 'Reis' }] });
  assert.equal(rankRecipes([r], query({ ingredients: ['tomate'] })).recipes.length, 0);
  assert.equal(rankRecipes([r], query({ ingredients: ['tomate', 'zwiebel'] })).recipes.length, 1);
});

test('result carries coverage, have, missing', () => {
  const [r] = rankRecipes([recipe()], query({ ingredients: ['tomate'] })).recipes;
  assert.equal(r.coverage, 0.5);
  assert.deepEqual(r.have, ['tomate']);
  assert.deepEqual(r.missing, ['zwiebel']);
});

test('required missing device hides the recipe and counts it', () => {
  const r = recipe({ title: 'Suppe aus dem Thermomix' });
  const out = rankRecipes([r], query());
  assert.equal(out.recipes.length, 0);
  assert.equal(out.hiddenByDevice, 1);
});

test('showBlocked reveals blocked recipe with missingDevices', () => {
  const r = recipe({ title: 'Suppe aus dem Thermomix' });
  const out = rankRecipes([r], query({ showBlocked: true }));
  assert.equal(out.recipes.length, 1);
  assert.deepEqual(out.recipes[0].missingDevices, ['thermomix']);
});

test('owned device gives bonus that wins at equal coverage', () => {
  const plain = recipe({ id: 'a', title: 'Suppe A' });
  const mixed = recipe({ id: 'b', title: 'Suppe B', steps: ['Mit dem Stabmixer pürieren'] });
  const out = rankRecipes([plain, mixed], query({ devices: ['stabmixer'] }));
  assert.deepEqual(out.recipes.map((x) => x.id), ['b', 'a']);
});

test('max time filters known times and keeps unknown ones', () => {
  const slow = recipe({ id: 's', title: 'Slow', timeMin: 45 });
  const quick = recipe({ id: 'q', title: 'Quick', timeMin: 20 });
  const unknown = recipe({ id: 'u', title: 'Unknown' });
  const out = rankRecipes([slow, quick, unknown], query({ maxTimeMin: 30 }));
  assert.deepEqual(out.recipes.map((x) => x.id).sort(), ['q', 'u']);
  assert.equal(out.recipes.find((x) => x.id === 'u').unknown.time, true);
  assert.equal(out.recipes.find((x) => x.id === 'q').unknown.time, false);
});

test('difficulty is a maximum', () => {
  const hard = recipe({ id: 'h', title: 'Hard', difficulty: 'schwer' });
  const easy = recipe({ id: 'e', title: 'Easy', difficulty: 'einfach' });
  const out = rankRecipes([hard, easy], query({ difficulty: 'einfach' }));
  assert.deepEqual(out.recipes.map((x) => x.id), ['e']);
});

test('vegan filter removes cheese recipe', () => {
  const cheese = recipe({ id: 'c', title: 'Käse', ingredients: [{ raw: 'Käse', name: 'Käse' }, { raw: 'Tomate', name: 'Tomate' }] });
  const veg = recipe({ id: 'v', title: 'Gemüse' });
  const out = rankRecipes([cheese, veg], query({ ingredients: ['käse', 'tomate', 'zwiebel'], diet: { vegan: true } }));
  assert.deepEqual(out.recipes.map((x) => x.id), ['v']);
});

test('duplicates by source and title are merged', () => {
  const out = rankRecipes([recipe({ id: '1' }), recipe({ id: '2', title: 'TOMATENSUPPE' })], query());
  assert.equal(out.recipes.length, 1);
});

test('recipes without usable ingredients are dropped', () => {
  assert.equal(rankRecipes([recipe({ ingredients: [] })], query()).recipes.length, 0);
  assert.equal(rankRecipes([recipe({ ingredients: [{ raw: '', name: '' }] })], query()).recipes.length, 0);
});

test('higher coverage first, then shorter time', () => {
  const half = recipe({ id: 'h', title: 'Half', ingredients: [{ raw: 'a', name: 'Tomate' }, { raw: 'b', name: 'Lachs' }] });
  const full = recipe({ id: 'f', title: 'Full', timeMin: 60 });
  const fullFast = recipe({ id: 'ff', title: 'FullFast', timeMin: 10 });
  const out = rankRecipes([half, full, fullFast], query());
  assert.deepEqual(out.recipes.map((x) => x.id), ['ff', 'f', 'h']);
});
