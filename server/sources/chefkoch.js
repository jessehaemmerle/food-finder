import { createSite } from './site.js';

// Best effort: chefkoch.de blocks many server IPs (HTTP 403). The error is passed on and shown as "nicht erreichbar".
export const chefkoch = createSite({
  id: 'chefkoch',
  label: 'Chefkoch',
  host: 'www.chefkoch.de',
  searchUrl: (terms) => `https://www.chefkoch.de/rs/s0/${terms.map(encodeURIComponent).join('+')}/Rezepte.html`,
  isRecipePath: (path) => /^\/rezepte\/\d+\/[^/]+\.html$/.test(path),
});
