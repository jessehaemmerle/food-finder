import { createSite } from './site.js';

export const kuechengoetter = createSite({
  id: 'kuechengoetter',
  label: 'Küchengötter',
  host: 'www.kuechengoetter.de',
  searchUrl: (terms) => `https://www.kuechengoetter.de/suche/${encodeURIComponent(terms.join(' '))}`,
  isRecipePath: (path) => /^\/rezepte\/[a-z0-9-]+-\d+$/.test(path),
});
