/* Réponses du bot et des jeux dans la langue du streamer (même dictionnaire que le site, js/i18n/*.json).
 * Le texte français est traduit tel quel, ou reconnu par un modèle (« {0} a {1} pépites. ») */
import en from '../js/i18n/en.json';
import es from '../js/i18n/es.json';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compile(dict) {
  const exact = new Map(), patterns = [];
  for (const [fr, tr] of Object.entries(dict)) {
    if (!tr || tr === fr) continue;
    exact.set(fr, tr);
    if (!/\{\w+\}/.test(fr)) continue;
    if ((fr.replace(/\{\w+\}/g, '').match(/\p{L}/gu) || []).length < 4) continue; // modèle trop vague
    const names = [];
    const re = new RegExp('^' + fr.split(/(\{\w+\})/).map((p) => { const m = p.match(/^\{(\w+)\}$/); if (m) { names.push(m[1]); return '([\\s\\S]+?)'; } return esc(p); }).join('') + '$');
    patterns.push({ re, names, tr, chunk: fr.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0], len: fr.length });
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
    const m = k.match(p.re);
    if (!m) continue;
    const vals = {}; p.names.forEach((n, i) => { vals[n] = translate(D, m[i + 1], depth + 1) || m[i + 1]; });
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
