import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relay } from '../helpers/relay.mjs';

const create = async (R, S, tool, settings = {}) => (await R.req('POST', '/me/overlays', { tool, name: tool, settings }, { token: S }))[1].id;
const config = async (R, id) => (await R.req('GET', '/o/' + id))[1].params;

test('les overlays pubs, votes, Hype Train et Musique ne reçoivent pas le jeton Twitch', async () => {
  const R = await relay(); const S = await R.login('a');
  for (const tool of ['pubs', 'votes', 'hypetrain', 'musique', 'webcam', 'defis', 'classement']) {
    const p = await config(R, await create(R, S, tool, { log: true }));
    assert.equal(p.token, undefined, tool);
  }
  assert.ok((await config(R, await create(R, S, 'alertes'))).token, 'les alertes en ont encore besoin pour EventSub');
});

test('réglages : seulement les champs de l’outil (pas de relay ni de jeton caché, OBS en local)', async () => {
  const R = await relay(); const S = await R.login('a');
  const mu = await config(R, await create(R, S, 'musique', { source: 'lastfm', log: true, relay: 'https://pirate.test', token: 'x', inconnu: 1 }));
  assert.equal(mu.relay, undefined); assert.equal(mu.inconnu, undefined); assert.equal(mu.log, true);
  assert.equal((await config(R, await create(R, S, 'rewind', { obsurl: 'wss://pirate.test:4455' }))).obsurl, undefined);
  assert.equal((await config(R, await create(R, S, 'rewind', { obsurl: 'ws://192.168.1.20:4455' }))).obsurl, 'ws://192.168.1.20:4455');
  const au = await create(R, S, 'automatisations', { rules: '[]', relay: 'x' });
  assert.deepEqual((await R.req('GET', '/me/overlays/' + au, null, { token: S }))[1].settings, { rules: '[]' });
});

test('lecture Twitch par le relais : seulement ce que l’outil a le droit de lire', async () => {
  const R = await relay(); const S = await R.login('a');
  const pubs = await create(R, S, 'pubs');
  const t = (path) => R.req('GET', `/o/${pubs}/twitch?path=` + encodeURIComponent(path));
  assert.deepEqual((await t('users?login=nimporte'))[1], { data: [{ id: '100', login: 'streameur' }] });
  assert.equal((await t('channels/ads'))[0], 200);
  assert.equal((await t('polls'))[0], 403, 'les sondages ne sont pas pour l’overlay pubs');
  assert.equal((await t('moderation/banned'))[0], 403);
  const ads = R.state.calls.filter((c) => c.url.includes('helix/channels/ads'));
  assert.match(ads.at(-1).url, /broadcaster_id=100/, 'toujours la chaîne du compte');
});

test('événements Twitch poussés aux overlays, et le follow reste traité par le relais', async () => {
  const R = await relay(); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  const v = await create(R, S, 'votes'), w = await create(R, S, 'webcam');
  assert.ok(R.state.subs.some((x) => x.type === 'channel.poll.begin'), 'abonnement créé avec l’overlay');
  assert.ok(R.state.subs.some((x) => x.type === 'channel.follow' && x.condition.moderator_user_id === '100'));
  assert.equal((await R.req('GET', `/o/${v}/ws`, null, { headers: { Upgrade: 'websocket' } }))[0], 101);
  assert.equal((await R.req('GET', `/o/${w}/ws`, null, { headers: { Upgrade: 'websocket' } }))[0], 101);
  await R.eventsub('channel.poll.begin', { id: 'p1', title: 'Q ?' });
  await R.eventsub('channel.follow', { user_name: 'Lou' });
  const socks = R.account().sockets;
  const sent = (tool) => socks.filter((s) => s.tags.includes('tool:' + tool)).flatMap((s) => s.sent);
  assert.deepEqual(sent('votes')[0], { type: 'twitch', ev: 'pollBegin', data: { id: 'p1', title: 'Q ?' } });
  assert.equal(sent('webcam')[0].ev, 'follow');
});

test('régénérer ou supprimer un lien ferme ses WebSockets et l’ancien lien ne marche plus', async () => {
  const R = await relay(); const S = await R.login('a');
  const id = await create(R, S, 'vedette');
  await R.req('GET', `/o/${id}/ws`, null, { headers: { Upgrade: 'websocket' } });
  const ws = R.account().sockets.at(-1);
  const [, rot] = await R.req('POST', `/me/overlays/${id}/rotate`, {}, { token: S });
  assert.equal(ws.closed, true); assert.deepEqual(ws.sent.at(-1), { type: 'deleted' });
  assert.equal((await R.req('GET', '/o/' + id))[0], 404);
  assert.equal((await R.req('GET', '/o/' + rot.id))[0], 200);
});

test('journal des musiques : seulement si l’overlay le publie, et des adresses https', async () => {
  const R = await relay(); const S = await R.login('a');
  const on = await create(R, S, 'musique', { log: true }), off = await create(R, S, 'musique', {});
  assert.equal((await R.req('POST', `/o/${on}/track`, { title: 'T', url: 'javascript:alert(1)//spotify.com', art: 'https://i.scdn.co/x.jpg' }))[0], 200);
  assert.equal((await R.req('POST', `/o/${off}/track`, { title: 'T' }))[0], 403);
  const [, d] = await R.req('GET', '/tracks/streameur');
  assert.equal(d.tracks[0].url, ''); assert.equal(d.tracks[0].art, 'https://i.scdn.co/x.jpg');
});

test('sauvegarde et import passent par la même règle (aucun réglage inconnu stocké)', async () => {
  const R = await relay(); const S = await R.login('a');
  const id = await create(R, S, 'chat', { theme: 'neon' });
  await R.req('PUT', '/me/overlays/' + id, { settings: { theme: 'clair', relay: 'https://pirate.test' } }, { token: S });
  assert.deepEqual((await R.req('GET', '/me/overlays/' + id, null, { token: S }))[1].settings, { theme: 'clair' });
});
