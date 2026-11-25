import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function withServer(app, fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try { return await fn(`http://127.0.0.1:${port}`); } finally { server.close(); }
}

test('healthz returns ok', async () => {
  await withServer(createApp(), async (base) => {
    const r = await fetch(`${base}/healthz`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });
});

test('responses carry a restrictive CSP', async () => {
  await withServer(createApp(), async (base) => {
    const csp = (await fetch(`${base}/healthz`)).headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /img-src 'self' https:/);
  });
});
