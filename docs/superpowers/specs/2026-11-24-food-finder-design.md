# Food Finder – Design

Datum: 2026-11-24 · Status: zur Freigabe

## Ziel und Warum
Eine Web-App, in der man erst seine vorhandenen Zutaten und dann seine Küchengeräte
auswählt. Die App durchsucht mehrere Rezeptquellen und schlägt passende Rezepte vor.
Das Gerät fließt in Suche und Ranking ein: Ein Rezept, das einen Thermomix braucht,
erscheint nicht, wenn man keinen hat. Eines, das den Stabmixer nutzt, rutscht nach oben,
wenn man einen hat.

## Ziele
- Zutaten per Tags mit Vorschlägen (DE/EN) eingeben, Basiszutaten (Salz, Pfeffer, Öl, Wasser, Zucker, Mehl) gelten als vorhanden.
- Geräteauswahl in Gruppen (Mixer, Garen & Backen, Sonstiges) plus eigene Geräte als Freitext.
- Mehrere Quellen parallel durchsuchen, Ergebnisse vereinheitlichen, nach Zutaten-Abdeckung und Geräte-Eignung ranken.
- Pro Treffer: Bild, Titel, Quelle, Zeit/Schwierigkeit (falls bekannt), vorhandene und fehlende Zutaten, benötigte Geräte, Link zum Originalrezept.
- Filter: vegetarisch, vegan, glutenfrei, laktosefrei, maximale Zeit, Schwierigkeit.
- Zutaten, Geräte, Filter und Favoriten bleiben im Browser (localStorage).
- Deutsche Oberfläche, deutsche und englische Rezepte. Mobile-first, Dark Mode.
- Läuft ohne API-Keys; Keys schalten später optionale Quellen frei.

## Nicht-Ziele
- Keine Benutzerkonten, keine serverseitige Datenbank.
- Keine vollständige Wiedergabe fremder Rezepttexte. Wir zeigen Zutaten und Eckdaten und verlinken zur Quelle. Nur bei offenen Quellen (TheMealDB) zeigen wir auch die Zubereitung.
- Keine Einkaufsliste, kein Wochenplaner, keine Nährwertberechnung.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)
- Quellen fallen still aus und der Nutzer hält die leere Liste für "keine Rezepte". Ausgefallene Quellen werden sichtbar benannt.
- Erfundene Rezepte oder Treffer, die zu den Zutaten nicht passen.
- Geräte-Filter, der Rezepte wegen einer Fehlerkennung ausblendet, ohne dass der Nutzer es merkt.

## Ansätze (besprochen)
- **A) Quellen-Plugins (gewählt):** Node-Server, austauschbare Quellen, einheitliches Modell, eigenes Matching und Ranking.
- B) Eigene Rezeptdatenbank per Crawler: stabiler, aber aufwendig und rechtlich heikel. Verworfen.
- C) Nur TheMealDB: schnell, aber englisch und klein. Verworfen.

## Architektur
Node 22, Express, Frontend ohne Build-Schritt (HTML, CSS, Vanilla-JS-Module). Tests mit `node:test`.

```
server/
  index.js            Express, statische Dateien, /api
  api.js              POST /api/search, GET /api/suggest, GET /api/devices
  sources/            je Quelle ein Modul: search(query) -> Recipe[]
    themealdb.js      filter.php je Zutat, lookup.php für Details (offene API)
    lecker.js         Suche -> Rezeptlinks -> schema.org/Recipe aus JSON-LD
    chefkoch.js       best effort, gleiche Technik; bei 403 als "nicht erreichbar" melden
    jsonld.js         gemeinsamer Parser für schema.org/Recipe
  core/
    normalize.js      Zutaten normalisieren (Menge/Einheit/Plural entfernen, Synonyme DE<->EN)
    match.js          Abdeckung, fehlende Zutaten, Basiszutaten
    devices.js        Gerätekatalog + Erkennung aus Titel/Zubereitung/Zutatentext
    diet.js           Ernährungs-Heuristik (Fleisch/Fisch/Tierprodukte/Gluten/Laktose-Listen)
    rank.js           Score, Filter, Sortierung
  lib/
    http.js           fetch mit Timeout, User-Agent, Host-Allowlist, Größenlimit
    cache.js          In-Memory-Cache mit TTL
public/               index.html, app.js, styles.css, Zutaten-Vorschlagsliste
data/                 synonyms.json, ingredients.json, devices.json, diet.json
test/                 Unit-Tests + HTML/JSON-Fixtures je Quelle
```

### Einheitliches Rezeptmodell
`{ id, source, title, url, image, ingredients[{raw, name}], timeMin?, difficulty?, language, steps?, tags[] }`

### Suchablauf
1. Client schickt Zutaten, Geräte, Filter an `POST /api/search`.
2. Server fragt alle aktiven Quellen parallel (Timeout je Quelle, Fehler werden gesammelt, nicht geworfen).
3. Rezepte werden normalisiert, dedupliziert (gleicher Titel+Quelle) und bewertet.
4. Antwort: `{ recipes[], sources[{name, ok, count, error?}] }`.

### Matching und Ranking
- Zutatenname wird normalisiert (klein, ohne Mengen/Einheiten/Klammern, Singular, Synonym-Mapping, z. B. chicken breast = Hähnchenbrust).
- Basiszutaten zählen als vorhanden und gehen nicht in die Abdeckung ein.
- `coverage = vorhandene / benötigte` (ohne Basiszutaten). Mindestabdeckung 0,5, Treffer darunter werden ausgeblendet. Standard-Sortierung: Abdeckung, dann Geräte-Bonus, dann kürzere Zeit.
- Geräteerkennung per Schlüsselwörter DE/EN (z. B. "Thermomix|TM6", "pürieren|Stabmixer|hand blender|immersion blender"). Ergebnis je Gerät: *erforderlich* (nennt es ausdrücklich) oder *erwähnt*.
- Gerät erforderlich, aber nicht vorhanden: Rezept wird ausgeblendet; die Zahl der ausgeblendeten Rezepte wird angezeigt ("3 Rezepte brauchen Geräte, die du nicht hast", mit Schalter zum Einblenden).
- Vorhandenes Gerät erkannt: Bonus. Eigene Geräte (Freitext) zählen nur als Bonus, nie als Filter.
- Backofen, Herd, Pfanne und Topf sind Standard und werden nur dann als Gerät abgefragt, wenn sie im Katalog stehen und angewählt werden können (Backofen: ja, Herd: nein).
- Zeit/Schwierigkeit: Unbekannte Werte werden nicht ausgefiltert, aber als "unbekannt" markiert.
- Ernährungsfilter sind Heuristiken auf Basis der Zutaten und Quell-Tags. Die UI weist darauf hin ("ohne Gewähr, bitte Zutaten prüfen").

### Frontend
Ein Bildschirm mit drei Schritten: 1. Zutaten, 2. Geräte, 3. Ergebnisse. Ein Schritt-Indikator oben, Ergebnisfilter als Chips. Treffer als Karten (Bild, Quelle, Zutaten-Abdeckung als Balken, fehlende Zutaten, Geräte-Chips). Favoriten per Herz, eigener Reiter "Merkliste". Auswahl bleibt in localStorage. Barrierefrei (Tastatur, Labels, Kontrast), Dark Mode per `prefers-color-scheme` mit manuellem Schalter. Visuelles Design über das Skill `frontend-design`.

### Sicherheit und Robustheit
- Server ruft nur feste Hosts auf (Allowlist), nie vom Client übergebene URLs (kein SSRF).
- Antworten mit Größen- und Zeitlimit; Rate-Limit pro IP auf `/api/search`.
- Eingaben validieren und kürzen (max. 30 Zutaten, 20 Geräte, Länge je Eintrag).
- Fremdtexte nur per `textContent` rendern, Bild-URLs auf https prüfen, CSP-Header, `rel="noopener noreferrer"` an Links.
- Cache pro Quelle, damit die Quellen geschont werden; höflicher User-Agent.

### Teststrategie
- Unit-Tests: Normalisierung, Matching, Geräteerkennung, Diät-Heuristik, Ranking.
- Parser-Tests gegen gespeicherte Fixtures je Quelle (reale Beispiele, die beim Bau abgelegt werden).
- API-Test mit gestubbten Quellen (Quelle fällt aus, Timeout, leere Treffer).
- Beim Bau echte Live-Abfrage gegen TheMealDB und Lecker; Browser-Durchlauf mit Playwright, Screenshot mobil und Desktop.

## Offen für den Bauenden (eigene Entscheidungen, hier markiert)
- Genauer Umfang der Synonym- und Zutatenliste (Start: ca. 300 häufige Zutaten, erweiterbar).
- Konkrete Gerätekatalog-Einträge und Schlüsselwörter (Start: Stabmixer, Standmixer, Thermomix, Küchenmaschine, Zerkleinerer, Backofen, Mikrowelle, Heißluftfritteuse, Dampfgarer, Slow Cooker, Schnellkochtopf/Instant Pot, Reiskocher, Toaster, Waffeleisen, Sandwichmaker, Grill, Eismaschine, Brotbackautomat, Wok, Sous-vide).
- Wie Lecker-Suchergebnisse zuverlässig gelesen werden, entscheidet sich an echtem HTML beim Bau. Falls Lecker ungeeignet ist, wird eine andere erreichbare Seite mit schema.org-Daten genommen.
- Chefkoch ist best effort: Ist sie gesperrt, bleibt die Quelle aus und wird als "nicht erreichbar" angezeigt.
- Optionale Quellen mit Key (Spoonacular, Brave-Suche) bekommen Plugin-Platzhalter und Umgebungsvariablen, werden aber nicht gebaut.
