import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../../relay/jeux.js';
import { relay } from '../helpers/relay.mjs';

function memoryPoints(nowRef) {
  const store = new Map();
  return { store, async get(id) { return store.get(id) || { id, n: 0, name: '', login: '' }; }, async put(id, p) { store.set(id, p); }, async findByName() { return null; },
    async top(n, kind = 'points') { const mo = J.month(nowRef.t); const v = { points: (x) => x.n, messages: (x) => (x.mo === mo ? x.mm : 0), presence: (x) => (x.mo === mo ? x.mt : 0) }[kind];
      return [...store.values()].map((x) => ({ name: x.name, n: v(x) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, n); } };
}

test('défis : proposer, soutenir (plafonné), atteindre, relever, refuser avec remboursement', async () => {
  const now = { t: Date.parse('2026-11-12T20:00:00Z') }, P = memoryPoints(now);
  const cfg = J.sanitizeGames({ enabled: true, defiCost: 100, defiGoal: 500 }, null), G = J.freshGames();
  const say = (id, text, lvl = 0) => J.onChat(cfg, G, P, { text, login: id, name: id, userId: id }, lvl, now.t);
  for (const id of ['alice', 'bob']) await J.earn(cfg, P, { id, name: id, login: id }, false, now.t); // 100 points chacun
  (await P.get('alice')).n = 400; P.store.get('alice').n = 400; P.store.get('bob').n = 300;
  assert.match(await say('alice', '!defi joue sans HUD'), /Défi n°1 proposé/);
  assert.equal((await P.get('alice')).n, 300);
  assert.equal(await say('bob', '!soutenir 1 100'), null);
  assert.match(await say('alice', '!soutenir 1 1000'), /atteint/, 'mise plafonnée à ce qui manque');
  assert.equal((await P.get('alice')).n, 0);
  assert.match(await say('alice', '!defi chante'), /coûte/);
  P.store.get('bob').n = 500;
  assert.match(await say('bob', '!defi chante une chanson'), /n°2/);
  assert.match(await say('mod', '!defi non 2', 3), /refusé/);
  assert.equal((await P.get('bob')).n, 500, 'mise rendue');
  assert.match(await say('mod', '!defi fait 1', 3), /relevé/);
  assert.deepEqual(J.publicGames(cfg, G, [], now.t).defis.map((d) => d.status), ['fait', 'refusé']);
});

test('classements du mois : messages, présence, remise à zéro le mois suivant', async () => {
  const now = { t: Date.parse('2026-11-30T20:00:00Z') }, P = memoryPoints(now);
  const cfg = J.sanitizeGames({ enabled: true }, null), G = J.freshGames();
  for (let i = 0; i < 5; i++) { now.t += 61000; await J.earn(cfg, P, { id: 'a', name: 'Alice', login: 'a' }, false, now.t); }
  await J.earn(cfg, P, { id: 'b', name: 'Bob', login: 'b' }, false, now.t);
  assert.match(await J.onChat(cfg, G, P, { text: '!classement', login: 'a', name: 'Alice', userId: 'a' }, 0, now.t), /1\. Alice \(5\) · 2\. Bob \(1\)/);
  assert.match(await J.onChat(cfg, G, P, { text: '!classement presence', login: 'a', name: 'Alice', userId: 'a' }, 0, now.t), /Alice \(5 min\)/);
  now.t = Date.parse('2026-12-01T10:00:00Z');
  await J.earn(cfg, P, { id: 'b', name: 'Bob', login: 'b' }, false, now.t);
  assert.match(await J.onChat(cfg, G, P, { text: '!classement', login: 'a', name: 'Alice', userId: 'a' }, 0, now.t), /^💬 Messages du mois : 1\. Bob \(1\)$/);
});

test('mini-jeux par le chat : le défi arrive dans l’overlay Défis', async () => {
  const R = await relay(); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  await R.req('PUT', '/me/jeux', { enabled: true, defiCost: 0, defiGoal: 300 }, { token: S });
  await R.chat('7', 'lou', 'salut');
  await R.chat('7', 'lou', '!defi joue sans HUD');
  const id = (await R.req('POST', '/me/overlays', { tool: 'defis', name: 'D', settings: {} }, { token: S }))[1].id;
  const [, g] = await R.req('GET', `/o/${id}/jeux`);
  assert.equal(g.defis[0].text, 'joue sans HUD');
  assert.ok(R.state.said.some((m) => /Défi n°1 proposé/.test(m)), 'le bot l’annonce dans le chat');
});

test('moments forts : les clips les plus vus du live, sur Discord, sans mention', async () => {
  const R = await relay();
  const t = Date.now();
  R.route(/helix\/clips\?/, () => new Response(JSON.stringify({ data: [
    { title: 'Le clutch', url: 'https://clips.twitch.tv/A', view_count: 42, creator_name: 'Lou', created_at: new Date(t - 3600e3).toISOString() },
    { title: 'Fou rire', url: 'https://clips.twitch.tv/B', view_count: 1200, creator_name: 'Sacha', created_at: new Date(t - 3000e3).toISOString() },
    { title: 'Avant le live', url: 'https://clips.twitch.tv/C', view_count: 9999, creator_name: 'X', created_at: new Date(t - 99e6).toISOString() }] })));
  const acc = R.env.ACCOUNT.get('user:100').o;
  const text = await acc.postClips({ login: 'streameur', user_id: '100', lang: 'fr' }, { webhook: 'https://discord.com/api/webhooks/1/abc' }, { start: t - 4 * 3600e3, end: t - 600e3 });
  assert.match(text, /1\. \[Fou rire\]\(https:\/\/clips\.twitch\.tv\/B\)/);
  assert.doesNotMatch(text, /Avant le live/);
  assert.deepEqual(R.state.discord[0].allowed_mentions, { parse: [] });
});
