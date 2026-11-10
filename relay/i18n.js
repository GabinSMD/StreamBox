/* Réponses du bot et des jeux dans la langue du streamer (même dictionnaire que le site, js/i18n/*.json).
 * Le texte français est traduit tel quel, ou reconnu par un modèle (« {0} a {1} pépites. ») */
import en from '../js/i18n/en.json';
import es from '../js/i18n/es.json';

/* Reconnaît un modèle « littéral {a} littéral {b} … » dans le texte : chaque valeur est la plus courte possible
 * (comme une expression régulière paresseuse), mais avec un nombre d'essais borné : un message de viewer ne peut
 * pas faire tourner le relais pendant des secondes (retour arrière catastrophique). */
const BUDGET = 2000;
function matchTpl(lits, k) {
  const n = lits.length - 1;
  if (!k.startsWith(lits[0]) || !k.endsWith(lits[n]) || k.length < lits[0].length + lits[n].length + n) return null;
  const end = k.length - lits[n].length, vals = new Array(n);
  let budget = BUDGET;
  const rec = (i, pos) => {
    if (i === n - 1) { if (end - pos < 1) return false; vals[i] = k.slice(pos, end); return true; }
    const L = lits[i + 1];
    for (let j = pos + 1; j <= end; j++) {
      if (L) { j = k.indexOf(L, j); if (j < 0 || j + L.length > end) return false; }
      if (--budget < 0) return false;
      vals[i] = k.slice(pos, j);
      if (rec(i + 1, j + L.length)) return true;
      if (budget < 0) return false;
    }
    return false;
  };
  return rec(0, lits[0].length) ? vals : null;
}
function compile(dict) {
  const exact = new Map(), patterns = [];
  for (const [fr, tr] of Object.entries(dict)) {
    if (!tr || tr === fr) continue;
    exact.set(fr, tr);
    if (!/\{\w+\}/.test(fr)) continue;
    if ((fr.replace(/\{\w+\}/g, '').match(/\p{L}/gu) || []).length < 4) continue; // modèle trop vague
    const parts = fr.split(/(\{\w+\})/), lits = [], names = [];
    parts.forEach((x, i) => (i % 2 ? names.push(x.slice(1, -1)) : lits.push(x)));
    patterns.push({ lits, names, tr, chunk: lits.slice().sort((a, b) => b.length - a.length)[0], len: fr.length });
  }
  patterns.sort((a, b) => b.len - a.len);
  return { exact, patterns };
}
const DICTS = { en, es };
const compiled = {};
function translate(D, s, depth) {
  const k = s.replace(/\s+/g, ' ').trim();
  const hit = D.exact.get(k);
  if (hit) return hit;
  if (depth > 2) return null;
  for (const p of D.patterns) {
    if (p.chunk && !k.includes(p.chunk)) continue;
    const m = matchTpl(p.lits, k);
    if (!m) continue;
    const vals = {}; p.names.forEach((n, i) => { vals[n] = translate(D, m[i], depth + 1) || m[i]; });
    return p.tr.replace(/\{(\w+)\}/g, (all, n) => (n in vals ? vals[n] : all));
  }
  return null;
}
export const LANGS = ['fr', 'en', 'es'];
export function tr(text, lang) {
  if (!text || !lang || lang === 'fr' || !DICTS[lang]) return text;
  const D = compiled[lang] || (compiled[lang] = compile(DICTS[lang]));
  return translate(D, String(text), 0) || text;
}
