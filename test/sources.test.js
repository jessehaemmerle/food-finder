import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipeJsonLd } from '../server/sources/jsonld.js';
import { themealdb } from '../server/sources/themealdb.js';
import { kuechengoetter } from '../server/sources/kuechengoetter.js';
import { einfachkochen } from '../server/sources/einfachkochen.js';
import { chefkoch } from '../server/sources/chefkoch.js';
import { defaultSources } from '../server/sources/index.js';
import { HttpError } from '../server/lib/http.js';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const ld = (obj) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

test('parses the Küchengötter recipe fixture', () => {
  const r = parseRecipeJsonLd(fx('kuechengoetter-recipe.html'), 'https://www.kuechengoetter.de/rezepte/x-1', { source: 'kuechengoetter' });
  assert.equal(r.title, 'Buntes Ofengemüse mit Kartoffeln');
  assert.ok(r.ingredients.length >= 5);
  assert.equal(r.url, 'https://www.kuechengoetter.de/rezepte/x-1');
  assert.equal(r.language, 'de');
  assert.equal(r.source, 'kuechengoetter');
  assert.equal(r.steps, undefined);
});

test('parses the einfachkochen fixture with @graph and ISO duration', () => {
  const r = parseRecipeJsonLd(fx('einfachkochen-recipe.html'), 'https://www.einfachkochen.de/rezepte/x', { source: 'einfachkochen' });
  assert.match(r.title, /Kartoffelgratin/);
  assert.equal(r.timeMin, 80);
  assert.ok(r.ingredients.length >= 3);
  assert.ok(r.image === undefined || r.image.startsWith('https://'));
});

test('html without recipe json-ld gives null', () => {
  assert.equal(parseRecipeJsonLd('<html><body>hi</body></html>', 'https://x'), null);
  assert.equal(parseRecipeJsonLd('<script type="application/ld+json">{kaputt</script>', 'https://x'), null);
  assert.equal(parseRecipeJsonLd(ld({ '@type': 'Recipe', name: 'Leer', recipeIngredient: [] }), 'https://x'), null);
});

test('duration formats and @type arrays', () => {
  const base = { '@type': ['Recipe', 'Thing'], name: 'T', recipeIngredient: ['1 Ei'] };
  assert.equal(parseRecipeJsonLd(ld({ ...base, totalTime: 'PT1H15M' }), 'u').timeMin, 75);
  assert.equal(parseRecipeJsonLd(ld({ ...base, totalTime: 'PT45M' }), 'u').timeMin, 45);
  assert.equal(parseRecipeJsonLd(ld({ ...base, totalTime: 'P0DT0H30M' }), 'u').timeMin, 30);
  assert.equal(parseRecipeJsonLd(ld({ ...base, totalTime: 'kaputt' }), 'u').timeMin, undefined);
});

test('image forms and unsafe image urls', () => {
  const base = { '@type': 'Recipe', name: 'T', recipeIngredient: ['1 Ei'] };
  assert.equal(parseRecipeJsonLd(ld({ ...base, image: 'https://a.example/i.jpg' }), 'u').image, 'https://a.example/i.jpg');
  assert.equal(parseRecipeJsonLd(ld({ ...base, image: { url: 'https://a.example/o.jpg' } }), 'u').image, 'https://a.example/o.jpg');
  assert.equal(parseRecipeJsonLd(ld({ ...base, image: ['https://a.example/l.jpg'] }), 'u').image, 'https://a.example/l.jpg');
  assert.equal(parseRecipeJsonLd(ld({ ...base, image: 'javascript:alert(1)' }), 'u').image, undefined);
  assert.equal(parseRecipeJsonLd(ld({ ...base, image: 'http://a.example/i.jpg' }), 'u').image, undefined);
});

test('markup inside titles and ingredients is reduced to plain text', () => {
  const r = parseRecipeJsonLd(ld({ '@type': 'Recipe', name: '<img src=x onerror=alert(1)>Suppe &amp; Brot', recipeIngredient: ['1 <b>Ei</b>'] }), 'u');
  assert.equal(r.title, 'Suppe & Brot');
  assert.equal(r.ingredients[0].raw, '1 Ei');
});

const mealdbStub = (calls = []) => ({
  fetchJson: async (url) => {
    calls.push(url);
    if (url.includes('filter.php')) return JSON.parse(fx('mealdb-filter.json'));
    const id = new URL(url).searchParams.get('i');
    const doc = JSON.parse(fx('mealdb-lookup.json'));
    doc.meals[0].idMeal = id;
    return doc;
  },
});

test('TheMealDB maps lookup details to the common model', async () => {
  const recipes = await themealdb.search({ ingredients: ['hähnchenbrust'] }, mealdbStub());
  assert.ok(recipes.length > 0 && recipes.length <= 12);
  const r = recipes[0];
  assert.equal(r.source, 'themealdb');
  assert.equal(r.language, 'en');
  assert.ok(r.id.startsWith('themealdb:'));
  assert.ok(r.url.startsWith('https://www.themealdb.com/'));
  assert.ok(r.ingredients.some((i) => i.name === 'Onions' && /chopped/.test(i.raw)));
  assert.ok(r.steps.length >= 1);
  assert.ok(r.image.startsWith('https://'));
});

test('TheMealDB only queries ingredients it knows and skips staples', async () => {
  const calls = [];
  await themealdb.search({ ingredients: ['salz', 'hähnchenbrust', 'drachenfrucht'] }, mealdbStub(calls));
  const filters = calls.filter((c) => c.includes('filter.php'));
  assert.equal(filters.length, 1);
  assert.match(filters[0], /i=Chicken_Breast/);
});

test('TheMealDB with nothing queryable returns an empty list without network', async () => {
  const calls = [];
  assert.deepEqual(await themealdb.search({ ingredients: ['drachenfrucht'] }, mealdbStub(calls)), []);
  assert.equal(calls.length, 0);
});

test('TheMealDB null result is an empty list', async () => {
  const ctx = { fetchJson: async () => ({ meals: null }) };
  assert.deepEqual(await themealdb.search({ ingredients: ['hähnchenbrust'] }, ctx), []);
});

function siteStub(searchFixture, recipeFixture, urls = []) {
  return {
    fetchText: async (url) => {
      urls.push(url);
      return /\/suche/.test(url) ? fx(searchFixture) : fx(recipeFixture);
    },
  };
}

test('Küchengötter search follows recipe links only and parses pages', async () => {
  const urls = [];
  const recipes = await kuechengoetter.search({ ingredients: ['kartoffel', 'zwiebel'] }, siteStub('kuechengoetter-search.html', 'kuechengoetter-recipe.html', urls));
  const pages = urls.filter((u) => !/\/suche/.test(u));
  assert.ok(pages.length > 0 && pages.length <= 8);
  assert.ok(pages.every((u) => /^https:\/\/www\.kuechengoetter\.de\/rezepte\/.+-\d+$/.test(u)), pages.join('\n'));
  assert.ok(urls[0].includes('/suche/'));
  assert.ok(recipes.length > 0);
  assert.equal(recipes[0].source, 'kuechengoetter');
});

test('einfachkochen search follows recipe links only', async () => {
  const urls = [];
  const recipes = await einfachkochen.search({ ingredients: ['kartoffel'] }, siteStub('einfachkochen-search.html', 'einfachkochen-recipe.html', urls));
  const pages = urls.filter((u) => !u.includes('/suche'));
  assert.ok(pages.length > 0);
  assert.ok(pages.every((u) => /^https:\/\/www\.einfachkochen\.de\/rezepte\/[a-z0-9-]+$/.test(u)), pages.join('\n'));
  assert.ok(recipes.length > 0);
});

test('layout change on the search page gives an empty list, not a crash', async () => {
  const ctx = { fetchText: async () => '<html><body>nichts</body></html>' };
  assert.deepEqual(await kuechengoetter.search({ ingredients: ['kartoffel'] }, ctx), []);
});

test('failing recipe pages are skipped but a failing search page throws', async () => {
  let n = 0;
  const partial = { fetchText: async (url) => { if (/\/suche/.test(url)) return fx('kuechengoetter-search.html'); if (n++ % 2) throw new HttpError('HTTP 500', { status: 500 }); return fx('kuechengoetter-recipe.html'); } };
  assert.ok((await kuechengoetter.search({ ingredients: ['kartoffel'] }, partial)).length > 0);
  const down = { fetchText: async () => { throw new HttpError('HTTP 403', { status: 403 }); } };
  await assert.rejects(chefkoch.search({ ingredients: ['kartoffel'] }, down), (e) => e.status === 403);
});

test('sources without usable ingredients do nothing', async () => {
  const ctx = { fetchText: async () => { throw new Error('should not be called'); }, fetchJson: async () => { throw new Error('should not be called'); } };
  assert.deepEqual(await kuechengoetter.search({ ingredients: ['salz'] }, ctx), []);
});

test('default sources', () => {
  assert.deepEqual(defaultSources().map((s) => s.id), ['themealdb', 'kuechengoetter', 'einfachkochen', 'chefkoch']);
});
