/* Le relais suit Twitch pour les overlays (ils n'ont plus le jeton du streamer) : événements, lectures, clip de Rewind. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relay } from '../helpers/relay.mjs';

const create = async (R, S, tool, settings = {}) => (await R.req('POST', '/me/overlays', { tool, name: tool, settings }, { token: S }))[1].id;
const ws = (R, id) => R.req('GET', `/o/${id}/ws`, null, { headers: { Upgrade: 'websocket' } });

test('follows, points de chaîne et live arrivent aux overlays qui les suivent, et seulement à eux', async () => {
  const R = await relay(); const S = await R.login('a'); await R.req('GET', '/me', null, { token: S });
  const ids = {};
  for (const t of ['alertes', 'subathon', 'sons', 'discord', 'chat']) { ids[t] = await create(R, S, t); await ws(R, ids[t]); }
  for (const type of ['channel.follow', 'channel.channel_points_custom_reward_redemption.add', 'stream.online']) assert.ok(R.state.subs.some((x) => x.type === type), type);
  await R.eventsub('channel.channel_points_custom_reward_redemption.add', { user_login: 'lou', user_name: 'Lou', reward: { title: 'Hydrate-toi', cost: 500 }, user_input: '' });
  await R.eventsub('stream.online', { started_at: '2026-11-12T20:00:00Z' });
  const got = (t) => R.account().sockets.filter((s) => s.tags.includes('tool:' + t)).flatMap((s) => s.sent).map((m) => m.st);
  assert.deepEqual(got('alertes'), ['channel.channel_points_custom_reward_redemption.add']);
  assert.deepEqual(got('sons'), ['channel.channel_points_custom_reward_redemption.add']);
  assert.deepEqual(got('discord'), ['stream.online']);
  assert.deepEqual(got('chat'), [], 'le chat ne suit pas les points');
});

test('lectures Twitch : la chaîne du compte pour les données privées, le jeton d’application pour les données publiques', async () => {
  const R = await relay(); const S = await R.login('a');
  const tw = (id, path, method = 'GET') => R.req(method, `/o/${id}/twitch?path=` + encodeURIComponent(path));
  const last = (re) => R.state.calls.filter((c) => re.test(c.url)).at(-1);
  const ob = await create(R, S, 'objectifs');
  assert.equal((await tw(ob, 'subscriptions?broadcaster_id=999&first=1'))[0], 200);
  assert.match(last(/helix\/subscriptions/).url, /broadcaster_id=100/, 'jamais une autre chaîne');
  assert.doesNotMatch(last(/helix\/subscriptions/).url, /999/);
  const di = await create(R, S, 'discord');
  await tw(di, 'streams?user_login=autre');
  assert.match(last(/helix\/streams/).url, /user_id=100/); assert.doesNotMatch(last(/helix\/streams/).url, /autre/);
  assert.equal((await tw(di, 'clips?broadcaster_id=100'))[0], 403, 'discord ne lit pas les clips');
  const so = await create(R, S, 'shoutout');
  await tw(so, 'users?login=raideur');
  const cu = R.state.calls.filter((c) => /helix\/users\?login=raideur/.test(c.url)).at(-1);
  assert.ok(cu, 'le profil du raideur est bien lu');
  assert.equal((await tw(so, 'subscriptions'))[0], 403, 'shoutout ne lit pas les abonnés');
  assert.equal((await tw(so, 'clips', 'POST'))[0], 403, 'seul Rewind crée des clips');
  const rw = await create(R, S, 'rewind');
  assert.equal((await tw(rw, 'clips?broadcaster_id=999', 'POST'))[0], 200);
  const post = R.state.calls.filter((c) => c.method === 'POST' && /helix\/clips/.test(c.url)).at(-1);
  assert.match(post.url, /broadcaster_id=100/);
});

test('régénérer le lien d’un ancien outil à jeton : nouveau jeton, puis l’ancien est révoqué', async () => {
  const R = await relay(); const S = await R.login('a');
  const id = await create(R, S, 'alertes');
  await R.req('POST', `/me/overlays/${id}/rotate`, {}, { token: S });
  const rev = R.state.calls.filter((c) => c.url.includes('oauth2/revoke'));
  assert.equal(rev.length, 1);
  assert.match(rev[0].body, /token=tok-a/);
  const v = await create(R, S, 'votes');
  await R.req('POST', `/me/overlays/${v}/rotate`, {}, { token: S });
  assert.equal(R.state.calls.filter((c) => c.url.includes('oauth2/revoke')).length, 1, 'votes n’a jamais eu le jeton : rien à révoquer');
});
