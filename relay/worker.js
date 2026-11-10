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
 *   GET  /kick/:pseudo                identifiant du salon de chat Kick (chat multiplateforme)
 *   GET  /yt/live/:@pseudo|UC…        vidéo du live YouTube en cours d'une chaîne
 *   GET  /yt/chat/:video[?c=suite]    nouveaux messages du chat d'un live YouTube (données publiques)
 *
 *
 * Comptes StreamBox (connexion Twitch) :
 *   POST   /auth/twitch                 { code, redirect_uri } → { session, login } (échange OAuth côté relais)
 *   POST   /auth/logout
 *   GET    /me                          profil, overlays, intégrations renseignées (jamais les valeurs)
 *   PUT    /me/lang                     { lang: fr | en | es } : langue des réponses du bot et des jeux
 *   PUT    /me/secrets                  { cle: valeur | null }  (jetons chiffrés au repos)
 *   POST   /me/overlays                 { tool, name, settings } → { id } (réglages limités aux champs de l'outil : tool-keys.js)
 *   GET    /me/overlays/:id             réglages d'un overlay (pour le configurateur)
 *   PUT    /me/overlays/:id             { name?, settings? } → les overlays ouverts dans OBS se rechargent
 *   POST   /me/overlays/:id/rotate      nouveau lien (l'ancien ne marche plus)
 *   DELETE /me/overlays/:id
 *   DELETE /me                          supprime le compte (réglages, jetons, liens, abonnements Twitch, accès révoqué,
 *                                       toutes les sessions)
 *   POST   /me/logout-all               déconnecte tous les appareils (les sessions déjà émises ne marchent plus)
 *   GET    /me/twitch-token             jeton Twitch du compte connecté, pour le panneau de modération (gardé en mémoire
 *                                       par la page, jamais dans une URL ni dans le stockage du navigateur)
 *   GET    /o/:id                       réglages + jetons utiles à cet outil seulement (lu par l'overlay)
 *   GET    /o/:id/ws                    WebSocket : « update » quand le streamer modifie l'overlay ; « twitch » (pubs, votes,
 *                                       Hype Train : événements reçus par le relais) ; fermée quand le lien est régénéré ou supprimé
 *   GET    /o/:id/twitch?path=…         pubs, votes, Hype Train : lecture Twitch faite par le relais (l'overlay n'a pas de jeton)
 *   POST   /o/:id/track                 overlay Musique : journal des musiques pour l'extension (sans jeton Twitch)
 *
 * Bot de chat :
 *   GET/PUT /me/bot · POST /me/bot/test (console de test, n'écrit rien sur Twitch)
 *   POST    /eventsub                    webhooks EventSub signés (chat, live, follows, abos, raids, bits)
 *
 * Subathon (timer sur le relais, page publique) :
 *   GET/PUT /me/subathon · POST /me/subathon/action { args } · PUT /me/subathon/ideas/:id { status }
 *   GET     /public/:login/subathon      état public (timer, paliers, idées) ; session facultative (votes du viewer)
 *   POST    /public/:login/ideas         { text } (session viewer) · POST /public/:login/ideas/:id/vote
 *   POST    /o/:id/don                   don reçu par un overlay (Streamlabs) → subathon du relais
 *
 * Demandes de musique (!sr) :
 *   GET/PUT /me/sr · POST /me/sr/action { action, n, dir } · GET /public/:login/sr (file publique)
 *   GET/POST /o/:id/sr                   overlay Lecteur (YouTube) : état de la file, morceau fini / en erreur
 *   GET     /o/:id/spotify-token         jeton Spotify à jour pour l'overlay Musique (le relais garde le refresh token)
 *   POST    /o/:id/tts { text }           voix française générée par Workers AI (binding AI), 20 lectures par minute maximum
 * Statistiques des lives (relevé chaque minute pendant le live, événements Twitch) :
 *   GET/PUT /me/stats { enabled } · GET/DELETE /me/stats/:debut (un live, relevés minute par minute)
 * Sous-titres en direct (voix reconnue par le navigateur du streamer, traduite) :
 *   POST /me/captions/ticket → ticket d'une minute · GET /captions/:userId?t=ticket (WebSocket de la page Sous-titres)
 *   → chaque phrase est relayée aux overlays « soustitres » (WebSocket /o/:id/ws), traduite par Workers AI si demandé
 * Équipe (le relais agit au nom du streamer, s'il l'autorise, pour ses modos vérifiés auprès de Twitch) :
 *   GET/PUT /me/team { mods } · POST /me/team/:broadcasterId { method, path, body } (sondages, prédictions, récompenses)
 * Page publique de la chaîne : GET/PUT /me/page · GET /public/:login/page (commandes, liens, planning)
 * Images du compte (avatars du PNGTuber…) : POST /me/assets { type, data base64 } · GET /me/assets · DELETE /me/assets/:id
 *   GET /a/:userId/:id  image publique (PNG, GIF, WebP, JPEG ; 500 Ko et 12 images au plus par compte)
 * Mini-jeux du chat (points virtuels, duels, prédictions, quiz) :
 *   GET/PUT /me/jeux · POST /me/jeux/action { args } (commande lancée au nom du streamer) · GET /o/:id/jeux (overlay)
 *   Secrets facultatifs : YOUTUBE_API_KEY (recherche par titre et durée), SPOTIFY_CLIENT_ID.
 * Dons automatiques du subathon : Ko-fi et webhooks (instantané), StreamElements (vérifié chaque minute),
 *   Streamlabs (transmis par l'overlay OBS). Chaque don n'est compté qu'une fois.
 *
 * Secrets (wrangler secret put …) : TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, ENCRYPTION_KEY (32 octets en base64),
 *   EVENTSUB_SECRET (10 à 100 caractères, pour signer les webhooks), BOT_LOGIN (facultatif : compte bot du site).
 */

import { DEFAULT_BOT, sanitizeBot, onChat, onEvent, onTick, wantedSubs, userLevel, BOT_SCOPES, BOT_ACCOUNT_SCOPES, SHIELD_SCOPES } from './bot.js';
import * as SUBA from './subathon.js';
import * as SR from './sr.js';
import * as JEUX from './jeux.js';
import * as STATS from './stats.js';
import * as MC from './multichat.js';
import { tr, LANGS } from './i18n.js';
import * as EQ from './equipe.js';
import { TOOL_KEYS } from './tool-keys.js';

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
        const k = await keyIndex(env, p[1]);
        const v = (k && k.v) || url.searchParams.get('v'); // jeton enregistré dans Mon compte : toujours vérifié
        if (v && !same(String(d.verification_token || ''), v)) return json({ error: 'jeton de vérification incorrect' }, 403);
        if (d.is_public === false) d.from_name = 'Anonyme';
        const don = { kind: 'don', source: 'Ko-fi', id: 'kofi-' + clean(d.kofi_transaction_id || d.message_id, 80), name: clean(d.from_name, 60), amount: parseFloat(d.amount) || 0, currency: clean(d.currency || 'EUR', 5), message: d.is_public === false ? '' : clean(d.message), type: clean(d.type, 30) };
        await room('key:' + p[1]).fetch('https://room/broadcast', { method: 'POST', body: JSON.stringify(don) });
        await donToOwner(env, p[1], don);
        return json({ ok: true });
      }
      if (req.method === 'POST' && p[0] === 'hook' && KEY_RE.test(p[1] || '')) {
        const d = await req.json().catch(() => null);
        if (!d) return json({ error: 'JSON attendu' }, 400);
        const k = await keyIndex(env, p[1]); // avec un jeton Ko-fi enregistré, le webhook générique doit le fournir aussi
        if (k && k.v && !same(url.searchParams.get('v') || req.headers.get('X-StreamBox-Token') || '', k.v)) return json({ error: 'jeton de vérification manquant ou incorrect' }, 403);
        const don = { kind: 'don', source: clean(d.source || 'Webhook', 30), id: d.id ? 'hook-' + clean(d.id, 80) : undefined, name: clean(d.name, 60), amount: parseFloat(d.amount) || 0, currency: clean(d.currency || 'EUR', 5), message: clean(d.message) };
        await room('key:' + p[1]).fetch('https://room/broadcast', { method: 'POST', body: JSON.stringify(don) });
        await donToOwner(env, p[1], don);
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
            const cur = await room('yt:' + ch).fetch('https://room/alias').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
            if (cur.login !== login) { // preuve que la chaîne YouTube est à toi : un code dans sa description
              const code = await ytCode(env, login, ch);
              const html = await fetch('https://www.youtube.com/channel/' + ch + '/about', { headers: MC.YT_HEADERS }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
              if (!html.includes(code)) return json({ error: `Pour prouver que cette chaîne YouTube est à toi, ajoute ${code} dans sa description, puis recommence (tu pourras l'enlever ensuite).`, code }, 403);
            }
            await room('yt:' + ch).fetch('https://room/alias', { method: 'POST', body: JSON.stringify({ login }) });
            return json({ ok: true });
          }
          return logTrack(env, login, body);
        }
      }
      /* ---- Images du compte (publiques, adresse impossible à deviner) ---- */
      if (req.method === 'GET' && p[0] === 'a' && /^\d{1,20}$/.test(p[1] || '') && /^[a-z0-9]{16,32}$/.test(p[2] || '')) {
        return env.ACCOUNT.get(env.ACCOUNT.idFromName('user:' + p[1])).fetch('https://acc/asset-get?id=' + p[2]);
      }
      /* ---- Sous-titres : WebSocket de la page Sous-titres (ticket à usage unique) ---- */
      if (p[0] === 'captions' && /^\d{1,20}$/.test(p[1] || '')) {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426);
        return env.ACCOUNT.get(env.ACCOUNT.idFromName('user:' + p[1])).fetch('https://acc/cap-ws?t=' + encodeURIComponent(url.searchParams.get('t') || ''), { headers: { Upgrade: 'websocket' } }); // jamais les en-têtes du client
      }
      /* ---- Chat multiplateforme (Kick, YouTube) ---- */
      if (req.method === 'GET' && p[0] === 'kick' && MC.KICK_SLUG.test(p[1] || '')) return cached('kick:' + p[1].toLowerCase(), 3600, () => MC.kickChannel(p[1]));
      if (req.method === 'GET' && p[0] === 'yt' && p[1] === 'live' && MC.YT_CHANNEL.test(decodeURIComponent(p[2] || ''))) return cached('ytlive:' + decodeURIComponent(p[2]).toLowerCase(), 60, () => MC.ytLive(decodeURIComponent(p[2])));
      if (req.method === 'GET' && p[0] === 'yt' && p[1] === 'chat' && MC.YT_VIDEO.test(p[2] || '')) {
        const { status, ...d } = await MC.ytChat(p[2], url.searchParams.get('c'));
        return json(d, status || 200, { 'Cache-Control': 'no-store' });
      }
      if (req.method === 'GET' && p[0] === 'yt' && /^UC[\w-]{20,}$/.test(p[1] || '')) {
        const a = await room('yt:' + p[1]).fetch('https://room/alias').then((r) => r.json());
        if (!a.login) return json({ error: 'chaîne YouTube non reliée à StreamBox', tracks: [] }, 404);
        const from = +url.searchParams.get('from') || 0, to = +url.searchParams.get('to') || Date.now();
        return room('chan:' + a.login).fetch(`https://room/tracks?from=${from}&to=${to}`).then(withCors);
      }
      /* ---- Planning Twitch d'une chaîne (données publiques, jeton d'application, cache 10 min) ---- */
      if (req.method === 'GET' && p[0] === 'schedule' && LOGIN_RE.test((p[1] || '').toLowerCase())) {
        if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'relais sans identifiants Twitch' }, 501);
        return cached('sched:' + p[1].toLowerCase(), 600, () => twitchSchedule(p[1].toLowerCase(), env));
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

/* Réponse publique mise en cache quelques minutes (évite de solliciter Kick / YouTube à chaque overlay) */
async function cached(name, secs, fn) {
  const key = new Request('https://cache.streambox/' + encodeURIComponent(name));
  const hit = await caches.default.match(key);
  if (hit) return withCors(hit);
  const { status, ...d } = await fn();
  const res = json(d, status || 200, { 'Cache-Control': `public, max-age=${d.error ? 30 : secs}` });
  await caches.default.put(key, res.clone());
  return res;
}

/* Un don arrivé par la clé Ko-fi / webhook d'un streamer va aussi dans son subathon (si la clé est enregistrée dans son compte) */
async function keyIndex(env, key) {
  if (!env.ACCOUNT) return null;
  const r = await env.ACCOUNT.get(env.ACCOUNT.idFromName('kofikey:' + key)).fetch('https://acc/index-full', { method: 'POST', body: '{}' });
  return r.ok ? r.json() : null;
}
// Code à mettre dans la description d'une chaîne YouTube pour la relier à un login Twitch (stable, propre au relais)
async function ytCode(env, login, ch) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(login + ':' + ch + ':' + (env.EVENTSUB_SECRET || env.TWITCH_CLIENT_ID || 'streambox')));
  return 'streambox-' + [...new Uint8Array(h)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// comparaison en temps constant (jetons)
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
async function donToOwner(env, key, don) {
  const k = await keyIndex(env, key);
  const user_id = k && k.user_id;
  if (user_id) await env.ACCOUNT.get(env.ACCOUNT.idFromName('user:' + user_id)).fetch('https://acc/don', { method: 'POST', body: JSON.stringify({ don }) });
}

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
async function appAccess(cid, secret) {
  if (!appToken || appToken.exp < Date.now() || appToken.cid !== cid) {
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: cid, client_secret: secret, grant_type: 'client_credentials' }) });
    const d = await r.json();
    if (!d.access_token) throw new Error('jeton d’application Twitch refusé');
    appToken = { v: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 60) * 1000, cid };
  }
  return appToken.v;
}
/* Planning : prochains lives (jusqu'à 3 semaines), vacances, nom et avatar de la chaîne */
async function twitchSchedule(login, env) {
  const tok = await appAccess(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET);
  const get = (q) => fetch('https://api.twitch.tv/helix/' + q, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + tok } });
  const u = ((await (await get('users?login=' + login)).json()).data || [])[0];
  if (!u) return { status: 404, error: 'chaîne introuvable' };
  const r = await get('schedule?first=25&broadcaster_id=' + u.id);
  const d = r.ok ? ((await r.json()).data || {}) : {}; // 404 : aucun planning sur Twitch
  const until = Date.now() + 21 * 86400000;
  const segments = (d.segments || []).filter((g) => !g.canceled_until && Date.parse(g.start_time) < until)
    .map((g) => ({ start: g.start_time, end: g.end_time, title: clean(g.title, 140), game: clean((g.category || {}).name || '', 80), recurring: !!g.is_recurring }));
  return { login: u.login, name: u.display_name, avatar: u.profile_image_url || '', segments, vacation: d.vacation ? { start: d.vacation.start_time, end: d.vacation.end_time } : null };
}
async function twitchVideo(id, env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'relais sans identifiants Twitch' }, 501);
  const cache = caches.default;
  const key = new Request('https://cache.streambox/video/' + id);
  const hit = await cache.match(key);
  if (hit) return withCors(hit);
  const tok = await appAccess(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET);
  const r = await fetch('https://api.twitch.tv/helix/videos?id=' + id, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + tok } });
  const v = ((await r.json()).data || [])[0];
  if (!v) { const miss = json({ error: 'VOD introuvable' }, 404, { 'Cache-Control': 'public, max-age=600' }); await cache.put(key, miss.clone()); return miss; } // absente : gardée 10 min
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
  musique: ['spotifycid', 'lastfm', 'lfmkey'], // Spotify : jeton à jour fourni par /o/:id/spotify-token ; journal des musiques : /o/:id/track
  lecteur: [], jeux: [], generique: [], soustitres: [], pngtuber: ['obspass'], shoutout: ['token', 'obspass'], clips: ['token', 'obspass'], etiquettes: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'], automatisations: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'], qrdons: [], compteurs: ['obspass'], sons: ['token', 'obspass'],
  tts: ['token', 'sejwt', 'sltoken', 'kofi', 'obspass'],
  planning: [], hypetrain: [], vedette: [], pubs: [], votes: [], score: ['obspass'], // pubs, votes, Hype Train : le relais lit Twitch pour eux (OV_TWITCH)
  discord: ['token', 'webhook'],
};
// Overlays qui suivent Twitch SANS recevoir le jeton du streamer : le relais s'abonne aux événements
// (webhooks EventSub) et les leur pousse par /o/:id/ws ; il fait aussi pour eux quelques lectures Helix précises.
const OV_TWITCH = {
  pubs: { subs: [['channel.ad_break.begin', '1', 'adBreak']], helix: ['channels/ads'] },
  votes: { subs: [['channel.poll.begin', '1', 'pollBegin'], ['channel.poll.progress', '1', 'pollProgress'], ['channel.poll.end', '1', 'pollEnd'],
    ['channel.prediction.begin', '1', 'predBegin'], ['channel.prediction.progress', '1', 'predProgress'], ['channel.prediction.lock', '1', 'predLock'], ['channel.prediction.end', '1', 'predEnd']], helix: ['polls', 'predictions'] },
  hypetrain: { subs: [['channel.hype_train.begin', '2', 'hypeBegin'], ['channel.hype_train.progress', '2', 'hypeProgress'], ['channel.hype_train.end', '2', 'hypeEnd']], helix: ['hypetrain/status'] },
};
const OV_EV = Object.fromEntries(Object.entries(OV_TWITCH).flatMap(([tool, x]) => x.subs.map(([type, , ev]) => [type, { tool, ev }])));
const LOCAL_WS = /^wss?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?\/?$/i;
const DISCORD_HOOK = /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const SECRET_KEYS = ['spotify', 'spotifycid', 'lastfm', 'lfmkey', 'sejwt', 'sltoken', 'kofi', 'kofiv', 'webhook', 'obspass']; // kofiv : jeton de vérification Ko-fi (jamais envoyé à un overlay)
const TEAM_SCOPES = ['channel:manage:polls', 'channel:manage:predictions', 'channel:manage:redemptions', 'moderation:read'];
const SCOPES = 'clips:edit moderator:read:followers channel:read:redemptions channel:read:subscriptions channel:read:hype_train channel:read:ads channel:read:polls channel:read:predictions';
const rand = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, Math.ceil(n * 1.4));
const OV_RE = /^[a-z0-9]{20,48}$/;

/* Journal des musiques : un morceau pour la chaîne (adresses en https uniquement : l'extension en fait un lien et une image) */
const httpsOnly = (s, n) => { const v = clean(s, n); try { return new URL(v).protocol === 'https:' ? v : ''; } catch (e) { return ''; } };
async function logTrack(env, login, body) {
  const t = { at: +body.at || Date.now(), title: clean(body.title, 200), artist: clean(body.artist, 200), album: clean(body.album, 200), art: httpsOnly(body.art, 400), url: httpsOnly(body.url, 400), source: clean(body.source, 20), duration: Math.max(0, Math.min(3600000, +body.duration || 0)) };
  if (!t.title) return json({ error: 'titre manquant' }, 400);
  return env.ROOM.get(env.ROOM.idFromName('chan:' + login)).fetch('https://room/tracks', { method: 'POST', body: JSON.stringify(t) }).then(withCors);
}

async function accountRoutes(req, env, url, p) {
  const stub = (name) => env.ACCOUNT.get(env.ACCOUNT.idFromName(name));
  // Session valide : non expirée, et émise depuis la dernière « déconnexion partout » ou suppression du compte
  const sessionOf = async (sid) => {
    if (!/^[a-z0-9]{20,64}$/.test(sid || '')) return null;
    const [st1, s] = await call('sess:' + sid, '/session-get');
    if (st1 !== 200 || !s.user_id) return null;
    const [, g] = await call('sessgen:' + s.user_id, '/gen-get', {});
    return (s.gen || 0) === (g.gen || 0) ? s : null;
  };
  const call = (name, path, body) => stub(name).fetch('https://acc' + path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json().then((d) => [r.status, d]));

  // ---- Connexion : échange du code OAuth (le secret Twitch ne quitte jamais le relais) ----
  if (req.method === 'POST' && p[0] === 'auth' && p[1] === 'twitch') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'relais sans identifiants Twitch' }, 501);
    const { code, redirect_uri, mode } = await req.json().catch(() => ({}));
    if (!code || !redirect_uri) return json({ error: 'code manquant' }, 400);
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri }) });
    const t = await r.json();
    if (!t.access_token) return json({ error: 'Twitch a refusé la connexion : ' + (t.message || r.status) }, 401);
    const v = await (await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + t.access_token } })).json();
    if (!v.user_id) return json({ error: 'jeton Twitch invalide' }, 401);
    const tokens = { login: v.login, user_id: v.user_id, access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 3600) * 1000, scopes: v.scopes || [] };
    if (mode === 'botaccount') { // compte bot du site : seul le compte prévu (BOT_LOGIN) est accepté
      if (!env.BOT_LOGIN || v.login !== env.BOT_LOGIN.toLowerCase()) return json({ error: `seul le compte ${env.BOT_LOGIN || '(BOT_LOGIN non défini)'} peut être le bot du site` }, 403);
      await call('botaccount', '/login', tokens);
      return json({ bot: true, login: v.login });
    }
    const session = rand(32);
    // « viewer » : simple connexion pour voter (aucune permission) ; ne touche jamais aux jetons d'un streamer
    await call('user:' + v.user_id, mode === 'viewer' ? '/viewer-login' : '/login', tokens);
    await call('login:' + v.login, '/index-set', { user_id: v.user_id });
    const [, g] = await call('sessgen:' + v.user_id, '/gen-get', {});
    await call('sess:' + session, '/session', { user_id: v.user_id, login: v.login, gen: g.gen || 0, exp: Date.now() + 90 * 86400000 });
    return json({ session, login: v.login });
  }

  // ---- Webhooks EventSub (bot de chat) : signature HMAC vérifiée ----
  if (req.method === 'POST' && p[0] === 'eventsub') {
    const raw = await req.text();
    if (!(await verifyEventsub(req, env, raw))) return new Response('signature invalide', { status: 403 });
    const body = JSON.parse(raw);
    const type = req.headers.get('Twitch-Eventsub-Message-Type');
    if (type === 'webhook_callback_verification') return new Response(body.challenge, { headers: { 'Content-Type': 'text/plain' } });
    const cond = (body.subscription || {}).condition || {};
    const bid = cond.broadcaster_user_id || cond.to_broadcaster_user_id;
    if (!bid) return new Response(null, { status: 204 });
    const r = await stub('user:' + bid).fetch('https://acc/bot-event', { method: 'POST', headers: { 'X-Origin': url.origin }, body: JSON.stringify({ kind: type, id: req.headers.get('Twitch-Eventsub-Message-Id'), type: body.subscription.type, event: body.event }) });
    return new Response(null, { status: r.ok ? 204 : 202 });
  }

  // ---- Subathon public : timer, paliers, idées (lecture libre ; propositions et votes avec une session) ----
  if (p[0] === 'public' && LOGIN_RE.test(p[1] || '') && ['subathon', 'ideas', 'sr', 'page'].includes(p[2])) {
    const [ist, idx] = await call('login:' + p[1], '/index');
    if (ist !== 200 || !idx.user_id) return json({ error: 'chaîne inconnue sur StreamBox' }, 404);
    const sid = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let viewer = null;
    viewer = await sessionOf(sid);
    const owner = stub('user:' + idx.user_id);
    const go = (path, body) => owner.fetch('https://acc' + path, { method: 'POST', headers: { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }) }, body: JSON.stringify(body) }).then((r) => withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })));
    if (req.method === 'GET' && p[2] === 'subathon') return go('/public-sub', { viewerId: viewer && viewer.user_id });
    if (req.method === 'GET' && p[2] === 'sr') return go('/public-sr', {});
    if (req.method === 'GET' && p[2] === 'page') return go('/public-page', {});
    if (req.method === 'POST' && p[2] === 'ideas') {
      if (!viewer) return json({ error: 'connecte-toi avec Twitch pour proposer ou voter' }, 401);
      const body = await req.json().catch(() => ({}));
      if (p.length === 3) return go('/public-idea', { text: body.text, by: viewer.login || 'viewer', byId: viewer.user_id });
      if (/^\d{1,6}$/.test(p[3] || '') && p[4] === 'vote') return go('/public-vote', { id: +p[3], userId: viewer.user_id });
    }
    return json({ error: 'route inconnue' }, 404);
  }

  // ---- Lecture par un overlay (lien court, public mais impossible à deviner) ----
  if (p[0] === 'o' && OV_RE.test(p[1] || '')) {
    const [st, idx] = await call('ov:' + p[1], '/index');
    if (st !== 200 || !idx.user_id) return json({ error: 'overlay introuvable (lien supprimé ou régénéré)' }, 404);
    if (p[2] === 'ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426);
      return stub('user:' + idx.user_id).fetch('https://acc/ws?ov=' + p[1], { headers: { Upgrade: 'websocket' } }); // jamais les en-têtes du client (X-Env, X-Origin…)
    }
    if (p[2] === 'tts' && req.method === 'POST') { // overlay Lecture à voix haute : voix du relais
      const d = await req.json().catch(() => ({}));
      const r = await stub('user:' + idx.user_id).fetch('https://acc/ov-tts', { method: 'POST', body: JSON.stringify({ ov: p[1], text: d.text, lang: d.lang }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (p[2] === 'say' && req.method === 'POST') { // overlay Automatisations : message du chat ou Discord envoyé par le relais
      const d = await req.json().catch(() => ({}));
      const r = await stub('user:' + idx.user_id).fetch('https://acc/ov-say', { method: 'POST', headers: { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }) }, body: JSON.stringify({ ov: p[1], text: d.text, to: d.to, which: d.which }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } }));
    }
    if ((p[2] === 'credits' || p[2] === 'recap') && req.method === 'GET') { // overlay Générique de fin (et son résumé par l'IA)
      const r = await stub('user:' + idx.user_id).fetch('https://acc/ov-' + p[2], { method: 'POST', body: JSON.stringify({ ov: p[1], lang: url.searchParams.get('lang') }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (p[2] === 'jeux' && req.method === 'GET') { // overlay Mini-jeux : état public des jeux
      const r = await stub('user:' + idx.user_id).fetch('https://acc/ov-jeux', { method: 'POST', body: JSON.stringify({ ov: p[1] }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (p[2] === 'sr' || p[2] === 'spotify-token') { // overlay Lecteur (file YouTube) / overlay Musique (Spotify)
      const d = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const r = await stub('user:' + idx.user_id).fetch('https://acc/' + (p[2] === 'sr' ? 'ov-sr' : 'ov-spotify-token'), { method: 'POST', body: JSON.stringify(Object.assign({ action: 'state' }, d, { ov: p[1] })) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (p[2] === 'track' && req.method === 'POST') { // overlay Musique : journal des musiques, sans jeton Twitch dans l'overlay
      const d = await req.json().catch(() => null);
      if (!d) return json({ error: 'JSON attendu' }, 400);
      const [s2, o] = await call('user:' + idx.user_id, '/ov-track', { ov: p[1] });
      if (s2 !== 200) return json(o, s2);
      return logTrack(env, o.login, d);
    }
    if (p[2] === 'twitch' && req.method === 'GET') { // pubs, votes, Hype Train : lecture Twitch faite par le relais (l'overlay n'a pas le jeton)
      const r = await stub('user:' + idx.user_id).fetch('https://acc/ov-twitch', { method: 'POST', headers: { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }) }, body: JSON.stringify({ ov: p[1], path: url.searchParams.get('path') || '' }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (p[2] === 'don' && req.method === 'POST') { // l'overlay transmet un don Streamlabs reçu en direct
      const d = await req.json().catch(() => ({}));
      const r = await stub('user:' + idx.user_id).fetch('https://acc/overlay-don', { method: 'POST', body: JSON.stringify({ ov: p[1], don: d }) });
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } }));
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
  const sess = await sessionOf(sid);
  if (!sess) return json({ error: 'session expirée : reconnecte-toi' }, 401);
  const user = 'user:' + sess.user_id;
  const envHdr = { 'X-Env': JSON.stringify({ cid: env.TWITCH_CLIENT_ID, secret: env.TWITCH_CLIENT_SECRET, key: env.ENCRYPTION_KEY || '' }), 'X-Origin': url.origin };
  const fwd = (path, method, body) => stub(user).fetch('https://acc' + path, { method, headers: envHdr, body: body == null ? undefined : JSON.stringify(body) }).then((r) => withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })));
  const body = req.method === 'GET' || req.method === 'DELETE' ? null : await req.json().catch(() => ({}));

  if (p.length === 1 && req.method === 'GET') return fwd('/me', 'POST', {});
  if (p.length === 1 && req.method === 'DELETE') { // RGPD : suppression complète du compte
    const r = await fwd('/delete-account', 'POST', {});
    if (r.status === 200) { await call('sessgen:' + sess.user_id, '/gen-bump', {}); await call('sess:' + sid, '/session-delete', {}); } // toutes les sessions du compte
    return r;
  }
  if (p[1] === 'logout-all' && req.method === 'POST') { // se déconnecter de tous les appareils
    await call('sessgen:' + sess.user_id, '/gen-bump', {}); await call('sess:' + sid, '/session-delete', {});
    return json({ ok: true });
  }
  if (p[1] === 'secrets' && req.method === 'PUT') return fwd('/secrets', 'POST', body);
  if (p[1] === 'lang' && req.method === 'PUT') return fwd('/lang', 'POST', body);
  if (p[1] === 'twitch-token' && p.length === 2 && req.method === 'GET') return fwd('/my-token', 'POST', {});
  if (p[1] === 'diag' && p.length === 2 && req.method === 'GET') return fwd('/diag', 'POST', {});
  if (p[1] === 'sim' && p.length === 2 && req.method === 'POST') return fwd('/sim', 'POST', body);
  if (p[1] === 'sr') {
    if (p.length === 2 && req.method === 'GET') return fwd('/sr-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/sr-save', 'POST', body);
    if (p[2] === 'action' && req.method === 'POST') return fwd('/sr-action', 'POST', body);
  }
  if (p[1] === 'team') {
    if (p.length === 2 && req.method === 'GET') return fwd('/team-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/team-save', 'POST', body);
    if (/^\d{1,15}$/.test(p[2] || '') && p[3] === 'feature' && p.length === 4 && req.method === 'POST') { // message en vedette sur la chaîne p[2]
      const r = await stub('user:' + p[2]).fetch('https://acc/team-feature', { method: 'POST', headers: { 'X-Env': envHdr['X-Env'] }, body: JSON.stringify({ caller: sess.user_id, msg: body.msg, clear: !!body.clear }) });
      if (r.status === 404 && (await r.clone().json().catch(() => ({}))).error === 'compte inconnu') return json({ error: 'cette chaîne n’utilise pas de compte StreamBox' }, 404);
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (/^\d{1,15}$/.test(p[2] || '') && p.length === 3 && req.method === 'POST') { // action pour la chaîne p[2] (la sienne, ou une chaîne où l'on est modo)
      const r = await stub('user:' + p[2]).fetch('https://acc/team-helix', { method: 'POST', headers: { 'X-Env': envHdr['X-Env'] }, body: JSON.stringify({ caller: sess.user_id, req: body }) });
      if (r.status === 404 && (await r.clone().json().catch(() => ({}))).error === 'compte inconnu') return json({ error: 'cette chaîne n’utilise pas de compte StreamBox : son streamer doit se connecter à StreamBox et autoriser ses modos' }, 404);
      return withCors(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
  }
  if (p[1] === 'page') {
    if (p.length === 2 && req.method === 'GET') return fwd('/page-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/page-save', 'POST', body);
  }
  if (p[1] === 'captions' && p[2] === 'ticket' && req.method === 'POST') return fwd('/cap-ticket', 'POST', {});
  if (p[1] === 'assets') {
    if (p.length === 2 && req.method === 'POST') return fwd('/asset-add', 'POST', body);
    if (p.length === 2 && req.method === 'GET') return fwd('/asset-list', 'POST', {});
    if (/^[a-z0-9]{16,32}$/.test(p[2] || '') && req.method === 'DELETE') return fwd('/asset-del', 'POST', { id: p[2] });
  }
  if (p[1] === 'stats') {
    if (p.length === 2 && req.method === 'GET') return fwd('/stats-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/stats-save', 'POST', body);
    if (p[2] === 'recap' && p.length === 3 && req.method === 'POST') return fwd('/stats-recap', 'POST', {});
    if (/^\d{10,15}$/.test(p[2] || '') && p.length === 3 && req.method === 'GET') return fwd('/stats-one', 'POST', { key: p[2] });
    if (/^\d{10,15}$/.test(p[2] || '') && p.length === 3 && req.method === 'DELETE') return fwd('/stats-del', 'POST', { key: p[2] });
  }
  if (p[1] === 'jeux') {
    if (p.length === 2 && req.method === 'GET') return fwd('/jeux-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/jeux-save', 'POST', body);
    if (p[2] === 'action' && req.method === 'POST') return fwd('/jeux-action', 'POST', body);
  }
  if (p[1] === 'subathon') {
    if (p.length === 2 && req.method === 'GET') return fwd('/sub-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/sub-save', 'POST', body);
    if (p[2] === 'action' && req.method === 'POST') return fwd('/sub-action', 'POST', body);
    if (p[2] === 'ideas' && /^\d{1,6}$/.test(p[3] || '') && req.method === 'PUT') return fwd('/sub-idea', 'POST', Object.assign({}, body, { id: +p[3] }));
  }
  if (p[1] === 'bot') {
    if (p.length === 2 && req.method === 'GET') return fwd('/bot-get', 'POST', {});
    if (p.length === 2 && req.method === 'PUT') return fwd('/bot-save', 'POST', body);
    if (p[2] === 'test' && req.method === 'POST') return fwd('/bot-test', 'POST', body);
  }
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

async function verifyEventsub(req, env, raw) {
  const id = req.headers.get('Twitch-Eventsub-Message-Id'), ts = req.headers.get('Twitch-Eventsub-Message-Timestamp'), sig = req.headers.get('Twitch-Eventsub-Message-Signature') || '';
  const t = Date.parse(ts || '');
  if (!id || !Number.isFinite(t) || !env.EVENTSUB_SECRET || Math.abs(Date.now() - t) > 10 * 60000) return false; // horodatage illisible : refusé
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.EVENTSUB_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + ts + raw)));
  const expected = 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i); // comparaison à temps constant
  return diff === 0;
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
  constructor(ctx, env) { this.ctx = ctx; this.env = env || {}; }
  get E() { return { cid: this.env.TWITCH_CLIENT_ID, secret: this.env.TWITCH_CLIENT_SECRET, key: this.env.ENCRYPTION_KEY || '' }; }
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname, st = this.ctx.storage;
    const ok = (d) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
    const err = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: { 'Content-Type': 'application/json' } });
    const body = req.method === 'POST' && path !== '/ws' ? await req.json().catch(() => ({})) : {};
    const E = req.headers.get('X-Env') ? JSON.parse(req.headers.get('X-Env')) : this.E;
    if (req.headers.get('X-Origin')) await st.put('origin', req.headers.get('X-Origin'));

    // --- index d'un lien d'overlay / session ---
    if (path === '/index') return (await st.get('user_id')) ? ok({ user_id: await st.get('user_id') }) : err('?', 404);
    if (path === '/index-full') return (await st.get('user_id')) ? ok({ user_id: await st.get('user_id'), v: (await st.get('v')) || '' }) : err('?', 404);
    if (path === '/index-set') {
      const cur = await st.get('user_id');
      if (body.owned && cur && String(cur) !== String(body.user_id)) return err('déjà utilisé par un autre compte', 409); // clé Ko-fi : premier compte qui l'enregistre
      await st.put('user_id', body.user_id);
      if ('v' in body) { if (body.v) await st.put('v', body.v); else await st.delete('v'); }
      return ok({ ok: true });
    }
    if (path === '/index-delete' || path === '/session-delete') { await st.deleteAll(); return ok({ ok: true }); }
    if (path === '/session') { await st.put('s', body); return ok({ ok: true }); }
    if (path === '/gen-get') return ok({ gen: (await st.get('gen')) || 0 }); // sessgen:<id> : génération des sessions du compte
    if (path === '/gen-bump') { const g = ((await st.get('gen')) || 0) + 1; await st.put('gen', g); return ok({ gen: g }); }
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
    if (path === '/viewer-login') { if (!(await st.get('profile'))) await st.put('profile', { login: body.login, user_id: body.user_id, scopes: [] }); return ok({ ok: true }); }
    const profile = await st.get('profile');
    if (!profile) return err('compte inconnu', 404);
    const overlays = async () => (await st.get('overlays')) || {};

    if (path === '/bot-token') { // compte bot du site
      const s = await secrets();
      return ok({ user_id: profile.user_id, login: profile.login, access: await this.twitchAccess(s, E) });
    }
    if (path === '/asset-get') {
      const a = await st.get('asset:' + url.searchParams.get('id'));
      if (!a) return new Response('introuvable', { status: 404, headers: CORS });
      return new Response(b64.dec(a.data), { headers: Object.assign({ 'Content-Type': a.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }, CORS) });
    }
    if (path === '/asset-list' || path === '/asset-add' || path === '/asset-del') {
      let list = (await st.get('assets')) || [];
      const origin = (await st.get('origin')) || '';
      const view = () => list.map((a) => Object.assign({ url: `${origin}/a/${profile.user_id}/${a.id}` }, a));
      if (path === '/asset-del') { await st.delete('asset:' + body.id); list = list.filter((a) => a.id !== body.id); await st.put('assets', list); return ok({ assets: view() }); }
      if (path === '/asset-list') return ok({ assets: view() });
      const TYPES = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/gif': [0x47, 0x49, 0x46, 0x38], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
      if (!TYPES[body.type]) return err('format accepté : PNG, GIF, WebP ou JPEG');
      let bytes; try { bytes = b64.dec(String(body.data || '')); } catch (e) { return err('image illisible'); }
      if (!bytes.length || bytes.length > 512 * 1024) return err('image trop lourde : 500 Ko maximum');
      // le contenu doit vraiment être une image du format annoncé (pas une page HTML déguisée)
      if (!TYPES[body.type].every((v, i) => bytes[i] === v) || (body.type === 'image/webp' && String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP')) return err('ce fichier n’est pas une image ' + body.type.split('/')[1].toUpperCase());
      if (list.length >= 12) return err('12 images maximum : supprimes-en une dans Mon compte');
      const id = rand(20).slice(0, 24).toLowerCase().replace(/[^a-z0-9]/g, '0').padEnd(16, '0');
      await st.put('asset:' + id, { type: body.type, data: String(body.data).replace(/\s+/g, '') }); // le base64 reçu (déjà vérifié)
      list.push({ id, type: body.type, size: bytes.length, at: Date.now() }); await st.put('assets', list);
      return ok({ id, url: `${origin}/a/${profile.user_id}/${id}`, assets: view() });
    }
    if (path === '/cap-ticket') { // ticket d'une minute pour ouvrir le WebSocket des sous-titres (pas de session dans l'URL)
      const t = rand(32); await st.put('capticket', { t, exp: Date.now() + 60000 });
      return ok({ ticket: t, userId: profile.user_id });
    }
    if (path === '/cap-ws') {
      const k = await st.get('capticket'), t = url.searchParams.get('t');
      if (!k || !t || k.t !== t || k.exp < Date.now()) return err('ticket invalide ou expiré', 403);
      await st.delete('capticket');
      const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1], ['cap']);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (path === '/lang') { if (!LANGS.includes(body.lang)) return err('langue inconnue'); profile.lang = body.lang; await st.put('profile', profile); return ok({ lang: profile.lang }); }
    if (path === '/my-token') { // panneau de modération : le modo agit avec SON compte Twitch, depuis son navigateur
      const s = await secrets();
      const access = await this.twitchAccess(s, E);
      if (!access) return err('connexion Twitch expirée : reconnecte-toi avec Twitch', 403);
      const v = await (await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + access } })).json().catch(() => ({}));
      return new Response(JSON.stringify({ access, login: profile.login, user_id: profile.user_id, scopes: v.scopes || profile.scopes || [], expires_in: v.expires_in || 0 }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (path === '/don') return ok(await this.subDon(body.don || {}, profile, await secrets(), E));
    if (path === '/ov-track') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || o.tool !== 'musique' || !(o.settings || {}).log) return err('overlay non autorisé', 403);
      const now = Date.now(); // 30 morceaux par minute et par compte
      this._trk = (this._trk || []).filter((t) => now - t < 60000);
      if (this._trk.length >= 30) return err('trop de morceaux, réessaie dans un instant', 429);
      this._trk.push(now);
      return ok({ login: profile.login });
    }
    if (path === '/ov-twitch') { // lecture Helix pour un overlay OV_TWITCH : point d'accès autorisé pour son outil, chaîne du compte uniquement
      const o = ((await st.get('overlays')) || {})[body.ov];
      const allow = o && OV_TWITCH[o.tool];
      if (!allow) return err('overlay non autorisé', 403);
      const [ep, qs] = String(body.path || '').split('?');
      if (ep === 'users') return ok({ data: [{ id: profile.user_id, login: profile.login }] });
      if (!allow.helix.includes(ep)) return err('lecture non autorisée pour cet overlay', 403);
      const now = Date.now(); // 60 lectures par minute et par compte
      this._ovtw = (this._ovtw || []).filter((t) => now - t < 60000);
      if (this._ovtw.length >= 60) return err('trop de lectures, réessaie dans un instant', 429);
      this._ovtw.push(now);
      const access = await this.twitchAccess(await secrets(), E);
      if (!access) return err('connexion Twitch expirée : reconnecte-toi sur StreamBox', 401);
      const q = new URLSearchParams({ broadcaster_id: profile.user_id });
      const first = new URLSearchParams(qs || '').get('first');
      if (first && /^\d{1,2}$/.test(first)) q.set('first', first);
      const r = await fetch('https://api.twitch.tv/helix/' + ep + '?' + q, { headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + access } }).catch(() => null);
      if (!r) return err('Twitch injoignable', 502);
      return new Response(JSON.stringify(await r.json().catch(() => ({}))), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/ov-tts') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || !['tts', 'generique'].includes(o.tool)) return err('overlay non autorisé', 403); // générique : lecture du résumé
      if (!this.env.AI) return err('voix du relais non activée (binding AI de Workers AI)', 501);
      const text = clean(body.text, 300).trim();
      if (!text) return err('texte vide');
      const now = Date.now(); // limite : 20 lectures par minute et par compte (quota Workers AI)
      this._tts = (this._tts || []).filter((t) => now - t < 60000);
      if (this._tts.length >= 20) return err('trop de lectures, réessaie dans un instant', 429);
      this._tts.push(now);
      try {
        const r = await this.env.AI.run('@cf/myshell-ai/melotts', { prompt: text, lang: LANGS.includes(body.lang) ? body.lang : 'fr' });
        const audio = typeof r === 'string' ? r : r && r.audio;
        if (!audio) throw new Error('réponse vide');
        return ok({ audio, mime: 'audio/mpeg' });
      } catch (e) { return err('voix indisponible : ' + e.message, 502); }
    }
    if (path === '/overlay-don') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || !['subathon', 'alertes', 'objectifs'].includes(o.tool)) return err('overlay non autorisé', 403);
      const d = body.don || {};
      if (!d.id) return err('identifiant du don manquant');
      return ok(await this.subDon({ source: clean(d.source || 'Streamlabs', 30), id: 'ov-' + clean(d.id, 80), name: clean(d.name, 60), amount: parseFloat(d.amount) || 0, currency: clean(d.currency || 'EUR', 5), message: clean(d.message, 300) }, profile, await secrets(), E));
    }
    if (path === '/ov-say') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || !['automatisations', 'pubs'].includes(o.tool)) return err('overlay non autorisé', 403);
      // Pubs : seulement les deux messages enregistrés dans ses réglages (un lien d'overlay ne peut pas écrire n'importe quoi)
      const PUB = { avant: ['msgbefore', 'Petite pub dans une minute : le temps d’aller boire un verre !'], apres: ['msgafter', 'La pub est finie, merci d’être resté !'] };
      if (o.tool === 'pubs' && !PUB[body.which]) return err('message inconnu');
      const text = clean(o.tool === 'pubs' ? (o.settings[PUB[body.which][0]] != null ? o.settings[PUB[body.which][0]] : tr(PUB[body.which][1], profile.lang)) : body.text, 450).trim();
      if (o.tool === 'pubs') body.to = 'chat';
      if (!text) return err('message vide');
      const now = Date.now(); // 20 messages par minute au plus (évite qu'une boucle inonde le chat)
      this._say = (this._say || []).filter((t) => now - t < 60000);
      if (this._say.length >= 20) return err('trop de messages, réessaie dans un instant', 429);
      this._say.push(now);
      const bot = (await st.get('bot')) || sanitizeBot({}, null);
      const ctx = { state: (await st.get('botstate')) || {}, changed: false };
      const api = this.makeApi(bot, profile, await secrets(), E, ctx);
      if (body.to === 'discord') { if (!(await secrets()).webhook) return err('aucun webhook Discord enregistré dans Mon compte'); await api.discord(text); }
      else { const r = await api.say(text); if (!r || !r.ok) return err(ctx.state.lastError || 'Twitch a refusé le message (autorise les permissions du bot)', 502); }
      await st.put('botstate', ctx.state);
      return ok({ ok: true });
    }
    if (path === '/ov-credits' || path === '/ov-recap') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || o.tool !== 'generique') return err('overlay non autorisé', 403);
      const cfg = (await st.get('stats')) || {};
      const L = await st.get('statlive');
      let d;
      if (L) d = Object.assign({ live: true, enabled: !!cfg.enabled }, STATS.credits(STATS.finish(L, Date.now())));
      else {
        const last = ((await st.get('statidx')) || [])[0];
        const r = last && Date.now() - last.endedAt < 12 * 3600000 ? await st.get('stat:' + String(last.startedAt).padStart(15, '0')) : null; // dernier live, s'il date de moins de 12 h
        d = r ? Object.assign({ live: false, enabled: !!cfg.enabled }, STATS.credits(r)) : { live: false, enabled: !!cfg.enabled, empty: true };
      }
      if (path === '/ov-credits') return ok(d);
      // Résumé rédigé par l'IA, à partir des seuls chiffres du live (gardé 15 min : pas de nouvel appel à chaque affichage)
      if (d.empty) return err('pas de live récent à résumer', 404);
      if (!this.env.AI) return err('IA du relais non activée (binding AI de Workers AI)', 501);
      const lang = LANGS.includes(body.lang) ? body.lang : (profile.lang || 'fr');
      const key = `recap:${d.startedAt}:${lang}:${Math.floor((d.duration || 0) / 900000)}`;
      const hit = await st.get('recap');
      if (hit && hit.key === key) return ok({ text: hit.text, cached: true });
      const now = Date.now(); this._recap = (this._recap || []).filter((t) => now - t < 3600000);
      if (this._recap.length >= 10) return err('trop de résumés demandés, réessaie plus tard', 429);
      this._recap.push(now);
      const facts = { titre: d.title, duree_minutes: Math.round((d.duration || 0) / 60000), jeux: d.games, pic_viewers: d.counts.peak, messages: d.counts.msgs,
        nouveaux_follows: d.counts.follows, abonnements: (d.counts.subs || 0) + (d.counts.resubs || 0), abos_offerts: d.counts.gifts, bits: d.counts.bits,
        raids: (d.raids || []).map((r) => `${r.from} (${r.viewers} viewers)`), chatteurs_les_plus_actifs: (d.chatters || []).slice(0, 3) };
      const LN = { fr: 'français', en: 'English', es: 'español' }[lang];
      try {
        const r = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { max_tokens: 220, messages: [
          { role: 'system', content: `Tu écris le résumé d'un live Twitch, affiché et lu à voix haute dans le générique de fin. Écris 2 ou 3 phrases chaleureuses, en ${LN}, au présent ou au passé composé, en t'adressant aux viewers. Utilise UNIQUEMENT les faits donnés (ignore ceux qui valent 0 ou sont vides), n'invente rien, pas de hashtags, au plus un emoji. Réponds seulement par le résumé.` },
          { role: 'user', content: JSON.stringify(facts) }] });
        const text = clean(String((r && r.response) || '').replace(/^["«\s]+|["»\s]+$/g, ''), 700).trim();
        if (!text) throw new Error('réponse vide');
        await st.put('recap', { key, text });
        return ok({ text });
      } catch (e) { return err('résumé indisponible : ' + e.message, 502); }
    }
    /* ---- Équipe : sondages, prédictions et récompenses faits par le relais pour les modos ---- */
    if (path === '/team-get') return ok(Object.assign({ mods: false }, await st.get('team'), { scopes: TEAM_SCOPES.filter((s) => !(profile.scopes || []).includes(s)) }));
    if (path === '/team-save') { const t = { mods: !!body.mods }; await st.put('team', t); this._mods = new Map(); return ok(t); }
    if (path === '/team-helix') {
      const g = await this.teamGuard(body, profile, E, secrets);
      if (g.error) return err(g.error, g.status || 403);
      const rq = EQ.teamRequest(body.req || {}, profile.user_id, g.isOwner);
      if (rq.error) return err(rq.error, 403);
      const H = g.H;
      const r = await fetch(rq.url, { method: rq.method, headers: H, body: rq.body ? JSON.stringify(rq.body) : undefined });
      const txt = r.status === 204 ? '{}' : await r.text();
      return new Response(txt || '{}', { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/team-feature') { // message mis en vedette depuis le panneau de modération → overlays « Message en vedette »
      const g = await this.teamGuard(body, profile, E, secrets);
      if (g.error) return err(g.error, g.status || 403);
      const msg = body.clear ? null : EQ.featureMsg(body.msg);
      if (!body.clear && !msg) return err('message invalide');
      let sent = 0;
      this.ctx.getWebSockets('tool:vedette').forEach((ws) => { try { ws.send(JSON.stringify({ type: 'feature', msg })); sent++; } catch (e) { /* parti */ } });
      return ok({ sent });
    }
    /* ---- Page publique de la chaîne ---- */
    if (path === '/page-get') return ok(Object.assign(EQ.sanitizePage(await st.get('page')), { url: EQ.pageUrl(await st.get('page'), profile.login) }));
    if (path === '/page-save') { const pg = EQ.sanitizePage(body, await st.get('page')); await st.put('page', pg); return ok(Object.assign({}, pg, { url: EQ.pageUrl(pg, profile.login) })); }
    if (path === '/public-page') {
      const pg = await st.get('page');
      if (!pg || !pg.enabled) return err('pas de page publique pour cette chaîne', 404);
      const now = Date.now(); // infos Twitch (profil, live, planning) gardées 5 minutes
      if (!this._pub || now - this._pub.at > 300000) {
        const x = { at: now };
        try {
          const app = await appAccess(E.cid, E.secret);
          const get = (q) => fetch('https://api.twitch.tv/helix/' + q, { headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + app } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
          const [u, s, sc] = await Promise.all([get('users?id=' + profile.user_id), get('streams?user_id=' + profile.user_id), pg.sections.schedule ? get(`schedule?broadcaster_id=${profile.user_id}&first=8`) : {}]);
          const user = (u.data || [])[0] || {}, live = (s.data || [])[0];
          x.profile = { name: user.display_name || profile.login, avatar: user.profile_image_url || '', description: user.description || '' };
          x.live = live ? { title: live.title, game: live.game_name, viewers: live.viewer_count, startedAt: live.started_at } : null;
          const seg = ((sc.data || {}).segments || []);
          x.schedule = seg.filter((g) => !g.canceled_until).map((g) => ({ start: g.start_time, end: g.end_time, title: g.title, game: (g.category || {}).name || '' }));
          x.vacation = (sc.data || {}).vacation || null;
        } catch (e) { x.error = true; }
        this._pub = x;
      }
      const bot = await st.get('bot');
      return ok(EQ.publicPage(pg, bot && sanitizeBot(bot, null), profile, { profile: this._pub.profile, live: this._pub.live, schedule: pg.sections.schedule ? this._pub.schedule : undefined, vacation: pg.sections.schedule ? this._pub.vacation : undefined }));
    }
    if (path === '/stats-recap') { // récap de la semaine : aperçu envoyé tout de suite sur Discord
      const s = await secrets().catch(() => ({}));
      if (!s.webhook) return err('aucun webhook Discord enregistré dans Mon compte → Intégrations');
      return ok({ sent: true, text: await this.statWeekly(profile, s) });
    }
    if (path.startsWith('/stats-')) return this.statsRoute(path, body, profile, ok, err);
    if (path.startsWith('/jeux-') || path === '/ov-jeux') return this.jeuxRoute(path, body, profile, await secrets(), E, ok, err);
    if (path.startsWith('/bot-')) return this.botRoute(path, body, profile, await secrets(), E, ok, err);
    if (path.startsWith('/sr-') || path === '/public-sr' || path === '/ov-sr' || path === '/ov-spotify-token') return this.srRoute(path, body, profile, await secrets(), E, ok, err);
    if (path.startsWith('/sub-') || path.startsWith('/public-')) return this.subRoute(path, body, profile, E, ok, err);

    if (path === '/delete-account') {
      const s = await secrets().catch(() => ({}));
      const idx = (name) => this.env.ACCOUNT ? this.env.ACCOUNT.get(this.env.ACCOUNT.idFromName(name)).fetch('https://acc/index-delete', { method: 'POST', body: '{}' }) : null;
      // 1. abonnements EventSub (bot, subathon, demandes de musique)
      const subs = (await st.get('botsubs')) || [];
      if (subs.length && E.cid && E.secret) {
        const app = await appAccess(E.cid, E.secret).catch(() => null);
        if (app) for (const id of subs) await fetch('https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id, { method: 'DELETE', headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + app } }).catch(() => {});
      }
      // 2. index : pseudo, clé Ko-fi, liens d'overlays
      await idx('login:' + profile.login);
      if (s.kofi) await idx('kofikey:' + s.kofi);
      for (const id of Object.keys((await st.get('overlays')) || {})) { this.revoke(id); await idx('ov:' + id); }
      // 3. accès Twitch révoqué, puis tout est effacé
      if (s.twitch && s.twitch.access && E.cid) await fetch('https://id.twitch.tv/oauth2/revoke', { method: 'POST', body: new URLSearchParams({ client_id: E.cid, token: s.twitch.access }) }).catch(() => {});
      await st.deleteAlarm().catch(() => {});
      await st.deleteAll();
      return ok({ deleted: true });
    }
    if (path === '/me') {
      const s = await secrets(); const ov = await overlays();
      // overlays pubs / votes / Hype Train créés avant que le relais ne s'abonne pour eux : abonnements faits une fois
      if (!(await st.get('ovsubs')) && Object.values(ov).some((o) => OV_TWITCH[o.tool])) { await this.syncOvSubs(profile, E); await st.put('ovsubs', 1); }
      return ok({ login: profile.login, lang: profile.lang || 'fr', scopes: profile.scopes, secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]])),
        overlays: Object.values(ov).map(({ id, tool, name, updatedAt }) => ({ id, tool, name, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt) });
    }
    if (path === '/diag') { // « Vérifier mon installation » : état du relais, du jeton Twitch, des abonnements et des overlays ouverts
      const s = await secrets().catch(() => ({}));
      const out = { relay: { twitch: !!(E.cid && E.secret), eventsub: !!this.env.EVENTSUB_SECRET, encryption: !!E.key, botAccount: !!this.env.BOT_LOGIN, youtube: !!this.env.YOUTUBE_API_KEY, ai: !!this.env.AI },
        login: profile.login, secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]])) };
      let access = null; try { access = await this.twitchAccess(s, E); } catch (e) { /* refus de Twitch */ }
      const v = access ? await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + access } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      out.token = v ? { ok: true, scopes: v.scopes || [], expiresIn: v.expires_in || 0 } : { ok: false };
      const on = async (k) => !!((await st.get(k)) || {}).enabled;
      const bot = (await st.get('bot')) || null;
      out.features = { bot: !!(bot && bot.enabled), subathon: await on('sub'), sr: await on('sr'), jeux: await on('jeux'), stats: await on('stats'), page: await on('page') };
      if (out.features.bot) { const b = await this.botStatus(bot, profile); out.bot = { sender: b.sender, missing: b.missing, lastError: b.lastError, botAccount: b.botAccount }; }
      const mine = (await st.get('botsubs')) || [];
      out.subs = { expected: mine.length, list: null };
      if (mine.length && E.cid && E.secret) {
        try {
          const app = await appAccess(E.cid, E.secret);
          const d = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions?user_id=' + profile.user_id, { headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + app } }).then((r) => r.json());
          const ids = new Set(mine);
          out.subs.list = (d.data || []).filter((x) => ids.has(x.id)).map((x) => ({ type: x.type, status: x.status }));
        } catch (e) { /* Twitch injoignable : liste inconnue */ }
      }
      out.overlays = Object.values(await overlays()).map((o) => ({ id: o.id, tool: o.tool, name: o.name, open: this.ctx.getWebSockets('ov:' + o.id).length }));
      return ok(out);
    }
    if (path === '/sim') { // simulateur : un faux événement envoyé aux overlays ouverts dans OBS (rien n'est enregistré)
      const now = Date.now();
      this._sim = (this._sim || []).filter((t) => now - t < 10000);
      if (this._sim.length >= 10) return err('doucement : 10 tests toutes les 10 secondes au plus', 429);
      const ev = EQ.simEvent(body.ev);
      if (!ev) return err('événement inconnu');
      this._sim.push(now);
      const ov = await overlays();
      let sent = 0;
      for (const id of (Array.isArray(body.ids) ? body.ids : []).filter((x) => ov[x]).slice(0, 50)) {
        this.ctx.getWebSockets('ov:' + id).forEach((ws) => { try { ws.send(JSON.stringify({ type: 'sim', ev })); sent++; } catch (e) { /* parti */ } });
      }
      return ok({ sent });
    }
    if (path === '/secrets') {
      const s = await secrets();
      const oldKofi = s.kofi;
      for (const [k, v] of Object.entries(body)) { if (!SECRET_KEYS.includes(k)) continue; if (v == null || v === '') delete s[k]; else s[k] = clean(v, 2000); }
      if (('kofi' in body || 'kofiv' in body) && this.env.ACCOUNT) { // relie la clé Ko-fi à ce compte (dons → subathon) avec son jeton de vérification
        const idx = (k) => this.env.ACCOUNT.get(this.env.ACCOUNT.idFromName('kofikey:' + k));
        if (s.kofi) {
          const r = await idx(s.kofi).fetch('https://acc/index-set', { method: 'POST', body: JSON.stringify({ user_id: profile.user_id, owned: true, v: s.kofiv || '' }) });
          if (r.status === 409) return err('cette clé Ko-fi est déjà utilisée par un autre compte : génère-en une autre', 409);
        }
        if (oldKofi && oldKofi !== s.kofi) {
          const r = await idx(oldKofi).fetch('https://acc/index-full', { method: 'POST', body: '{}' });
          const cur = r.ok ? await r.json() : null;
          if (cur && String(cur.user_id) === String(profile.user_id)) await idx(oldKofi).fetch('https://acc/index-delete', { method: 'POST', body: '{}' }); // seulement si elle est encore à ce compte
        }
      }
      await saveSecrets(s);
      if ('sejwt' in body) { const sub = await st.get('sub'); if (sub && sub.enabled) await this.armAlarm(); }
      this.broadcastAll();
      return ok({ ok: true, secrets: Object.fromEntries(SECRET_KEYS.map((k) => [k, !!s[k]])) });
    }
    // Réglages d'un overlay : seulement les champs que le configurateur propose pour cet outil (TOOL_KEYS),
    // jamais un jeton ni une adresse qui détournerait les secrets fournis par le relais (relay, token…).
    const checkSettings = (tool, o) => {
      const j = JSON.stringify(o || {}); if (j.length > 20000) throw new Error('réglages trop volumineux');
      const s = JSON.parse(j), keys = TOOL_KEYS[tool] || [], out = {};
      if (!s || typeof s !== 'object' || Array.isArray(s)) return out;
      for (const k of keys) if (k in s && !SECRET_KEYS.includes(k)) out[k] = s[k];
      if ('obsurl' in out && !LOCAL_WS.test(String(out.obsurl))) delete out.obsurl; // OBS : seulement ce PC ou le réseau local
      if (out.discord && out.discord !== 'compte' && !DISCORD_HOOK.test(String(out.discord))) delete out.discord;
      return out;
    };
    if (path === '/overlay-create') {
      const ov = await overlays();
      if (Object.keys(ov).length >= 50) return err('50 overlays maximum par compte');
      if (!NEEDS[body.tool]) return err('outil inconnu');
      ov[body.id] = { id: body.id, tool: body.tool, name: clean(body.name || body.tool, 80), settings: checkSettings(body.tool, body.settings), updatedAt: Date.now() };
      await st.put('overlays', ov);
      if (OV_TWITCH[body.tool]) await this.syncOvSubs(profile, E);
      return ok({ id: body.id });
    }
    const ov = await overlays(); const o = ov[body.id || url.searchParams.get('ov')];
    if (path === '/ws') {
      if (!o) return err('?', 404);
      const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1], ['ov:' + o.id, 'tool:' + o.tool]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (!o) return err('overlay introuvable', 404);
    if (path === '/overlay-get') return ok(o);
    if (path === '/overlay-update') {
      if (body.name != null) o.name = clean(body.name, 80);
      if (body.settings) o.settings = checkSettings(o.tool, body.settings);
      o.updatedAt = Date.now(); await st.put('overlays', ov);
      this.broadcast(o.id);
      return ok({ ok: true });
    }
    if (path === '/overlay-delete') { this.revoke(o.id); delete ov[o.id]; await st.put('overlays', ov); if (OV_TWITCH[o.tool]) await this.syncOvSubs(profile, E); return ok({ ok: true }); }
    if (path === '/overlay-rotate') {
      this.revoke(o.id);
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
  /* ================= Bot de chat ================= */
  async botAccount() {
    if (!this.env.BOT_LOGIN || !this.env.ACCOUNT) return null;
    const r = await this.env.ACCOUNT.get(this.env.ACCOUNT.idFromName('botaccount')).fetch('https://acc/bot-token', { method: 'POST', body: '{}' });
    if (!r.ok) return null;
    const d = await r.json();
    return d.access ? d : null;
  }

  /* Le streamer, ou un modo qu'il a autorisé (vérifié auprès de Twitch, gardé 5 minutes). 90 actions par minute pour toute l'équipe. */
  async teamGuard(body, profile, E, secrets) {
    const st = this.ctx.storage;
    const isOwner = String(body.caller) === String(profile.user_id);
    const team = (await st.get('team')) || {};
    if (!isOwner && !team.mods) return { error: `${profile.login} n’a pas autorisé ses modos à gérer sondages, prédictions, récompenses et messages en vedette depuis StreamBox` };
    const now = Date.now();
    const hit0 = !isOwner && this._mods && this._mods.get(body.caller);
    if (hit0 && !hit0.ok && now - hit0.at <= 300000) return { error: `tu n’es pas modo de ${profile.login}` }; // refusé récemment : rien à vérifier
    if (!isOwner && !(hit0 && now - hit0.at <= 300000)) { // vérifications de modo : limite à part, pour ne pas épuiser celle de l'équipe
      this._lookups = (this._lookups || []).filter((t) => now - t < 60000);
      if (this._lookups.length >= 30) return { error: 'trop d’actions, réessaie dans un instant', status: 429 };
      this._lookups.push(now);
    }
    const access = await this.twitchAccess(await secrets(), E);
    if (!access) return { error: `la connexion Twitch de ${profile.login} a expiré : il ou elle doit se reconnecter à StreamBox` };
    const H = { 'Client-Id': E.cid, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
    if (!isOwner) {
      this._mods = this._mods || new Map();
      const hit = this._mods.get(body.caller);
      if (!hit || now - hit.at > 300000) {
        const r = await fetch(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${profile.user_id}&user_id=${encodeURIComponent(body.caller)}`, { headers: H });
        if (r.status === 401 || r.status === 403) return { error: `${profile.login} doit se reconnecter à StreamBox pour autoriser cette fonction` };
        const d = await r.json().catch(() => ({}));
        this._mods.set(body.caller, { ok: r.ok && (d.data || []).length > 0, at: now });
      }
      if (!this._mods.get(body.caller).ok) return { error: `tu n’es pas modo de ${profile.login}` };
    }
    // limite de l'équipe : comptée seulement pour le streamer et les modos vérifiés
    this._team = (this._team || []).filter((t) => now - t < 60000);
    if (this._team.length >= 90) return { error: 'trop d’actions, réessaie dans un instant', status: 429 };
    this._team.push(now);
    return { isOwner, H };
  }

  async botStatus(cfg, profile) {
    const st = this.ctx.storage;
    const bot = await this.botAccount().catch(() => null);
    const need = ((cfg.sender === 'bot' ? 'channel:bot moderator:read:followers' : BOT_SCOPES) + (cfg.shield && cfg.shield.on && cfg.sender !== 'bot' ? ' ' + SHIELD_SCOPES : '')).split(' ');
    const missing = need.filter((s) => !(profile.scopes || []).includes(s));
    const state = (await st.get('botstate')) || {};
    return { enabled: cfg.enabled, sender: cfg.sender, missing, live: !!state.live, subs: ((await st.get('botsubs')) || []).length,
      lastError: state.lastError || null, botAccount: { configured: !!this.env.BOT_LOGIN, login: this.env.BOT_LOGIN || null, connected: !!bot },
      webhooks: !!this.env.EVENTSUB_SECRET };
  }

  makeApi(cfg, profile, secrets, E, ctx) {
    const self = this, bid = profile.user_id;
    const helix = async (path, opt = {}, token) => fetch('https://api.twitch.tv/helix/' + path, Object.assign({}, opt, { headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + (token || await appAccess(E.cid, E.secret)), 'Content-Type': 'application/json' } }));
    const sender = async () => (cfg.sender === 'bot' ? await self.botAccount() : null);
    const modToken = async () => { const b = await sender(); return b ? [b.user_id, b.access] : [bid, await self.twitchAccess(secrets, E)]; };
    const fail = async (what, r) => { if (r && !r.ok) ctx.state.lastError = `${what} : ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`; return r; };
    return {
      async pageUrl() { return EQ.pageUrl(await self.ctx.storage.get('page'), profile.login); },
      async say(text, reply) {
        text = tr(text, profile.lang); // langue choisie par le streamer sur le site
        const b = await sender();
        if (cfg.sender === 'bot' && !b) { ctx.state.lastError = 'compte bot du site non connecté'; return; }
        ctx.state.sent = (ctx.state.sent || []).concat({ text, t: Date.now() }).slice(-20);
        return fail('envoi du message', await helix('chat/messages', { method: 'POST', body: JSON.stringify({ broadcaster_id: bid, sender_id: b ? b.user_id : bid, message: text, reply_parent_message_id: reply || undefined }) }));
      },
      async del(msgId) { const [mid, t] = await modToken(); return fail('suppression', await helix(`moderation/chat?broadcaster_id=${bid}&moderator_id=${mid}&message_id=${msgId}`, { method: 'DELETE' }, t)); },
      async timeout(uid, secs, reason) { const [mid, t] = await modToken(); return fail('timeout', await helix(`moderation/bans?broadcaster_id=${bid}&moderator_id=${mid}`, { method: 'POST', body: JSON.stringify({ data: { user_id: uid, duration: secs, reason } }) }, t)); },
      async shoutout(to) { const [mid, t] = await modToken(); return helix(`chat/shoutouts?from_broadcaster_id=${bid}&to_broadcaster_id=${to}&moderator_id=${mid}`, { method: 'POST' }, t); },
      async channel(id) { return ((await (await helix('channels?broadcaster_id=' + (id || bid))).json()).data || [])[0]; },
      async user(login) { return ((await (await helix('users?login=' + encodeURIComponent(login))).json()).data || [])[0]; },
      async userById(id) { return ((await (await helix('users?id=' + encodeURIComponent(id))).json()).data || [])[0]; },
      async getChatSettings() { const [mid, t] = await modToken(); return ((await (await helix(`chat/settings?broadcaster_id=${bid}&moderator_id=${mid}`, {}, t)).json()).data || [])[0]; },
      async chatSettings(patch) { const [mid, t] = await modToken(); return fail('modes du chat', await helix(`chat/settings?broadcaster_id=${bid}&moderator_id=${mid}`, { method: 'PATCH', body: JSON.stringify(patch) }, t)); },
      async shieldMode(on) { const [mid, t] = await modToken(); return fail('mode bouclier', await helix(`moderation/shield_mode?broadcaster_id=${bid}&moderator_id=${mid}`, { method: 'PUT', body: JSON.stringify({ is_active: !!on }) }, t)); },
      async followedAt(uid) { const d = await (await helix(`channels/followers?broadcaster_id=${bid}&user_id=${uid}`, {}, await self.twitchAccess(secrets, E))).json(); return d.data && d.data[0] ? d.data[0].followed_at : null; },
      async clip() { // créé avec le compte du streamer (permission clips:edit)
        const r = await helix('clips?broadcaster_id=' + bid, { method: 'POST' }, await self.twitchAccess(secrets, E));
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? 'le live est hors ligne' : r.status === 401 || r.status === 403 ? 'reconnecte-toi sur StreamBox (permission clips)' : d.message || 'erreur ' + r.status);
        return (d.data || [])[0];
      },
      async discord(text) { // webhook Discord enregistré dans « Mon compte »
        if (!/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(secrets.webhook || '')) return;
        await fetch(secrets.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: tr(text, profile.lang), allowed_mentions: { parse: [] } }) });
      },
      changed() { ctx.changed = true; },
    };
  }

  /* Console de test : mêmes règles, mais rien n'est envoyé à Twitch */
  dryApi(out, state) {
    const self = this;
    return {
      async pageUrl() { const pr = await self.ctx.storage.get('profile'); return EQ.pageUrl(await self.ctx.storage.get('page'), pr && pr.login); },
      async say(text) { out.push({ type: 'message', text }); }, async del() { out.push({ type: 'suppression' }); },
      async timeout(uid, secs) { out.push({ type: 'timeout', secs }); }, async shoutout() { out.push({ type: 'shoutout' }); },
      async channel() { return { game_name: '(jeu en cours)', title: '(titre du live)' }; },
      async user(login) { return { id: '0', login: login.toLowerCase(), display_name: login }; },
      async userById() { return { id: '0', created_at: new Date(Date.now() - 2 * 86400000).toISOString() }; },
      async getChatSettings() { return { follower_mode: false, follower_mode_duration: 0 }; },
      async chatSettings(p) { out.push({ type: 'modes du chat', p }); }, async shieldMode(on) { out.push({ type: 'mode bouclier', on }); },
      async followedAt() { return new Date(Date.now() - 400 * 86400000).toISOString(); },
      async clip() { out.push({ type: 'clip' }); return { id: 'ClipDeTest' }; },
      async discord(text) { out.push({ type: 'discord', text }); },
      changed() {},
    };
  }

  // Abonnements des overlays pubs / votes / Hype Train (créés ou supprimés avec l'overlay)
  async syncOvSubs(profile, E) {
    if (!this.env.EVENTSUB_SECRET || !(await this.ctx.storage.get('origin'))) return [];
    return this.syncSubs((await this.ctx.storage.get('bot')) || sanitizeBot({}, null), profile, E).catch((e) => [e.message]);
  }

  // Révoque un lien d'overlay : prévient l'overlay puis ferme ses connexions (l'ancien lien ne reçoit plus rien)
  revoke(id) {
    this.ctx.getWebSockets('ov:' + id).forEach((ws) => { try { ws.send(JSON.stringify({ type: 'deleted' })); ws.close(4001, 'lien révoqué'); } catch (e) { /* déjà fermé */ } });
  }

  async syncSubs(cfg, profile, E) {
    const st = this.ctx.storage, errors = [];
    const app = await appAccess(E.cid, E.secret);
    const h = { 'Client-Id': E.cid, Authorization: 'Bearer ' + app, 'Content-Type': 'application/json' };
    for (const id of (await st.get('botsubs')) || []) await fetch('https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id, { method: 'DELETE', headers: h }).catch(() => {});
    const ids = [];
    const subCfg = await st.get('sub');
    const subOn = !!(subCfg && subCfg.enabled);
    const srC = await st.get('sr');
    const srOn = !!(srC && srC.enabled);
    const jx = await st.get('jeux');
    const jeuxOn = !!(jx && jx.enabled);
    const sx = await st.get('stats');
    const statsOn = !!(sx && sx.enabled);
    const ovTools = [...new Set(Object.values((await st.get('overlays')) || {}).map((o) => o.tool).filter((t) => OV_TWITCH[t]))];
    if (cfg.enabled || subOn || srOn || jeuxOn || statsOn || ovTools.length) {
      const origin = await st.get('origin');
      const bot = cfg.sender === 'bot' ? await this.botAccount() : null;
      const bid = profile.user_id;
      // Bot et subathon partagent les mêmes abonnements (un seul par type)
      const off = { events: Object.fromEntries(Object.keys(cfg.events).map((k) => [k, { on: false }])) };
      let list = wantedSubs(cfg.enabled ? cfg : off, bid, bot ? bot.user_id : bid);
      if (subOn) {
        const b = { broadcaster_user_id: bid };
        list.push({ type: 'channel.subscribe', version: '1', condition: b }, { type: 'channel.subscription.message', version: '1', condition: b },
          { type: 'channel.subscription.gift', version: '1', condition: b }, { type: 'channel.cheer', version: '1', condition: b });
        if (subCfg.rules.follow) list.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: bid, moderator_user_id: bid } });
        if (subCfg.rules.raid) list.push({ type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: bid } });
      }
      if (statsOn) { // statistiques : follows, abos, bits, raids (le chat seulement si les permissions du bot sont accordées)
        const b = { broadcaster_user_id: bid }, sc = profile.scopes || [];
        list.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: bid, moderator_user_id: bid } }, { type: 'channel.subscribe', version: '1', condition: b },
          { type: 'channel.subscription.message', version: '1', condition: b }, { type: 'channel.subscription.gift', version: '1', condition: b }, { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: bid } });
        if (sc.includes('bits:read')) list.push({ type: 'channel.cheer', version: '1', condition: b });
        if (!cfg.enabled && !subOn && !srOn && !jeuxOn && !(sc.includes('user:read:chat') && sc.includes('channel:bot'))) list = list.filter((x) => x.type !== 'channel.chat.message');
      }
      if (!cfg.enabled && !subOn && !srOn && !jeuxOn && !statsOn) list = []; // seulement des overlays pubs / votes / Hype Train
      for (const t of ovTools) for (const [type, version] of OV_TWITCH[t].subs) list.push({ type, version, condition: { broadcaster_user_id: bid } });
      list = list.filter((x, i) => list.findIndex((y) => y.type === x.type) === i);
      if (cfg.sender === 'bot' && !bot) errors.push('compte bot du site non connecté');
      else for (const sub of list) {
        const r = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { method: 'POST', headers: h, body: JSON.stringify(Object.assign(sub, { transport: { method: 'webhook', callback: origin + '/eventsub', secret: this.env.EVENTSUB_SECRET } })) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.data) ids.push(d.data[0].id);
        else if (r.status !== 409) errors.push(`${sub.type} : ${d.message || r.status}`); // 409 = déjà abonné
      }
    }
    await st.put('botsubs', ids);
    return errors;
  }

  async botRoute(path, body, profile, secrets, E, ok, err) {
    const st = this.ctx.storage;
    let cfg = (await st.get('bot')) || sanitizeBot({}, null);
    if (path === '/bot-get') return ok({ cfg, status: await this.botStatus(cfg, profile) });
    if (path === '/bot-save') {
      const prev = cfg;
      cfg = sanitizeBot(body, prev);
      const counts = Object.fromEntries(prev.commands.map((c) => [c.name, c.count]));
      cfg.commands.forEach((c) => { if (counts[c.name] && !c.count) c.count = counts[c.name]; });
      await st.put('bot', cfg);
      let errors = [];
      const subsChanged = cfg.enabled !== prev.enabled || cfg.sender !== prev.sender || JSON.stringify(Object.fromEntries(Object.entries(cfg.events).map(([k, v]) => [k, v.on]))) !== JSON.stringify(Object.fromEntries(Object.entries(prev.events).map(([k, v]) => [k, v.on])));
      if (subsChanged && this.env.EVENTSUB_SECRET) errors = await this.syncSubs(cfg, profile, E).catch((e) => [e.message]);
      if (!this.env.EVENTSUB_SECRET && cfg.enabled) errors.push('EVENTSUB_SECRET manquant sur le relais');
      return ok({ cfg, status: await this.botStatus(cfg, profile), errors });
    }
    if (path === '/bot-test' && body.raid) { // faux raid suspect : règles du bouclier telles qu'affichées (non enregistrées), rien n'est envoyé à Twitch
      const out = [], state = {};
      const c = sanitizeBot(Object.assign({}, cfg, { shield: (body.cfg || {}).shield || cfg.shield }), cfg);
      await onEvent(c, state, 'channel.raid', { from_broadcaster_user_id: '0', from_broadcaster_user_login: String(body.user || 'raideur_test').toLowerCase().slice(0, 25), from_broadcaster_user_name: String(body.user || 'Raideur_Test').slice(0, 25), viewers: 30 }, this.dryApi(out, state), profile.login);
      return ok({ actions: out });
    }
    if (path === '/bot-test') {
      const out = [];
      const state = Object.assign({ live: true, startedAt: Date.now() - 83 * 60000 }, structuredClone((await st.get('botstate')) || {}), { live: true });
      const level = { viewer: [], sub: [{ set_id: 'subscriber' }], vip: [{ set_id: 'vip' }], mod: [{ set_id: 'moderator' }], broadcaster: [{ set_id: 'broadcaster' }] }[body.role] || [];
      const login = String(body.user || 'viewer_test').toLowerCase().slice(0, 25);
      const r = await onChat(structuredClone(cfg), state, { text: String(body.text || '').slice(0, 500), login, name: body.user || 'Viewer_Test', userId: '1', badges: level, messageId: 'test' }, this.dryApi(out, state), profile.login);
      if (r && r.moderated) out.unshift({ type: 'modération', text: { links: 'lien interdit', caps: 'trop de majuscules', words: 'mot interdit' }[r.moderated] });
      return ok({ actions: out });
    }
    if (path === '/bot-event') {
      const ovEv = OV_EV[body.type];
      if (ovEv) { // pub, sondage, prédiction, Hype Train : poussé aux overlays de cet outil
        if (body.kind !== 'revocation') this.ctx.getWebSockets('tool:' + ovEv.tool).forEach((ws) => { try { ws.send(JSON.stringify({ type: 'twitch', ev: ovEv.ev, data: body.event || {} })); } catch (e) { /* parti */ } });
        return ok({ ok: true });
      }
      const subCfg = await st.get('sub');
      const subOn = !!(subCfg && subCfg.enabled);
      const srCfg = await st.get('sr');
      const srOn = !!(srCfg && srCfg.enabled);
      const jxCfg = await st.get('jeux');
      const jeuxOn = !!(jxCfg && jxCfg.enabled);
      const stCfg = await st.get('stats');
      const statsOn = !!(stCfg && stCfg.enabled);
      if (!cfg.enabled && !subOn && !srOn && !jeuxOn && !statsOn) return ok({ ignored: true });
      const state = (await st.get('botstate')) || {};
      state.seen = state.seen || [];
      if (body.id && state.seen.includes(body.id)) return ok({ duplicate: true }); // Twitch peut renvoyer un webhook
      state.seen.push(body.id); if (state.seen.length > 200) state.seen.shift();
      if (body.kind === 'revocation') { state.lastError = 'abonnement Twitch révoqué (' + body.type + ') : reconnecte-toi et réactive le bot'; await st.put('botstate', state); return ok({}); }
      const ctx = { state, changed: false };
      const api = this.makeApi(cfg, profile, secrets, E, ctx);
      const e = body.event || {};
      if (body.type === 'stream.online') {
        state.live = true; state.startedAt = Date.parse(e.started_at) || Date.now(); state.lines = 0; state.timers = {};
        if (statsOn) await st.put('statlive', await this.statStart({ id: e.id, started_at: e.started_at }, Date.now()));
        if (cfg.enabled || statsOn) await st.setAlarm(Date.now() + 60000);
      } else if (body.type === 'stream.offline') {
        state.live = false; state.permits = {};
        if (statsOn) { const L = await st.get('statlive'); if (L) { await this.statFinish(L, Date.now()); await st.delete('statlive'); } }
      }
      else if (body.type === 'channel.chat.message') {
        const text = (e.message && e.message.text) || '';
        const b = cfg.sender === 'bot' ? await this.botAccount() : null;
        // Le bot ne se répond jamais à lui-même : compte bot = ignoré ; compte du streamer = on ignore
        // seulement les messages que le bot vient d'envoyer (le streamer peut toujours taper ses commandes).
        const own = b ? e.chatter_user_id === b.user_id
          : e.chatter_user_id === profile.user_id && (state.sent || []).some((x) => x.text === text && Date.now() - x.t < 60000);
        if (!own && statsOn) { const L = await st.get('statlive'); if (L) { STATS.chat(L, e); await st.put('statlive', L); } }
        if (!own) {
          const handled = (srOn && await this.srChat(srCfg, text, e, profile, api, secrets, E)) || (subOn && await this.subChat(subCfg, text, e, profile, api)) || (jeuxOn && await this.jeuxChat(jxCfg, text, e, profile, api));
          if (!handled && cfg.enabled) await onChat(cfg, state, { text, login: e.chatter_user_login, name: e.chatter_user_name, userId: e.chatter_user_id, badges: e.badges, messageId: e.message_id, isBroadcaster: e.chatter_user_id === profile.user_id }, api, profile.login);
        }
      } else {
        if (subOn) { const S = (await st.get('substate')) || SUBA.freshState(subCfg); SUBA.onEvent(subCfg, S, body.type, e, Date.now()); await st.put('substate', S); }
        if (statsOn) { const L = await st.get('statlive'); if (L && STATS.event(L, body.type, e)) await st.put('statlive', L); }
        if (cfg.enabled) await onEvent(cfg, state, body.type, e, api, profile.login);
      }
      if (ctx.changed) await st.put('bot', cfg);
      await st.put('botstate', state);
      return ok({ ok: true });
    }
    return err('?', 404);
  }

  /* ================= Demandes de musique ================= */
  async spotifyAccess(secrets, E) {
    if (this._sp && this._sp.exp > Date.now() && this._sp.rt === secrets.spotify) return this._sp.access;
    const cid = secrets.spotifycid || this.env.SPOTIFY_CLIENT_ID;
    if (!secrets.spotify || !cid) throw new Error('Spotify n’est pas connecté (Mon compte)');
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: secrets.spotify, client_id: cid }) });
    const d = await r.json().catch(() => ({}));
    if (!d.access_token) throw new Error('Spotify a refusé l’accès : reconnecte Spotify dans Mon compte');
    if (d.refresh_token && d.refresh_token !== secrets.spotify) { secrets.spotify = d.refresh_token; await this.ctx.storage.put('secrets', await seal(secrets, E.key)); } // Spotify peut renouveler le jeton
    this._sp = { access: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 60) * 1000, rt: secrets.spotify, scope: d.scope || '' };
    return d.access_token;
  }
  async spotifyApi(path, opt, secrets, E) {
    const r = await fetch('https://api.spotify.com/v1/' + path, Object.assign({}, opt, { headers: { Authorization: 'Bearer ' + (await this.spotifyAccess(secrets, E)), 'Content-Type': 'application/json' } }));
    return r;
  }
  async ytMeta(id) {
    const key = this.env.YOUTUBE_API_KEY;
    if (key) {
      const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${id}&key=${key}`)).json();
      const v = (d.items || [])[0];
      if (!v) return { error: 'vidéo introuvable.' };
      if (v.status && v.status.embeddable === false) return { error: 'cette vidéo ne peut pas être lue en dehors de YouTube.' };
      return { source: 'youtube', id, title: v.snippet.title, artist: v.snippet.channelTitle, duration: SR.isoDuration(v.contentDetails.duration), thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: 'https://youtu.be/' + id };
    }
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
    if (!r.ok) return { error: r.status === 401 ? 'cette vidéo ne peut pas être lue en dehors de YouTube.' : 'vidéo introuvable.' };
    const d = await r.json();
    return { source: 'youtube', id, title: d.title, artist: d.author_name, duration: 0, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, url: 'https://youtu.be/' + id };
  }
  spTrack(t) { return { source: 'spotify', id: t.id, title: t.name, artist: (t.artists || []).map((a) => a.name).join(', '), duration: Math.round((t.duration_ms || 0) / 1000), thumb: ((t.album || {}).images || [])[0] ? t.album.images[0].url : '', url: (t.external_urls || {}).spotify || '' }; }
  async resolve(cfg, req, secrets, E) {
    if (req.kind === 'empty') return { error: `utilisation : ${cfg.cmd} titre ou lien` };
    if (req.kind === 'unsupported') return { error: cfg.source === 'spotify' ? 'envoie un titre ou un lien Spotify.' : 'envoie un titre ou un lien YouTube.' };
    if (cfg.source === 'youtube') {
      if (req.kind === 'youtube') return this.ytMeta(req.id);
      if (req.kind === 'spotify') return { error: 'envoie un lien YouTube.' };
      const key = this.env.YOUTUBE_API_KEY;
      if (!key) return { error: 'envoie un lien YouTube (la recherche par titre n’est pas activée).' };
      const d = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(req.q)}&key=${key}`)).json();
      const id = ((d.items || [])[0] || {}).id;
      return id && id.videoId ? this.ytMeta(id.videoId) : { error: 'aucun résultat.' };
    }
    if (req.kind === 'youtube') return { error: 'envoie un titre ou un lien Spotify.' };
    if (req.kind === 'spotify') { const r = await this.spotifyApi('tracks/' + req.id, {}, secrets, E); return r.ok ? this.spTrack(await r.json()) : { error: 'morceau Spotify introuvable.' }; }
    const r = await this.spotifyApi(`search?type=track&limit=1&q=${encodeURIComponent(req.q)}`, {}, secrets, E);
    const t = r.ok ? ((((await r.json()).tracks || {}).items) || [])[0] : null;
    return t ? this.spTrack(t) : { error: 'aucun résultat sur Spotify.' };
  }

  /* Commandes du chat : !sr, !song, !file, !wrongsong, !skip */
  async srChat(cfg, text, e, profile, api, secrets, E) {
    const st = this.ctx.storage, now = Date.now();
    const [w, ...rest] = text.trim().split(/\s+/);
    const low = (w || '').toLowerCase(), args = rest.join(' '), name = e.chatter_user_name;
    if (![cfg.cmd, '!song', '!file', '!queue', '!wrongsong', '!skip'].includes(low)) return false;
    const level = userLevel(e.badges, e.chatter_user_id === profile.user_id);
    const Q = (await st.get('srq')) || SR.freshQueue();
    const user = { id: e.chatter_user_id, name };
    let reply = null;
    try {
      if (low === cfg.cmd && level >= 3 && /^(on|off|pause|reprendre|clear|vider)$/i.test(args)) {
        const a = args.toLowerCase();
        if (a === 'on') { cfg.enabled = true; await st.put('sr', cfg); Q.paused = false; reply = '🎵 Demandes de musique ouvertes !'; }
        else if (a === 'off' || a === 'pause') { Q.paused = true; reply = '⏸ Demandes de musique en pause.'; }
        else if (a === 'reprendre') { Q.paused = false; reply = '▶ Demandes de musique ouvertes.'; }
        else { Q.items = []; reply = '🧹 File vidée.'; }
      } else if (low === cfg.cmd) {
        const no = SR.canRequest(cfg, Q, user, level, now);
        if (no) reply = `@${name} ${no}`;
        else {
          if (level < 3) Q.cd[user.id] = now; // le délai compte dès la recherche, même ratée (quota YouTube partagé)
          const track = await this.resolve(cfg, SR.parseRequest(args), secrets, E);
          if (track.error) reply = `@${name} ${track.error}`;
          else {
            const r = SR.addTrack(cfg, Q, track, user, level, now);
            if (r.error) reply = `@${name} ${r.error}`;
            else if (cfg.source === 'spotify') {
              const q = await this.spotifyApi('me/player/queue?uri=' + encodeURIComponent('spotify:track:' + track.id), { method: 'POST' }, secrets, E);
              Q.items.pop();
              if (!q.ok) { Q.cd[user.id] = 0; reply = `@${name} Spotify refuse l’ajout (${q.status === 404 ? 'aucun appareil Spotify actif' : q.status === 403 ? 'Spotify Premium et la permission « modifier la lecture » sont nécessaires' : 'erreur ' + q.status}).`; }
              else { Q.history.unshift(Object.assign(r.item, { status: 'spotify', endedAt: now })); Q.history = Q.history.slice(0, 30); if (cfg.announce) reply = `🎵 ${SR.label(r.item)} ajouté à la file Spotify (demandé par ${name}).`; }
            } else if (cfg.announce) reply = `🎵 ${SR.label(r.item)} [${SR.fmtLen(r.item.duration)}] ajouté en position ${r.position + (Q.current ? 1 : 0)} (demandé par ${name}).`;
          }
        }
      } else if (low === '!song') {
        if (cfg.source === 'spotify') {
          const r = await this.spotifyApi('me/player/currently-playing', {}, secrets, E);
          const d = r.status === 200 ? await r.json() : null;
          reply = d && d.item ? `🎵 En ce moment : ${d.item.name} — ${(d.item.artists || []).map((a) => a.name).join(', ')} ${(d.item.external_urls || {}).spotify || ''}` : 'Rien ne joue sur Spotify.';
        } else reply = Q.current ? `🎵 En ce moment : ${SR.label(Q.current)} (demandé par ${Q.current.by}) ${Q.current.url}` : 'Aucune demande en cours.';
      } else if (low === '!file' || low === '!queue') {
        const mine = Q.items.map((x, i) => [x, i + 1]).filter(([x]) => x.byId === String(user.id));
        reply = `${Q.items.length} morceau(x) en attente.` + (mine.length ? ` ${name} : ${mine.map(([x, pos]) => `« ${x.title.slice(0, 40)} » en position ${pos}`).join(', ')}.` : '');
      } else if (low === '!wrongsong') {
        const it = SR.removeLastOf(Q, user.id);
        reply = it ? `@${name} « ${it.title.slice(0, 60)} » retiré de la file.` : `@${name} tu n’as aucune demande en attente.`;
      } else if (low === '!skip' && level >= 3) {
        if (cfg.source === 'spotify') { await this.spotifyApi('me/player/next', { method: 'POST' }, secrets, E); reply = '⏭ Morceau passé.'; }
        else if (Q.current) { SR.advance(Q, 'skipped', now); reply = '⏭ Morceau passé.' + (Q.current ? ` Suivant : ${SR.label(Q.current)}` : ''); }
      } else return false;
    } catch (err) { reply = `@${name} ${err.message}`; }
    await st.put('srq', Q);
    if (reply) await api.say(reply.slice(0, 480));
    return true;
  }

  async srRoute(path, body, profile, secrets, E, ok, err) {
    const st = this.ctx.storage, now = Date.now();
    let cfg = (await st.get('sr')) || SR.sanitizeSr({}, null);
    const Q = (await st.get('srq')) || SR.freshQueue();
    const full = () => ({ cfg, queue: { current: Q.current, items: Q.items, history: Q.history, paused: Q.paused }, ytSearch: !!this.env.YOUTUBE_API_KEY, spotify: !!secrets.spotify, login: profile.login });
    if (path === '/sr-get') return ok(full());
    if (path === '/sr-save') {
      const prev = cfg; cfg = SR.sanitizeSr(body, prev); await st.put('sr', cfg);
      let errors = [];
      if (cfg.enabled !== prev.enabled && this.env.EVENTSUB_SECRET) errors = await this.syncSubs((await st.get('bot')) || sanitizeBot({}, null), profile, E).catch((e) => [e.message]);
      if (cfg.source === 'spotify' && cfg.enabled) { try { await this.spotifyAccess(secrets, E); if (this._sp && !/user-modify-playback-state/.test(this._sp.scope)) errors.push('reconnecte Spotify dans Mon compte pour autoriser l’ajout à la file'); } catch (e) { errors.push(e.message); } }
      return ok(Object.assign(full(), { errors }));
    }
    if (path === '/sr-action') {
      const i = Q.items.findIndex((x) => x.n === body.n);
      if (body.action === 'skip') { if (cfg.source === 'spotify') await this.spotifyApi('me/player/next', { method: 'POST' }, secrets, E).catch(() => {}); else SR.advance(Q, 'skipped', now); }
      else if (body.action === 'remove' && i >= 0) Q.items.splice(i, 1);
      else if (body.action === 'move' && i >= 0) { const j = Math.max(0, Math.min(Q.items.length - 1, i + (body.dir < 0 ? -1 : 1))); Q.items.splice(j, 0, Q.items.splice(i, 1)[0]); }
      else if (body.action === 'playnow' && i >= 0) { Q.items.unshift(Q.items.splice(i, 1)[0]); SR.advance(Q, 'skipped', now); }
      else if (body.action === 'clear') Q.items = [];
      else if (body.action === 'pause') Q.paused = true;
      else if (body.action === 'resume') Q.paused = false;
      await st.put('srq', Q);
      return ok(full());
    }
    if (path === '/public-sr') { if (!cfg.enabled) return err('pas de demandes de musique sur cette chaîne', 404); return ok(SR.publicQueue(cfg, Q, profile.login)); }
    // Overlays (lien court du compte)
    const o = ((await st.get('overlays')) || {})[body.ov];
    if (path === '/ov-spotify-token') {
      if (!o || o.tool !== 'musique') return err('overlay non autorisé', 403);
      try { return ok({ access: await this.spotifyAccess(secrets, E), exp: this._sp.exp }); } catch (e) { return err(e.message, 409); }
    }
    if (path === '/ov-sr') {
      if (!o || o.tool !== 'lecteur') return err('overlay non autorisé', 403);
      if (cfg.source !== 'youtube' || !cfg.enabled) return ok({ off: true, current: null, next: [] });
      if (body.action === 'next' && !Q.current) SR.advance(Q, null, now);
      else if ((body.action === 'ended' || body.action === 'error') && Q.current && Q.current.n === body.n) SR.advance(Q, body.action === 'error' ? 'error' : 'played', now);
      if (body.action !== 'state') await st.put('srq', Q);
      return ok({ volume: cfg.volume, paused: Q.paused, current: Q.current, next: Q.items.slice(0, 3), count: Q.items.length });
    }
    return err('?', 404);
  }

  /* Récap de la semaine (statistiques des 7 derniers jours, comparées aux 7 précédents), envoyé sur le webhook Discord */
  async statWeekly(profile, secrets) {
    const idx = (await this.ctx.storage.get('statidx')) || [];
    const lang = profile.lang, T = (s, v) => tr(s, lang).replace(/\{(\d)\}/g, (_, i) => v[i]);
    const loc = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' }[lang] || 'fr-FR';
    const n = (x) => Number(x || 0).toLocaleString(loc);
    const t = STATS.trends(idx, Date.now(), 7), a = t.now, b = t.before;
    const delta = (x, y) => (!y ? (x ? T('nouveau', []) : '=') : (x >= y ? '+' : '') + Math.round((x - y) / y * 100) + ' %');
    const lines = ['**' + T('Récap de la semaine de {0}', [profile.login]) + '**'];
    if (!a.lives) lines.push(T('Pas de live cette semaine. À la semaine prochaine !', []));
    else {
      lines.push(T('Lives : {0} ({1} h)', [n(a.lives), n(a.hours)]), T('Viewers en moyenne : {0} ({1})', [n(a.avg), delta(a.avg, b.avg)]), T('Pic : {0} viewers', [n(a.peak)]),
        T('Nouveaux follows : {0} ({1})', [n(a.follows), delta(a.follows, b.follows)]), T('Abonnements : {0} ({1})', [n(a.subs), delta(a.subs, b.subs)]), T('Messages dans le chat : {0}', [n(a.msgs)]));
      const week = idx.filter((r) => r.startedAt >= Date.now() - 7 * 86400000);
      const best = week.reduce((m, r) => (!m || r.avg > m.avg ? r : m), null);
      if (best) lines.push(T('Meilleur live : {0} ({1} viewers en moyenne)', [String(best.title || '').slice(0, 80) || '—', n(best.avg)]));
    }
    lines.push('twitch.tv/' + profile.login);
    const text = lines.join('\n');
    if (/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(secrets.webhook || '')) {
      await fetch(secrets.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }) });
    }
    return text;
  }

  /* ================= Statistiques ================= */
  async statStart(stream, now) {
    const st = this.ctx.storage;
    const L = await st.get('statlive');
    if (L && L.id === String(stream.id)) return L;
    if (L) { await this.statFinish(L, now); await st.delete('statlive'); }
    const key = 'stat:' + String(Date.parse(stream.started_at) || now).padStart(15, '0');
    const prev = await st.get(key);
    if (prev && prev.id === String(stream.id)) { // même live après une courte coupure : on reprend
      await st.delete(key);
      await st.put('statidx', ((await st.get('statidx')) || []).filter((x) => x.startedAt !== prev.startedAt));
      return STATS.reopen(prev);
    }
    return STATS.freshLive(stream, now);
  }
  async statFinish(L, now) {
    const st = this.ctx.storage, r = STATS.finish(L, now);
    if (r.duration < 60000 && !r.msgs) return; // live de moins d'une minute : ignoré
    await st.put('stat:' + String(r.startedAt).padStart(15, '0'), r);
    let idx = ((await st.get('statidx')) || []).filter((x) => x.startedAt !== r.startedAt);
    idx.push(STATS.summary(r)); idx.sort((a, b) => b.startedAt - a.startedAt);
    for (const old of idx.slice(STATS.MAX_LIVES)) await st.delete('stat:' + String(old.startedAt).padStart(15, '0'));
    await st.put('statidx', idx.slice(0, STATS.MAX_LIVES));
  }
  /* Relevé de la minute : le live est détecté même si un webhook Twitch se perd */
  async statPoll(profile) {
    const st = this.ctx.storage, E = this.E, now = Date.now();
    if (!E.cid || !E.secret) return false;
    const r = await fetch('https://api.twitch.tv/helix/streams?user_id=' + profile.user_id, { headers: { 'Client-Id': E.cid, Authorization: 'Bearer ' + await appAccess(E.cid, E.secret) } });
    if (!r.ok) return !!(await st.get('statlive'));
    const s = ((await r.json()).data || [])[0];
    if (s && s.type === 'live') {
      const L = await this.statStart(s, now);
      STATS.sample(L, s, now);
      await st.put('statlive', L);
      return true;
    }
    const L = await st.get('statlive');
    if (!L) return false;
    if (++L.miss >= 3) { await this.statFinish(L, now); await st.delete('statlive'); return false; } // 3 relevés sans live : terminé
    await st.put('statlive', L);
    return true;
  }
  async statsRoute(path, body, profile, ok, err) {
    const st = this.ctx.storage, now = Date.now();
    let cfg = (await st.get('stats')) || { enabled: false };
    const key = (k) => 'stat:' + String(k).padStart(15, '0');
    if (path === '/stats-get') {
      const idx = (await st.get('statidx')) || [];
      const L = await st.get('statlive');
      const sc = profile.scopes || [];
      return ok({ cfg, live: L ? STATS.finish(L, now) : null, lives: idx, trends: [STATS.trends(idx, now, 7), STATS.trends(idx, now, 30)],
        can: { chat: sc.includes('user:read:chat') && sc.includes('channel:bot'), bits: sc.includes('bits:read'), webhooks: !!this.env.EVENTSUB_SECRET } });
    }
    if (path === '/stats-save') {
      const prev = cfg; cfg = { enabled: !!body.enabled, weekly: body.weekly != null ? !!body.weekly : !!prev.weekly }; // weekly : récap du lundi sur Discord
      await st.put('stats', cfg);
      let errors = [];
      if (cfg.enabled !== prev.enabled && this.env.EVENTSUB_SECRET) errors = await this.syncSubs((await st.get('bot')) || sanitizeBot({}, null), profile, this.E).catch((e) => [e.message]);
      if (cfg.enabled) await this.armAlarm();
      else { const L = await st.get('statlive'); if (L) { await this.statFinish(L, now); await st.delete('statlive'); } }
      return ok({ cfg, errors });
    }
    if (path === '/stats-one') { const r = await st.get(key(body.key)); return r ? ok(r) : err('live introuvable', 404); }
    if (path === '/stats-del') {
      await st.delete(key(body.key));
      await st.put('statidx', ((await st.get('statidx')) || []).filter((x) => String(x.startedAt) !== String(+body.key)));
      return ok({ ok: true });
    }
    return err('?', 404);
  }

  /* ================= Mini-jeux du chat ================= */
  // Points par viewer : pt:<id> = { id, n, name, login, seen, last } ; ptn:<login> = id (pour !duel @pseudo, !give)
  pointsStore() {
    const st = this.ctx.storage, acc = this;
    const P = {
      async get(id) { return (await st.get('pt:' + id)) || { id: String(id), n: 0, name: '', login: '' }; },
      async put(id, p) { p.id = String(id); await st.put('pt:' + id, p); if (p.login) await st.put('ptn:' + p.login, String(id)); },
      async findByName(login) { const id = await st.get('ptn:' + String(login).toLowerCase()); return id ? P.get(id) : null; },
      async top(n) { // classement gardé 15 s : !top répété ne relit pas 5000 joueurs à chaque fois
        const now = Date.now();
        if (!acc._top || now - acc._top.at > 15000) acc._top = { at: now, list: [...(await st.list({ prefix: 'pt:', limit: 5000 })).values()].filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 10).map((x) => ({ name: x.name || x.login, n: x.n })) };
        return acc._top.list.slice(0, n);
      },
    };
    return P;
  }

  async jeuxChat(cfg, text, e, profile, api) {
    const st = this.ctx.storage, now = Date.now(), P = this.pointsStore();
    const level = userLevel(e.badges, e.chatter_user_id === profile.user_id);
    await JEUX.earn(cfg, P, { id: e.chatter_user_id, name: e.chatter_user_name, login: e.chatter_user_login }, level >= 1, now);
    const G = (await st.get('jeuxstate')) || JEUX.freshGames();
    const r = await JEUX.onChat(cfg, G, P, { text, login: e.chatter_user_login, name: e.chatter_user_name, userId: e.chatter_user_id }, level, now);
    await st.put('jeuxstate', G);
    if (r === undefined) return false; // pas une commande des jeux : le bot peut la traiter
    if (r) await api.say(r);
    return true;
  }

  async jeuxRoute(path, body, profile, secrets, E, ok, err) {
    const st = this.ctx.storage, now = Date.now(), P = this.pointsStore();
    let cfg = (await st.get('jeux')) || JEUX.sanitizeGames({}, null);
    const G = (await st.get('jeuxstate')) || JEUX.freshGames();
    const full = async () => ({ cfg, state: JEUX.publicGames(cfg, G, await P.top(10), now), quizAnswer: G.quiz && G.quiz.open ? G.quiz.answers.join(' / ') : null, players: (await st.list({ prefix: 'pt:', limit: 5000 })).size });
    if (path === '/ov-jeux') {
      const o = ((await st.get('overlays')) || {})[body.ov];
      if (!o || o.tool !== 'jeux') return err('overlay non autorisé', 403);
      return ok(JEUX.publicGames(cfg, G, await P.top(5), now));
    }
    if (path === '/jeux-get') return ok(await full());
    if (path === '/jeux-save') {
      const prev = cfg;
      cfg = JEUX.sanitizeGames(body, prev);
      await st.put('jeux', cfg);
      let errors = [];
      if (cfg.enabled !== prev.enabled && this.env.EVENTSUB_SECRET) errors = await this.syncSubs((await st.get('bot')) || sanitizeBot({}, null), profile, E).catch((e) => [e.message]);
      if (!this.env.EVENTSUB_SECRET && cfg.enabled) errors.push('EVENTSUB_SECRET manquant sur le relais');
      return ok(Object.assign(await full(), { errors }));
    }
    if (path === '/jeux-action') {
      if (body.action === 'reset') { // remet tous les points à zéro
        const keys = [...(await st.list({ prefix: 'pt:', limit: 5000 })).keys(), ...(await st.list({ prefix: 'ptn:', limit: 5000 })).keys()];
        for (let i = 0; i < keys.length; i += 128) await st.delete(keys.slice(i, i + 128));
        Object.assign(G, JEUX.freshGames()); await st.put('jeuxstate', G);
        return ok(await full());
      }
      // Les boutons de la page lancent la même commande que dans le chat, au nom du streamer
      const args = String(body.args || '').slice(0, 500);
      const reply = await JEUX.onChat(cfg, G, P, { text: args, login: profile.login, name: profile.login, userId: profile.user_id }, 4, now);
      await st.put('jeuxstate', G);
      const bot = (await st.get('bot')) || sanitizeBot({}, null);
      let sent = false;
      if (reply && cfg.enabled) { const ctx = { state: (await st.get('botstate')) || {}, changed: false }; await this.makeApi(bot, profile, secrets, E, ctx).say(reply).catch(() => {}); await st.put('botstate', ctx.state); sent = true; }
      return ok(Object.assign(await full(), { reply: reply || null, sent }));
    }
    return err('?', 404);
  }

  /* ================= Subathon ================= */
  async subChat(sub, text, e, profile, api) {
    const st = this.ctx.storage, now = Date.now();
    const [w, ...rest] = text.trim().split(/\s+/);
    const low = (w || '').toLowerCase(), args = rest.join(' '), name = e.chatter_user_name;
    const level = userLevel(e.badges, e.chatter_user_id === profile.user_id);
    if (low !== sub.cmd && low !== '!idee' && low !== '!idée' && low !== '!vote') return false;
    const S = (await st.get('substate')) || SUBA.freshState(sub);
    const ideas = (await st.get('ideas')) || { seq: 0, items: [] };
    let reply = null;
    if (low === sub.cmd) reply = level >= 3 || !args ? SUBA.command(sub, S, args, name, now) : null;
    else if (low === '!vote') { const r = SUBA.vote(ideas, rest[0], e.chatter_user_id); if (r.error) reply = `@${name} ${r.error}`; }
    else {
      const m = args.match(/^(ok|valider|non|refuser|fait)\s+(\d+)$/i);
      if (m && level >= 3) {
        const idea = ideas.items.find((x) => x.id === +m[2]);
        if (idea) { idea.status = /^(ok|valider)$/i.test(m[1]) ? 'approved' : /^fait$/i.test(m[1]) ? 'done' : 'hidden'; reply = `Idée n°${idea.id} : ${{ approved: 'validée ✓', done: 'réalisée 🎉', hidden: 'refusée' }[idea.status]}`; }
      } else {
        const r = SUBA.addIdea(sub, ideas, args, name, e.chatter_user_id, now);
        reply = r.error ? `@${name} ${r.error}` : `@${name} idée n°${r.idea.id} enregistrée${r.idea.status === 'pending' ? ' (en attente de validation)' : ''} ✓`;
      }
    }
    await st.put('substate', S); await st.put('ideas', ideas);
    if (S.status === 'running') await this.armAlarm(); // vérification des dons StreamElements
    if (reply) await api.say(reply);
    return true;
  }

  async subRoute(path, body, profile, E, ok, err) {
    const st = this.ctx.storage, now = Date.now();
    let sub = (await st.get('sub')) || SUBA.sanitizeSub({}, null);
    const S = (await st.get('substate')) || SUBA.freshState(sub);
    const ideas = (await st.get('ideas')) || { seq: 0, items: [] };
    const se = (await st.get('se')) || {};
    const sec = await unseal(await st.get('secrets'), E.key).catch(() => ({}));
    const full = () => ({ cfg: sub, state: Object.assign({}, S, { remaining: SUBA.remaining(S, now), elapsed: SUBA.elapsed(S, now), now }), ideas: ideas.items.map((x) => Object.assign({}, x, { votes: x.voters.length, voters: undefined })), login: profile.login,
      dons: { kofi: !!sec.kofi, streamelements: !!sec.sejwt, streamlabs: !!sec.sltoken, seLastPoll: se.lastPoll || null, seError: se.error || null } });
    if (path === '/sub-get') { SUBA.tick(S, now); return ok(full()); }
    if (path === '/sub-save') {
      const prev = sub;
      sub = SUBA.sanitizeSub(body, prev);
      if (S.status === 'idle') S.left = sub.start * 3600000; // le temps de départ ne change qu'avant le lancement
      await st.put('sub', sub); await st.put('substate', S);
      if (this.env.ACCOUNT) await this.env.ACCOUNT.get(this.env.ACCOUNT.idFromName('login:' + profile.login)).fetch('https://acc/index-set', { method: 'POST', body: JSON.stringify({ user_id: profile.user_id }) });
      let errors = [];
      const key = (c) => [c.enabled, !!c.rules.follow, !!c.rules.raid].join();
      if (key(sub) !== key(prev) && this.env.EVENTSUB_SECRET) {
        const botCfg = (await st.get('bot')) || sanitizeBot({}, null);
        errors = await this.syncSubs(botCfg, profile, E).catch((e) => [e.message]);
      }
      return ok(Object.assign(full(), { errors }));
    }
    if (path === '/sub-action') {
      const msg = SUBA.command(sub, S, String(body.args || ''), profile.login, now);
      await st.put('substate', S);
      if (S.status === 'running') await this.armAlarm();
      return ok(Object.assign(full(), { message: msg }));
    }
    if (path === '/sub-idea') {
      const idea = ideas.items.find((x) => x.id === body.id);
      if (!idea) return err('idée introuvable', 404);
      if (body.delete) ideas.items.splice(ideas.items.indexOf(idea), 1);
      else if (['pending', 'approved', 'hidden', 'done'].includes(body.status)) idea.status = body.status;
      await st.put('ideas', ideas);
      return ok(full());
    }
    if (path === '/public-sub') { if (!sub.enabled) return err('pas de subathon en cours sur cette chaîne', 404); return ok(SUBA.publicView(sub, S, ideas, now, body.viewerId, profile.login)); }
    if (path === '/public-idea' || path === '/public-vote') {
      if (!sub.enabled) return err('pas de subathon en cours', 404);
      const r = path === '/public-idea' ? SUBA.addIdea(sub, ideas, body.text, body.by, body.byId, now) : SUBA.vote(ideas, body.id, body.userId);
      if (r.error) return err(r.error);
      await st.put('ideas', ideas);
      return ok({ ok: true, id: r.idea.id, status: r.idea.status, voted: r.voted });
    }
    return err('?', 404);
  }

  /* Un don (Ko-fi, webhook, StreamElements, Streamlabs) : ajouté au subathon une seule fois, remercié par le bot si activé */
  async subDon(d, profile, secrets, E) {
    const st = this.ctx.storage, now = Date.now();
    const amount = Math.max(0, Math.round((parseFloat(d.amount) || 0) * 100) / 100);
    if (!amount) return { ignored: 'montant nul' };
    const sub = await st.get('sub');
    const S = sub ? (await st.get('substate')) || SUBA.freshState(sub) : null;
    // Doublons (Ko-fi et Twitch peuvent renvoyer un même événement) : vérifiés pour le subathon ET les remerciements du bot
    const seen = (await st.get('donseen')) || [];
    const id = d.id || `${d.source}|${d.name}|${amount}|${Math.floor(now / 10000)}`;
    if (seen.includes(id)) return { duplicate: true };
    seen.push(id); if (seen.length > 500) seen.shift();
    await st.put('donseen', seen);
    let added = 0;
    if (sub && sub.enabled && S && (S.status === 'running' || S.status === 'paused')) {
      S.totals.don = Math.round((S.totals.don + amount) * 100) / 100;
      const money = `${amount} ${d.currency && d.currency !== 'EUR' ? d.currency : '€'}`;
      added = SUBA.addTime(sub, S, amount * sub.rules.don, `don de ${money} de ${d.name || 'Anonyme'} (${d.source || 'don'})`, 'don', now);
    }
    if (S) await st.put('substate', S);
    const L = await st.get('statlive');
    if (L) { STATS.don(L, amount, d.currency, d.name); await st.put('statlive', L); }
    const bot = await st.get('bot');
    if (bot && bot.enabled && bot.events.don && bot.events.don.on) {
      const state = (await st.get('botstate')) || {}, ctx = { state, changed: false };
      await onEvent(bot, state, 'don', { user_name: d.name || 'Anonyme', amount: `${amount} ${d.currency === 'EUR' || !d.currency ? '€' : d.currency}` }, this.makeApi(bot, profile, secrets, E, ctx), profile.login);
      await st.put('botstate', state);
    }
    return { ok: true, added };
  }

  async armAlarm() { const st = this.ctx.storage; if (!(await st.getAlarm())) await st.setAlarm(Date.now() + 60000); }

  /* StreamElements : pas de webhook public, on lit les derniers dons chaque minute pendant le subathon */
  async pollStreamElements(sub, S, profile, secrets, E) {
    const st = this.ctx.storage;
    const se = (await st.get('se')) || { seen: [] };
    const h = { Authorization: 'Bearer ' + secrets.sejwt, Accept: 'application/json' };
    try {
      if (!se.channel) {
        const me = await (await fetch('https://api.streamelements.com/kappa/v2/channels/me', { headers: h })).json();
        if (!me._id) throw new Error('jeton StreamElements refusé');
        se.channel = me._id;
      }
      const r = await fetch(`https://api.streamelements.com/kappa/v2/tips/${se.channel}?limit=25&sort=-createdAt`, { headers: h });
      if (!r.ok) throw new Error('StreamElements : erreur ' + r.status);
      const d = await r.json();
      const since = S.startedAt || Date.now();
      for (const t of (d.docs || d.data || []).slice().reverse()) {
        const at = Date.parse(t.createdAt || t.updatedAt || 0);
        if (!t._id || at < since || se.seen.includes(t._id)) continue;
        se.seen.push(t._id); if (se.seen.length > 500) se.seen.shift();
        const don = t.donation || {};
        await this.subDon({ source: 'StreamElements', id: 'se-' + t._id, name: (don.user || {}).username, amount: don.amount, currency: don.currency, message: don.message }, profile, secrets, E);
      }
      se.lastPoll = Date.now(); se.error = null;
    } catch (e) { se.error = e.message; se.lastPoll = Date.now(); }
    await st.put('se', se);
  }

  async alarm() { // chaque minute : messages automatiques du bot (en live) et dons StreamElements (subathon en cours)
    const st = this.ctx.storage;
    const cfg = await st.get('bot'), state = (await st.get('botstate')) || {}, profile = await st.get('profile');
    if (!profile) return;
    const secrets = await unseal(await st.get('secrets'), this.E.key).catch(() => ({}));
    let next = Infinity;
    const stats = await st.get('stats');
    if (stats && stats.enabled) next = Math.min(next, (await this.statPoll(profile).catch(() => false)) ? 60000 : 300000); // en live : chaque minute, sinon toutes les 5 min
    if (stats && stats.enabled && stats.weekly && secrets.webhook) { // le lundi matin (UTC), une fois par semaine
      const d = new Date(), w = (await st.get('weekly')) || {};
      if (d.getUTCDay() === 1 && d.getUTCHours() >= 8 && (!w.at || Date.now() - w.at > 5 * 86400000)) {
        await st.put('weekly', { at: Date.now() });
        await this.statWeekly(profile, secrets).catch(() => {});
      }
    }
    if (cfg && cfg.enabled && (state.live || state.shield)) { // bouclier : levé à l'heure prévue, même après la fin du live
      const ctx = { state, changed: false };
      await onTick(cfg, state, this.makeApi(cfg, profile, secrets, this.E, ctx), profile.login);
      await st.put('botstate', state);
      next = Math.min(next, 60000);
    }
    const sub = await st.get('sub');
    const S = sub && (await st.get('substate'));
    if (sub && sub.enabled && S && (S.status === 'running' || S.status === 'paused') && secrets.sejwt) {
      await this.pollStreamElements(sub, S, profile, secrets, this.E);
      next = Math.min(next, 60000);
    }
    if (next < Infinity) await st.setAlarm(Date.now() + next);
  }

  broadcast(id, type = 'update') { this.ctx.getWebSockets('ov:' + id).forEach((ws) => { try { ws.send(JSON.stringify({ type })); } catch (e) { /* parti */ } }); }
  /* Sous-titres : chaque message de la page Sous-titres est relayé aux overlays « soustitres » */
  async webSocketMessage(ws, raw) {
    if (!this.ctx.getTags(ws).includes('cap')) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'ping') return ws.send('{"type":"pong"}');
    if (m.type !== 'caption') return;
    const OK = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ja', 'ko'], LANGS = { test: (l) => OK.includes(l) }; // langues proposées par la page Sous-titres
    const out = { type: 'caption', id: clean(m.id, 20), text: clean(m.text, 400), final: !!m.final, lang: LANGS.test(m.lang) ? m.lang : 'fr', tr: {} };
    for (const [l, v] of Object.entries(m.tr || {}).slice(0, 6)) if (LANGS.test(l)) out.tr[l] = clean(v, 400);
    if (!out.text && !out.final) return;
    const send = (o) => { const j = JSON.stringify(o); this.ctx.getWebSockets('tool:soustitres').forEach((s) => { try { s.send(j); } catch (e) { /* parti */ } }); };
    send(out);
    // Traduction par le relais (si le navigateur ne sait pas traduire) : phrases finies seulement, 60 par minute au plus
    const want = (Array.isArray(m.ai) ? m.ai : []).filter((l) => LANGS.test(l) && l !== out.lang && !out.tr[l]).slice(0, 4);
    if (!out.final || !out.text || !want.length || !this.env.AI) return;
    const now = Date.now(); this._tr = (this._tr || []).filter((t) => now - t < 60000);
    if (this._tr.length >= 60) return ws.send(JSON.stringify({ type: 'error', error: 'trop de traductions, ralentis un peu' }));
    this._tr.push(now);
    const tr = {};
    for (const l of want) {
      try { const r = await this.env.AI.run('@cf/meta/m2m100-1.2b', { text: out.text, source_lang: out.lang, target_lang: l }); if (r && r.translated_text) tr[l] = clean(r.translated_text, 400); }
      catch (e) { ws.send(JSON.stringify({ type: 'error', error: 'traduction indisponible : ' + e.message })); }
    }
    if (Object.keys(tr).length) { send({ type: 'caption-tr', id: out.id, tr }); ws.send(JSON.stringify({ type: 'caption-tr', id: out.id, tr })); }
  }
  broadcastAll() { this.ctx.getWebSockets().forEach((ws) => { try { ws.send(JSON.stringify({ type: 'update' })); } catch (e) { /* parti */ } }); }
}
