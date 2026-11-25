import * as cheerio from 'cheerio';
import { normalizeIngredient, isStaple } from '../core/normalize.js';
import { parseRecipeJsonLd } from './jsonld.js';

const MAX_PAGES = 8;

export function searchTerms(ingredients, max = 3) {
  const names = [...new Set((ingredients ?? []).map(normalizeIngredient).filter((n) => n && !isStaple(n)))];
  return names.slice(0, max);
}

function extractLinks(html, host, isRecipePath) {
  const $ = cheerio.load(html);
  const links = new Set();
  for (const a of $('a[href]').toArray()) {
    let url;
    try { url = new URL($(a).attr('href'), `https://${host}`); } catch { continue; }
    if (url.hostname !== host || !isRecipePath(url.pathname)) continue;
    links.add(`https://${host}${url.pathname}`);
  }
  return [...links];
}

export function createSite({ id, label, host, searchUrl, isRecipePath }) {
  return {
    id,
    label,
    async search(query, ctx) {
      const terms = searchTerms(query.ingredients);
      if (!terms.length) return [];
      const links = new Set(extractLinks(await ctx.fetchText(searchUrl(terms)), host, isRecipePath));
      if (links.size < 4 && terms.length > 1) {
        for (const term of terms.slice(0, 2)) {
          try { extractLinks(await ctx.fetchText(searchUrl([term])), host, isRecipePath).forEach((l) => links.add(l)); } catch { /* single-term query is a bonus */ }
        }
      }
      const pages = await Promise.allSettled([...links].slice(0, MAX_PAGES).map((link) => ctx.fetchText(link).then((html) => parseRecipeJsonLd(html, link, { source: id, language: 'de' }))));
      return pages.flatMap((p) => (p.status === 'fulfilled' && p.value ? [p.value] : []));
    },
  };
}
