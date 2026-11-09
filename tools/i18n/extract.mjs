// Extrait les textes français de StreamBox (HTML statique + chaînes JS + modèles avec variables)
import fs from 'node:fs'; import path from 'node:path';
import * as acorn from 'acorn'; import * as walk from 'acorn-walk'; import { parse, parseFragment } from 'parse5';
const ROOT = process.argv[2], out = new Map(); // texte → fichiers
const addHtmlish = (s, file) => { // chaîne JS qui contient du HTML (innerHTML) : on en extrait les textes
  const frag = parseFragment(s.replace(/\{\d+\}/g, 'XVARX'));
  const visit = (n) => { if (n.nodeName === '#text') add(n.value.replace(/XVARX/g, ''), file, true); for (const a of n.attrs || []) if (['placeholder', 'title', 'aria-label', 'alt'].includes(a.name)) add(a.value, file); (n.childNodes || []).forEach(visit); };
  visit(frag);
};
const add = (s, file, fromHtml) => {
  if (!fromHtml && /\n/.test(s)) s.split('\n').forEach((l) => add(l, file)); // valeur sur plusieurs lignes : traduite ligne par ligne
  if (/<[a-z][\s\S]*>/i.test(s) && /<\/?(div|p|span|a|b|i|small|button|label|h\d|li|ul|summary|details|strong|em|code|br|img)\b/i.test(s)) return addHtmlish(s, file); s = s.replace(/\s+/g, ' ').trim(); if (!keep(s) && !word(s, fromHtml)) return; if (!out.has(s)) out.set(s, new Set()); out.get(s).add(file); };
const WORD = /[A-Za-zÀ-ÿœ]{2,}/;
// Un mot seul : texte s'il vient du HTML, ou s'il commence par une majuscule dans le JavaScript (« Copier », « Alertes »)
const word = (s, fromHtml) => /^[A-Za-zÀ-ÿœ’'-]{3,}$/.test(s) && (fromHtml || /^[A-ZÀ-Ý][a-zà-ÿœ’'-]+$/.test(s));
function keep(s) {
  if (!s || s.length < 2 || !WORD.test(s)) return false;
  const lit = s.replace(/\{[\w]+\}/g, '');
  if (!/[A-Za-zÀ-ÿœ]{3,}/.test(lit) && (lit.match(/[A-Za-zÀ-ÿœ]/g) || []).length < 4) return false;
  if (/^(https?:|wss?:|data:|\/\/|\.\.?\/)/.test(s)) return false;
  if (/^[\w$.\-\/:?=&%#@\[\]{}()*+,]+$/.test(s) && !/[À-ÿœ’]/.test(s)) return false; // identifiants, sélecteurs, chemins (sans espace ni accent)
  if (/[\w\])-]\s*\{[^}]*:[^}]*\}/.test(s) || /^[\w-]+\s*:\s*[^;]+;(\s*[\w-]+\s*:[^;]+;)*$/.test(s)) return false; // CSS
  if (/^(application|text|image|audio)\//.test(s)) return false;
  if (/^[a-z]+(-[a-z]+)*(\s+[a-z]+(-[a-z]+)*)*$/.test(s) && !/[À-ÿ]/.test(s) && s.split(' ').every((w) => w.length < 14 && /^[a-z-]+$/.test(w)) && /-|^(btn|small|ghost|on|box|note)/.test(s)) return false; // classes CSS
  if (/^(user|moderator|channel|clips|bits|chat):/.test(s)) return false; // permissions Twitch
  return true;
}
function html(file) {
  const src = fs.readFileSync(file, 'utf8'), rel = path.relative(ROOT, file);
  const doc = parse(src);
  const visit = (n, skip) => {
    if (n.nodeName === 'script') { const t = (n.childNodes || []).map((c) => c.value).join(''); if (t.trim()) js(t, rel); return; }
    if (n.nodeName === 'style') return;
    const sk = skip || n.nodeName === 'code';
    if (n.nodeName === '#text' && !sk) add(n.value, rel, true);
    for (const a of n.attrs || []) if (['placeholder', 'title', 'aria-label', 'alt'].includes(a.name) || (n.nodeName === 'meta' && a.name === 'content' && (n.attrs.find((x) => x.name === 'name') || {}).value === 'description')) add(a.value, rel);
    (n.childNodes || []).forEach((c) => visit(c, sk));
    if (n.content) visit(n.content, sk);
  };
  visit(doc, false);
}
function js(src, rel) {
  let ast;
  for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true }); break; } catch (e) { if (sourceType === 'module') { console.error('analyse impossible', rel, e.message); return; } } }
  const tmpl = (q, exprs) => q.quasis.map((x, i) => x.value.cooked + (i < exprs ? `{${i}}` : '')).join('');
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') add(n.value, rel);
    else if (n.type === 'TemplateLiteral') { add(tmpl(n, n.expressions.length), rel); n.quasis.forEach((q) => add(q.value.cooked, rel)); }
    else if (n.type === 'BinaryExpression' && n.operator === '+') { // 'a ' + x + ' b' → « a {0} b »
      const parts = []; const flat = (e) => { if (e.type === 'BinaryExpression' && e.operator === '+') { flat(e.left); flat(e.right); } else parts.push(e); };
      flat(n);
      if (parts.some((p) => p.type === 'Literal' && typeof p.value === 'string') && parts.some((p) => !(p.type === 'Literal'))) {
        let k = 0; add(parts.map((p) => (p.type === 'Literal' ? String(p.value) : p.type === 'TemplateLiteral' ? tmpl(p, p.expressions.length) : `{${k++}}`)).join(''), rel);
      }
    }
  });
}
const files = [];
const scan = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.git', 'i18n', '.github', 'vendor'].includes(e.name)) scan(f); } else files.push(f); });
scan(ROOT);
for (const f of files) {
  if (f.endsWith('.html')) html(f);
  else if (f.endsWith('.js')) { if (/annuaire-data\.js$/.test(f)) continue; js(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f)); }
}
const list = [...out.entries()].map(([s, fs_]) => ({ s, files: [...fs_].sort() })).sort((a, b) => a.files[0].localeCompare(b.files[0]) || a.s.localeCompare(b.s));
fs.writeFileSync(process.argv[3], JSON.stringify(list, null, 1));
console.log(list.length, 'textes ·', list.reduce((a, x) => a + x.s.length, 0), 'caractères');
const by = {}; list.forEach((x) => { const k = x.files[0].split('/')[0]; by[k] = (by[k] || 0) + 1; }); console.log(by);
