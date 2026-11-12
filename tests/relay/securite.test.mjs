/* Correctifs de la repasse de sécurité : chaque test reproduit l'attaque décrite, et vérifie qu'elle ne marche plus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../../relay/jeux.js';
import { relay } from '../helpers/relay.mjs';

test('la modération du bot passe avant les commandes : un !defi avec un mot interdit est supprimé et ne crée rien', async () => {
  const R = await relay(); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  await R.req('PUT', '/me/bot', { enabled: true, mod: { words: { on: true, list: 'motinterdit', action: 'delete' } } }, { token: S });
  await R.req('PUT', '/me/jeux', { enabled: true, defiCost: 0, defiGoal: 300 }, { token: S });
  await R.chat('7', 'lou', 'salut');
  await R.chat('7', 'lou', '!defi dis motinterdit en live');
  const id = (await R.req('POST', '/me/overlays', { tool: 'defis', name: 'D', settings: {} }, { token: S }))[1].id;
  assert.deepEqual((await R.req('GET', `/o/${id}/jeux`))[1].defis, [], 'aucun défi créé');
  assert.ok(R.state.calls.some((c) => c.method === 'DELETE' && c.url.includes('moderation/chat')), 'message supprimé');
  assert.ok(!R.state.said.some((m) => /Défi n°1/.test(m)));
});

test('!sr : une rafale de demandes pendant la recherche YouTube ne lance qu’une recherche', async () => {
  const R = await relay({ env: { YOUTUBE_API_KEY: 'cle-test' } }); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  await R.req('PUT', '/me/sr', { enabled: true, source: 'youtube', cooldown: 30 }, { token: S });
  let searches = 0;
  R.route(/youtube\/v3\/search/, async () => { searches++; await new Promise((ok) => setTimeout(ok, 30)); return new Response(JSON.stringify({ items: [{ id: { videoId: 'dQw4w9WgXcQ' } }] })); });
  R.route(/youtube\/v3\/videos/, () => new Response(JSON.stringify({ items: [{ snippet: { title: 'Titre', channelTitle: 'Chaîne' }, contentDetails: { duration: 'PT3M' }, status: { embeddable: true } }] })));
  await Promise.all(Array.from({ length: 6 }, () => R.chat('7', 'lou', '!sr une chanson')));
  assert.equal(searches, 1);
  const [, q] = await R.req('GET', '/me/sr', null, { token: S });
  assert.equal(q.queue.items.length, 1, 'la demande retenue est bien dans la file');
});

test('!sr : 20 recherches par titre par heure et par chaîne au plus (clé YouTube partagée)', async () => {
  const R = await relay({ env: { YOUTUBE_API_KEY: 'cle-test' } }); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  await R.req('PUT', '/me/sr', { enabled: true, source: 'youtube', cooldown: 0 }, { token: S });
  let searches = 0;
  R.route(/youtube\/v3\/search/, () => { searches++; return new Response(JSON.stringify({ items: [] })); });
  for (let i = 0; i < 25; i++) await R.chat(String(10 + i), 'v' + i, '!sr chanson ' + i);
  assert.equal(searches, 20);
  assert.ok(R.state.said.some((m) => /trop de recherches/.test(m)));
});

test('défis : un défi en cours n’est jamais retiré de la liste, même avec beaucoup de défis terminés', async () => {
  const now = Date.parse('2026-11-12T20:00:00Z');
  const G = { defis: [{ n: 1, status: 'ouvert', total: 200, backers: { a: 200 } }] };
  for (let i = 2; i <= 40; i++) G.defis.push({ n: i, status: 'fait', endedAt: now - 1000 });
  const P = { store: new Map(), async get(id) { return this.store.get(id) || { id, n: 1000 }; }, async put(id, p) { this.store.set(id, p); } };
  const cfg = J.sanitizeGames({ enabled: true, defiCost: 0 }, null);
  await J.onChat(cfg, G, P, { text: '!defis', login: 'x', name: 'x', userId: 'x' }, 0, now);
  assert.ok(G.defis.some((d) => d.n === 1 && d.status === 'ouvert'), 'le défi ouvert et sa cagnotte restent');
  assert.equal(G.defis.length, 11, 'le défi en cours + les 10 derniers terminés');
});

test('défis : « !defi non 3 merci » d’un modo refuse bien le défi n°3', async () => {
  const now = Date.parse('2026-11-12T20:00:00Z');
  const G = J.freshGames(), P = { store: new Map(), async get(id) { return this.store.get(id) || { id, n: 1000 }; }, async put(id, p) { this.store.set(id, p); } };
  const cfg = J.sanitizeGames({ enabled: true, defiCost: 0, defiGoal: 500 }, null);
  for (const t of ['un', 'deux', 'trois']) await J.onChat(cfg, G, P, { text: '!defi défi ' + t, login: 'm', name: 'm', userId: 'm' }, 3, now);
  assert.match(await J.onChat(cfg, G, P, { text: '!defi non 3 merci', login: 'm', name: 'm', userId: 'm' }, 3, now), /n°3 refusé/);
  assert.equal(G.defis.length, 3, 'pas de nouveau défi « non 3 merci »');
});

test('classement des messages : une rafale de messages compte pour un', async () => {
  const P = { store: new Map(), async get(id) { return this.store.get(id) || { id, n: 0 }; }, async put(id, p) { this.store.set(id, p); } };
  const cfg = J.sanitizeGames({ enabled: true }, null), t = Date.parse('2026-11-12T20:00:00Z');
  for (let i = 0; i < 50; i++) await J.earn(cfg, P, { id: 'a', name: 'A', login: 'a' }, false, t + i * 100);
  await J.earn(cfg, P, { id: 'a', name: 'A', login: 'a' }, false, t + 10000);
  assert.equal(P.store.get('a').mm, 3);
});

test('journal des musiques : une date réécrite ne fausse pas le compteur, une date lointaine est ramenée à maintenant', async () => {
  const R = await relay();
  const room = R.env.ROOM.get('chan:streameur');
  const post = (t) => room.fetch('https://room/tracks', { method: 'POST', body: JSON.stringify(t) });
  const at = Date.now() - 5000;
  for (let i = 0; i < 30; i++) await post({ at, title: 'T' + i, artist: 'A' });
  assert.equal(await room.ctx.storage.get('n'), 1, 'même instant réécrit 30 fois : un seul morceau compté');
  await post({ at: 9e14, title: 'Futur', artist: 'B' });
  const keys = [...(await room.ctx.storage.list({ prefix: 't:' })).keys()];
  assert.ok(keys.every((k) => +k.slice(2) <= Date.now() + 60000), 'aucune date dans le futur lointain');
});

test('salon de dons plein : les nouvelles connexions passent, les plus anciennes sont fermées', async () => {
  const R = await relay();
  const room = R.env.ROOM.get('key:cleKofiDeTest123');
  for (let i = 0; i < 205; i++) assert.equal((await room.fetch('https://room/ws')).status, 101);
  assert.equal(room.ctx.getWebSockets().length, 200);
  assert.equal(room.ctx.sockets[0].closed, true, 'la plus ancienne est fermée');
  assert.equal(room.ctx.sockets.at(-1).closed, false, 'la plus récente est ouverte');
});

test('équipe : des comptes non modos ne bloquent pas un vrai modo, et Twitch n’est lu qu’une fois', async () => {
  const R = await relay(); const A = await R.login('a'), B = await R.login('b'), C = await R.login('c'), D = await R.login('d');
  assert.equal((await R.req('PUT', '/me/team', { mods: true }, { token: A }))[0], 200);
  for (let i = 0; i < 40; i++) assert.equal((await R.req('POST', '/me/team/100', { method: 'GET', path: 'polls' }, { token: i % 2 ? C : D }))[0], 403);
  assert.equal((await R.req('POST', '/me/team/100', { method: 'GET', path: 'polls' }, { token: B }))[0], 200, 'le modo passe');
  assert.equal(R.state.calls.filter((c) => c.url.includes('moderation/moderators')).length, 1);
});
