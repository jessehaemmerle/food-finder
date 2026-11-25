import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIngredient, isStaple, suggestIngredients } from '../server/core/normalize.js';

test('strips quantity and unit', () => {
  assert.equal(normalizeIngredient('2 EL Olivenöl'), 'olivenöl');
  assert.equal(normalizeIngredient('200g Nudeln'), 'nudeln');
  assert.equal(normalizeIngredient('1/2 Bund Petersilie'), 'petersilie');
});

test('cuts descriptions after a comma and in brackets', () => {
  assert.equal(normalizeIngredient('Käse, gerieben'), 'käse');
  assert.equal(normalizeIngredient('Tomaten (Dose)'), 'tomate');
});

test('maps english names to german canonical names', () => {
  assert.equal(normalizeIngredient('chicken breast'), 'hähnchenbrust');
  assert.equal(normalizeIngredient('2 cups Chicken Breast Fillets'), 'hähnchenbrust');
  assert.equal(normalizeIngredient('Onions'), 'zwiebel');
});

test('handles plural, umlauts and case', () => {
  assert.equal(normalizeIngredient('Tomaten'), 'tomate');
  assert.equal(normalizeIngredient('KARTOFFELN'), 'kartoffel');
  assert.equal(normalizeIngredient('Hühnereier'), 'ei');
  assert.equal(normalizeIngredient('Rote Zwiebel'), 'zwiebel');
});

test('unknown ingredient stays as lowercase text', () => {
  assert.equal(normalizeIngredient('Drachenfrucht'), 'drachenfrucht');
});

test('empty or junk input gives empty string', () => {
  assert.equal(normalizeIngredient(''), '');
  assert.equal(normalizeIngredient('   '), '');
  assert.equal(normalizeIngredient('200 g'), '');
  assert.equal(normalizeIngredient(null), '');
});

test('staples', () => {
  for (const s of ['salz', 'pfeffer', 'öl', 'olivenöl', 'wasser', 'zucker', 'mehl']) assert.equal(isStaple(s), true, s);
  assert.equal(isStaple('tomate'), false);
});

test('suggestions match german and english prefixes and return german names', () => {
  assert.ok(suggestIngredients('tom').includes('tomate'));
  assert.ok(suggestIngredients('chick').includes('hähnchenbrust') || suggestIngredients('chick').includes('huhn'));
  assert.equal(suggestIngredients('').length, 0);
  assert.ok(suggestIngredients('t', 3).length <= 3);
});
