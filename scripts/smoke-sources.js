// Live check of all sources: node scripts/smoke-sources.js "tomate,zwiebel"
// Behind a proxy run with NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS if needed).
import { defaultSources } from '../server/sources/index.js';
import { fetchText, fetchJson } from '../server/lib/http.js';

const ingredients = (process.argv[2] ?? 'tomate,zwiebel').split(',').map((s) => s.trim()).filter(Boolean);
for (const source of defaultSources()) {
  const started = Date.now();
  try {
    const recipes = await source.search({ ingredients }, { fetchText, fetchJson });
    console.log(`${source.id}: ${recipes.length} Rezepte in ${Date.now() - started} ms`, recipes[0] ? `z. B. "${recipes[0].title}" (${recipes[0].ingredients.length} Zutaten, ${recipes[0].timeMin ?? '?'} min)` : '');
  } catch (err) {
    console.log(`${source.id}: FEHLER ${err.message}`);
  }
}
