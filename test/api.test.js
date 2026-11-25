import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

const recipe = (over = {}) => ({
  id: 'r1', source: 'stub', title: 'Tomatensuppe', url: 'https://example.com/1', language: 'de', tags: [],
  ingredients: [{ raw: '2 Tomaten', name: 'Tomaten' }, { raw: '1 Zwiebel', name: 'Zwiebel' }], ...over,
});
const okSource = (id = 'stub', recipes = [recipe()]) => ({ id, label: id.toUpperCase(), search: async () => recipes });
const failing = (id = 'bad') => ({ id, label: id, search: async () => { throw new Error('kaputt'); } });
const hanging = { id: 'slow', label: 'Slow', search: () => new Promise(() => {}) };

async function withApp(deps, fn) {
  const server = createApp(deps).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, path = '/api/search') => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try { return await fn({ base, post }); } finally { server.close(); }
}
const valid = { ingredients: ['tomate', 'zwiebel'] };

test('search returns ranked recipes and per-source status', async () => {
  await withApp({ sources: [okSource()] }, async ({ post }) => {
    const r = await post(valid);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.recipes.length, 1);
    assert.equal(body.recipes[0].coverage, 1);
    assert.deepEqual(body.sources, [{ id: 'stub', label: 'STUB', ok: true, count: 1 }]);
    assert.equal(body.hiddenByDevice, 0);
  });
});

test('one failing source does not hide the others', async () => {
  await withApp({ sources: [failing(), okSource()] }, async ({ post }) => {
    const body = await (await post(valid)).json();
    assert.equal(body.recipes.length, 1);
    const bad = body.sources.find((s) => s.id === 'bad');
    assert.equal(bad.ok, false);
    assert.ok(bad.error);
  });
});

test('all sources failing gives 200 with empty list and ok=false everywhere', async () => {
  await withApp({ sources: [failing('a'), failing('b')] }, async ({ post }) => {
    const r = await post(valid);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body.recipes, []);
    assert.ok(body.sources.every((s) => s.ok === false));
  });
});

test('a hanging source times out', async () => {
  await withApp({ sources: [hanging, okSource()], sourceTimeoutMs: 50 }, async ({ post }) => {
    const body = await (await post(valid)).json();
    assert.equal(body.sources.find((s) => s.id === 'slow').ok, false);
    assert.equal(body.recipes.length, 1);
  });
});

test('empty ingredient list is a 400 and no source is queried', async () => {
  let called = 0;
  const spy = { id: 'spy', label: 'Spy', search: async () => { called++; return []; } };
  await withApp({ sources: [spy] }, async ({ post }) => {
    for (const body of [{ ingredients: [] }, { ingredients: ['  ', ''] }, {}, { ingredients: 'tomate' }]) {
      const r = await post(body);
      assert.equal(r.status, 400);
      assert.match((await r.json()).error, /Zutat/);
    }
    assert.equal(called, 0);
  });
});

test('limits: 31 ingredients, 61 chars, 21 devices', async () => {
  await withApp({ sources: [okSource()] }, async ({ post }) => {
    assert.equal((await post({ ingredients: Array.from({ length: 31 }, (_, i) => `z${i}`) })).status, 400);
    assert.equal((await post({ ingredients: ['x'.repeat(61)] })).status, 400);
    assert.equal((await post({ ...valid, devices: Array.from({ length: 21 }, (_, i) => `d${i}`) })).status, 400);
    assert.equal((await post({ ...valid, maxTimeMin: 'schnell' })).status, 400);
    assert.equal((await post({ ...valid, difficulty: 'unmöglich' })).status, 400);
  });
});

test('broken json body is a german 400', async () => {
  await withApp({ sources: [okSource()] }, async ({ post }) => {
    const r = await post('{kaputt');
    assert.equal(r.status, 400);
    assert.ok((await r.json()).error);
  });
});

test('duplicate ingredients are merged before sources see them', async () => {
  let seen;
  const spy = { id: 'spy', label: 'Spy', search: async (q) => { seen = q.ingredients; return []; } };
  await withApp({ sources: [spy] }, async ({ post }) => {
    await post({ ingredients: ['Tomate', 'tomate', ' TOMATE ', 'zwiebel'] });
    assert.deepEqual(seen, ['Tomate', 'zwiebel']);
  });
});

test('device filter is applied and counted', async () => {
  const blocked = recipe({ id: 'tm', title: 'Suppe aus dem Thermomix' });
  await withApp({ sources: [okSource('stub', [blocked])] }, async ({ post }) => {
    const body = await (await post(valid)).json();
    assert.equal(body.recipes.length, 0);
    assert.equal(body.hiddenByDevice, 1);
    const shown = await (await post({ ...valid, showBlocked: true })).json();
    assert.equal(shown.recipes.length, 1);
  });
});

test('suggest and devices endpoints', async () => {
  await withApp({ sources: [] }, async ({ base }) => {
    const s = await (await fetch(`${base}/api/suggest?q=tom`)).json();
    assert.ok(s.suggestions.includes('tomate'));
    assert.deepEqual((await (await fetch(`${base}/api/suggest`)).json()).suggestions, []);
    const d = await (await fetch(`${base}/api/devices`)).json();
    assert.equal(d.groups.length, 3);
  });
});

test('31st search within a minute is rate limited', async () => {
  await withApp({ sources: [okSource()] }, async ({ post }) => {
    for (let i = 0; i < 30; i++) assert.equal((await post(valid)).status, 200);
    const r = await post(valid);
    assert.equal(r.status, 429);
    assert.ok((await r.json()).error);
  });
});
