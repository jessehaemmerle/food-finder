import * as cheerio from 'cheerio';

const plain = (value) => cheerio.load(String(value ?? ''), null, false).text().replace(/\s+/g, ' ').trim();
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function flatten(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => flatten(n, out));
  else if (node && typeof node === 'object') {
    out.push(node);
    if (node['@graph']) flatten(node['@graph'], out);
  }
  return out;
}

const isRecipe = (node) => asArray(node['@type']).includes('Recipe');

function minutes(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(String(iso ?? ''));
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : undefined;
}

function pickImage(image) {
  for (const candidate of asArray(image)) {
    const url = typeof candidate === 'string' ? candidate : candidate?.url;
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return undefined;
}

export function parseRecipeJsonLd(html, url, { source = '', language = 'de' } = {}) {
  const $ = cheerio.load(String(html ?? ''));
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let parsed;
    try { parsed = JSON.parse($(el).text()); } catch { continue; }
    const node = flatten(parsed).find(isRecipe);
    if (!node) continue;
    const ingredients = asArray(node.recipeIngredient)
      .map(plain)
      .filter(Boolean)
      .slice(0, 60)
      .map((raw) => ({ raw, name: raw }));
    const title = plain(node.name);
    if (!ingredients.length || !title) continue;
    const timeMin = minutes(node.totalTime) ?? ((minutes(node.prepTime) ?? 0) + (minutes(node.cookTime) ?? 0) || undefined);
    const tags = [...String(node.keywords ?? '').split(','), ...asArray(node.recipeCategory)].map(plain).filter(Boolean).slice(0, 20);
    return { id: url, source, title, url, image: pickImage(node.image), ingredients, timeMin, language, tags };
  }
  return null;
}
