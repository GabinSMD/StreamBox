/* Statistiques des lives : logique pure. Le Durable Object du compte fournit l'état du live en cours (L)
 * et l'enregistre. Un relevé par minute (viewers, messages), plus les événements reçus de Twitch. */

export const MAX_CHATTERS = 5000; // au-delà, on compte encore les messages mais plus les pseudos
export const MAX_LIVES = 200;     // lives gardés (les plus anciens sont effacés)

export function freshLive(stream, now) {
  const L = {
    id: String(stream.id || now), startedAt: Date.parse(stream.started_at) || now, title: String(stream.title || '').slice(0, 140),
    games: [], samples: [], msgs: 0, minuteMsgs: 0, chatters: {}, nChatters: 0,
    follows: 0, subs: 0, resubs: 0, gifts: 0, bits: 0, raids: [], dons: {}, miss: 0,
    names: freshNames(), // pseudos pour le générique de fin
  };
  setGame(L, stream.game_name, L.startedAt);
  return L;
}

const MAX_NAMES = 300;
export const freshNames = () => ({ follows: [], subs: [], resubs: [], gifts: {}, bits: {}, dons: [] });
const nm = (e, k = 'user_name') => String((e && (e[k] || e.user_login)) || '').slice(0, 30);
function addName(list, name) { if (name && !list.includes(name) && list.length < MAX_NAMES) list.push(name); }
function addCount(map, name, n) { if (!name) return; if (map[name] == null && Object.keys(map).length >= MAX_NAMES) return; map[name] = (map[name] || 0) + n; }

function setGame(L, name, t) {
  name = String(name || '').slice(0, 80);
  if (!name) return;
  const last = L.games[L.games.length - 1];
  if (!last || last.name !== name) L.games.push({ name, at: t });
}

/* Relevé d'une minute (appelé par l'alarme pendant le live) */
export function sample(L, stream, now) {
  L.samples.push([now, Math.max(0, stream.viewer_count | 0), L.minuteMsgs]);
  L.minuteMsgs = 0; L.miss = 0;
  if (stream.title) L.title = String(stream.title).slice(0, 140);
  setGame(L, stream.game_name, now);
}

export function chat(L, e) {
  L.msgs++; L.minuteMsgs++;
  const id = e.chatter_user_id;
  if (!id) return;
  const c = L.chatters[id];
  if (c) c[1]++;
  else if (L.nChatters < MAX_CHATTERS) { L.chatters[id] = [String(e.chatter_user_name || e.chatter_user_login || '?').slice(0, 30), 1]; L.nChatters++; }
}

export function event(L, type, e) {
  const N = L.names || (L.names = freshNames());
  if (type === 'channel.follow') { L.follows++; addName(N.follows, nm(e)); }
  else if (type === 'channel.subscribe') { if (!e.is_gift) { L.subs++; addName(N.subs, nm(e)); } }
  else if (type === 'channel.subscription.message') { L.resubs++; addName(N.resubs, nm(e)); }
  else if (type === 'channel.subscription.gift') { L.gifts += e.total | 0; if (!e.is_anonymous) addCount(N.gifts, nm(e), e.total | 0); }
  else if (type === 'channel.cheer') { L.bits += e.bits | 0; if (!e.is_anonymous) addCount(N.bits, nm(e), e.bits | 0); }
  else if (type === 'channel.raid') { L.raids.push({ from: String(e.from_broadcaster_user_name || '?').slice(0, 30), viewers: e.viewers | 0 }); L.raids = L.raids.slice(-50); }
  else return false;
  return true;
}

export function don(L, amount, currency, name) {
  const c = String(currency || 'EUR').toUpperCase().slice(0, 5);
  const N = L.names || (L.names = freshNames());
  if (name && name !== 'Anonyme' && N.dons.length < MAX_NAMES) N.dons.push({ name: String(name).slice(0, 30), amount, currency: c });
  L.dons[c] = Math.round(((L.dons[c] || 0) + amount) * 100) / 100;
}

/* Fin du live : on garde les chiffres, le top 10 des chatteurs et le nombre de chatteurs (pas la liste complète) */
export function finish(L, now) {
  const endedAt = Math.max(L.startedAt, (L.samples.length ? L.samples[L.samples.length - 1][0] : now));
  const views = L.samples.map((s) => s[1]);
  const avg = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0;
  const duration = endedAt - L.startedAt;
  const top = Object.values(L.chatters).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n }));
  return {
    id: L.id, startedAt: L.startedAt, endedAt, duration, title: L.title, games: L.games, samples: L.samples,
    peak: views.length ? Math.max(...views) : 0, avg, hoursWatched: Math.round((avg * duration) / 36e5 * 10) / 10,
    msgs: L.msgs, chatters: L.nChatters, chattersCapped: L.nChatters >= MAX_CHATTERS, topChatters: top,
    follows: L.follows, subs: L.subs, resubs: L.resubs, gifts: L.gifts, bits: L.bits, raids: L.raids, dons: L.dons,
    names: Object.assign(L.names || freshNames(), { chatters: Object.values(L.chatters).sort((a, b) => b[1] - a[1]).slice(0, 100).map((c) => c[0]) }),
  };
}

/* Générique de fin : qui remercier (live en cours, ou dernier live terminé) */
export function credits(r) {
  const N = r.names || freshNames();
  const top = (map) => Object.entries(map || {}).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  return { title: r.title, startedAt: r.startedAt, endedAt: r.endedAt, duration: r.duration, games: (r.games || []).map((g) => g.name),
    follows: N.follows || [], subs: N.subs || [], resubs: N.resubs || [], gifts: top(N.gifts), bits: top(N.bits), raids: r.raids || [], dons: N.dons || [], chatters: N.chatters || [],
    counts: { follows: r.follows, subs: r.subs, resubs: r.resubs, gifts: r.gifts, bits: r.bits, msgs: r.msgs, peak: r.peak } };
}

/* Résumé pour la liste (sans les relevés minute par minute) */
export function summary(r) {
  const { samples, topChatters, names, ...rest } = r; // la liste reste légère : pas de relevés ni de pseudos
  return Object.assign(rest, { points: samples.length });
}

/* Tendances : période récente comparée à la précédente de même durée */
export function trends(list, now, days) {
  const span = days * 86400000;
  const pick = (from, to) => list.filter((r) => r.startedAt >= from && r.startedAt < to);
  const sum = (rs) => {
    const hours = rs.reduce((a, r) => a + r.duration, 0) / 36e5;
    const wavg = hours ? rs.reduce((a, r) => a + r.avg * (r.duration / 36e5), 0) / hours : 0; // moyenne pondérée par la durée
    return { lives: rs.length, hours: Math.round(hours * 10) / 10, avg: Math.round(wavg), peak: rs.reduce((a, r) => Math.max(a, r.peak), 0),
      follows: rs.reduce((a, r) => a + r.follows, 0), subs: rs.reduce((a, r) => a + r.subs + r.resubs + r.gifts, 0), msgs: rs.reduce((a, r) => a + r.msgs, 0),
      hoursWatched: Math.round(rs.reduce((a, r) => a + r.hoursWatched, 0) * 10) / 10 };
  };
  return { days, now: sum(pick(now - span, now + 1)), before: sum(pick(now - 2 * span, now - span)) };
}

/* Le live reprend après une courte coupure (même identifiant Twitch) : on repart du relevé enregistré */
export function reopen(r) {
  const L = freshLive({ id: r.id, started_at: new Date(r.startedAt).toISOString(), title: r.title }, r.startedAt);
  Object.assign(L, { games: r.games, samples: r.samples, msgs: r.msgs, follows: r.follows, subs: r.subs, resubs: r.resubs, gifts: r.gifts, bits: r.bits, raids: r.raids, dons: r.dons, names: r.names || freshNames() });
  r.topChatters.forEach((c, i) => { L.chatters['top' + i] = [c.name, c.n]; });
  L.nChatters = Object.keys(L.chatters).length;
  return L;
}
