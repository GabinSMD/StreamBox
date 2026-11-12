import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relay } from '../helpers/relay.mjs';

test('connexion : une session donne accès à /me, sans session → 401', async () => {
  const R = await relay();
  const S = await R.login('a');
  const [s, me] = await R.req('GET', '/me', null, { token: S });
  assert.equal(s, 200); assert.equal(me.login, 'streameur');
  assert.equal((await R.req('GET', '/me'))[0], 401);
  assert.equal((await R.req('GET', '/me', null, { token: 'x'.repeat(40) }))[0], 401);
});

test('déconnexion partout : toutes les sessions du compte cessent de marcher', async () => {
  const R = await relay();
  const A = await R.login('a'), B = await R.login('a');
  assert.equal((await R.req('POST', '/me/logout-all', {}, { token: A }))[0], 200);
  assert.equal((await R.req('GET', '/me', null, { token: A }))[0], 401);
  assert.equal((await R.req('GET', '/me', null, { token: B }))[0], 401);
  const C = await R.login('a'); // une nouvelle connexion marche
  assert.equal((await R.req('GET', '/me', null, { token: C }))[0], 200);
});

test('suppression du compte : une ancienne session ne revient pas après une reconnexion', async () => {
  const R = await relay();
  const A = await R.login('a'), old = await R.login('a');
  assert.equal((await R.req('DELETE', '/me', null, { token: A }))[0], 200);
  await R.login('a');
  assert.equal((await R.req('GET', '/me/twitch-token', null, { token: old }))[0], 401);
});

test('Ko-fi : jeton de vérification exigé, clé reliée à un seul compte', async () => {
  const R = await relay();
  const A = await R.login('a'), D = await R.login('d');
  assert.equal((await R.req('PUT', '/me/secrets', { kofi: 'cleKofiDeTest123', kofiv: 'VERIF' }, { token: A }))[0], 200);
  const kofi = (tok, q = '') => R.req('POST', '/kofi/cleKofiDeTest123' + q, 'data=' + encodeURIComponent(JSON.stringify({ verification_token: tok, amount: '5', from_name: 'X', kofi_transaction_id: 't' + Math.random() })), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal((await kofi('VERIF'))[0], 200);
  assert.equal((await kofi('faux'))[0], 403);
  assert.equal((await kofi('faux', '?v=faux'))[0], 403, 'le ?v= de l’adresse ne remplace pas le jeton enregistré');
  const hook = (q, h) => R.req('POST', '/hook/cleKofiDeTest123' + q, { name: 'X', amount: 5 }, { headers: h });
  assert.equal((await hook(''))[0], 403);
  assert.equal((await hook('?v=VERIF'))[0], 200);
  assert.equal((await hook('', { 'X-StreamBox-Token': 'VERIF' }))[0], 200);
  assert.equal((await R.req('PUT', '/me/secrets', { kofi: 'cleKofiDeTest123' }, { token: D }))[0], 409, 'un autre compte ne reprend pas la clé');
});

test('équipe : un non-modo n’épuise pas la limite du streamer et des modos', async () => {
  const R = await relay();
  const A = await R.login('a'), B = await R.login('b'), C = await R.login('c');
  assert.equal((await R.req('PUT', '/me/team', { mods: true }, { token: A }))[0], 200);
  for (let i = 0; i < 95; i++) assert.equal((await R.req('POST', '/me/team/100', { method: 'GET', path: 'polls' }, { token: C }))[0], 403);
  assert.equal((await R.req('POST', '/me/team/100', { method: 'GET', path: 'polls' }, { token: B }))[0], 200, 'modo');
  assert.equal((await R.req('POST', '/me/team/100', { method: 'GET', path: 'polls' }, { token: A }))[0], 200, 'streamer');
});

test('alias YouTube : il faut prouver que la chaîne est à soi', async () => {
  const R = await relay();
  const link = () => R.req('POST', '/tracks/streameur/youtube', { channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }, { headers: { Authorization: 'Bearer tok-a' } });
  const [s1, d1] = await link();
  assert.equal(s1, 403); assert.match(d1.code, /^streambox-[0-9a-f]{10}$/);
  R.state.ytPage = 'Ma chaîne ' + d1.code;
  assert.equal((await link())[0], 200);
  R.state.ytPage = '';
  assert.equal((await link())[0], 200, 'déjà reliée au même login');
  const other = await R.req('POST', '/tracks/autre/youtube', { channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }, { headers: { Authorization: 'Bearer tok-d' } });
  assert.equal(other[0], 403, 'un autre compte ne la reprend pas sans preuve');
});

test('EventSub : signature vérifiée, horodatage illisible refusé', async () => {
  const R = await relay();
  const bad = await R.worker.fetch(new Request('https://relais.test/eventsub', { method: 'POST', body: '{}', headers: { 'Twitch-Eventsub-Message-Id': '1', 'Twitch-Eventsub-Message-Timestamp': 'pas une date', 'Twitch-Eventsub-Message-Signature': 'sha256=00' } }), R.env);
  assert.equal(bad.status, 403);
  assert.equal(await R.eventsub('stream.online', { started_at: new Date().toISOString() }), 202, 'compte inconnu : Twitch réessaiera');
  await R.login('a');
  assert.equal(await R.eventsub('stream.online', { started_at: new Date().toISOString() }), 204);
});
