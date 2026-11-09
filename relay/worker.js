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
 * Secrets (wrangler secret put …) : TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET (pour /twitch/video).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
