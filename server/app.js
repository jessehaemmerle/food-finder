import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const CSP = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(deps = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/api', createApi(deps));
  app.use(express.static(publicDir));
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Die Anfrage ist kein gültiges JSON.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Die Anfrage ist zu groß.' });
    console.error(err);
    res.status(500).json({ error: 'Interner Fehler.' });
  });
  return app;
}
