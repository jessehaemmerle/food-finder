import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecipe } from '../server/core/match.js';

const ing = (...names) => names.map((n) => ({ raw: n, name: n }));

test('coverage ignores staples and lists missing', () => {
  const r = matchRecipe(ing('Tomate', 'Zwiebel', 'Salz'), ['tomate']);
  assert.equal(r.coverage, 0.5);
  assert.deepEqual(r.have, ['tomate']);
  assert.deepEqual(r.missing, ['zwiebel']);
});

test('owned items are normalised too', () => {
  const r = matchRecipe(ing('2 Zwiebeln', 'chicken breast'), ['Zwiebel', 'Hähnchenbrust']);
  assert.equal(r.coverage, 1);
});

test('empty ingredient list gives coverage 0', () => {
  assert.equal(matchRecipe([], ['tomate']).coverage, 0);
});

test('only staples gives coverage 0', () => {
  assert.equal(matchRecipe(ing('Salz', 'Wasser'), ['salz']).coverage, 0);
});

test('duplicates count once', () => {
  const r = matchRecipe(ing('Tomate', 'Tomaten', 'Zwiebel'), ['tomate']);
  assert.equal(r.coverage, 0.5);
});
