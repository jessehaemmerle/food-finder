export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count++;
    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.' });
    }
    next();
  };
}
