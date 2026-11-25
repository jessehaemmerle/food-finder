import { readFileSync } from 'node:fs';

const catalogue = JSON.parse(readFileSync(new URL('../../data/devices.json', import.meta.url), 'utf8'));

const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const compile = (sources) => (sources.length ? new RegExp(`${L}(?:${sources.join('|')})${R}`, 'iu') : null);

const compiled = catalogue.groups.flatMap((g) =>
  g.devices.map((d) => ({ id: d.id, required: compile(d.required), hints: compile(d.hints) })),
);

export function listDevices() {
  return {
    groups: catalogue.groups.map((g) => ({
      id: g.id,
      label: g.label,
      devices: g.devices.map(({ id, label }) => ({ id, label })),
    })),
  };
}

// "Ofen oder Mikrowelle", "alternatively microwave", "kann auch im Slow Cooker": the device is optional, so it is only mentioned.
const ALTERNATIVE = /(?<![\p{L}])(?:oder|or|alternativ\p{L}*|alternatively|kann auch|can also|optional\p{L}*|wahlweise|falls vorhanden|if you have|if using)(?![\p{L}])/iu;

export function detectDevices(text) {
  if (typeof text !== 'string' || !text) return [];
  const best = new Map();
  for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) {
    const optional = ALTERNATIVE.test(sentence);
    for (const d of compiled) {
      const level = d.required?.test(sentence) ? (optional ? 'mentioned' : 'required') : d.hints?.test(sentence) ? 'mentioned' : null;
      if (level && best.get(d.id) !== 'required') best.set(d.id, level);
    }
  }
  return compiled.filter((d) => best.has(d.id)).map((d) => ({ id: d.id, level: best.get(d.id) }));
}

export function deviceVerdict(detected, ownedIds, customNames, text) {
  const owned = new Set(ownedIds ?? []);
  const missingDevices = detected.filter((d) => d.level === 'required' && !owned.has(d.id)).map((d) => d.id);
  let bonus = 0;
  for (const d of detected) if (owned.has(d.id)) bonus += d.level === 'required' ? 2 : 1;
  const haystack = (text ?? '').toLowerCase();
  for (const name of new Set((customNames ?? []).map((n) => n.toLowerCase().trim()))) {
    if (name.length >= 3 && haystack.includes(name)) bonus += 2;
  }
  return { blocked: missingDevices.length > 0, missingDevices, bonus };
}
