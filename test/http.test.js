import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchText, fetchJson, HttpError } from '../server/lib/http.js';

function serve(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
  }));
}
const opts = (extra = {}) => ({ allowHosts: ['127.0.0.1'], allowInsecure: true, ...extra });

test('host outside the allowlist is rejected without network access', async () => {
  await assert.rejects(fetchText('https://evil.example/x'), (e) => e instanceof HttpError && /nicht erlaubt/.test(e.message));
});

test('non-https url is rejected by default', async () => {
  await assert.rejects(fetchText('http://www.themealdb.com/x'), HttpError);
});

test('returns body text and parses json', async () => {
  const s = await serve((req, res) => res.end('{"a":1}'));
  try {
    assert.equal(await fetchText(s.url, opts()), '{"a":1}');
    assert.deepEqual(await fetchJson(s.url, opts()), { a: 1 });
  } finally { s.close(); }
});

test('non-2xx raises HttpError with status', async () => {
  const s = await serve((req, res) => { res.statusCode = 500; res.end('no'); });
  try {
    await assert.rejects(fetchText(s.url, opts()), (e) => e instanceof HttpError && e.status === 500);
  } finally { s.close(); }
});

test('response above maxBytes is rejected', async () => {
  const s = await serve((req, res) => res.end('x'.repeat(5000)));
  try {
    await assert.rejects(fetchText(s.url, opts({ maxBytes: 1000 })), /zu groß/);
  } finally { s.close(); }
});

test('slow response hits the timeout', async () => {
  const s = await serve(() => {});
  try {
    await assert.rejects(fetchText(s.url, opts({ timeoutMs: 100 })), /Zeitüberschreitung/);
  } finally { s.close(); }
});

test('redirect to a host outside the allowlist is refused', async () => {
  const s = await serve((req, res) => { res.statusCode = 302; res.setHeader('location', 'https://evil.example/'); res.end(); });
  try {
    await assert.rejects(fetchText(s.url, opts()), (e) => e instanceof HttpError && /nicht erlaubt/.test(e.message));
  } finally { s.close(); }
});

test('invalid json raises HttpError', async () => {
  const s = await serve((req, res) => res.end('<html>'));
  try {
    await assert.rejects(fetchJson(s.url, opts()), HttpError);
  } finally { s.close(); }
});
