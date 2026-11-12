/* Harnais du relais : le vrai relay/worker.js, dans Node, avec un faux Cloudflare (Durable Objects, WebSockets,
 * cache) et un faux réseau (Twitch, Discord, YouTube…). Aucune requête ne sort de la machine.
 * Lancer avec : node --import ./tests/helpers/register.mjs --test tests/ */
import crypto from 'node:crypto';

// ---- Cloudflare : Response 101, WebSocketPair, caches ----
const NativeResponse = globalThis.Response;
class WorkerResponse extends NativeResponse { // Node refuse le statut 101 (WebSocket accepté) : on le garde à part
  constructor(body, init = {}) {
    const ws = init && init.webSocket, s = init && init.status;
    super(body, s === 101 ? Object.assign({}, init, { status: 200 }) : init);
    if (s === 101) Object.defineProperty(this, 'status', { value: 101 });
    if (ws) this.webSocket = ws;
  }
}
globalThis.Response = WorkerResponse;

export class FakeWS {
  constructor() { this.sent = []; this.closed = false; this.tags = []; }
  send(m) { if (this.closed) throw new Error('fermé'); this.sent.push(JSON.parse(m)); }
  close(code, reason) { this.closed = true; this.closeCode = code; this.closeReason = reason; }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new FakeWS(); this[1] = new FakeWS(); } };
const cacheStore = new Map();
globalThis.caches = { default: {
  async match(k) { const r = cacheStore.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
  async put(k, r) { cacheStore.set(typeof k === 'string' ? k : k.url, r.clone()); },
} };

export class FakeStorage {
  constructor() { this.m = new Map(); this.alarm = null; }
  async get(k) { return structuredClone(this.m.get(k)); }
  async put(k, v) { this.m.set(k, structuredClone(v)); }
  async delete(k) { (Array.isArray(k) ? k : [k]).forEach((x) => this.m.delete(x)); }
  async deleteAll() { this.m.clear(); }
  async list({ prefix = '', start, end, reverse, limit } = {}) {
    let keys = [...this.m.keys()].filter((k) => k.startsWith(prefix) && (start == null || k >= start) && (end == null || k < end)).sort();
    if (reverse) keys.reverse(); if (limit) keys = keys.slice(0, limit);
    return new Map(keys.map((k) => [k, structuredClone(this.m.get(k))]));
  }
  async setAlarm(t) { this.alarm = t; } async getAlarm() { return this.alarm; } async deleteAlarm() { this.alarm = null; }
}

// ---- Faux réseau : chaque test peut ajouter ses propres réponses (routes) ----
const USERS = { a: ['100', 'streameur'], b: ['200', 'modo'], c: ['300', 'viewer'], d: ['400', 'autre'] };
export function fakeFetch(state) {
  return async (input, opt = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = opt.body == null ? '' : String(opt.body);
    state.calls.push({ url, method: opt.method || 'GET', body });
    for (const [re, fn] of state.routes) if (re.test(url)) { const r = await fn(url, opt, body); if (r) return r; }
    const J = (d, s = 200) => new NativeResponse(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('id.twitch.tv/oauth2/token')) {
      const code = new URLSearchParams(body).get('code');
      return J({ access_token: code ? 'tok-' + code : 'app-token', refresh_token: 'ref-' + (code || 'app'), expires_in: 14000 });
    }
    if (url.includes('id.twitch.tv/oauth2/validate')) {
      const t = String((opt.headers || {}).Authorization || '').replace(/^OAuth\s+/, '').replace(/^tok-/, '');
      const u = USERS[t] || ['999', 'inconnu'];
      return J({ login: u[1], user_id: u[0], scopes: state.scopes, expires_in: 14000 });
    }
    if (url.includes('id.twitch.tv/oauth2/revoke')) return J({});
    if (url.startsWith('https://api.twitch.tv/helix/eventsub/subscriptions')) {
      if ((opt.method || 'GET') === 'POST') state.subs.push(JSON.parse(body));
      return J({ data: [{ id: 'sub' + state.subs.length }] }, 202);
    }
    if (url.includes('api.twitch.tv/helix/moderation/moderators')) return J({ data: new URL(url).searchParams.get('user_id') === '200' ? [{ user_id: '200' }] : [] });
    if (url.includes('api.twitch.tv/helix/chat/messages')) { state.said.push(JSON.parse(body).message); return J({ data: [{ is_sent: true }] }); }
    if (url.includes('api.twitch.tv/helix/')) return J({ data: [] });
    if (url.includes('discord.com/api/webhooks')) { state.discord.push(JSON.parse(body)); return new NativeResponse(null, { status: 204 }); }
    if (url.includes('youtube.com/channel/')) return new NativeResponse('<html>' + state.ytPage + '</html>');
    return J({ error: 'réseau coupé dans les tests : ' + url }, 599);
  };
}

/* Un relais neuf : appelle relay() dans chaque test pour partir d'un état vide */
export async function relay(opts = {}) {
  const state = { calls: [], routes: [], subs: [], said: [], discord: [], ytPage: '', scopes: opts.scopes || ['clips:edit', 'moderator:read:followers', 'channel:read:ads', 'channel:read:polls'] };
  globalThis.fetch = fakeFetch(state);
  const { default: worker, Room, Account } = await import('../../relay/worker.js');
  const objects = new Map();
  const ns = (Cls, kind) => ({
    idFromName: (n) => n,
    get: (n) => {
      const key = kind + ':' + n;
      if (!objects.has(key)) {
        const sockets = [];
        const ctx = { storage: new FakeStorage(), sockets,
          acceptWebSocket(ws, tags = []) { ws.tags = tags; sockets.push(ws); },
          getWebSockets(tag) { return sockets.filter((w) => !w.closed && (!tag || w.tags.includes(tag))); },
          getTags(ws) { return ws.tags; } };
        const o = new Cls(ctx, env);
        objects.set(key, { o, ctx, fetch: (u, i) => o.fetch(u instanceof Request ? u : new Request(u, i)) });
      }
      return objects.get(key);
    },
  });
  const env = Object.assign({
    EVENTSUB_SECRET: 'secret-de-test-eventsub', TWITCH_CLIENT_ID: 'cid', TWITCH_CLIENT_SECRET: 'csecret',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), BOT_LOGIN: 'streamboxbot',
  }, opts.env || {});
  env.ROOM = ns(Room, 'room'); env.ACCOUNT = ns(Account, 'acc');
  const ORIGIN = 'https://relais.test';
  const R = {
    state, env, worker,
    /* requête au relais → [statut, JSON] */
    async req(method, path, body, { token, headers } = {}) {
      const h = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers || {});
      const r = await worker.fetch(new Request(ORIGIN + path, { method, headers: h, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
      const text = await r.text(); let d = text; try { d = JSON.parse(text); } catch (e) { /* texte brut */ }
      return [r.status, d, r];
    },
    /* connexion d'un streamer (a, b, c ou d) → jeton de session */
    async login(who = 'a') { const [s, d] = await R.req('POST', '/auth/twitch', { code: who, redirect_uri: 'https://site.test/connexion.html' }); if (s !== 200) throw new Error('connexion : ' + JSON.stringify(d)); return d.session; },
    /* webhook EventSub signé comme le fait Twitch */
    async eventsub(type, event, condition = { broadcaster_user_id: '100' }, msgType = 'notification') {
      const raw = JSON.stringify({ subscription: { type, condition }, event });
      const id = 'msg-' + crypto.randomUUID(), ts = new Date().toISOString();
      const sig = 'sha256=' + crypto.createHmac('sha256', env.EVENTSUB_SECRET).update(id + ts + raw).digest('hex');
      const r = await worker.fetch(new Request(ORIGIN + '/eventsub', { method: 'POST', body: raw, headers: { 'Twitch-Eventsub-Message-Id': id, 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Message-Signature': sig, 'Twitch-Eventsub-Message-Type': msgType } }), env);
      return r.status;
    },
    /* message du chat reçu par EventSub */
    chat(userId, login, text, badges = []) { return R.eventsub('channel.chat.message', { chatter_user_id: userId, chatter_user_login: login, chatter_user_name: login, message: { text }, badges, message_id: crypto.randomUUID() }); },
    /* Durable Object d'un compte : stockage et WebSockets */
    account(id = '100') { return env.ACCOUNT.get('user:' + id).ctx; },
    route(re, fn) { state.routes.push([re, fn]); },
  };
  return R;
}
