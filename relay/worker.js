/* Relais StreamBox : Cloudflare Worker + Durable Object (offre gratuite suffisante).
 *
 * Pourquoi un relais ? Certaines plateformes (Ko-fi…) ne savent qu'ENVOYER des webhooks : il faut
 * une adresse publique pour les recevoir, puis les transmettre en direct aux overlays dans OBS.
 * Le relais garde aussi la liste des musiques jouées en live, pour l'extension « Musiques des redifs ».
 *
 * Routes :
 *   POST /kofi/:cle[?v=jeton_ko-fi]   webhook Ko-fi  → diffusé aux overlays abonnés à :cle
 *   POST /hook/:cle                   webhook générique JSON { name, amount, currency, message }
 *   GET  /ws/:cle                     WebSocket des overlays (dons en direct)
 *   POST /tracks/:login               ajoute un morceau (Authorization: Bearer <jeton Twitch de :login>)
 *   POST /tracks/:login/youtube       relie une chaîne YouTube { channelId } (même authentification)
 *   GET  /tracks/:login?from=&to=     morceaux joués entre deux dates (ms) : public
 *   GET  /yt/:channelId?from=&to=     idem, à partir d'une chaîne YouTube reliée
 *   GET  /twitch/video/:id            début et chaîne d'une VOD Twitch (pour l'extension)
 *
 *
 * Comptes StreamBox (connexion Twitch) :
 *   POST   /auth/twitch                 { code, redirect_uri } → { session, login } (échange OAuth côté relais)
 *   POST   /auth/logout
 *   GET    /me                          profil, overlays, intégrations renseignées (jamais les valeurs)
 *   PUT    /me/secrets                  { cle: valeur | null }  (jetons chiffrés au repos)
 *   POST   /me/overlays                 { tool, name, settings } → { id }
 *   GET    /me/overlays/:id             réglages d'un overlay (pour le configurateur)
 *   PUT    /me/overlays/:id             { name?, settings? } → les overlays ouverts dans OBS se rechargent
 *   POST   /me/overlays/:id/rotate      nouveau lien (l'ancien ne marche plus)
 *   DELETE /me/overlays/:id
 *   GET    /o/:id                       réglages + jetons utiles à cet outil seulement (lu par l'overlay)
 *   GET    /o/:id/ws                    WebSocket : « update » quand le streamer modifie l'overlay
 *
 * Secrets (wrangler secret put …) : TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, ENCRYPTION_KEY (32 octets en base64).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
const KEY_RE = /^[A-Za-z0-9_-]{12,64}$/;     // clé secrète choisie par le streamer
const LOGIN_RE = /^[a-z0-9_]{2,25}$/;
const clean = (s, n = 300) => String(s == null ? '' : s).slice(0, n);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const room = (name) => env.ROOM.get(env.ROOM.idFromName(name));
    try {
      /* ---- Dons ---- */
      if (req.method === 'POST' && p[0] === 'kofi' && KEY_RE.test(p[1] || '')) {
        const d = await parseKofi(req);
        if (!d) return json({ error: 'données Ko-fi illisibles' }, 400);
        const v = url.searchParams.get('v');
        if (v && d.verification_token !== v) return json({ error: 'jeton de vérification incorrect' }, 403);
        if (d.is_public === false) d.from_name = 'Anonyme';
        const don = { kind: 'don', source: 'Ko-fi', id: 'kofi-' + clean(d.kofi_transaction_id || d.message_id, 80), name: clean(d.from_name, 60), amount: parseFloat(d.amount) || 0, currency: clean(d.currency || 'EUR', 5), message: d.is_public === false ? '' : clean(d.message), type: clean(d.type, 30) };
        await room('key:' + p[1]).fetch('https://room/broadcast', { method: 'POST', body: JSON.stringify(don) });
        return json({ ok: true });
      }
      if (req.method === 'POST' && p[0] === 'hook' && KEY_RE.test(p[1] || '')) {
        const d = await req.json().catch(() => null);
        if (!d) return json({ error: 'JSON attendu' }, 400);
        const don = { kind: 'don', source: clean(d.source || 'Webhook', 30), name: clean(d.name, 60), amount: parseFloat(d.amount) || 0, currency: clean(d.currency || 'EUR', 5), message: clean(d.message) };
        await room('key:' + p[1]).fetch('https://room/broadcast', { method: 'POST', body: JSON.stringify(don) });
        return json({ ok: true });
      }
      if (p[0] === 'ws' && KEY_RE.test(p[1] || '')) {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426);
        return room('key:' + p[1]).fetch('https://room/ws', req);
      }

      /* ---- Musiques du live ---- */
      if (p[0] === 'tracks' && LOGIN_RE.test(p[1] || '')) {
        const login = p[1];
        if (req.method === 'GET') {
          const from = +url.searchParams.get('from') || 0, to = +url.searchParams.get('to') || Date.now();
          return room('chan:' + login).fetch(`https://room/tracks?from=${from}&to=${to}`).then(withCors);
        }
        if (req.method === 'POST') {
          const who = await twitchLogin(req.headers.get('Authorization'));
          if (who !== login) return json({ error: 'le jeton Twitch ne correspond pas à cette chaîne' }, 403);
          const body = await req.json().catch(() => null);
          if (!body) return json({ error: 'JSON attendu' }, 400);
          if (p[2] === 'youtube') {
            const ch = clean(body.channelId, 40);
            if (!/^UC[\w-]{20,}$/.test(ch)) return json({ error: 'identifiant de chaîne YouTube invalide (UC…)' }, 400);
            await room('yt:' + ch).fetch('https://room/alias', { method: 'POST', body: JSON.stringify({ login }) });
            return json({ ok: true });
          }
          const t = { at: +body.at || Date.now(), title: clean(body.title, 200), artist: clean(body.artist, 200), album: clean(body.album, 200), art: clean(body.art, 400), url: clean(body.url, 400), source: clean(body.source, 20) };
          if (!t.title) return json({ error: 'titre manquant' }, 400);
          return room('chan:' + login).fetch('https://room/tracks', { method: 'POST', body: JSON.stringify(t) }).then(withCors);
        }
      }
      if (req.method === 'GET' && p[0] === 'yt' && /^UC[\w-]{20,}$/.test(p[1] || '')) {
        const a = await room('yt:' + p[1]).fetch('https://room/alias').then((r) => r.json());
        if (!a.login) return json({ error: 'chaîne YouTube non reliée à StreamBox', tracks: [] }, 404);
        const from = +url.searchParams.get('from') || 0, to = +url.searchParams.get('to') || Date.now();
        return room('chan:' + a.login).fetch(`https://room/tracks?from=${from}&to=${to}`).then(withCors);
      }
      if (req.method === 'GET' && p[0] === 'twitch' && p[1] === 'video' && /^\d{5,15}$/.test(p[2] || '')) {
        return twitchVideo(p[2], env);
      }
      const acc = await accountRoutes(req, env, url, p);
      if (acc) return acc;
      return json({ error: 'route inconnue' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};

function withCors(r) { const h = new Headers(r.headers); Object.entries(CORS).forEach(([k, v]) => h.set(k, v)); return new Response(r.body, { status: r.status, headers: h }); }

async function parseKofi(req) {
  const type = req.headers.get('Content-Type') || '';
  try {
    if (type.includes('application/json')) return await req.json();
    const form = await req.formData();
    return JSON.parse(form.get('data'));
  } catch (e) { return null; }
}

async function twitchLogin(auth) {
  const tok = (auth || '').replace(/^Bearer\s+/i, '');
  if (!tok) return null;
  const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + tok } });
  if (!r.ok) return null;
  return (await r.json()).login;
}

let appToken = null; // jeton d'application Twitch, gardé en mémoire tant que le Worker vit
async function twitchVideo(id, env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'relais sans identifiants Twitch' }, 501);
  const cache = caches.default;
  const key = new Request('https://cache.streambox/video/' + id);
  const hit = await cache.match(key);
  if (hit) return withCors(hit);
  if (!appToken || appToken.exp < Date.now()) {
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }) });
    const d = await r.json();
    appToken = { v: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  }
  const r = await fetch('https://api.twitch.tv/helix/videos?id=' + id, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + appToken.v } });
  const v = ((await r.json()).data || [])[0];
  if (!v) return json({ error: 'VOD introuvable' }, 404);
  const res = json({ login: v.user_login, start: Date.parse(v.created_at), duration: v.duration, title: v.title }, 200, { 'Cache-Control': 'public, max-age=86400' });
  await cache.put(key, res.clone());
  return res;
}

/* Une « salle » par clé de dons, par chaîne (musiques) et par alias YouTube */
export class Room {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/broadcast') {
      const msg = await req.text();
      this.ctx.getWebSockets().forEach((ws) => { try { ws.send(msg); } catch (e) { /* client parti */ } });
      return new Response('ok');
    }
    if (url.pathname === '/tracks' && req.method === 'POST') {
      const t = await req.json();
      // pas de doublon si l'overlay renvoie le même morceau (rechargement d'OBS)
      const last = await this.ctx.storage.list({ prefix: 't:', reverse: true, limit: 1 });
      const prev = [...last.values()][0];
      if (prev && prev.title === t.title && prev.artist === t.artist && t.at - prev.at < 15 * 60000) return new Response(JSON.stringify({ ok: true, dup: true }));
      await this.ctx.storage.put('t:' + String(t.at).padStart(15, '0'), t);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (url.pathname === '/tracks') {
      const from = +url.searchParams.get('from'), to = +url.searchParams.get('to');
      // on prend aussi le morceau lancé juste avant « from » (il jouait encore au début de la VOD)
      const before = await this.ctx.storage.list({ prefix: 't:', end: 't:' + String(from).padStart(15, '0'), reverse: true, limit: 1 });
      const inside = await this.ctx.storage.list({ start: 't:' + String(from).padStart(15, '0'), end: 't:' + String(to).padStart(15, '0'), limit: 1000 });
      return new Response(JSON.stringify({ tracks: [...before.values(), ...inside.values()] }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/alias') {
      if (req.method === 'POST') { await this.ctx.storage.put('login', (await req.json()).login); return new Response('ok'); }
      return new Response(JSON.stringify({ login: (await this.ctx.storage.get('login')) || null }));
    }
    return new Response('?', { status: 404 });
  }
}


/* =========================================================================================
 * COMPTES
 * ========================================================================================= */

// Jetons dont chaque outil a besoin : un overlay ne reçoit QUE ceux-là (moindre privilège).
const NEEDS = {
  chat: [], emotes: [],
  alertes: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'],
  subathon: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'],
  objectifs: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'],
  sondage: ['obspass'], minuteur: ['obspass'], roue: ['obspass'], giveaway: ['obspass', 'webhook'],
  rewind: ['token', 'obspass'],
  musique: ['token', 'spotify', 'spotifycid', 'lastfm', 'lfmkey'],
  discord: ['token', 'webhook'],
};
const SECRET_KEYS = ['spotify', 'spotifycid', 'lastfm', 'lfmkey', 'sejwt', 'sltoken', 'kofi', 'webhook', 'obspass'];
const SCOPES = 'clips:edit moderator:read:followers channel:read:redemptions channel:read:subscriptions';
const rand = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, Math.ceil(n * 1.4));
const OV_RE = /^[a-z0-9]{20,48}$/;

async function accountRoutes(req, env, url, p) {
  const stub = (name) => env.ACCOUNT.get(env.ACCOUNT.idFromName(name));
  const call = (name, path, body) => stub(name).fetch('https://acc' + path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json().then((d) => [r.status, d]));

  // ---- Connexion : échange du code OAuth (le secret Twitch ne quitte jamais le relais) ----
  if (req.method === 'POST' && p[0] === 'auth' && p[1] === 'twitch') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'relais sans identifiants Twitch' }, 501);
    const { code, redirect_uri } = await req.json().catch(() => ({}));
    if (!code || !redirect_uri) return json({ error: 'code manquant' }, 400);
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri }) });
    const t = await r.json();
    if (!t.access_token) return json({ error: 'Twitch a refusé la connexion : ' + (t.message || r.status) }, 401);
    const v = await (await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + t.access_token } })).json();
    if (!v.user_id) return json({ error: 'jeton Twitch invalide' }, 401);
    const session = rand(32);
    await call('user:' + v.user_id, '/login', { login: v.login, user_id: v.user_id, access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 3600) * 1000, scopes: v.scopes || [] });
    await call('sess:' + session, '/session', { user_id: v.user_id, exp: Date.now() + 90 * 86400000 });
    return json({ session, login: v.login });
  }

  // ---- Lecture par un overlay (lien court, public mais impossible à deviner) ----
  if (p[0] === 'o' && OV_RE.test(p[1] || '')) {
    const [st, idx] = await call('ov:' + p[1], '/index');
    if (st !== 200 || !idx.user_id) return json({ error: 'overlay introuvable (lien supprimé ou régénéré)' }, 404);
    if (p[2] === 'ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426);
      return stub('user:' + idx.user_id).fetch('https://acc/ws?ov=' + p[1], req);
    }
    const r = await stub('user:' + idx.user_id).fetch('https://acc/overlay-config?ov=' + p[1], { headers: { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }) } });
    return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
  }

  // ---- Espace « Mon compte » (session obligatoire) ----
  if (p[0] === 'auth' && p[1] === 'logout' && req.method === 'POST') {
    const sid = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (/^[a-z0-9]{20,64}$/.test(sid)) await call('sess:' + sid, '/session-delete', {});
    return json({ ok: true });
  }
  if (p[0] !== 'me') return null;
  const sid = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-z0-9]{20,64}$/.test(sid)) return json({ error: 'non connecté' }, 401);
  const [sst, sess] = await call('sess:' + sid, '/session-get');
  if (sst !== 200 || !sess.user_id) return json({ error: 'session expirée : reconnecte-toi' }, 401);
  const user = 'user:' + sess.user_id;
  const envHdr = { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }) };
  const fwd = (path, method, body) => stub(user).fetch('https://acc' + path, { method, headers: envHdr, body: body == null ? undefined : JSON.stringify(body) }).then((r) => withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } })));
  const body = req.method === 'GET' || req.method === 'DELETE' ? null : await req.json().catch(() => ({}));

  if (p.length === 1 && req.method === 'GET') return fwd('/me', 'POST', {});
  if (p[1] === 'secrets' && req.method === 'PUT') return fwd('/secrets', 'POST', body);
  if (p[1] === 'overlays') {
    if (p.length === 2 && req.method === 'POST') {
      const id = rand(24);
      const r = await fwd('/overlay-create', 'POST', Object.assign({}, body, { id }));
      if (r.status === 200) await call('ov:' + id, '/index-set', { user_id: sess.user_id });
      return r;
    }
    if (!OV_RE.test(p[2] || '')) return json({ error: 'overlay inconnu' }, 404);
    if (p.length === 3 && req.method === 'GET') return fwd('/overlay-get', 'POST', { id: p[2] });
    if (p.length === 3 && req.method === 'PUT') return fwd('/overlay-update', 'POST', Object.assign({}, body, { id: p[2] }));
    if (p.length === 3 && req.method === 'DELETE') {
      const r = await fwd('/overlay-delete', 'POST', { id: p[2] });
      if (r.status === 200) await call('ov:' + p[2], '/index-delete', {});
      return r;
    }
    if (p[3] === 'rotate' && req.method === 'POST') {
      const nid = rand(24);
      const r = await fwd('/overlay-rotate', 'POST', { id: p[2], nid });
      if (r.status === 200) { await call('ov:' + nid, '/index-set', { user_id: sess.user_id }); await call('ov:' + p[2], '/index-delete', {}); }
      return r;
    }
  }
  return json({ error: 'route inconnue' }, 404);
}

/* ---- Chiffrement des jetons au repos (AES-GCM, clé ENCRYPTION_KEY) ---- */
const b64 = { enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))), dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) };
async function aesKey(k) { return k ? crypto.subtle.importKey('raw', b64.dec(k), 'AES-GCM', false, ['encrypt', 'decrypt']) : null; }
async function seal(obj, k) {
  const key = await aesKey(k);
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (!key) return { plain: JSON.stringify(obj) };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64.enc(iv), data: b64.enc(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw)) };
}
async function unseal(box, k) {
  if (!box) return {};
  if (box.plain) return JSON.parse(box.plain);
  const key = await aesKey(k);
  if (!key) throw new Error('ENCRYPTION_KEY manquante sur le relais');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(box.iv) }, key, b64.dec(box.data))));
}

/* Un Durable Object par compte (user:<id>), par session (sess:<id>) et par lien d'overlay (ov:<id>) */
export class Account {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname, st = this.ctx.storage;
    const ok = (d) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
    const err = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: { 'Content-Type': 'application/json' } });
    const body = req.method === 'POST' && path !== '/ws' ? await req.json().catch(() => ({})) : {};
    const E = JSON.parse(req.headers.get('X-Env') || '{}');

    // --- index d'un lien d'overlay / session ---
    if (path === '/index') return (await st.get('user_id')) ? ok({ user_id: await st.get('user_id') }) : err('?', 404);
    if (path === '/index-set') { await st.put('user_id', body.user_id); return ok({ ok: true }); }
    if (path === '/index-delete' || path === '/session-delete') { await st.deleteAll(); return ok({ ok: true }); }
    if (path === '/session') { await st.put('s', body); return ok({ ok: true }); }
    if (path === '/session-get') { const s = await st.get('s'); return s && s.exp > Date.now() ? ok(s) : err('expirée', 401); }

    // --- compte ---
    const secrets = async () => unseal(await st.get('secrets'), E.key);
    const saveSecrets = async (o) => st.put('secrets', await seal(o, E.key));
    if (path === '/login') {
      const prev = await secrets().catch(() => ({}));
      await st.put('profile', { login: body.login, user_id: body.user_id, scopes: body.scopes });
      await saveSecrets(Object.assign(prev, { twitch: { access: body.access, refresh: body.refresh, exp: body.exp } }));
      return ok({ ok: true });
    }
    const profile = await st.get('profile');
    if (!profile) return err('compte inconnu', 404);
    const overlays = async () => (await st.get('overlays')) || {};

    if (path === '/me') {
      const s = await secrets(); const ov = await overlays();
      return ok({ login: profile.login, scopes: profile.scopes, secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]])),
        overlays: Object.values(ov).map(({ id, tool, name, updatedAt }) => ({ id, tool, name, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt) });
    }
    if (path === '/secrets') {
      const s = await secrets();
      for (const [k, v] of Object.entries(body)) { if (!SECRET_KEYS.includes(k)) continue; if (v == null || v === '') delete s[k]; else s[k] = clean(v, 2000); }
      await saveSecrets(s);
      this.broadcastAll();
      return ok({ ok: true, secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]])) });
    }
    const checkSettings = (o) => { const j = JSON.stringify(o || {}); if (j.length > 20000) throw new Error('réglages trop volumineux'); return JSON.parse(j); };
    if (path === '/overlay-create') {
      const ov = await overlays();
      if (Object.keys(ov).length >= 50) return err('50 overlays maximum par compte');
      if (!NEEDS[body.tool]) return err('outil inconnu');
      ov[body.id] = { id: body.id, tool: body.tool, name: clean(body.name || body.tool, 80), settings: checkSettings(body.settings), updatedAt: Date.now() };
      await st.put('overlays', ov);
      return ok({ id: body.id });
    }
    const ov = await overlays(); const o = ov[body.id || url.searchParams.get('ov')];
    if (path === '/ws') {
      if (!o) return err('?', 404);
      const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1], ['ov:' + o.id]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (!o) return err('overlay introuvable', 404);
    if (path === '/overlay-get') return ok(o);
    if (path === '/overlay-update') {
      if (body.name != null) o.name = clean(body.name, 80);
      if (body.settings) o.settings = checkSettings(body.settings);
      o.updatedAt = Date.now(); await st.put('overlays', ov);
      this.broadcast(o.id);
      return ok({ ok: true });
    }
    if (path === '/overlay-delete') { this.broadcast(o.id, 'deleted'); delete ov[o.id]; await st.put('overlays', ov); return ok({ ok: true }); }
    if (path === '/overlay-rotate') {
      this.broadcast(o.id, 'deleted');
      delete ov[o.id]; o.id = body.nid; o.updatedAt = Date.now(); ov[o.id] = o; await st.put('overlays', ov);
      return ok({ id: o.id });
    }
    if (path === '/overlay-config') {
      const s = await secrets();
      const params = Object.assign({}, o.settings);
      if (!params.channel) params.channel = profile.login;
      for (const k of NEEDS[o.tool] || []) {
        if (k === 'token') { const t = await this.twitchAccess(s, E); if (t) params.token = t; }
        else if (k === 'webhook' && o.tool === 'giveaway') { if (params.discord === 'compte' && s.webhook) params.discord = s.webhook; }
        else if (s[k]) params[k] = s[k];
      }
      if (o.tool === 'giveaway' && params.discord === 'compte') delete params.discord;
      return ok({ tool: o.tool, params });
    }
    return err('?', 404);
  }

  /* Jeton Twitch toujours valide : renouvelé ici avec le refresh token (le secret reste sur le relais) */
  async twitchAccess(s, E) {
    const t = s.twitch;
    if (!t) return null;
    if (t.exp > Date.now() + 5 * 60000) return t.access;
    if (!t.refresh || !E.cid || !E.secret) return t.access;
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: E.cid, client_secret: E.secret, grant_type: 'refresh_token', refresh_token: t.refresh }) });
    const d = await r.json();
    if (!d.access_token) return null; // accès révoqué : le streamer doit se reconnecter
    s.twitch = { access: d.access_token, refresh: d.refresh_token || t.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 };
    await this.ctx.storage.put('secrets', await seal(s, E.key));
    return s.twitch.access;
  }
  broadcast(id, type = 'update') { this.ctx.getWebSockets('ov:' + id).forEach((ws) => { try { ws.send(JSON.stringify({ type })); } catch (e) { /* parti */ } }); }
  broadcastAll() { this.ctx.getWebSockets().forEach((ws) => { try { ws.send(JSON.stringify({ type: 'update' })); } catch (e) { /* parti */ } }); }
}
