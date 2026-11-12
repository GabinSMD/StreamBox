/* Les secrets du compte (clé Ko-fi, webhook Discord) restent sur le relais : les overlays passent par lui. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { relay } from '../helpers/relay.mjs';

const create = async (R, S, tool, settings = {}) => (await R.req('POST', '/me/overlays', { tool, name: tool, settings }, { token: S }))[1].id;
const HOOK = 'https://discord.com/api/webhooks/123456/secret-du-webhook';
const tools = () => { const W = { window: {} }; vm.runInNewContext(fs.readFileSync(new URL('../../js/tools.js', import.meta.url), 'utf8'), W); return W.window.SB_TOOLS; };

test('aucun overlay ne reçoit la clé Ko-fi, le jeton Ko-fi ni le webhook Discord du compte', async () => {
  const R = await relay(); const S = await R.login('a');
  assert.equal((await R.req('PUT', '/me/secrets', { kofi: 'cleKofiDeTest123', kofiv: 'VERIF', webhook: HOOK }, { token: S }))[0], 200);
  for (const t of tools()) {
    const raw = JSON.stringify((await R.req('GET', '/o/' + await create(R, S, t.id, t.id === 'giveaway' ? { discord: 'compte' } : {})))[1]);
    for (const secret of ['cleKofiDeTest123', 'VERIF', 'secret-du-webhook']) assert.ok(!raw.includes(secret), `${t.id} reçoit ${secret}`);
  }
  const g = await create(R, S, 'giveaway', { discord: 'https://discord.com/api/webhooks/9/propre-au-giveaway' });
  assert.equal((await R.req('GET', '/o/' + g))[1].params.discord, 'relais', 'le webhook propre au giveaway reste aussi sur le relais');
});

test('un don Ko-fi arrive aux overlays de dons du compte par leur connexion, sans la clé', async () => {
  const R = await relay(); const S = await R.login('a');
  await R.req('PUT', '/me/secrets', { kofi: 'cleKofiDeTest123', kofiv: 'VERIF' }, { token: S });
  const ids = { alertes: await create(R, S, 'alertes'), chat: await create(R, S, 'chat') };
  for (const id of Object.values(ids)) await R.req('GET', `/o/${id}/ws`, null, { headers: { Upgrade: 'websocket' } });
  const body = 'data=' + encodeURIComponent(JSON.stringify({ verification_token: 'VERIF', amount: '5', currency: 'EUR', from_name: 'Lou', message: 'Merci', kofi_transaction_id: 't1' }));
  assert.equal((await R.req('POST', '/kofi/cleKofiDeTest123', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }))[0], 200);
  const sent = (t) => R.account().sockets.filter((s) => s.tags.includes('tool:' + t)).flatMap((s) => s.sent);
  assert.equal(sent('alertes')[0].type, 'don');
  assert.equal(sent('alertes')[0].don.name, 'Lou');
  assert.deepEqual(sent('chat'), [], 'le chat ne reçoit pas les dons');
});

test('Discord : le relais poste pour l’overlay, sur le webhook du compte, et les mentions restent celles des réglages', async () => {
  const R = await relay(); const S = await R.login('a');
  await R.req('PUT', '/me/secrets', { webhook: HOOK }, { token: S });
  const d = await create(R, S, 'discord', { mention: 'everyone' });
  const post = (id, payload) => R.req('POST', `/o/${id}/discord`, payload);
  assert.equal((await post(d, { content: '@everyone c’est parti', allowed_mentions: { parse: ['everyone'] }, embeds: [{ title: 'Live' }] }))[0], 200);
  assert.deepEqual(R.state.discord.at(-1).allowed_mentions, { parse: ['everyone'] });
  await post(d, { content: '@everyone message du chat' });
  assert.deepEqual(R.state.discord.at(-1).allowed_mentions, { parse: [] }, 'pas de mention sans la demande de l’annonce');
  const g = await create(R, S, 'giveaway', { discord: 'compte' });
  await post(g, { content: 'Gagnant', allowed_mentions: { parse: ['everyone'] } });
  assert.deepEqual(R.state.discord.at(-1).allowed_mentions, { parse: [] }, 'le giveaway ne mentionne jamais');
  assert.equal((await post(await create(R, S, 'chat'), { content: 'x' }))[0], 403, 'un autre outil ne poste pas sur Discord');
  const posted = R.state.calls.filter((c) => c.url.startsWith(HOOK));
  assert.equal(posted.length, 3);
  for (let i = 0; i < 12; i++) await post(d, { content: 'spam ' + i });
  assert.ok(R.state.calls.filter((c) => c.url.startsWith(HOOK)).length <= 10, '10 messages par minute au plus');
});
