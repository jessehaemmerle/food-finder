# Food Finder

Web-App, die aus deinen Zutaten und Küchengeräten passende Rezepte findet.

1. **Zutaten** eintippen (Deutsch oder Englisch, mit Vorschlägen). Salz, Pfeffer, Öl, Wasser, Zucker und Mehl gelten als vorhanden.
2. **Geräte** wählen (Stabmixer, Thermomix, Backofen, Heißluftfritteuse …) oder eigene eintragen.
3. **Rezepte** ansehen: gerankt nach Zutaten-Abdeckung, mit fehlenden Zutaten, benötigten Geräten, Zeit und Link zur Quelle. Filter für Ernährung, Zeit und Aufwand. Merkliste und Auswahl bleiben im Browser gespeichert.

## Starten

```bash
npm install
npm start          # http://localhost:3000, anderer Port: PORT=8080 npm start
npm test           # Unit- und API-Tests (node:test)
node scripts/smoke-sources.js "tomate,zwiebel"   # Live-Check aller Quellen
```

Hinter einem Proxy: `NODE_USE_ENV_PROXY=1` setzen (und bei eigener CA `NODE_EXTRA_CA_CERTS`). Hinter einem Reverse-Proxy `app.set('trust proxy', …)` in `server/app.js` ergänzen, damit das Rate-Limit die echte Client-IP sieht.

Browser-Durchlauf (Playwright): `npm start` und dann `BASE_URL=http://localhost:3000 SHOTS=/pfad/zu/screenshots node scripts/e2e.mjs`.

## So funktioniert die Suche

- Der Server fragt mehrere Quellen parallel: **TheMealDB** (offene API, englisch), **Küchengötter** und **einfach kochen** (Rezeptseiten mit schema.org-Daten) sowie **Chefkoch** (siehe Grenzen).
- Zutaten werden normalisiert (Mengen, Mehrzahl, Englisch → Deutsch). Rezepte unter 50 % Abdeckung werden ausgeblendet.
- Geräte werden aus Titel, Zubereitung und Zutaten erkannt. Braucht ein Rezept ausdrücklich ein Gerät, das du nicht ausgewählt hast, wird es ausgeblendet. Ein Hinweis zeigt, wie viele es sind, und lässt sie einblenden. Ausgewählte Geräte geben Bonuspunkte im Ranking. Eigene Geräte (Freitext) geben nur Bonuspunkte.
- Fremde Rezepttexte werden nicht kopiert: Zutaten und Eckdaten werden angezeigt, die Zubereitung steht bei der Quelle (Ausnahme: TheMealDB).

## Grenzen

- **Chefkoch** sperrt viele Server-IPs (HTTP 403). Die Quelle bleibt eingebaut und wird in der Oberfläche als „nicht erreichbar" angezeigt, wenn sie blockiert.
- Die **Ernährungsfilter** sind Heuristiken auf Zutatenlisten. Sie ersetzen keine Prüfung bei Allergien.
- Die Geräteerkennung liest Text. Ein Gerät, das nur sinngemäß gemeint ist, wird nicht erkannt.
- Die Zutatenliste (`data/ingredients.json`, ca. 150 Einträge) ist erweiterbar. Unbekannte Zutaten werden als Klartext verglichen.
- Optionale Quellen mit Key (Spoonacular, Brave-Suche) sind nicht gebaut. Neue Quellen sind ein Modul in `server/sources/` mit `search(query, ctx)`.

## Aufbau

```
server/core/     Normalisierung, Matching, Geräte, Ernährung, Ranking (reine Funktionen)
server/sources/  eine Datei je Quelle, gemeinsame JSON-LD-Auswertung
server/lib/      HTTP mit Host-Allowlist, Cache, Rate-Limit
public/          Frontend ohne Build-Schritt
data/            Zutaten, Geräte, Diät-Listen
```
