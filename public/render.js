// DOM helpers: every piece of foreign text goes in through textContent, never through innerHTML.
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'href' || key === 'src') { if (isHttps(value)) node.setAttribute(key, value); }
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const isHttps = (url) => typeof url === 'string' && url.startsWith('https://');

export function formatTime(min) {
  if (min == null) return 'Zeit unbekannt';
  if (min < 60) return `${min} Min.`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

export function recipeCard(recipe, { deviceLabels, ownedDevices, sourceLabels, favorite, onFavorite, showDetails = true, difficultyFiltered = false }) {
  const total = (recipe.have?.length ?? 0) + (recipe.missing?.length ?? 0);
  const required = (recipe.devices ?? []).filter((d) => d.level === 'required');
  const heart = h('button', {
    type: 'button',
    class: 'heart',
    'aria-pressed': String(favorite),
    'aria-label': favorite ? `${recipe.title} aus der Merkliste entfernen` : `${recipe.title} merken`,
    onclick: () => onFavorite(recipe),
  }, favorite ? '♥' : '♡');

  const meta = h('p', { class: 'meta' },
    h('span', {}, sourceLabels[recipe.source] ?? recipe.source),
    showDetails && h('span', {}, formatTime(recipe.timeMin)),
    showDetails && recipe.difficulty && h('span', {}, `Aufwand: ${recipe.difficulty}`),
    showDetails && !recipe.difficulty && difficultyFiltered && h('span', {}, 'Aufwand unbekannt'),
    recipe.language === 'en' && h('span', {}, 'Englisch'),
  );

  return h('li', {},
    h('article', { class: 'card' },
      isHttps(recipe.image) && h('img', { src: recipe.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }),
      h('div', { class: 'card__body' },
        h('div', { class: 'card__head' },
          h('h3', {}, h('a', { href: recipe.url, target: '_blank', rel: 'noopener noreferrer' }, recipe.title)),
          heart,
        ),
        meta,
        showDetails && total > 0 && [
          h('ul', { class: 'coverage', 'aria-hidden': 'true' },
            [...recipe.have.map(() => h('li', { class: 'have' })), ...recipe.missing.map(() => h('li'))]),
          h('p', { class: 'coverage-label' }, `${recipe.have.length} von ${total} Zutaten vorhanden`),
        ],
        showDetails && recipe.missing?.length > 0 && h('p', { class: 'missing' }, h('strong', {}, 'Fehlt: '), recipe.missing.slice(0, 8).join(', '), recipe.missing.length > 8 ? ' …' : ''),
        showDetails && required.length > 0 && h('ul', { class: 'devices', 'aria-label': 'Benötigte Geräte' },
          required.map((d) => {
            const has = ownedDevices.includes(d.id);
            return h('li', { class: has ? 'ok' : 'lack' }, `${deviceLabels[d.id] ?? d.id}${has ? '' : ' fehlt'}`);
          })),
      ),
    ),
  );
}
