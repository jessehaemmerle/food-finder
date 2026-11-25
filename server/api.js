import express from 'express';
import { rankRecipes } from './core/rank.js';
import { listDevices } from './core/devices.js';
import { suggestIngredients } from './core/normalize.js';
import { defaultSources } from './sources/index.js';
import { fetchText, fetchJson, HttpError } from './lib/http.js';
import { createCache } from './lib/cache.js';
import { createRateLimiter } from './lib/ratelimit.js';

export const LIMITS = { ingredients: 30, devices: 20, entryLength: 60 };
const DIET_KEYS = ['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'];
const DIFFICULTIES = ['einfach', 'mittel', 'schwer'];

class ValidationError extends Error {}

function cleanList(value, name, max) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${name} muss eine Liste sein.`);
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new ValidationError(`${name}: Nur Text ist erlaubt.`);
    const text = item.trim();
    if (!text) continue;
    if (text.length > LIMITS.entryLength) throw new ValidationError(`${name}: Einträge dürfen höchstens ${LIMITS.entryLength} Zeichen haben.`);
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  if (out.length > max) throw new ValidationError(`${name}: Höchstens ${max} Einträge sind erlaubt.`);
  return out;
}

export function parseQuery(body) {
  const b = body && typeof body === 'object' ? body : {};
  const ingredients = cleanList(b.ingredients, 'Zutaten', LIMITS.ingredients);
  if (!ingredients.length) throw new ValidationError('Bitte gib mindestens eine Zutat an.');
  const query = {
    ingredients,
    devices: cleanList(b.devices, 'Geräte', LIMITS.devices),
    customDevices: cleanList(b.customDevices, 'Eigene Geräte', LIMITS.devices),
    diet: Object.fromEntries(DIET_KEYS.map((k) => [k, b.diet?.[k] === true])),
    showBlocked: b.showBlocked === true,
  };
  if (b.maxTimeMin != null) {
    if (typeof b.maxTimeMin !== 'number' || !Number.isFinite(b.maxTimeMin) || b.maxTimeMin < 1 || b.maxTimeMin > 1440) throw new ValidationError('Die maximale Zeit muss zwischen 1 und 1440 Minuten liegen.');
    query.maxTimeMin = b.maxTimeMin;
  }
  if (b.difficulty != null) {
    if (!DIFFICULTIES.includes(b.difficulty)) throw new ValidationError('Ungültiger Schwierigkeitsgrad.');
    query.difficulty = b.difficulty;
  }
  return query;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpError('Zeitüberschreitung')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function defaultContext() {
  const cache = createCache(15 * 60 * 1000, 300);
  return {
    fetchText: (url, opts) => cache.wrap(`t:${url}`, () => fetchText(url, opts)),
    fetchJson: (url, opts) => cache.wrap(`j:${url}`, () => fetchJson(url, opts)),
  };
}

export function createApi({ sources = defaultSources(), ctx = defaultContext(), sourceTimeoutMs = 10_000, searchesPerMinute = 30 } = {}) {
  const router = express.Router();

  router.get('/devices', (req, res) => res.json(listDevices()));

  router.get('/suggest', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, LIMITS.entryLength) : '';
    res.json({ suggestions: suggestIngredients(q) });
  });

  router.post('/search', createRateLimiter({ limit: searchesPerMinute, windowMs: 60_000 }), async (req, res, next) => {
    let query;
    try { query = parseQuery(req.body); } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      return next(err);
    }
    const settled = await Promise.allSettled(sources.map((s) => withTimeout(Promise.resolve().then(() => s.search(query, ctx)), sourceTimeoutMs)));
    const all = [];
    const status = settled.map((result, i) => {
      const { id, label } = sources[i];
      if (result.status === 'fulfilled') {
        const list = Array.isArray(result.value) ? result.value.filter((r) => r && typeof r === 'object') : [];
        all.push(...list);
        return { id, label, ok: true, count: list.length };
      }
      return { id, label, ok: false, count: 0, error: result.reason instanceof HttpError ? result.reason.message : 'Unbekannter Fehler' };
    });
    const { recipes, hiddenByDevice } = rankRecipes(all, query);
    res.json({ recipes, hiddenByDevice, sources: status });
  });

  return router;
}
