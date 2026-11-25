import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../server/lib/cache.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('second wrap call is served from cache', async () => {
  const cache = createCache(1000);
  let calls = 0;
  const fn = async () => ++calls;
  assert.equal(await cache.wrap('k', fn), 1);
  assert.equal(await cache.wrap('k', fn), 1);
  assert.equal(calls, 1);
});

test('expired entries are reloaded', async () => {
  const cache = createCache(20);
  let calls = 0;
  const fn = async () => ++calls;
  await cache.wrap('k', fn);
  await sleep(40);
  assert.equal(await cache.wrap('k', fn), 2);
});

test('parallel calls share one invocation', async () => {
  const cache = createCache(1000);
  let calls = 0;
  const fn = async () => { calls++; await sleep(20); return 'v'; };
  const results = await Promise.all([cache.wrap('k', fn), cache.wrap('k', fn), cache.wrap('k', fn)]);
  assert.deepEqual(results, ['v', 'v', 'v']);
  assert.equal(calls, 1);
});

test('failures are not cached', async () => {
  const cache = createCache(1000);
  let calls = 0;
  const fn = async () => { if (++calls === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(cache.wrap('k', fn), /boom/);
  assert.equal(await cache.wrap('k', fn), 'ok');
});

test('size is bounded', async () => {
  const cache = createCache(1000, 2);
  for (const k of ['a', 'b', 'c']) await cache.wrap(k, async () => k);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), 'c');
});
