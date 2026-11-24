# Food Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web-App, in der man Zutaten und Küchengeräte wählt und passende Rezepte aus mehreren Quellen vorgeschlagen bekommt.

**Architecture:** Express-Server mit austauschbaren Quellen-Modulen (`server/sources/*`), die in ein einheitliches Rezeptmodell übersetzen. Reine Kernlogik (`server/core/*`) normalisiert Zutaten, erkennt Geräte und rankt. Frontend ohne Build-Schritt in `public/`.

**Tech Stack:** Node 22 (ESM), Express, cheerio, `node:test`, Vanilla JS/CSS. Playwright (vorinstalliert) nur für den Browser-Check.

**Spec:** `docs/superpowers/specs/2026-11-24-food-finder-design.md`

## Global Constraints

- Node 22, ESM (`"type": "module"`), nur die Abhängigkeiten `express` und `cheerio`; keine weiteren Laufzeit-Abhängigkeiten.
- Läuft ohne API-Keys. Keys (z. B. `SPOONACULAR_KEY`) sind optional und werden nicht gebaut.
- Oberfläche deutsch; Rezepte in Originalsprache (`language: "de" | "en"`).
- Basiszutaten: Salz, Pfeffer, Öl, Wasser, Zucker, Mehl gelten als vorhanden.
- Mindestabdeckung 0,5; Treffer darunter werden ausgeblendet.
- Server ruft nur Hosts aus der Allowlist auf: `www.themealdb.com`, `www.lecker.de`, `api.chefkoch.de`, `www.chefkoch.de`.
- Limits: max. 30 Zutaten, 20 Geräte, 60 Zeichen je Eintrag; Rate-Limit auf `/api/search`.
- Fremdtexte nur per `textContent`; Bild-URLs nur `https:`; Links mit `rel="noopener noreferrer"`; CSP-Header.
- Fremde Rezepttexte nicht kopieren: Zutaten + Eckdaten + Link; `steps` nur bei TheMealDB.
- Gerät erforderlich und nicht vorhanden: ausblenden und Anzahl melden. Eigene Geräte (Freitext) nur Bonus.
- Unbekannte Zeit/Schwierigkeit wird nicht ausgefiltert, sondern als "unbekannt" markiert.

## Review Focus

1. Leere Zutatenliste: `/api/search` antwortet mit 400 und deutscher Meldung, keine Quellen-Abfragen.
2. Alle Quellen fallen aus: Antwort 200 mit leerer Rezeptliste und `sources[].ok=false`, die UI zeigt "Quellen nicht erreichbar" statt "keine Rezepte".
3. Umlaute, ß, Groß/Kleinschreibung, Mehrzahl und Mengen im Text ("2 EL Olivenöl", "Käse, gerieben"): werden zum selben Zutatennamen wie die Eingabe.
4. Rezept mit leerer/kaputter Zutatenliste oder HTML im Titel: wird verworfen bzw. als reiner Text angezeigt, nie als HTML.
5. Doppelte Zutaten/Geräte und Eingaben über den Limits: werden dedupliziert bzw. mit 400 abgelehnt.

---

### Task 1: Projekt-Gerüst und Server-Skelett

**Files:**
- Create: `package.json`, `.gitignore`, `server/index.js`, `server/app.js`, `public/index.html` (Platzhalter), `test/app.test.js`

**Interfaces:**
- Produces: `createApp(deps?: { sources?: Source[] }): express.Application` in `server/app.js`; `server/index.js` startet auf `PORT` (Standard 3000). Skripte: `npm start`, `npm test` (`node --test`).

- [ ] **Step 1: Test schreiben** (`test/app.test.js`): `GET /healthz` liefert 200 `{ok:true}`; Antworten tragen `Content-Security-Policy` mit `default-src 'self'` und `img-src 'self' https:`.
- [ ] **Step 2: Test ausführen**, erwarten: FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** `createApp` mit `express.json({limit:'50kb'})`, statischem `public/`, CSP-Middleware, `/healthz`. `npm install express cheerio` (Versionen mit `npm view` prüfen, exakt in `package.json` pinnen).
- [ ] **Step 4: `npm test`**, erwarten: PASS.
- [ ] **Step 5: Commit** `chore: project scaffold`.

### Task 2: Zutaten-Normalisierung und Matching

**Files:**
- Create: `server/core/normalize.js`, `server/core/match.js`, `data/synonyms.json`, `data/ingredients.json`
- Test: `test/normalize.test.js`, `test/match.test.js`

**Interfaces:**
- Produces:
  - `normalizeIngredient(raw: string): string` – klein, Umlaute behalten, ohne Mengen/Einheiten/Klammern/Zusätze nach Komma, Singular, über `synonyms.json` auf den kanonischen deutschen Namen abgebildet.
  - `isStaple(name: string): boolean`
  - `matchRecipe(recipeIngredients: {raw:string,name:string}[], owned: string[]): { have: string[], missing: string[], coverage: number }` – Basiszutaten zählen nicht in `coverage`; keine Nicht-Basiszutaten ⇒ `coverage = 0`.
  - `suggestIngredients(prefix: string, limit?: number): string[]` aus `ingredients.json` (deutsch + englisch, Treffer liefern den deutschen Namen).

- [ ] **Step 1: Tests schreiben** mit den Assertions: `normalizeIngredient("2 EL Olivenöl")` = `"olivenöl"`; `normalizeIngredient("Käse, gerieben")` = `"käse"`; `normalizeIngredient("chicken breast")` = `"hähnchenbrust"`; `normalizeIngredient("Tomaten")` = `"tomate"`; `isStaple("salz")` true, `isStaple("tomate")` false; `matchRecipe` mit Zutaten Tomate, Zwiebel, Salz und owned `["tomate"]` ⇒ `coverage 0.5`, `missing ["zwiebel"]`; leere Zutatenliste ⇒ `coverage 0`.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren.** `ingredients.json` startet mit ca. 300 häufigen Zutaten (de-Name, Aliase, Typ-Tags für Diät); `synonyms.json` bildet Aliase auf den kanonischen Namen ab. Entfernen von Mengen/Einheiten per Regex-Liste (g, kg, ml, l, EL, TL, Prise, Stück, Bund, Dose, cup, tbsp, tsp …).
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: ingredient normalisation and matching`.

### Task 3: Geräte-Katalog und Erkennung

**Files:**
- Create: `server/core/devices.js`, `data/devices.json`
- Test: `test/devices.test.js`

**Interfaces:**
- Produces:
  - `listDevices(): { groups: { id:string, label:string, devices:{id:string,label:string}[] }[] }` – Gruppen `mixer`, `cook`, `other` mit den Geräten aus der Spec.
  - `detectDevices(text: string): { id: string, level: 'required'|'mentioned' }[]`
  - `deviceVerdict(detected, ownedIds: string[], customNames: string[], text: string): { blocked: boolean, missingDevices: string[], bonus: number }` – `blocked` nur bei `required`-Gerät, das nicht in `ownedIds` ist; Freitext-Geräte erzeugen nur `bonus` bei Treffer im Text.

- [ ] **Step 1: Tests schreiben:** "Mit dem Thermomix 10 Min/Stufe 5 pürieren" ⇒ `thermomix` required; "Suppe mit dem Stabmixer pürieren" ⇒ `stabmixer` required; "mit einem Löffel verrühren" ⇒ leer; "puree with an immersion blender" ⇒ `stabmixer`; "pürieren" allein ⇒ `stabmixer` mentioned (nicht required); `deviceVerdict` ohne Thermomix und `thermomix` required ⇒ `blocked true, missingDevices ["thermomix"]`; mit `ownedIds ["thermomix"]` ⇒ `blocked false, bonus > 0`; customNames `["Zauberstab"]` und Text enthält "Zauberstab" ⇒ `bonus > 0`, nie `blocked`.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren** `devices.json`: je Gerät `id`, `label`, `required` (ausdrückliche Namen, de/en) und `hints` (Tätigkeitswörter wie "pürieren", "air fry"). Erkennung per Wortgrenzen-Regex, Umlaute/Groß-Klein tolerant. Katalog laut Spec (Stabmixer, Standmixer, Thermomix, Küchenmaschine, Zerkleinerer, Backofen, Mikrowelle, Heißluftfritteuse, Dampfgarer, Slow Cooker, Schnellkochtopf/Instant Pot, Reiskocher, Toaster, Waffeleisen, Sandwichmaker, Grill, Eismaschine, Brotbackautomat, Wok, Sous-vide).
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: device catalogue and detection`.

### Task 4: Ernährungs-Heuristik

**Files:**
- Create: `server/core/diet.js`, `data/diet.json`
- Test: `test/diet.test.js`

**Interfaces:**
- Consumes: `normalizeIngredient` (Task 2).
- Produces: `dietFlags(ingredientNames: string[], tags?: string[]): { vegetarian:boolean, vegan:boolean, glutenFree:boolean, lactoseFree:boolean }`. Quell-Tags (z. B. "Vegetarian") dürfen `true` bestätigen, Zutatenlisten mit Fleisch/Fisch/Tierprodukt/Gluten/Laktose-Treffern setzen `false`.

- [ ] **Step 1: Tests:** Nudeln+Tomate ⇒ vegetarian true, vegan true, glutenFree false; Hähnchenbrust ⇒ vegetarian false; Käse ⇒ vegetarian true, vegan false, lactoseFree false; Reis+Gemüse ⇒ alle vier true; Tag "Vegan" mit leerer Zutatenliste ⇒ nicht `true` (Zutaten haben Vorrang, leere Liste ⇒ alle `false`).
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren** mit Schlüsselwortlisten in `diet.json` (Fleisch, Fisch/Meeresfrüchte, Eier/Honig/Milchprodukte, Gluten-Getreide, Laktose-Produkte), Abgleich über normalisierte Namen.
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: diet heuristics`.

### Task 5: Ranking und Filter

**Files:**
- Create: `server/core/rank.js`
- Test: `test/rank.test.js`

**Interfaces:**
- Consumes: `matchRecipe`, `deviceVerdict`, `dietFlags`.
- Produces: `rankRecipes(recipes: Recipe[], query: Query): { recipes: RankedRecipe[], hiddenByDevice: number }`
  - `Recipe = { id, source, title, url, image?, ingredients:{raw,name}[], timeMin?, difficulty?: 'einfach'|'mittel'|'schwer', language:'de'|'en', steps?:string[], tags:string[] }`
  - `Query = { ingredients:string[], devices:string[], customDevices:string[], diet:{vegetarian?,vegan?,glutenFree?,lactoseFree?}, maxTimeMin?:number, difficulty?:string, showBlocked?:boolean }`
  - `RankedRecipe = Recipe & { coverage:number, have:string[], missing:string[], devices:{id,level}[], missingDevices:string[], deviceBonus:number, unknown:{time:boolean,difficulty:boolean} }`
  - Reihenfolge: `coverage` ↓, `deviceBonus` ↓, `timeMin` ↑ (unbekannt zuletzt). Deduplizierung nach `source+title` (case-insensitiv). Rezepte ohne Zutaten werden verworfen.

- [ ] **Step 1: Tests:** Abdeckung < 0,5 wird entfernt; Rezept mit Thermomix-Pflicht ohne Gerät wird ausgeblendet und `hiddenByDevice` steigt, mit `showBlocked: true` erscheint es mit `missingDevices`; Gerätebonus schlägt bei gleicher Abdeckung; `maxTimeMin: 30` filtert 45-Min-Rezept, behält Rezept ohne `timeMin` mit `unknown.time true`; Diätfilter `vegan` entfernt Käse-Rezept; Duplikate werden zusammengeführt; Rezept mit `ingredients: []` fehlt im Ergebnis.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren** `rankRecipes` als reine Funktion (Gerätetext = Titel + `steps` + Zutaten-`raw`).
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: ranking and filters`.

### Task 6: HTTP-Helfer und Cache

**Files:**
- Create: `server/lib/http.js`, `server/lib/cache.js`
- Test: `test/http.test.js`, `test/cache.test.js`

**Interfaces:**
- Produces:
  - `fetchText(url: string, opts?: { timeoutMs?: number, maxBytes?: number, headers?: object }): Promise<string>` – wirft `HttpError` (mit `status`) bei Nicht-2xx, Timeout (Standard 8000 ms), Überschreiten von `maxBytes` (Standard 2 MB) oder Host außerhalb der Allowlist. Gzip wird dekodiert (Node-`fetch`). User-Agent `FoodFinder/1.0 (+Hobby-Projekt)`.
  - `fetchJson<T>(url, opts): Promise<T>`
  - `createCache(ttlMs: number, max?: number): { get(k), set(k,v), wrap(k, fn): Promise<V> }` – `wrap` vermeidet doppelte parallele Aufrufe.

- [ ] **Step 1: Tests:** Host `evil.example` wird sofort mit `HttpError` abgelehnt (ohne Netzwerk); lokaler Test-Server (über injizierbare Allowlist `allowHosts` in opts) liefert 500 ⇒ `HttpError.status === 500`; zu große Antwort ⇒ Fehler; Timeout ⇒ Fehler; Cache liefert zweiten Aufruf ohne erneutes `fn`; abgelaufener Eintrag wird neu geladen; parallele `wrap`-Aufrufe rufen `fn` einmal.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren** mit `AbortController` und Stream-Zähler für `maxBytes`.
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: http helper with allowlist and cache`.

### Task 7: Quellen (TheMealDB, JSON-LD, Lecker, Chefkoch)

**Files:**
- Create: `server/sources/index.js`, `server/sources/themealdb.js`, `server/sources/jsonld.js`, `server/sources/lecker.js`, `server/sources/chefkoch.js`, `test/fixtures/*` (echte Antworten, beim Bau mit `curl` gespeichert)
- Test: `test/sources.test.js`

**Interfaces:**
- Consumes: `fetchText`/`fetchJson`, `createCache`, `normalizeIngredient`.
- Produces:
  - `type Source = { id:string, label:string, search(q:{ingredients:string[]}, ctx:{fetchText,fetchJson}): Promise<Recipe[]> }`
  - `parseRecipeJsonLd(html: string, url: string): Recipe | null` – liest `<script type="application/ld+json">` (auch `@graph`, Array, `@type` als Liste), mappt `recipeIngredient`, `totalTime` (ISO-8601 `PT1H15M` ⇒ Minuten), `image` (String/Objekt/Array), verwirft ohne Zutaten; setzt **kein** `steps`.
  - `defaultSources(): Source[]` = `[themealdb, lecker, chefkoch]`.
  - TheMealDB: zu jeder Eingabezutat (max. 5, englisch via `ingredients.json`) `filter.php?i=`, Schnittmenge/Vereinigung, Details via `lookup.php?i=` (max. 12 Rezepte), Zutaten aus `strIngredient1..20` + `strMeasure`, `steps` aus `strInstructions`, `language:'en'`.
  - Lecker: Suche mit den 2–3 Hauptzutaten, Rezeptlinks (`/rezepte/`) extrahieren, bis zu 8 Seiten parallel laden, per `parseRecipeJsonLd`, `language:'de'`. Selektoren werden gegen die Fixture der Live-Suchseite geschrieben; Reaktion bei Layoutwechsel: leere Liste, nicht Absturz.
  - Chefkoch: dieselbe Technik, bei `HttpError 403` wirft die Quelle den Fehler weiter (wird im API-Layer als `ok:false` gemeldet).

- [ ] **Step 1: Fixtures sammeln:** TheMealDB-Antworten (`filter`, `lookup`), eine Lecker-Suchseite und eine Lecker-Rezeptseite per `curl --compressed` in `test/fixtures/`.
- [ ] **Step 2: Tests schreiben:** `parseRecipeJsonLd` auf Lecker-Fixture ⇒ Titel, ≥ 3 Zutaten, `url`, `language 'de'`; auf HTML ohne JSON-LD ⇒ `null`; `PT1H15M` ⇒ 75; JSON-LD mit `@graph`; TheMealDB-Mapping aus Fixture (Zutaten, `steps`, `language 'en'`); Lecker-Suche aus Fixture liefert Rezepte; Layout-Müll ⇒ `[]`.
- [ ] **Step 3: Ausführen**, erwarten: FAIL.
- [ ] **Step 4: Implementieren** die vier Module; Cache je Quelle (TTL 15 Min).
- [ ] **Step 5: Ausführen**, erwarten: PASS. Zusätzlich ein Live-Smoke-Skript `node scripts/smoke-sources.js "tomate,zwiebel"` laufen lassen; Ergebnis je Quelle (Anzahl oder Fehler) festhalten.
- [ ] **Step 6: Commit** `feat: recipe sources`.

### Task 8: API

**Files:**
- Modify: `server/app.js`
- Create: `server/api.js`, `server/lib/ratelimit.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `defaultSources`, `rankRecipes`, `listDevices`, `suggestIngredients`.
- Produces:
  - `POST /api/search` Body = `Query` (siehe Task 5, Eingaben validiert) ⇒ `{ recipes: RankedRecipe[], hiddenByDevice:number, sources:{id,label,ok,count,error?}[] }`.
  - `GET /api/suggest?q=…` ⇒ `{ suggestions:string[] }`; `GET /api/devices` ⇒ Ergebnis von `listDevices()`.
  - Fehler: 400 `{ error: string }` auf Deutsch; 429 bei Rate-Limit (30 Anfragen/Minute/IP).

- [ ] **Step 1: Tests** (mit gestubbten Quellen über `createApp({sources})`): Erfolg liefert Rezepte und `sources` mit `ok:true`; eine Quelle wirft ⇒ `ok:false`, andere Ergebnisse bleiben; alle Quellen werfen ⇒ 200, `recipes []`, alle `ok:false`; Quelle hängt über Timeout ⇒ `ok:false`; leere Zutaten ⇒ 400; 31 Zutaten ⇒ 400; Eintrag mit 61 Zeichen ⇒ 400; doppelte Zutaten werden dedupliziert; 31. Anfrage innerhalb einer Minute ⇒ 429; `/api/suggest?q=tom` enthält `tomate`.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: Implementieren**; Quellen parallel mit `Promise.allSettled` und Quellen-Timeout 10 s; Rate-Limit als kleine In-Memory-Implementierung (`ratelimit.js`).
- [ ] **Step 4: Ausführen**, erwarten: PASS.
- [ ] **Step 5: Commit** `feat: search api`.

### Task 9: Frontend

**Files:**
- Create/Modify: `public/index.html`, `public/styles.css`, `public/app.js`, `public/state.js`, `public/render.js`
- Test: `test/state.test.js` (reine Zustandslogik)

**Interfaces:**
- Consumes: API aus Task 8.
- Produces: `public/state.js` exportiert `loadState(storage)`, `saveState(storage, state)`, `addIngredient(state, name)`, `toggleDevice(state, id)`, `toggleFavorite(state, recipe)`; Zustand = `{ ingredients:string[], devices:string[], customDevices:string[], filters:{…}, favorites:Recipe[] }`; defekter/alter localStorage-Inhalt fällt auf Standardzustand zurück.

- [ ] **Step 1: Zustandstests** (`node:test` mit Fake-Storage): Duplikate werden ignoriert, Eintrag trimmt/kürzt auf 60 Zeichen, kaputtes JSON im Storage ⇒ Standardzustand, Favorit hinzufügen/entfernen.
- [ ] **Step 2: Ausführen**, erwarten: FAIL.
- [ ] **Step 3: `state.js` implementieren.**
- [ ] **Step 4: Skill `frontend-design:frontend-design` aufrufen** und danach UI bauen: Drei Schritte (Zutaten, Geräte, Ergebnisse) mit Schritt-Anzeige; Zutaten-Tags mit Autocomplete (`/api/suggest`, Enter/Komma fügt hinzu); Geräte als gruppierte Kacheln plus Freitextfeld; Ergebnis-Karten mit Abdeckungsbalken, "Du hast"/"Fehlt"-Listen, Geräte-Chips, Quelle, Zeit/Schwierigkeit, Link; Filterleiste (Ernährung, Zeit, Schwierigkeit), Hinweis auf ausgeblendete Rezepte mit Schalter, Quellenstatus (auch Fehler) sichtbar, Ladezustand, leere Zustände, Merkliste. Mobile-first, Dark Mode (`prefers-color-scheme` + Schalter), Tastatur- und Screenreader-tauglich. Rendern nur über `textContent`/DOM-APIs; Bild-URLs nur `https:`.
- [ ] **Step 5: Ausführen** `npm test`, erwarten: PASS.
- [ ] **Step 6: Commit** `feat: frontend`.

### Task 10: End-to-End-Prüfung, README, Abschluss

**Files:**
- Create: `scripts/e2e.mjs` (Playwright), `README.md` (Ersatz des Platzhalters)
- Modify: ggf. Fehler aus dem Durchlauf

- [ ] **Step 1: Server starten** (`npm start`) und `scripts/e2e.mjs` laufen lassen: Zutaten `Tomate, Zwiebel, Nudeln` eingeben, Gerät Stabmixer wählen, Suche, ≥ 1 Karte sichtbar, Quellenstatus sichtbar; Reload behält Auswahl; Favorit bleibt nach Reload; Dark-Mode-Schalter wirkt; XSS-Probe: Zutat `<img src=x onerror=alert(1)>` löst keinen Dialog aus. Screenshots mobil (390 px) und Desktop (1280 px, `deviceScaleFactor: 2`) in den Scratchpad speichern und ansehen.
- [ ] **Step 2: Fehler beheben**, die der Durchlauf zeigt, jeweils mit neuem Test, wenn es Logik betrifft.
- [ ] **Step 3: README** (Start, Quellen, Grenzen: Chefkoch evtl. gesperrt, Heuristiken, optionale Keys) schreiben.
- [ ] **Step 4: `npm test` komplett**, erwarten: alles PASS; Ergebnis ehrlich berichten, inklusive Quellen, die live nicht erreichbar waren.
- [ ] **Step 5: Commit und Push** auf `claude/epic-cerf-4mor5i`.
