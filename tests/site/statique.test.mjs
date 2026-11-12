/* Vérifications sans navigateur : syntaxe de tous les scripts, dictionnaires, registre des outils. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ls = (dir, ext) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
const PAGES = [...ls('.', '.html'), ...ls('overlays', '.html')];

function loadTools() { // js/tools.js est un script du navigateur : on l'exécute avec un faux window
  const ctx = { window: {} }; vm.runInNewContext(read('js/tools.js'), ctx);
  return { tools: ctx.window.SB_TOOLS, pages: ctx.window.SB_PAGES, paths: ctx.window.SB_PATHS };
}

test('tous les scripts du site se lisent sans erreur de syntaxe', () => {
  for (const f of [...ls('js', '.js'), ...ls('extension', '.js')]) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
  for (const f of PAGES) {
    const html = read(f);
    [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      assert.doesNotThrow(() => new vm.Script(m[1], { filename: `${f} (script ${i + 1})` }), `${f}, script ${i + 1}`);
    });
  }
});

test('les fichiers du relais se lisent (modules ES)', () => {
  for (const f of ls('relay', '.js')) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]);
});

test('dictionnaires : JSON valide, mêmes variables qu’en français, rien de vide', () => {
  const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const lang of ['en', 'es']) {
    const d = JSON.parse(read(`js/i18n/${lang}.json`));
    assert.ok(Object.keys(d).length > 1000, lang);
    for (const [fr, t] of Object.entries(d)) {
      assert.ok(typeof t === 'string' && t.trim(), `${lang} vide : ${fr}`);
      assert.equal(vars(t), vars(fr), `${lang} : variables différentes pour « ${fr} »`);
    }
  }
});

test('registre des outils : overlays présents, relais au courant de chaque outil', () => {
  const { tools, pages, paths } = loadTools();
  const worker = read('relay/worker.js');
  const needs = worker.slice(worker.indexOf('const NEEDS = {'), worker.indexOf('};', worker.indexOf('const NEEDS = {')));
  const ids = new Set();
  for (const t of tools) {
    assert.ok(!ids.has(t.id), 'identifiant en double : ' + t.id); ids.add(t.id);
    assert.ok(fs.existsSync(path.join(ROOT, t.overlay)), `${t.id} : ${t.overlay} introuvable`);
    assert.match(needs, new RegExp(`[{\\s,]'?${t.id}'?:`), `${t.id} absent de NEEDS (relay/worker.js) : le relais refuserait de l’enregistrer`);
    assert.ok(Array.isArray(t.need) && t.need.length === 2, `${t.id} : prérequis manquant`);
    for (const f of t.fields) assert.ok(f.key && f.type, `${t.id} : champ sans clé ou sans type`);
  }
  for (const p of pages) if (p.href && !/^https?:/.test(p.href)) assert.ok(fs.existsSync(path.join(ROOT, p.href.split(/[?#]/)[0])), `${p.id} : ${p.href} introuvable`);
  const all = new Set([...tools, ...pages].map((t) => t.id));
  for (const P of paths) for (const s of P.steps) assert.ok(all.has(s), `parcours ${P.id} : outil ${s} inconnu`);
});

test('relay/tool-keys.js est à jour (node tools/relay/tool-keys.mjs)', () => {
  const before = read('relay/tool-keys.js');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/relay/tool-keys.mjs')], { stdio: 'pipe' });
  const after = read('relay/tool-keys.js');
  if (after !== before) fs.writeFileSync(path.join(ROOT, 'relay/tool-keys.js'), before); // on ne laisse pas le fichier modifié
  assert.equal(after, before, 'un champ a changé dans js/tools.js : lance « node tools/relay/tool-keys.mjs » et ajoute le fichier');
});

test('chaque aperçu du catalogue existe', () => {
  const cat = read('js/catalogue.js');
  const ids = cat.match(/PREVIEWS = new Set\('([^']+)'/)[1].split(' ');
  for (const id of ids) assert.ok(fs.existsSync(path.join(ROOT, 'img/apercus', id + '.jpg')), 'aperçu manquant : ' + id);
});

test('aucun secret ni jeton dans le dépôt', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|html|json|toml|md)$/.test(f));
  const bad = /(oauth:[a-z0-9]{30}|discord(app)?\.com\/api\/webhooks\/\d{17,}\/[\w-]{60,}|sk-[A-Za-z0-9]{32}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY)/;
  for (const f of files) assert.doesNotMatch(read(f), bad, f);
});
