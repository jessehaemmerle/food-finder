export class HttpError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export const ALLOWED_HOSTS = ['www.themealdb.com', 'www.kuechengoetter.de', 'www.einfachkochen.de', 'www.chefkoch.de'];
const USER_AGENT = 'FoodFinder/1.0 (Hobby-Projekt)';
const MAX_REDIRECTS = 3;

function checkUrl(raw, { allowHosts = ALLOWED_HOSTS, allowInsecure = false } = {}) {
  let url;
  try { url = new URL(raw); } catch { throw new HttpError('Ungültige URL', { url: raw }); }
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    throw new HttpError('Nur https ist erlaubt', { url: raw });
  }
  if (!allowHosts.includes(url.hostname)) throw new HttpError(`Host nicht erlaubt: ${url.hostname}`, { url: raw });
  return url;
}

async function readLimited(res, maxBytes, url) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError('Antwort zu groß', { url });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchText(rawUrl, opts = {}) {
  const { timeoutMs = 8000, maxBytes = 2_000_000, headers = {} } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = checkUrl(rawUrl, opts);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'de,en;q=0.8', ...headers },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = checkUrl(new URL(res.headers.get('location'), current).href, opts);
        continue;
      }
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, { status: res.status, url: String(current) });
      return await readLimited(res, maxBytes, String(current));
    }
    throw new HttpError('Zu viele Weiterleitungen', { url: rawUrl });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err?.name === 'AbortError' || controller.signal.aborted) throw new HttpError('Zeitüberschreitung', { url: rawUrl });
    throw new HttpError(`Netzwerkfehler: ${err?.cause?.code ?? err?.message ?? 'unbekannt'}`, { url: rawUrl });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  try { return JSON.parse(text); } catch { throw new HttpError('Ungültige JSON-Antwort', { url }); }
}
