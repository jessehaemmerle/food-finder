import {
  loadState, saveState, searchBody, addIngredient, removeIngredient, toggleDevice,
  addCustomDevice, removeCustomDevice, toggleFavorite, isFavorite,
} from './state.js';
import { h, recipeCard } from './render.js';

const $ = (id) => document.getElementById(id);
const STEPS = ['ingredients', 'devices', 'results'];

let state = loadState(localStorage);
let deviceLabels = {};
let groups = [];
let sourceLabels = {};
let showBlocked = false;
let lastHidden = 0;
let currentStep = 'ingredients';
let inFavorites = false;
let controller;
let searchTimer;

function update(next) {
  state = next;
  saveState(localStorage, state);
}

/* ---------- navigation ---------- */
function showStep(step, { focus = true } = {}) {
  currentStep = step;
  inFavorites = false;
  for (const s of STEPS) $(`step-${s}`).hidden = s !== step;
  $('favorites-view').hidden = true;
  $('open-favorites').setAttribute('aria-pressed', 'false');
  for (const b of document.querySelectorAll('.steps button')) {
    if (b.dataset.step === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  }
  if (step === 'results') runSearch();
  if (focus) $(`h-${step}`).focus({ preventScroll: false });
}

function showFavorites() {
  inFavorites = true;
  for (const s of STEPS) $(`step-${s}`).hidden = true;
  $('favorites-view').hidden = false;
  $('open-favorites').setAttribute('aria-pressed', 'true');
  for (const b of document.querySelectorAll('.steps button')) b.removeAttribute('aria-current');
  renderFavorites();
  $('h-favorites').focus();
}

/* ---------- ingredients ---------- */
function renderIngredients() {
  const list = $('ingredient-list');
  list.replaceChildren(...state.ingredients.map((name) =>
    h('li', { class: 'chip' }, name,
      h('button', { type: 'button', 'aria-label': `${name} entfernen`, onclick: () => { update(removeIngredient(state, name)); renderIngredients(); } }, '×'))));
  $('ingredient-empty').hidden = state.ingredients.length > 0;
}

function addIngredientFromInput(value = $('ingredient-input').value) {
  const before = state.ingredients.length;
  update(addIngredient(state, value));
  $('ingredient-input').value = '';
  closeSuggestions();
  renderIngredients();
  if (state.ingredients.length === before && value.trim()) $('ingredient-input').setAttribute('aria-description', 'Diese Zutat steht schon in der Liste.');
}

let suggestions = [];
let activeSuggestion = -1;
let suggestTimer;

function closeSuggestions() {
  suggestions = [];
  activeSuggestion = -1;
  $('suggestions').hidden = true;
  $('suggestions').replaceChildren();
  $('ingredient-input').setAttribute('aria-expanded', 'false');
  $('ingredient-input').removeAttribute('aria-activedescendant');
}

function renderSuggestions() {
  const box = $('suggestions');
  box.replaceChildren(...suggestions.map((s, i) =>
    h('li', { id: `sug-${i}`, role: 'option', 'aria-selected': String(i === activeSuggestion), onmousedown: (e) => { e.preventDefault(); addIngredientFromInput(s); } }, s)));
  box.hidden = suggestions.length === 0;
  $('ingredient-input').setAttribute('aria-expanded', String(suggestions.length > 0));
  if (activeSuggestion >= 0) $('ingredient-input').setAttribute('aria-activedescendant', `sug-${activeSuggestion}`);
  else $('ingredient-input').removeAttribute('aria-activedescendant');
}

async function fetchSuggestions(q) {
  if (!q.trim()) return closeSuggestions();
  try {
    const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if ($('ingredient-input').value !== q) return;
    suggestions = (data.suggestions ?? []).filter((s) => !state.ingredients.some((i) => i.toLowerCase() === s.toLowerCase()));
    activeSuggestion = -1;
    renderSuggestions();
  } catch { closeSuggestions(); }
}

function wireIngredients() {
  const input = $('ingredient-input');
  input.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = input.value;
    if (q.includes(',')) { q.split(',').forEach((part) => update(addIngredient(state, part))); input.value = ''; closeSuggestions(); renderIngredients(); return; }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); activeSuggestion = (activeSuggestion + 1) % suggestions.length; renderSuggestions(); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); activeSuggestion = (activeSuggestion - 1 + suggestions.length) % suggestions.length; renderSuggestions(); }
    else if (e.key === 'Escape') closeSuggestions();
    else if (e.key === 'Enter' && activeSuggestion >= 0) { e.preventDefault(); addIngredientFromInput(suggestions[activeSuggestion]); }
  });
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 100));
  $('ingredient-form').addEventListener('submit', (e) => { e.preventDefault(); addIngredientFromInput(); });
  $('to-devices').addEventListener('click', () => showStep('devices'));
}

/* ---------- devices ---------- */
function renderDevices() {
  $('device-groups').replaceChildren(...groups.map((g) =>
    h('fieldset', { class: 'device-group' },
      h('legend', {}, g.label),
      h('div', { class: 'device-grid' }, g.devices.map((d) =>
        h('label', { class: 'tile' },
          h('input', { type: 'checkbox', checked: state.devices.includes(d.id), onchange: () => update(toggleDevice(state, d.id)) }),
          h('span', {}, d.label)))))));
  $('custom-device-list').replaceChildren(...state.customDevices.map((name) =>
    h('li', { class: 'chip' }, name,
      h('button', { type: 'button', 'aria-label': `${name} entfernen`, onclick: () => { update(removeCustomDevice(state, name)); renderDevices(); } }, '×'))));
}

function wireDevices() {
  $('custom-device-form').addEventListener('submit', (e) => {
    e.preventDefault();
    update(addCustomDevice(state, $('custom-device-input').value));
    $('custom-device-input').value = '';
    renderDevices();
  });
  $('back-to-ingredients').addEventListener('click', () => showStep('ingredients'));
  $('to-results').addEventListener('click', () => showStep('results'));
}

/* ---------- results ---------- */
function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

function cardOptions() {
  return {
    deviceLabels,
    ownedDevices: state.devices,
    sourceLabels,
    onFavorite: (recipe) => { update(toggleFavorite(state, recipe)); updateFavoritesCount(); if (inFavorites) renderFavorites(); else rerenderResults(); },
  };
}

let lastResponse;
function rerenderResults() {
  if (!lastResponse) return;
  $('results').replaceChildren(...lastResponse.recipes.map((r) => recipeCard(r, { ...cardOptions(), favorite: isFavorite(state, r.id) })));
}

function renderSources(sources) {
  sourceLabels = Object.fromEntries(sources.map((s) => [s.id, s.label]));
  $('sources').replaceChildren(...sources.map((s) =>
    h('li', { class: s.ok ? '' : 'is-down' }, s.ok ? `${s.label}: ${s.count} Treffer` : `${s.label}: nicht erreichbar (${s.error ?? 'Fehler'})`)));
}

function renderBlockedNote(hidden) {
  const note = $('blocked-note');
  lastHidden = hidden || lastHidden;
  if (!showBlocked && hidden === 0) { note.hidden = true; return; }
  note.hidden = false;
  $('blocked-text').textContent = showBlocked
    ? 'Rezepte, die ein fehlendes Gerät brauchen, sind eingeblendet.'
    : `${hidden} ${hidden === 1 ? 'Rezept braucht' : 'Rezepte brauchen'} ein Gerät, das du nicht ausgewählt hast.`;
  $('toggle-blocked').textContent = showBlocked ? 'Wieder ausblenden' : 'Trotzdem anzeigen';
}

async function runSearch() {
  if (!state.ingredients.length) {
    $('results').replaceChildren();
    $('sources').replaceChildren();
    $('blocked-note').hidden = true;
    setStatus('Füge zuerst mindestens eine Zutat hinzu.', true);
    return;
  }
  controller?.abort();
  controller = new AbortController();
  setStatus('Suche läuft …');
  try {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(searchBody(state, { showBlocked })), signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Die Suche ist fehlgeschlagen.');
    lastResponse = data;
    renderSources(data.sources);
    renderBlockedNote(data.hiddenByDevice);
    rerenderResults();
    const allDown = data.sources.length > 0 && data.sources.every((s) => !s.ok);
    if (allDown) setStatus('Alle Quellen sind gerade nicht erreichbar. Versuche es in ein paar Minuten noch einmal.', true);
    else if (!data.recipes.length) setStatus('Keine passenden Rezepte. Füge weitere Zutaten hinzu oder lockere die Filter.');
    else setStatus(`${data.recipes.length} ${data.recipes.length === 1 ? 'Rezept' : 'Rezepte'} gefunden`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setStatus(`${err.message || 'Die Suche ist fehlgeschlagen.'} Prüfe deine Verbindung und versuche es erneut.`, true);
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
}

function wireResults() {
  const form = $('filters');
  for (const [key, on] of Object.entries(state.filters.diet)) if (on && form.elements[key]) form.elements[key].checked = true;
  form.elements.maxTimeMin.value = state.filters.maxTimeMin ? String(state.filters.maxTimeMin) : '';
  form.elements.difficulty.value = state.filters.difficulty;
  $('diet-note').hidden = !Object.values(state.filters.diet).some(Boolean);
  form.addEventListener('change', () => {
    const diet = Object.fromEntries(['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'].filter((k) => form.elements[k].checked).map((k) => [k, true]));
    update({ ...state, filters: { diet, maxTimeMin: form.elements.maxTimeMin.value ? Number(form.elements.maxTimeMin.value) : null, difficulty: form.elements.difficulty.value } });
    $('diet-note').hidden = !Object.keys(diet).length;
    scheduleSearch();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('toggle-blocked').addEventListener('click', () => { showBlocked = !showBlocked; runSearch(); });
  $('back-to-devices').addEventListener('click', () => showStep('devices'));
}

/* ---------- favorites ---------- */
function updateFavoritesCount() { $('favorites-count').textContent = String(state.favorites.length); }

function renderFavorites() {
  $('favorites-empty').hidden = state.favorites.length > 0;
  $('favorites-list').replaceChildren(...state.favorites.map((r) => recipeCard(r, { ...cardOptions(), favorite: true, showDetails: false })));
}

/* ---------- theme ---------- */
function isDark() {
  const set = document.documentElement.dataset.theme;
  return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function renderTheme() {
  const btn = $('theme-toggle');
  btn.textContent = isDark() ? 'Hell' : 'Dunkel';
  btn.setAttribute('aria-pressed', String(isDark()));
  btn.setAttribute('aria-label', isDark() ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln');
}

/* ---------- boot ---------- */
async function loadDevices() {
  try {
    const data = await (await fetch('/api/devices')).json();
    groups = data.groups;
    deviceLabels = Object.fromEntries(groups.flatMap((g) => g.devices.map((d) => [d.id, d.label])));
  } catch {
    $('device-groups').textContent = 'Die Geräteliste konnte nicht geladen werden. Lade die Seite neu.';
  }
  renderDevices();
}

for (const b of document.querySelectorAll('.steps button')) b.addEventListener('click', () => showStep(b.dataset.step));
$('open-favorites').addEventListener('click', () => (inFavorites ? showStep(currentStep, { focus: false }) : showFavorites()));
$('theme-toggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('food-finder:theme', next); } catch { /* ignore */ }
  renderTheme();
});
wireIngredients();
wireDevices();
wireResults();
renderIngredients();
updateFavoritesCount();
renderTheme();
showStep('ingredients', { focus: false });
loadDevices();
