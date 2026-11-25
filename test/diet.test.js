import test from 'node:test';
import assert from 'node:assert/strict';
import { dietFlags } from '../server/core/diet.js';

test('pasta and tomato is vegan but not gluten free', () => {
  const f = dietFlags(['nudeln', 'tomate']);
  assert.equal(f.vegetarian, true);
  assert.equal(f.vegan, true);
  assert.equal(f.glutenFree, false);
  assert.equal(f.lactoseFree, true);
});

test('chicken is not vegetarian', () => {
  const f = dietFlags(['hähnchenbrust', 'reis']);
  assert.equal(f.vegetarian, false);
  assert.equal(f.vegan, false);
});

test('cheese is vegetarian but neither vegan nor lactose free', () => {
  const f = dietFlags(['käse', 'tomate']);
  assert.equal(f.vegetarian, true);
  assert.equal(f.vegan, false);
  assert.equal(f.lactoseFree, false);
});

test('rice and vegetables satisfy all four', () => {
  assert.deepEqual(dietFlags(['reis', 'karotte', 'zucchini']), { vegetarian: true, vegan: true, glutenFree: true, lactoseFree: true });
});

test('egg and honey are not vegan but vegetarian', () => {
  assert.equal(dietFlags(['ei', 'mehl']).vegan, false);
  assert.equal(dietFlags(['honig', 'reis']).vegan, false);
  assert.equal(dietFlags(['honig', 'reis']).vegetarian, true);
});

test('plant milks and coconut milk are not dairy', () => {
  assert.equal(dietFlags(['pflanzenmilch', 'haferflocken']).vegan, true);
  assert.equal(dietFlags(['kokosmilch', 'reis']).lactoseFree, true);
});

test('unnormalised german compounds are still caught', () => {
  assert.equal(dietFlags(['Rinderhackfleisch']).vegetarian, false);
  assert.equal(dietFlags(['Weizenmehl']).glutenFree, false);
});

test('empty ingredient list gives all false, tags cannot override ingredients', () => {
  assert.deepEqual(dietFlags([], ['Vegan']), { vegetarian: false, vegan: false, glutenFree: false, lactoseFree: false });
  assert.equal(dietFlags(['hähnchenbrust'], ['Vegetarian']).vegetarian, false);
});

test('tag may confirm a free-from claim only when ingredients do not contradict', () => {
  assert.equal(dietFlags(['reis', 'sojasauce'], ['Gluten Free']).glutenFree, true);
  assert.equal(dietFlags(['reis', 'sojasauce']).glutenFree, false);
});
