import { createSite } from './site.js';

export const einfachkochen = createSite({
  id: 'einfachkochen',
  label: 'einfach kochen',
  host: 'www.einfachkochen.de',
  searchUrl: (terms) => `https://www.einfachkochen.de/suche?q=${encodeURIComponent(terms.join(' '))}`,
  isRecipePath: (path) => /^\/rezepte\/[a-z0-9]+(-[a-z0-9]+){2,}$/.test(path),
});
