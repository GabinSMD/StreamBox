/* Subathon côté relais : une seule source de vérité pour l'overlay OBS et la page publique.
 * Logique pure : le Durable Object du compte fournit l'état et le sauvegarde.
 */

export const DEFAULT_SUB = {
  enabled: false,
  title: 'Subathon',
  start: 4,           // heures au départ
  cap: 0,             // durée maximum en heures (0 = illimitée)
  rules: { sub1: 5, sub2: 10, sub3: 20, bits: 1, follow: 0, raid: 0, raidMin: 10, don: 1 },
  metric: 'subs',     // ce que mesurent les paliers : subs | bits | dons | heures
  paliers: [
    { target: 10, label: 'Cosplay surprise' },
    { target: 25, label: 'Nuit blanche' },
    { target: 50, label: 'Je mange le piment le plus fort' },
  ],
  ideas: { on: true, needApproval: true, maxPerUser: 3 },
  cmd: '!subathon',
};

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizeSub(input, prev) {
  const c = input || {}, p = prev || DEFAULT_SUB, r = c.rules || p.rules, i = c.ideas || p.ideas;
  return {
    enabled: bool(c.enabled, p.enabled),
    title: str(c.title != null ? c.title : p.title, 80) || 'Subathon',
    start: num(c.start, p.start, 0, 240),
    cap: num(c.cap, p.cap, 0, 2400),
    rules: Object.fromEntries(Object.keys(DEFAULT_SUB.rules).map((k) => [k, num(r[k], DEFAULT_SUB.rules[k], 0, k === 'raidMin' ? 100000 : 600)])),
    metric: ['subs', 'bits', 'dons', 'heures'].includes(c.metric) ? c.metric : p.metric,
    paliers: (Array.isArray(c.paliers) ? c.paliers : p.paliers).slice(0, 50)
      .map((x) => ({ target: num(x.target, 0, 0, 1e9), label: str(x.label, 120) })).filter((x) => x.label && x.target > 0)
      .sort((a, b) => a.target - b.target),
    ideas: { on: bool(i.on, true), needApproval: bool(i.needApproval, true), maxPerUser: num(i.maxPerUser, 3, 1, 20) },
    cmd: (str(c.cmd || p.cmd, 30).trim().toLowerCase() || '!subathon').replace(/^(?!!)/, '!'),
  };
}

export function freshState(cfg) {
  return { status: 'idle', left: cfg.start * 3600000, endAt: 0, startedAt: 0, pausedAt: 0, pausedTotal: 0, happyMult: 1, happyUntil: 0,
    totals: { subs: 0, gifts: 0, bits: 0, follows: 0, raids: 0, don: 0, added: 0 }, last: [], followed: [] };
}

export const remaining = (S, now) => (S.status === 'running' ? Math.max(0, S.endAt - now) : S.left);
const multiplier = (S, now) => (S.happyUntil > now ? S.happyMult : 1);
function capAt(cfg, S, now) {
  if (!cfg.cap || !S.startedAt) return Infinity;
  return S.startedAt + cfg.cap * 3600000 + S.pausedTotal + (S.status === 'paused' ? now - S.pausedAt : 0);
}
function setRemaining(cfg, S, ms, now) {
  ms = Math.max(0, ms);
  if (S.status === 'running') S.endAt = Math.min(now + ms, capAt(cfg, S, now));
  else S.left = Math.max(0, Math.min(ms, cfg.cap && S.startedAt ? capAt(cfg, S, now) - now : Infinity));
}
export function tick(S, now) { if (S.status === 'running' && now >= S.endAt) { S.status = 'ended'; S.left = 0; } }
export function elapsed(S, now) {
  if (!S.startedAt) return 0;
  const end = S.status === 'ended' ? S.endAt : now;
  return Math.max(0, end - S.startedAt - S.pausedTotal - (S.status === 'paused' ? now - S.pausedAt : 0));
}

export function start(cfg, S, now) {
  tick(S, now);
  if (S.status === 'running' || S.status === 'ended') return false;
  if (!S.startedAt) S.startedAt = now;
  if (S.status === 'paused') S.pausedTotal += now - S.pausedAt;
  S.endAt = now + S.left; S.status = 'running';
  return true;
}
export function pause(S, now) {
  tick(S, now);
  if (S.status !== 'running') return false;
  S.left = remaining(S, now); S.status = 'paused'; S.pausedAt = now;
  return true;
}

/* Ajoute du temps (minutes). kind 'manuel' : pas de multiplicateur de happy hour. Renvoie les ms vraiment ajoutées. */
export function addTime(cfg, S, minutes, label, kind, now) {
  tick(S, now);
  if (!minutes || S.status === 'ended') return 0;
  const ms = minutes * 60000 * (kind === 'manuel' ? 1 : multiplier(S, now));
  const before = remaining(S, now);
  setRemaining(cfg, S, before + ms, now);
  const real = remaining(S, now) - before;
  if (real > 0) S.totals.added += real;
  S.last.unshift({ label: str(label, 120), ms: real, t: now });
  S.last = S.last.slice(0, 10);
  return real;
}

/* « 10 », « +10 », « 1h30 », « 45s », « 1:30:00 » → millisecondes */
export function parseDur(s) {
  s = String(s || '').trim().toLowerCase().replace(',', '.');
  if (!s) return NaN;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) { const p = s.split(':').map(Number); return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000; }
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 60000;
  const re = /(\d+(?:\.\d+)?)\s*(j|d|h|min|m|s)/g; let m, total = 0, found = false;
  while ((m = re.exec(s))) { found = true; total += parseFloat(m[1]) * { j: 86400, d: 86400, h: 3600, min: 60, m: 60, s: 1 }[m[2]] * 1000; }
  const tail = s.match(/h(\d+)$/); if (tail) total += parseInt(tail[1], 10) * 60000;
  return found ? total : NaN;
}

const tierMin = (cfg, t) => (t === '3000' ? cfg.rules.sub3 : t === '2000' ? cfg.rules.sub2 : cfg.rules.sub1);
const tierName = (t) => (t === '3000' ? 'palier 3' : t === '2000' ? 'palier 2' : 'palier 1');

/* Événements Twitch (EventSub) */
export function onEvent(cfg, S, type, e, now) {
  if (S.status === 'idle' || S.status === 'ended') return 0; // le timer ne bouge pas avant le départ ni après la fin
  if (type === 'channel.subscribe' && !e.is_gift) { S.totals.subs++; return addTime(cfg, S, tierMin(cfg, e.tier), `${e.user_name} (abo ${tierName(e.tier)})`, 'sub', now); }
  if (type === 'channel.subscription.message') { S.totals.subs++; return addTime(cfg, S, tierMin(cfg, e.tier), `${e.user_name} (réabo ${tierName(e.tier)})`, 'sub', now); }
  if (type === 'channel.subscription.gift') {
    const n = e.total || 1; S.totals.subs += n; S.totals.gifts += n;
    return addTime(cfg, S, tierMin(cfg, e.tier) * n, `${e.is_anonymous ? 'Anonyme' : e.user_name} offre ${n} abo${n > 1 ? 's' : ''}`, 'sub', now);
  }
  if (type === 'channel.cheer') { S.totals.bits += e.bits; return addTime(cfg, S, (e.bits / 100) * cfg.rules.bits, `${e.is_anonymous ? 'Anonyme' : e.user_name} (${e.bits} bits)`, 'bits', now); }
  if (type === 'channel.follow' && cfg.rules.follow) {
    S.followed = S.followed || [];
    if (S.followed.includes(e.user_id)) return 0; // un follow par compte
    S.followed.push(e.user_id); if (S.followed.length > 5000) S.followed.shift();
    S.totals.follows++; return addTime(cfg, S, cfg.rules.follow, `${e.user_name} (follow)`, 'follow', now);
  }
  if (type === 'channel.raid' && cfg.rules.raid && e.viewers >= cfg.rules.raidMin) { S.totals.raids++; return addTime(cfg, S, cfg.rules.raid, `raid de ${e.from_broadcaster_user_name} (${e.viewers})`, 'raid', now); }
  return 0;
}

const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(s % 60).padStart(2, '0')} s`; };

/* Commandes des modos : « !subathon start | pause | +10 | -5 | set 3h | don 15 Pseudo | happy 2 30m | reset confirmer » */
export function command(cfg, S, args, by, now) {
  const [sub, ...rest] = String(args || '').trim().split(/\s+/);
  const low = (sub || '').toLowerCase();
  let ms;
  if (['start', 'go', 'reprendre', 'play'].includes(low)) return start(cfg, S, now) ? `▶ Subathon lancé : ${fmt(remaining(S, now))} au compteur !` : null;
  if (low === 'pause') return pause(S, now) ? '⏸ Subathon en pause.' : null;
  if (low === 'set' && !isNaN(ms = parseDur(rest.join(' ')))) { tick(S, now); setRemaining(cfg, S, ms, now); return `Timer réglé sur ${fmt(remaining(S, now))}.`; }
  if (low === 'don') {
    const amount = parseFloat((rest[0] || '').replace(',', '.'));
    if (!(amount > 0)) return 'Utilisation : !subathon don 15 Pseudo';
    S.totals.don += amount;
    const real = addTime(cfg, S, amount * cfg.rules.don, `don de ${amount} €${rest[1] ? ' de ' + rest.slice(1).join(' ') : ''}`, 'don', now);
    return `💸 Don de ${amount} € : +${fmt(real)} !`;
  }
  if (low === 'happy' || low === 'happyhour') {
    if (/^(off|stop|fin)$/i.test(rest[0] || '')) { S.happyUntil = 0; return 'Fin de la happy hour.'; }
    S.happyMult = num(parseFloat(rest[0]), 2, 1, 10); S.happyUntil = now + (parseDur(rest[1] || '60') || 3600000);
    return `🎉 Happy hour : temps ×${S.happyMult} pendant ${fmt(S.happyUntil - now)} !`;
  }
  if (low === 'reset' && /^confirmer$/i.test(rest[0] || '')) { Object.assign(S, freshState(cfg)); return 'Subathon remis à zéro.'; }
  if (/^[+-]/.test(low) && !isNaN(ms = parseDur(low.slice(1) || rest.join(' ')))) {
    const real = addTime(cfg, S, ((low[0] === '-' ? -1 : 1) * ms) / 60000, `ajout manuel par ${by}`, 'manuel', now);
    return `${real >= 0 ? '+' : '−'}${fmt(Math.abs(real))} au timer.`;
  }
  if (!low) return `⏱ Il reste ${fmt(remaining(S, now))} au subathon.`;
  return null;
}

/* Propositions des viewers */
export function addIdea(cfg, ideas, text, by, byId, now) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!cfg.ideas.on) return { error: 'Les propositions sont fermées.' };
  if (text.length < 3) return { error: 'Idée trop courte.' };
  if (ideas.items.filter((x) => x.byId === byId && x.status !== 'hidden').length >= cfg.ideas.maxPerUser) return { error: `${cfg.ideas.maxPerUser} idées maximum par personne.` };
  if (ideas.items.some((x) => x.text.toLowerCase() === text.toLowerCase() && x.status !== 'hidden')) return { error: 'Cette idée a déjà été proposée.' };
  if (ideas.items.length >= 300) return { error: 'Trop d’idées pour ce subathon.' };
  const idea = { id: ++ideas.seq, text, by: str(by, 30), byId: String(byId), at: now, status: cfg.ideas.needApproval ? 'pending' : 'approved', voters: [] };
  ideas.items.push(idea);
  return { idea };
}
export function vote(ideas, id, userId) {
  const idea = ideas.items.find((x) => x.id === Number(id) && x.status === 'approved');
  if (!idea) return { error: 'Idée introuvable (ou pas encore validée).' };
  const i = idea.voters.indexOf(String(userId));
  if (i >= 0) idea.voters.splice(i, 1); else idea.voters.push(String(userId));
  return { idea, voted: i < 0 };
}

export function metricValue(cfg, S, now) {
  if (cfg.metric === 'bits') return S.totals.bits;
  if (cfg.metric === 'dons') return S.totals.don;
  if (cfg.metric === 'heures') return Math.floor(elapsed(S, now) / 3600000);
  return S.totals.subs;
}

/* Ce que voit le public (aucune donnée privée) */
export function publicView(cfg, S, ideas, now, viewerId, login) {
  tick(S, now);
  const value = metricValue(cfg, S, now);
  const show = (x) => ({ id: x.id, text: x.text, by: x.by, votes: x.voters.length, status: x.status, mine: viewerId ? x.byId === String(viewerId) : false, voted: viewerId ? x.voters.includes(String(viewerId)) : false });
  return {
    channel: login, title: cfg.title, enabled: cfg.enabled, status: S.status, remaining: remaining(S, now), now,
    elapsed: elapsed(S, now), cap: cfg.cap, happy: S.happyUntil > now ? { mult: S.happyMult, until: S.happyUntil } : null,
    rules: cfg.rules, totals: S.totals, last: S.last.slice(0, 8), metric: cfg.metric, value,
    paliers: cfg.paliers.map((p) => ({ target: p.target, label: p.label, reached: value >= p.target })),
    ideas: cfg.ideas.on ? ideas.items.filter((x) => x.status === 'approved' || x.status === 'done' || (viewerId && x.byId === String(viewerId) && x.status === 'pending')).map(show)
      .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.votes - a.votes || a.id - b.id) : [],
    ideasOn: cfg.ideas.on, cmd: cfg.cmd,
  };
}
