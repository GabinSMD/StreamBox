/* StreamBox en plusieurs langues (français, anglais, espagnol).
 *
 * Le français reste la langue du code : chaque texte affiché est traduit à la volée à partir de son texte
 * français, grâce aux dictionnaires js/i18n/en.json et js/i18n/es.json (générés par tools/i18n-extract.mjs).
 * Les textes qui contiennent une valeur (« 4 joueur(s) ») sont reconnus par des modèles (« {0} joueur(s) »).
 * Les zones marquées data-i18n-skip (messages du chat, saisies des viewers) ne sont jamais traduites.
 *
 * Langue : ?lang=en dans l'URL, sinon celle choisie sur le site (mémorisée), sinon celle du navigateur.
 * Les overlays suivent leur réglage « lang » (SB.params appelle SB.setLang).
 */
(function () {
  'use strict';
  const LANGS = { fr: 'Français', en: 'English', es: 'Español' };
  const TAGS = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };
  const base = (document.currentScript && document.currentScript.src.replace(/js\/i18n\.js(\?.*)?$/, '')) || '';
  const isOverlay = /\/overlays\//.test(location.pathname);
  let exact = new Map(), patterns = [], lang = 'fr';
  const done = new WeakMap(); // nœud → dernier texte posé par nous (évite de retraduire en boucle)

  function pick() {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS[q]) { if (!isOverlay) try { localStorage.setItem('sb-lang', q); } catch (e) { /* ignore */ } return q; }
    if (isOverlay) return 'fr'; // un overlay ne dépend pas du navigateur d'OBS : il suit son propre réglage
    try { const s = localStorage.getItem('sb-lang'); if (LANGS[s]) return s; } catch (e) { /* ignore */ }
    const nav = (navigator.languages || [navigator.language || 'fr']).map((l) => String(l).slice(0, 2).toLowerCase());
    return nav.find((l) => LANGS[l]) || 'en';
  }

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const weak = (fr) => (fr.replace(/\{\w+\}/g, '').match(/\p{L}/gu) || []).length < 4;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compile(dict) {
    exact = new Map(); patterns = [];
    for (const [fr, tr] of Object.entries(dict)) {
      if (!tr || tr === fr) continue;
      if (!/\{\w+\}/.test(fr)) { exact.set(fr, tr); continue; }
      exact.set(fr, tr); // le modèle lui-même (texte brut avec {user} : messages par défaut)
      if (weak(fr)) continue; // « {0} par {1} » : trop vague, traduirait des bouts de phrases
      const names = [];
      const re = new RegExp('^' + fr.split(/(\{\w+\})/).map((part) => { const m = part.match(/^\{(\w+)\}$/); if (m) { names.push(m[1]); return '([\\s\\S]+?)'; } return esc(part); }).join('') + '$');
      const chunk = fr.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0];
      patterns.push({ re, names, tr, chunk, len: fr.length });
    }
    patterns.sort((a, b) => b.len - a.len); // le modèle le plus précis d'abord
  }
  function translate(s, depth) {
    const k = norm(s);
    if (!k || lang === 'fr') return null;
    const hit = exact.get(k);
    if (hit) return hit;
    if (depth > 2) return null;
    const icon = k.match(/^([^\p{L}\p{N}«“"(]+\s)(\p{L}[\s\S]*)$/u); // « 📊 Sondage par le chat »
    if (icon) { const r = translate(icon[2], depth + 1); if (r) return icon[1] + r; }
    // Texte assemblé de morceaux déjà traduits : « A · B », phrases mises bout à bout, listes « A, B, C »
    for (const [split, join] of [[/ · /, ' · '], [/(?<=[.!?…])\s+(?=\p{Lu})/u, ' '], [/, /, ', ']]) {
      const parts = k.split(split);
      if (parts.length < 2) continue;
      const tr = parts.map((x) => (join === ', ' ? exact.get(x) : translate(x, depth + 1)));
      if (tr.some(Boolean)) return parts.map((x, i) => tr[i] || x).join(join);
    }
    for (const p of patterns) {
      if (p.chunk && !k.includes(p.chunk)) continue;
      const m = k.match(p.re);
      if (!m) continue;
      const vals = {}; p.names.forEach((n, i) => { const v = m[i + 1]; vals[n] = translate(v, depth + 1) || v; });
      return p.tr.replace(/\{(\w+)\}/g, (all, n) => (n in vals ? vals[n] : all));
    }
    return null;
  }
  function t(s, vars) {
    let out = (typeof s === 'string' && translate(s, 0)) || s;
    if (vars) out = String(out).replace(/\{(\w+)\}/g, (all, n) => (n in vars ? vars[n] : all));
    return out;
  }

  /* ---------- Traduction de la page ---------- */
  const SKIP = 'script,style,code,pre,textarea,[data-i18n-skip],[contenteditable]';
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function skipped(el) { return !el || (el.closest && el.closest(SKIP)); }
  function textNode(n) {
    if (lang === 'fr' || done.get(n) === n.nodeValue || skipped(n.parentElement)) return;
    const v = n.nodeValue, tr = translate(v, 0);
    if (tr == null) return;
    const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    n.nodeValue = lead + tr + trail; done.set(n, n.nodeValue);
  }
  function element(el) { // attributs (placeholder, title…) : traduits même sur un champ de saisie
    if (lang === 'fr' || !el || (el.closest && el.closest('script,style,[data-i18n-skip]'))) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v && done.get(el) !== a + v) { const tr = translate(v, 0); if (tr != null) { el.setAttribute(a, tr); done.set(el, a + tr); } } }
  }
  function tree(root) {
    if (lang === 'fr' || !root) return;
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { element(root); if (skipped(root)) return; }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? (element(n), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else element(n); }
  }
  let observer = null, titleSeen = '';
  function start() {
    if (observer || lang === 'fr') return;
    observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(tree);
        else if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') element(m.target);
      }
      if (document.title !== titleSeen) { const tr = translate(document.title, 0); if (tr) document.title = tr; titleSeen = document.title; }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    tree(document.documentElement);
  }

  function load(l) {
    if (l === 'fr') { exact = new Map(); patterns = []; return; }
    try { // synchrone, comme la lecture des réglages des overlays : la page s'affiche directement traduite
      const x = new XMLHttpRequest(); x.open('GET', base + 'js/i18n/' + l + '.json', false); x.send();
      if (x.status === 200) compile(JSON.parse(x.responseText));
    } catch (e) { console.warn('StreamBox : traduction indisponible', e.message); }
  }
  function setLang(l) {
    if (!LANGS[l] || l === lang) return;
    lang = l; load(l);
    window.SB_LANG = l; window.SB_LANG_TAG = TAGS[l];
    document.documentElement.lang = l;
    start(); tree(document.documentElement);
  }

  window.SB_LANG = 'fr'; window.SB_LANG_TAG = 'fr-FR';
  const SB = (window.SB = window.SB || {});
  SB.LANGS = LANGS; SB.t = t; SB.setLang = setLang; SB.lang = () => lang;
  // Boîtes de dialogue du navigateur : traduites aussi
  ['alert', 'confirm', 'prompt'].forEach((f) => { const orig = window[f]; window[f] = function (msg, ...rest) { return orig.call(window, t(String(msg == null ? '' : msg)), ...rest); }; });
  setLang(pick());
})();
