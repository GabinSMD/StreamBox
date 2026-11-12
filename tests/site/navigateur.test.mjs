/* Tests dans un vrai navigateur (Chromium, via Playwright) : le site est servi en local, le réseau extérieur est coupé.
 * Sans Playwright installé, ces tests sont ignorés en local (npm install pour les lancer) ; en CI ils sont obligatoires. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (e) { if (process.env.CI) throw new Error('Playwright est requis en CI (npm ci)'); }
const skip = !chromium && 'Playwright non installé (npm install)';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
let server, base, browser;
before(async () => {
  if (skip) return;
  server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function page(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ locale: 'fr-FR' }, opts));
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort()); // pas de réseau extérieur (Twitch, polices, relais…)
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  return p;
}
const tools = () => { const c = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/tools.js'), 'utf8'), c); return c.window; };

test('chaque overlay démarre en démo sans erreur JavaScript', { skip }, async () => {
  const p = await page();
  for (const t of tools().SB_TOOLS) {
    await p.goto(base + t.overlay + '?demo=1'); await p.waitForTimeout(250);
    assert.deepEqual(p.errors, [], t.overlay); p.errors.length = 0;
  }
  await p.context().close();
});

test('chaque page du site et chaque configurateur s’ouvrent sans erreur', { skip }, async () => {
  const p = await page();
  const W = tools();
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  for (const f of [...pages, ...W.SB_TOOLS.map((t) => 'outil.html?id=' + t.id)]) {
    await p.goto(base + f); await p.waitForTimeout(150);
    assert.deepEqual(p.errors, [], f); p.errors.length = 0;
  }
  await p.context().close();
});

test('catalogue : tous les outils, « Pour commencer », pas de débordement sur mobile', { skip }, async () => {
  const p = await page({ viewport: { width: 390, height: 844 } });
  await p.goto(base + 'outils.html'); await p.waitForTimeout(400);
  const W = tools();
  const n = [...W.SB_TOOLS, ...W.SB_PAGES].filter((t) => !t.mergedInto).length;
  assert.equal(await p.locator('#outils a.tool').count(), n);
  assert.equal(await p.locator('.start-path').count(), 3);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'débordement horizontal');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

/* Le cœur de la promesse « les tests ne changent rien » : après une rafale de faux événements, l'état en mémoire
 * de l'overlay et ce qu'il a enregistré sont strictement identiques à avant. */
const COUNTING = [
  ['objectifs.html', 'type=subs&start=10&target=20'], ['objectifs.html', 'type=bits&start=0&target=1000'],
  ['etiquettes.html', 'items=sub,cheer,follow,don,topbits'], ['compteurs.html', ''], ['score.html', ''],
  ['subathon.html', 'start=60&sub=5&bits=1'], ['roue.html', 'everysubs=2'], ['discord.html', 'webhook=https://discord.com/api/webhooks/1/x'],
];
const EVENTS = [{ kind: 'sub' }, { kind: 'gift', count: 5 }, { kind: 'bits', bits: 500 }, { kind: 'raid', viewers: 42 }, { kind: 'follow' }, { kind: 'don', amount: 5, currency: 'EUR' },
  { kind: 'chat', message: '!mort' }, { kind: 'chat', message: '!score 1 +1' }, { kind: 'chat', message: '!discord coucou' }, { kind: 'first' }];

for (const [file, q] of COUNTING) {
  test(`simulation sans effet : ${file}${q ? ' (' + q + ')' : ''}`, { skip }, async () => {
    const p = await page();
    await p.clock.install();
    await p.goto(`${base}overlays/${file}?channel=chaine_test&${q}`); await p.clock.runFor(500);
    const snap = () => p.evaluate(() => ({ state: SB._testable ? JSON.stringify(SB._testable.get()) : null, saved: JSON.stringify(Object.fromEntries(Object.entries(localStorage))) }));
    const before = await snap();
    const reacted = await p.evaluate((evs) => { const b = document.body.innerText; evs.forEach((e) => SB.simulate(Object.assign({ name: 'Testeur' }, e))); return { during: SB.testing() }; }, EVENTS);
    assert.equal(reacted.during, true, 'la fenêtre de test est ouverte');
    const mid = await snap();
    assert.equal(mid.saved, before.saved, 'rien n’est enregistré pendant le test');
    await p.clock.runFor(9000);
    const end = await snap();
    assert.equal(end.state, before.state, 'état en mémoire identique après le test');
    assert.equal(end.saved, before.saved, 'sauvegarde identique après le test');
    assert.equal(await p.evaluate(() => SB.testing()), false);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}

test('un vrai événement pendant un test est compté, et le test est annulé', { skip }, async () => {
  const p = await page();
  await p.clock.install();
  await p.goto(`${base}overlays/objectifs.html?channel=chaine_test&type=subs&start=10&target=20`); await p.clock.runFor(300);
  await p.evaluate(() => SB.simulate({ kind: 'gift', name: 'Testeur', count: 5 }));
  assert.match(await p.textContent('#num'), /^15/);
  await p.evaluate(() => SB.sources('chat')[0].emit('usernotice', Object.assign(SB.fake({ user: { login: 'vrai' }, text: '' }), { type: 'sub', months: 1, giftCount: 0 })));
  assert.match(await p.textContent('#num'), /^11/);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('sb-goal-')))));
  assert.equal(saved.value, 11);
  await p.context().close();
});

test('automatisations : une règle déclenchée par un test n’exécute aucune action', { skip }, async () => {
  const p = await page();
  const rules = encodeURIComponent(JSON.stringify([{ id: 'r1', name: 'Abo', on: true, trigger: { type: 'sub' }, actions: [{ type: 'scene', scene: 'Merci' }, { type: 'chat', text: 'merci {user}' }] }]));
  await p.goto(`${base}overlays/automatisations.html?channel=chaine_test&debug=1&rules=${rules}`); await p.waitForTimeout(300);
  await p.evaluate(() => SB.simulate({ kind: 'sub', name: 'Testeur' })); await p.waitForTimeout(200);
  const log = await p.textContent('#log');
  assert.match(log, /test/);
  assert.match(log, /non exécuté/);
  assert.doesNotMatch(log, /OBS non connecté|⚠️/, 'aucune action tentée');
  await p.context().close();
});

test('traduction de la page : un message de viewer piégé ne bloque pas l’overlay, et il n’est pas traduit', { skip, timeout: 60000 }, async () => {
  const p = await page();
  await p.goto(`${base}overlays/vedette.html?channel=chaine_test&lang=en`); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const dict = await (await fetch('../js/i18n/en.json')).json();
    const tpls = Object.keys(dict).filter((k) => /\{\w+\}/.test(k)).sort((a, b) => b.length - a.length).slice(0, 80);
    let worst = 0;
    for (const fr of tpls) { // les morceaux fixes du modèle répétés : le pire cas pour une recherche paresseuse
      const lits = fr.split(/\{\w+\}/).filter(Boolean);
      const trap = (lits.join(' a ') + ' ').repeat(Math.ceil(390 / (fr.length + 3))).slice(0, 390);
      for (const s of [trap, trap + ' x', 'Viewer hugs ' + 'a : '.repeat(60) + ' (total '.repeat(60)]) {
        const t0 = performance.now(); SB.t(s); worst = Math.max(worst, performance.now() - t0);
      }
    }
    const box = document.createElement('div'); box.append(...SB.messageNodes({ text: 'Défi introuvable.' })); document.body.append(box);
    await new Promise((ok) => setTimeout(ok, 200));
    return { worst, text: box.textContent, ui: SB.t('Défi introuvable.') };
  });
  assert.ok(r.worst < 250, `pire cas : ${Math.round(r.worst)} ms`);
  assert.equal(r.ui, 'Challenge not found.', 'le texte de l’interface est bien traduit');
  assert.equal(r.text, 'Défi introuvable.', 'le message du viewer reste tel quel');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
