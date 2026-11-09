/* Demandes de musique : logique pure (file d'attente, règles, analyse des demandes).
 * Le Durable Object du compte résout les morceaux (YouTube / Spotify) et sauvegarde l'état.
 */

export const DEFAULT_SR = {
  enabled: false,
  source: 'youtube',     // 'youtube' (overlay Lecteur dans OBS) | 'spotify' (file de Spotify, Premium)
  cmd: '!sr',
  level: 'everyone',     // everyone | sub | vip | mod
  maxPerUser: 2,         // demandes en attente par viewer
  maxQueue: 30,
  maxMinutes: 8,         // durée maximum d'un morceau (si connue)
  cooldown: 30,          // secondes entre deux demandes d'un même viewer
  blocklist: '',         // mots interdits dans le titre, un par ligne ou virgule
  volume: 60,
  announce: true,        // le bot annonce le morceau ajouté
};

const LEVELS = { everyone: 0, sub: 1, vip: 2, mod: 3 };
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizeSr(input, prev) {
  const c = input || {}, p = prev || DEFAULT_SR;
  const cmd = str(c.cmd != null ? c.cmd : p.cmd, 20).trim().toLowerCase().replace(/\s+/g, '');
  return {
    enabled: bool(c.enabled, p.enabled),
    source: c.source === 'spotify' ? 'spotify' : c.source === 'youtube' ? 'youtube' : p.source,
    cmd: cmd ? (cmd.startsWith('!') ? cmd : '!' + cmd) : '!sr',
    level: LEVELS[c.level] != null ? c.level : p.level,
    maxPerUser: num(c.maxPerUser, p.maxPerUser, 1, 20),
    maxQueue: num(c.maxQueue, p.maxQueue, 1, 200),
    maxMinutes: num(c.maxMinutes, p.maxMinutes, 1, 60),
    cooldown: num(c.cooldown, p.cooldown, 0, 3600),
    blocklist: str(c.blocklist != null ? c.blocklist : p.blocklist, 3000),
    volume: num(c.volume, p.volume, 0, 100),
    announce: bool(c.announce, p.announce),
  };
}

export const freshQueue = () => ({ seq: 0, items: [], current: null, history: [], paused: false, cd: {} });

/* Que demande le viewer ? Lien ou identifiant YouTube, lien Spotify, ou recherche par texte. */
export function parseRequest(text) {
  const t = String(text || '').trim();
  const yt = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i) || t.match(/^([\w-]{11})$/);
  if (yt && /[\w-]{11}/.test(yt[1]) && (/youtu/i.test(t) || /\d/.test(yt[1]))) return { kind: 'youtube', id: yt[1] };
  const sp = t.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/);
  if (sp) return { kind: 'spotify', id: sp[1] };
  if (/^https?:\/\//i.test(t)) return { kind: 'unsupported' };
  return t.length >= 2 ? { kind: 'search', q: t.slice(0, 120) } : { kind: 'empty' };
}

/* « PT4M13S » → secondes */
export function isoDuration(s) {
  const m = String(s || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}
export const fmtLen = (s) => { if (!s) return '?'; const p = (x) => String(x).padStart(2, '0'); return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`; };

/* Vérifie si un viewer peut demander (avant de chercher le morceau) */
export function canRequest(cfg, Q, user, level, now) {
  if (!cfg.enabled) return 'les demandes de musique sont fermées.';
  if (Q.paused && level < 3) return 'les demandes sont en pause.';
  if (level < LEVELS[cfg.level]) return { sub: 'demandes réservées aux abonnés.', vip: 'demandes réservées aux VIP.', mod: 'demandes réservées aux modos.' }[cfg.level];
  if (level < 3) {
    if (Q.items.length >= cfg.maxQueue) return 'la file est pleine, réessaie plus tard.';
    if (Q.items.filter((x) => x.byId === user.id).length >= cfg.maxPerUser) return `tu as déjà ${cfg.maxPerUser} demande(s) en attente.`;
    const last = Q.cd[user.id] || 0;
    if (cfg.cooldown && now - last < cfg.cooldown * 1000) return `attends encore ${Math.ceil((cfg.cooldown * 1000 - (now - last)) / 1000)} s.`;
  }
  return null;
}

/* Vérifie le morceau trouvé (durée, mots interdits, doublon) puis l'ajoute */
export function addTrack(cfg, Q, track, user, level, now) {
  if (level < 3) {
    if (track.duration && track.duration > cfg.maxMinutes * 60) return { error: `morceau trop long (${fmtLen(track.duration)}, maximum ${cfg.maxMinutes} min).` };
    const words = cfg.blocklist.split(/[\n,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
    const hay = `${track.title} ${track.artist}`.toLowerCase();
    if (words.some((w) => hay.includes(w))) return { error: 'ce morceau n’est pas autorisé ici.' };
  }
  const key = track.source + ':' + track.id;
  if ((Q.current && Q.current.key === key) || Q.items.some((x) => x.key === key)) return { error: 'ce morceau est déjà dans la file.' };
  const item = { n: ++Q.seq, key, source: track.source, id: track.id, title: str(track.title, 150), artist: str(track.artist, 100), duration: track.duration || 0,
    thumb: str(track.thumb, 300), url: str(track.url, 300), by: str(user.name, 30), byId: String(user.id), at: now };
  Q.items.push(item);
  Q.cd[user.id] = now;
  return { item, position: Q.items.length };
}

/* Passe au morceau suivant (le morceau en cours part dans l'historique) */
export function advance(Q, status, now) {
  if (Q.current) { Q.history.unshift(Object.assign({}, Q.current, { status: status || 'played', endedAt: now })); Q.history = Q.history.slice(0, 30); }
  Q.current = Q.items.shift() || null;
  if (Q.current) Q.current.startedAt = now;
  return Q.current;
}

export function removeLastOf(Q, userId) {
  for (let i = Q.items.length - 1; i >= 0; i--) if (Q.items[i].byId === String(userId)) return Q.items.splice(i, 1)[0];
  return null;
}

export const label = (it) => `${it.title}${it.artist ? ' — ' + it.artist : ''}`;

export function publicQueue(cfg, Q, login) {
  const pick = (x) => ({ n: x.n, title: x.title, artist: x.artist, duration: x.duration, thumb: x.thumb, url: x.url, by: x.by, source: x.source });
  return { channel: login, enabled: cfg.enabled, paused: Q.paused, source: cfg.source, cmd: cfg.cmd,
    current: Q.current && pick(Q.current), queue: Q.items.map(pick), history: Q.history.slice(0, 10).map(pick) };
}
