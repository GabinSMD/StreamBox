/* Bot de chat StreamBox : logique pure (aucun appel réseau ici).
 * Le Durable Object du compte fournit `api` (Twitch réel, ou simulé pour la console de test)
 * et sauvegarde `cfg` (réglages) et `st` (état : compteurs, délais, permissions…).
 */

export const DEFAULT_BOT = {
  enabled: false,
  sender: 'self', // 'self' = le compte du streamer, 'bot' = le compte bot du site
  commands: [
    { name: '!discord', aliases: [], response: 'Rejoins le Discord : https://discord.gg/ton-lien', level: 'everyone', cooldown: 10, userCooldown: 0, enabled: true, count: 0 },
    { name: '!bonjour', aliases: ['!salut'], response: 'Bienvenue {user} ! 👋', level: 'everyone', cooldown: 5, userCooldown: 30, enabled: true, count: 0 },
  ],
  builtins: { commandes: true, uptime: true, followage: true, so: true, addcom: true, permit: true, clip: true },
  timers: [{ message: 'Pense à follow la chaîne si le live te plaît 💜', interval: 20, minLines: 10, enabled: false }],
  mod: {
    permitSecs: 60,
    links: { on: false, action: 'delete', exemptSubs: true, allow: 'clips.twitch.tv', msg: '{user}, pas de liens sans permission 🙏' },
    caps: { on: false, min: 15, pct: 70, action: 'warn', msg: '{user}, doucement sur les majuscules 🙂' },
    words: { on: false, list: '', action: 'delete', msg: '{user}, ce mot n’est pas autorisé ici.' },
  },
  events: {
    follow: { on: false, msg: 'Merci pour le follow {user} ! 💜' },
    sub: { on: true, msg: 'Merci pour l’abo {user} ! ⭐' },
    resub: { on: true, msg: '{user} est abonné·e depuis {months} mois, merci ! ⭐' },
    gift: { on: true, msg: '{user} offre {count} abonnement(s) ! Merci 🎁' },
    raid: { on: true, msg: 'Bienvenue aux {viewers} raiders de {user} ! 🚀', shoutout: true },
    cheer: { on: false, msg: 'Merci {user} pour les {bits} bits ! 💎', min: 100 },
    don: { on: false, msg: 'Merci {user} pour le don de {amount} ! 💸' },
  },
  // Bouclier anti-raid haineux : un raid venant d'un compte très récent passe le chat en mode protégé pendant quelques minutes
  shield: { on: false, maxAge: 30, minViewers: 2, followers: true, followMins: 10, shieldMode: false, duration: 10, trusted: '',
    msg: 'Raid suspect de {user} : le chat passe en mode followers pendant {minutes} min. Les vrais viewers sont les bienvenus !' },
};

const LEVELS = { everyone: 0, sub: 1, vip: 2, mod: 3, broadcaster: 4 };
const ACTIONS = /^(delete|warn|timeout:\d{1,5})$/;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const cmdName = (s) => { const n = str(s, 30).trim().toLowerCase().replace(/\s+/g, ''); return n ? (n.startsWith('!') ? n : '!' + n) : ''; };

/* Nettoie et borne les réglages envoyés par le site */
export function sanitizeBot(input, prev) {
  const c = input || {}, d = DEFAULT_BOT, p = prev || d;
  const out = {
    enabled: bool(c.enabled, p.enabled),
    sender: c.sender === 'bot' ? 'bot' : 'self',
    commands: (Array.isArray(c.commands) ? c.commands : p.commands).slice(0, 100).map((x) => ({
      name: cmdName(x.name), aliases: (Array.isArray(x.aliases) ? x.aliases : String(x.aliases || '').split(/[\s,]+/)).map(cmdName).filter(Boolean).slice(0, 5),
      response: str(x.response, 450), level: LEVELS[x.level] != null ? x.level : 'everyone',
      cooldown: num(x.cooldown, 5, 0, 3600), userCooldown: num(x.userCooldown, 0, 0, 86400), enabled: bool(x.enabled, true), count: num(x.count, 0, 0, 1e9),
    })).filter((x) => x.name && x.response),
    builtins: Object.fromEntries(Object.keys(d.builtins).map((k) => [k, bool((c.builtins || {})[k], (p.builtins || d.builtins)[k])])),
    timers: (Array.isArray(c.timers) ? c.timers : p.timers).slice(0, 20).map((t) => ({ message: str(t.message, 450), interval: num(t.interval, 15, 5, 240), minLines: num(t.minLines, 5, 0, 500), enabled: bool(t.enabled, true) })).filter((t) => t.message),
    mod: { permitSecs: num((c.mod || {}).permitSecs, 60, 10, 600) },
    events: {},
  };
  for (const k of ['links', 'caps', 'words']) {
    const m = (c.mod || {})[k] || (p.mod || d.mod)[k] || d.mod[k];
    out.mod[k] = { on: bool(m.on, false), action: ACTIONS.test(m.action) ? m.action : 'delete', msg: str(m.msg, 300) };
    if (k === 'links') Object.assign(out.mod[k], { exemptSubs: bool(m.exemptSubs, true), allow: str(m.allow, 500) });
    if (k === 'caps') Object.assign(out.mod[k], { min: num(m.min, 15, 5, 200), pct: num(m.pct, 70, 30, 100) });
    if (k === 'words') out.mod[k].list = str(m.list, 3000);
  }
  const sh = c.shield || p.shield || d.shield, ds = d.shield;
  out.shield = { on: bool(sh.on, ds.on), maxAge: num(sh.maxAge, ds.maxAge, 1, 3650), minViewers: num(sh.minViewers, ds.minViewers, 1, 100000),
    followers: bool(sh.followers, ds.followers), followMins: num(sh.followMins, ds.followMins, 0, 129600), shieldMode: bool(sh.shieldMode, ds.shieldMode),
    duration: num(sh.duration, ds.duration, 1, 240), trusted: str(sh.trusted, 1000), msg: str(sh.msg != null ? sh.msg : ds.msg, 400) };
  for (const k of Object.keys(d.events)) {
    const e = (c.events || {})[k] || (p.events || d.events)[k] || d.events[k];
    out.events[k] = { on: bool(e.on, d.events[k].on), msg: str(e.msg, 400) };
    if (k === 'raid') out.events[k].shoutout = bool(e.shoutout, true);
    if (k === 'cheer') out.events[k].min = num(e.min, 100, 1, 1e6);
  }
  return out;
}

export function userLevel(badges, isBroadcaster) {
  if (isBroadcaster) return 4;
  const set = new Set((badges || []).map((b) => b.set_id));
  if (set.has('broadcaster')) return 4;
  if (set.has('moderator')) return 3;
  if (set.has('vip')) return 2;
  if (set.has('subscriber') || set.has('founder')) return 1;
  return 0;
}

const fmtDur = (ms) => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d} j ${h % 24} h` : h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
function fmtSince(iso) {
  const ms = Date.now() - Date.parse(iso);
  const days = Math.floor(ms / 86400000), y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30), dd = (days % 365) % 30;
  return [y && `${y} an${y > 1 ? 's' : ''}`, mo && `${mo} mois`, (dd || (!y && !mo)) && `${dd} jour${dd > 1 ? 's' : ''}`].filter(Boolean).join(', ');
}

/* Remplace les variables d'un message. Les variables coûteuses ne sont calculées que si présentes. */
export async function render(tpl, v, api, st) {
  let out = String(tpl || '');
  out = out.replace(/\{random:(\d{1,6})-(\d{1,6})\}/g, (_, a, b) => { const lo = Math.min(+a, +b), hi = Math.max(+a, +b); return String(lo + Math.floor(Math.random() * (hi - lo + 1))); });
  const simple = { user: v.user, touser: v.touser || v.user, args: v.args || '', channel: v.channel, count: v.count, months: v.months, viewers: v.viewers, bits: v.bits, tier: v.tier, amount: v.amount, minutes: v.minutes };
  out = out.replace(/\{(user|touser|args|channel|count|months|viewers|bits|tier|amount|minutes)\}/g, (_, k) => (simple[k] != null ? String(simple[k]) : ''));
  if (/\{uptime\}/.test(out)) out = out.replace(/\{uptime\}/g, st.live && st.startedAt ? fmtDur(Date.now() - st.startedAt) : 'hors ligne');
  if (/\{(game|title)\}/.test(out)) {
    const ch = await api.channel().catch(() => null) || {};
    out = out.replace(/\{game\}/g, ch.game_name || '?').replace(/\{title\}/g, ch.title || '?');
  }
  if (/\{followage\}/.test(out)) {
    const f = await api.followedAt(v.userId).catch(() => null);
    out = out.replace(/\{followage\}/g, f ? fmtSince(f) : 'pas encore follow');
  }
  return out.slice(0, 480);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LINK_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|net|org|fr|tv|gg|io|be|ch|ca|ly|me|co|xyz|info|ru|de|uk|app|dev|link|live|shop|store|site|online|club|top|cc|to|eu)(?:\/\S*)?/i;

/* Vérifie un message (modération). Renvoie la règle enfreinte ou null. */
export function moderate(cfg, st, text, login, level) {
  if (level >= 3) return null;
  const m = cfg.mod;
  if (m.links.on && !(m.links.exemptSubs && level >= 1) && !(st.permits && st.permits[login] > Date.now())) {
    const allow = m.links.allow.split(/[\s,]+/).filter(Boolean).map((a) => a.toLowerCase());
    const found = (text.match(new RegExp(LINK_RE.source, 'gi')) || []).filter((u) => !allow.some((a) => u.toLowerCase().includes(a)));
    if (found.length) return 'links';
  }
  if (m.caps.on) {
    const letters = text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
    const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length;
    if (letters.length >= m.caps.min && (upper / letters.length) * 100 >= m.caps.pct) return 'caps';
  }
  if (m.words.on && m.words.list.trim()) {
    const words = m.words.list.split(/[\n,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
    const low = text.toLowerCase();
    if (words.some((w) => new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRe(w).replace(/\\\*/g, '\\S*') + '($|[^\\p{L}\\p{N}])', 'u').test(low))) return 'words';
  }
  return null;
}

/* Traite un message du chat. ev = { text, login, name, userId, badges, messageId } */
/* Modération d'un message (liens, majuscules, mots interdits…) : appliquée avant tout le reste,
 * mini-jeux, demandes de musique et subathon compris. Renvoie la règle enfreinte, ou null. */
export async function modChat(cfg, st, ev, api, channel) {
  const level = userLevel(ev.badges, ev.isBroadcaster);
  const rule = moderate(cfg, st, ev.text, ev.login, level);
  if (!rule) return null;
  const r = cfg.mod[rule];
  if (r.action === 'delete') await api.del(ev.messageId);
  else if (r.action.startsWith('timeout:')) await api.timeout(ev.userId, +r.action.split(':')[1], 'StreamBox : ' + rule);
  if (r.msg) await api.say(await render(r.msg, { user: ev.name, channel }, api, st));
  return rule;
}

export async function onChat(cfg, st, ev, api, channel, opts = {}) {
  const level = userLevel(ev.badges, ev.isBroadcaster);
  st.lines = (st.lines || 0) + 1;
  const now = Date.now();

  // 1. Modération (déjà faite par l'appelant quand opts.moderated)
  if (!opts.moderated) { const rule = await modChat(cfg, st, ev, api, channel); if (rule) return { moderated: rule }; }

  // 2. Commandes
  const text = ev.text.trim();
  if (!text.startsWith('!')) return null;
  const [rawName, ...rest] = text.split(/\s+/);
  const name = rawName.toLowerCase();
  const args = rest.join(' ');
  const touser = (rest[0] || '').replace(/^@/, '');
  const B = cfg.builtins;
  const isMod = level >= 3;
  const v = { user: ev.name, userId: ev.userId, touser: touser || ev.name, args, channel };

  if (B.commandes && (name === '!commandes' || name === '!commands')) {
    const page = api.pageUrl ? await api.pageUrl().catch(() => '') : ''; // page publique : la liste complète, avec les réponses
    if (page) return api.say(`Toutes les commandes : ${page}`);
    const list = cfg.commands.filter((c) => c.enabled && LEVELS[c.level] <= level).map((c) => c.name);
    const builtins = [B.uptime && '!uptime', B.followage && '!followage', B.clip && '!clip'].filter(Boolean);
    return api.say(`Commandes : ${[...list, ...builtins].join(' ') || 'aucune'}`.slice(0, 480));
  }
  if (B.uptime && name === '!uptime') return api.say(st.live && st.startedAt ? `${channel} est en live depuis ${fmtDur(now - st.startedAt)}.` : `${channel} n’est pas en live.`);
  if (B.followage && name === '!followage') {
    const f = await api.followedAt(ev.userId).catch(() => null);
    return api.say(f ? `${ev.name} suit ${channel} depuis ${fmtSince(f)}.` : `${ev.name} ne suit pas encore ${channel}.`, ev.messageId);
  }
  if (B.clip && name === '!clip') { // clip des 30 dernières secondes, posté aussi sur Discord si un webhook est enregistré
    if (!st.live) return api.say(`${channel} n’est pas en live : pas de clip possible.`);
    if (!isMod && now - (st.clipAt || 0) < 30000) return null; // un clip toutes les 30 s au plus
    st.clipAt = now;
    const c = await api.clip().catch((e) => ({ error: e.message }));
    if (!c || !c.id) return api.say(`Impossible de créer le clip${c && c.error ? ' : ' + c.error : ''}.`);
    const url = 'https://clips.twitch.tv/' + c.id;
    await api.discord(`🎬 Nouveau clip de ${channel}, créé par ${ev.name} : ${url}`).catch(() => {});
    return api.say(`🎬 Clip créé par ${ev.name} : ${url}`);
  }
  if (B.so && name === '!so' && isMod && touser) {
    const u = await api.user(touser).catch(() => null);
    if (!u) return api.say(`Je ne trouve pas ${touser}.`);
    const ch = await api.channel(u.id).catch(() => null) || {};
    await api.shoutout(u.id).catch(() => {});
    return api.say(`Allez voir ${u.display_name} 💜 ${ch.game_name ? `Dernier jeu : ${ch.game_name}. ` : ''}twitch.tv/${u.login}`);
  }
  if (B.permit && name === '!permit' && isMod && touser) {
    st.permits = st.permits || {};
    st.permits[touser.toLowerCase()] = now + cfg.mod.permitSecs * 1000;
    return api.say(`${touser} peut poster un lien pendant ${cfg.mod.permitSecs} s.`);
  }
  if (B.addcom && isMod && ['!addcom', '!editcom', '!delcom'].includes(name)) {
    const target = cmdName(rest[0]);
    const resp = rest.slice(1).join(' ').trim();
    if (!target) return api.say(`Utilisation : ${name} !nom ${name === '!delcom' ? '' : 'réponse'}`.trim());
    const i = cfg.commands.findIndex((c) => c.name === target);
    if (name === '!delcom') { if (i < 0) return api.say(`${target} n’existe pas.`); cfg.commands.splice(i, 1); api.changed(); return api.say(`Commande ${target} supprimée.`); }
    if (!resp) return api.say(`Il manque la réponse de ${target}.`);
    if (name === '!addcom' && i >= 0) return api.say(`${target} existe déjà : utilise !editcom.`);
    if (name === '!editcom' && i < 0) return api.say(`${target} n’existe pas : utilise !addcom.`);
    if (i >= 0) cfg.commands[i].response = resp.slice(0, 450);
    else { if (cfg.commands.length >= 100) return api.say('100 commandes maximum.'); cfg.commands.push({ name: target, aliases: [], response: resp.slice(0, 450), level: 'everyone', cooldown: 5, userCooldown: 0, enabled: true, count: 0 }); }
    api.changed();
    return api.say(`Commande ${target} ${i >= 0 ? 'modifiée' : 'ajoutée'} ✓`);
  }

  const cmd = cfg.commands.find((c) => c.enabled && (c.name === name || c.aliases.includes(name)));
  if (!cmd || level < LEVELS[cmd.level]) return null;
  st.cd = st.cd || {}; st.ucd = st.ucd || {};
  if (!isMod) {
    if (cmd.cooldown && now - (st.cd[cmd.name] || 0) < cmd.cooldown * 1000) return null;
    const uk = cmd.name + ':' + ev.login;
    if (cmd.userCooldown && now - (st.ucd[uk] || 0) < cmd.userCooldown * 1000) return null;
    st.ucd[uk] = now;
  }
  st.cd[cmd.name] = now;
  cmd.count = (cmd.count || 0) + 1; api.changed();
  return api.say(await render(cmd.response, Object.assign(v, { count: cmd.count }), api, st));
}

/* Événements de la chaîne (follow, abos, raids, bits) */
export async function onEvent(cfg, st, type, e, api, channel) {
  const E = cfg.events;
  const tier = (t) => ({ 1000: '1', 2000: '2', 3000: '3' }[t] || '1');
  if (type === 'channel.follow' && E.follow.on) {
    st.followed = st.followed || [];
    if (st.followed.includes(e.user_id)) return; // pas de doublon (follow / unfollow en boucle)
    st.followed.push(e.user_id); if (st.followed.length > 500) st.followed.shift();
    return api.say(await render(E.follow.msg, { user: e.user_name, channel }, api, st));
  }
  if (type === 'channel.subscribe' && E.sub.on && !e.is_gift) return api.say(await render(E.sub.msg, { user: e.user_name, tier: tier(e.tier), channel }, api, st));
  if (type === 'channel.subscription.message' && E.resub.on) return api.say(await render(E.resub.msg, { user: e.user_name, months: e.cumulative_months, tier: tier(e.tier), channel }, api, st));
  if (type === 'channel.subscription.gift' && E.gift.on) return api.say(await render(E.gift.msg, { user: e.is_anonymous ? 'Anonyme' : e.user_name, count: e.total, tier: tier(e.tier), channel }, api, st));
  if (type === 'channel.cheer' && E.cheer.on && e.bits >= E.cheer.min) return api.say(await render(E.cheer.msg, { user: e.is_anonymous ? 'Anonyme' : e.user_name, bits: e.bits, channel }, api, st));
  if (type === 'don' && E.don && E.don.on) return api.say(await render(E.don.msg, { user: e.user_name, amount: e.amount, channel }, api, st));
  if (type === 'channel.raid' && cfg.shield && cfg.shield.on && await shieldCheck(cfg, st, e, api, channel)) return; // raid suspect : ni accueil ni shoutout
  if (type === 'channel.raid' && E.raid.on) {
    await api.say(await render(E.raid.msg, { user: e.from_broadcaster_user_name, viewers: e.viewers, channel }, api, st));
    if (E.raid.shoutout) await api.shoutout(e.from_broadcaster_user_id).catch(() => {});
  }
}

/* Bouclier : raid d'un compte créé il y a moins de `maxAge` jours (et hors chaînes de confiance) → mode followers et/ou
 * mode bouclier de Twitch pendant `duration` minutes, puis retour aux réglages d'avant (dans onTick). */
const trustedList = (s) => String(s || '').toLowerCase().split(/[\s,;]+/).map((x) => x.replace(/^@/, '')).filter(Boolean);
export async function shieldCheck(cfg, st, e, api, channel) {
  const S = cfg.shield, login = String(e.from_broadcaster_user_login || '').toLowerCase();
  if ((+e.viewers || 0) < S.minViewers || trustedList(S.trusted).includes(login)) return false;
  const u = await api.userById(e.from_broadcaster_user_id).catch(() => null);
  const ageDays = u && u.created_at ? (Date.now() - Date.parse(u.created_at)) / 86400000 : 0;
  if (u && ageDays >= S.maxAge) return false;
  const now = Date.now();
  if (!st.shield) { // on garde les réglages d'avant une seule fois, même si plusieurs raids suspects s'enchaînent
    const prev = await api.getChatSettings().catch(() => null);
    st.shield = { prev: prev ? (prev.follower_mode ? { follower_mode: true, follower_mode_duration: prev.follower_mode_duration || 0 } : { follower_mode: false }) : null, mode: false };
  }
  st.shield.until = now + S.duration * 60000; st.shield.from = e.from_broadcaster_user_name; st.shield.at = now;
  if (S.followers) await api.chatSettings({ follower_mode: true, follower_mode_duration: S.followMins }).catch(() => {});
  if (S.shieldMode) { await api.shieldMode(true).catch(() => {}); st.shield.mode = true; }
  if (S.msg) await api.say(await render(S.msg, { user: e.from_broadcaster_user_name, viewers: e.viewers, minutes: S.duration, channel }, api, st));
  if (api.changed) api.changed();
  return true;
}
async function shieldEnd(st, api) {
  const s = st.shield; delete st.shield;
  if (s.prev) await api.chatSettings(s.prev).catch(() => {}); // réglages d'avant le raid
  if (s.mode) await api.shieldMode(false).catch(() => {});
}

/* Messages automatiques : appelé chaque minute pendant le live. Un seul message par passage. */
export async function onTick(cfg, st, api, channel) {
  if (st.shield && Date.now() >= st.shield.until) await shieldEnd(st, api); // fin du bouclier, même si le live s'est arrêté
  if (!st.live) return;
  st.timers = st.timers || {};
  const now = Date.now();
  for (let i = 0; i < cfg.timers.length; i++) {
    const t = cfg.timers[i];
    if (!t.enabled) continue;
    const s = st.timers[i] || (st.timers[i] = { last: now, lines: st.lines || 0 });
    if (now - s.last >= t.interval * 60000 && (st.lines || 0) - s.lines >= t.minLines) {
      s.last = now; s.lines = st.lines || 0;
      return api.say(await render(t.message, { channel }, api, st));
    }
  }
}

/* Abonnements EventSub nécessaires (webhooks) */
export function wantedSubs(cfg, broadcasterId, readerId) {
  const b = { broadcaster_user_id: broadcasterId };
  const subs = [
    { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: broadcasterId, user_id: readerId } },
    { type: 'stream.online', version: '1', condition: b },
    { type: 'stream.offline', version: '1', condition: b },
  ];
  const E = cfg.events;
  if (E.follow.on) subs.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId } });
  if (E.sub.on) subs.push({ type: 'channel.subscribe', version: '1', condition: b });
  if (E.resub.on) subs.push({ type: 'channel.subscription.message', version: '1', condition: b });
  if (E.gift.on) subs.push({ type: 'channel.subscription.gift', version: '1', condition: b });
  if (E.cheer.on) subs.push({ type: 'channel.cheer', version: '1', condition: b });
  if (E.raid.on || (cfg.shield && cfg.shield.on)) subs.push({ type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterId } });
  return subs;
}

export const BOT_SCOPES = 'user:read:chat user:write:chat user:bot channel:bot moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:shoutouts moderator:read:followers bits:read';
export const BOT_ACCOUNT_SCOPES = 'user:read:chat user:write:chat user:bot moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:shoutouts moderator:manage:chat_settings moderator:manage:shield_mode';
// Bouclier anti-raid : permissions en plus, demandées seulement quand il est activé
export const SHIELD_SCOPES = 'moderator:manage:chat_settings moderator:manage:shield_mode';
