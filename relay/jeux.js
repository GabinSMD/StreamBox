/* Mini-jeux du chat : points virtuels, duels, prédictions, quiz, pari, défis des viewers, classements du mois.
 * Logique pure : le Durable Object fournit `P` (points par viewer, stockage) et sauvegarde l'état `G`.
 * Points virtuels uniquement : aucune valeur réelle, rien à acheter ni à retirer.
 */

export const DEFAULT_GAMES = {
  enabled: false,
  currency: 'pépites',
  earn: 10,          // points par minute de participation au chat
  subBonus: 2,       // multiplicateur pour les abonnés
  start: 100,        // points offerts au premier message
  duel: true, duelTimeout: 60,
  pred: true, predSeconds: 120,
  quiz: true, quizPoints: 100, quizSeconds: 60,
  gamble: false, gambleWin: 45, gambleMax: 500,
  defis: true, defiCost: 100, defiGoal: 1000, // défis : !defi texte (coûte defiCost), !soutenir n mise ; atteint à defiGoal
};
export const DEFI_MAX = 10; // défis en cours (ouverts ou atteints) au plus

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizeGames(c, prev) {
  c = c || {}; const p = prev || DEFAULT_GAMES;
  return {
    enabled: bool(c.enabled, p.enabled), currency: str(c.currency != null ? c.currency : p.currency, 24).trim() || 'points',
    earn: num(c.earn, p.earn, 0, 1000), subBonus: num(c.subBonus, p.subBonus, 1, 10), start: num(c.start, p.start, 0, 100000),
    duel: bool(c.duel, p.duel), duelTimeout: num(c.duelTimeout, p.duelTimeout, 15, 600),
    pred: bool(c.pred, p.pred), predSeconds: num(c.predSeconds, p.predSeconds, 15, 3600),
    quiz: bool(c.quiz, p.quiz), quizPoints: num(c.quizPoints, p.quizPoints, 1, 100000), quizSeconds: num(c.quizSeconds, p.quizSeconds, 10, 3600),
    gamble: bool(c.gamble, p.gamble), gambleWin: num(c.gambleWin, p.gambleWin, 1, 99), gambleMax: num(c.gambleMax, p.gambleMax, 1, 1e7),
    defis: bool(c.defis, p.defis != null ? p.defis : DEFAULT_GAMES.defis), defiCost: num(c.defiCost, p.defiCost != null ? p.defiCost : DEFAULT_GAMES.defiCost, 0, 1e7),
    defiGoal: num(c.defiGoal, p.defiGoal != null ? p.defiGoal : DEFAULT_GAMES.defiGoal, 1, 1e8),
  };
}

export const freshGames = () => ({ duel: null, pred: null, quiz: null, events: [], defis: [], defiSeq: 0 });
export const month = (now) => new Date(now).toISOString().slice(0, 7); // « 2026-11 » : les classements du mois repartent de zéro
const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
function log(G, text, now) { G.events.unshift({ text: str(text, 200), t: now }); G.events = G.events.slice(0, 10); }
function amount(s, have) { const t = String(s || '').toLowerCase(); if (t === 'tout' || t === 'all') return have; const n = Math.floor(Number(t)); return Number.isFinite(n) && n > 0 ? n : 0; }

/* Gain de points en discutant (une fois par minute et par viewer) */
export async function earn(cfg, P, user, isSub, now) {
  const p = await P.get(user.id);
  if (!p.seen) { p.seen = now; p.n += cfg.start; }
  const mo = month(now);
  if (p.mo !== mo) { p.mo = mo; p.mm = 0; p.mt = 0; } // classements du mois : messages (mm) et minutes de présence (mt)
  p.mm = (p.mm || 0) + 1;
  if (now - (p.last || 0) >= 60000) { p.last = now; p.n += Math.round(cfg.earn * (isSub ? cfg.subBonus : 1)); p.mt = (p.mt || 0) + 1; }
  p.name = user.name; p.login = user.login;
  await P.put(user.id, p);
}

/* Commandes des jeux. Renvoie le message du bot (ou null), ou undefined si ce n'est pas une commande des jeux. */
export async function onChat(cfg, G, P, ev, level, now, api) {
  const text = ev.text.trim();
  const [w, ...rest] = text.split(/\s+/);
  const cmd = (w || '').toLowerCase();
  const C = cfg.currency, name = ev.name, me = { id: ev.userId, name };
  const isMod = level >= 3;

  // Quiz : la première bonne réponse gagne (n'importe quel message)
  if (G.quiz && G.quiz.open) {
    if (now > G.quiz.endsAt) { const a = G.quiz.answers[0]; G.quiz.open = false; log(G, `Quiz : personne n’a trouvé (« ${a} »)`, now); return `⏱ Temps écoulé ! La réponse était : ${a}`; }
    if (!text.startsWith('!') && G.quiz.answers.some((a) => norm(text) === norm(a))) {
      const p = await P.get(ev.userId); p.n += cfg.quizPoints; p.name = name; await P.put(ev.userId, p);
      G.quiz.open = false; G.quiz.winner = name;
      log(G, `🧠 ${name} a trouvé « ${G.quiz.answers[0]} » (+${fmt(cfg.quizPoints)} ${C})`, now);
      return `🧠 Bravo ${name} ! La réponse était « ${G.quiz.answers[0]} » : +${fmt(cfg.quizPoints)} ${C} 🎉`;
    }
  }
  if (!cmd.startsWith('!')) return undefined;
  const target = (rest[0] || '').replace(/^@/, '').toLowerCase();

  if (cmd === '!points' || cmd === '!' + norm(C).replace(/ /g, '')) {
    if (target && target !== ev.login) { const t = await P.findByName(target); return t ? `${t.name} a ${fmt(t.n)} ${C}.` : `${target} n’a pas encore de ${C}.`; }
    return `${name}, tu as ${fmt((await P.get(ev.userId)).n)} ${C}.`;
  }
  if (cmd === '!top') { const top = await P.top(5); return top.length ? '🏆 ' + top.map((x, i) => `${i + 1}. ${x.name} (${fmt(x.n)})`).join(' · ') : `Personne n’a encore de ${C}.`; }
  if (cmd === '!classement') { // classement du mois : messages ou présence (minutes passées à discuter)
    const k = /^(pr[ée]sence|temps|minutes?)$/i.test(rest[0] || '') ? 'presence' : 'messages';
    const top = await P.top(5, k);
    if (!top.length) return `Pas encore de classement ce mois-ci.`;
    return (k === 'presence' ? '⏱ Présence du mois : ' : '💬 Messages du mois : ') + top.map((x, i) => `${i + 1}. ${x.name} (${k === 'presence' ? fmtMin(x.n) : fmt(x.n)})`).join(' · ');
  }

  // Défis des viewers : !defi texte · !soutenir n mise · modos : !defi fait n / !defi non n
  if (cfg.defis && (cmd === '!defi' || cmd === '!défi' || cmd === '!defis' || cmd === '!défis' || cmd === '!soutenir')) return defiCmd(cfg, G, P, ev, cmd, rest, isMod, now);
  if (cmd === '!give' && isMod) {
    const n = Math.floor(Number(rest[1]));
    if (!target || !Number.isFinite(n) || !n) return `Utilisation : !give @pseudo 100 (ou -100)`;
    const t = await P.findByName(target);
    if (!t) return `${target} n’a encore jamais écrit dans le chat.`;
    t.n = Math.max(0, t.n + n); await P.put(t.id, t);
    return `${n > 0 ? '🎁' : '➖'} ${t.name} : ${n > 0 ? '+' : ''}${fmt(n)} ${C} (total ${fmt(t.n)}).`;
  }

  // Duel : !duel @pseudo 100 → !accept / !refuse
  if (cfg.duel && cmd === '!duel') {
    if (G.duel && now < G.duel.expires) return `Un duel est déjà en cours entre ${G.duel.from} et ${G.duel.to}.`;
    const stake = amount(rest[1], (await P.get(ev.userId)).n);
    if (!target || !stake) return `Utilisation : !duel @pseudo 100`;
    if (target === ev.login) return `${name}, tu ne peux pas te défier toi-même 😄`;
    const mine = await P.get(ev.userId);
    if (mine.n < stake) return `${name}, tu n’as que ${fmt(mine.n)} ${C}.`;
    const t = await P.findByName(target);
    if (!t || t.n < stake) return `${target} n’a pas assez de ${C} pour ce duel.`;
    G.duel = { fromId: ev.userId, from: name, toId: t.id, to: t.name, stake, expires: now + cfg.duelTimeout * 1000 };
    return `⚔️ ${name} défie ${t.name} pour ${fmt(stake)} ${C} ! ${t.name}, tape !accept ou !refuse (${cfg.duelTimeout} s).`;
  }
  if (cfg.duel && (cmd === '!accept' || cmd === '!refuse') && G.duel && G.duel.toId === ev.userId) {
    const d = G.duel; G.duel = null;
    if (now > d.expires) return `Trop tard, le duel a expiré.`;
    if (cmd === '!refuse') return `🏳️ ${d.to} refuse le duel de ${d.from}.`;
    const a = await P.get(d.fromId), b = await P.get(d.toId);
    if (a.n < d.stake || b.n < d.stake) return `Duel annulé : il n’y a plus assez de ${C}.`;
    const fromWins = rnd() < 0.5;
    const [win, lose] = fromWins ? [a, b] : [b, a];
    win.n += d.stake; lose.n -= d.stake;
    await P.put(d.fromId, a); await P.put(d.toId, b);
    const wn = fromWins ? d.from : d.to, ln = fromWins ? d.to : d.from;
    log(G, `⚔️ ${wn} bat ${ln} (${fmt(d.stake)} ${C})`, now);
    return `⚔️ ${wn} remporte le duel contre ${ln} et gagne ${fmt(d.stake)} ${C} !`;
  }

  // Pari : !gamble 50 (désactivé par défaut)
  if (cfg.gamble && cmd === '!gamble') {
    const p = await P.get(ev.userId);
    const bet = Math.min(amount(rest[0], p.n), cfg.gambleMax);
    if (!bet) return `Utilisation : !gamble 50 (maximum ${fmt(cfg.gambleMax)})`;
    if (p.n < bet) return `${name}, tu n’as que ${fmt(p.n)} ${C}.`;
    const won = rnd() * 100 < cfg.gambleWin;
    p.n += won ? bet : -bet; await P.put(ev.userId, p);
    return won ? `🎰 ${name} gagne ${fmt(bet)} ${C} ! (total ${fmt(p.n)})` : `🎰 ${name} perd ${fmt(bet)} ${C}… (total ${fmt(p.n)})`;
  }

  // Prédictions
  if (cfg.pred && cmd === '!pred' && isMod) {
    const args = rest.join(' ');
    const fin = args.match(/^(fin|end|gagnant)\s+(\d+)$/i);
    if (fin) return resolvePred(cfg, G, P, +fin[2] - 1, now);
    if (/^(annuler|cancel)$/i.test(args)) return cancelPred(cfg, G, P, now);
    if (/^(fermer|lock|stop)$/i.test(args)) { if (G.pred && G.pred.open) { G.pred.open = false; return '🔒 Paris fermés !'; } return null; }
    if (G.pred && !G.pred.resolved) return `Une prédiction est déjà en cours : termine-la avec !pred fin 1 ou !pred annuler.`;
    const parts = args.split('|').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 3) return `Utilisation : !pred Question ? | Choix 1 | Choix 2`;
    G.pred = { question: str(parts[0], 120), options: parts.slice(1, 6).map((l) => ({ label: str(l, 60), total: 0 })), bets: {}, open: true, endsAt: now + cfg.predSeconds * 1000, resolved: false };
    log(G, `🔮 Prédiction : ${G.pred.question}`, now);
    return `🔮 ${G.pred.question} ${G.pred.options.map((o, i) => `[${i + 1}] ${o.label}`).join(' · ')} → pariez avec !bet numéro mise (${cfg.predSeconds} s)`;
  }
  if (cfg.pred && cmd === '!bet') {
    const P_ = G.pred;
    if (!P_ || !P_.open) return null;
    if (now > P_.endsAt) { P_.open = false; return '🔒 Paris fermés !'; }
    const i = Math.floor(Number(rest[0])) - 1;
    const p = await P.get(ev.userId);
    const stake = amount(rest[1], p.n);
    if (!(i >= 0 && i < P_.options.length) || !stake) return `${name}, utilisation : !bet numéro mise`;
    const prev = P_.bets[ev.userId];
    if (prev && prev.option !== i) return `${name}, tu as déjà parié sur « ${P_.options[prev.option].label} ».`;
    if (p.n < stake) return `${name}, tu n’as que ${fmt(p.n)} ${C}.`;
    p.n -= stake; await P.put(ev.userId, p);
    P_.bets[ev.userId] = { option: i, stake: (prev ? prev.stake : 0) + stake, name };
    P_.options[i].total += stake;
    return null; // pas de message pour chaque pari (éviter le spam) : l'overlay affiche les mises
  }

  // Quiz : !quiz Question ? | réponse / autre réponse
  if (cfg.quiz && cmd === '!quiz' && isMod) {
    const [q, a] = rest.join(' ').split('|').map((x) => (x || '').trim());
    if (/^(stop|fin)$/i.test(q || '')) { if (G.quiz && G.quiz.open) { G.quiz.open = false; return `Quiz arrêté. La réponse était : ${G.quiz.answers[0]}`; } return null; }
    if (!q || !a) return `Utilisation : !quiz Question ? | réponse (plusieurs réponses : séparées par /)`;
    G.quiz = { question: str(q, 200), answers: a.split('/').map((x) => str(x.trim(), 80)).filter(Boolean), open: true, endsAt: now + cfg.quizSeconds * 1000, winner: null };
    return `🧠 QUIZ : ${G.quiz.question} (première bonne réponse : +${fmt(cfg.quizPoints)} ${C}, ${cfg.quizSeconds} s)`;
  }
  return undefined;
}

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
const liveDefis = (G) => (G.defis || []).filter((d) => d.status === 'ouvert' || d.status === 'atteint');
function tidyDefis(G, now) { // les défis terminés restent 30 min à l'écran, puis disparaissent
  G.defis = (G.defis || []).filter((d) => d.status === 'ouvert' || d.status === 'atteint' || now - (d.endedAt || 0) < 30 * 60000).slice(-20);
}
async function refundDefi(P, d) { for (const [id, n] of Object.entries(d.backers || {})) { const u = await P.get(id); u.n += n; await P.put(id, u); } }
async function defiCmd(cfg, G, P, ev, cmd, rest, isMod, now) {
  const C = cfg.currency, name = ev.name;
  G.defis = G.defis || []; tidyDefis(G, now);
  const find = (n) => G.defis.find((d) => d.n === Math.floor(Number(n)));
  const list = () => { const l = liveDefis(G).sort((a, b) => (b.status === 'atteint') - (a.status === 'atteint') || b.total - a.total).slice(0, 3);
    return l.length ? '🎯 Défis : ' + l.map((d) => `n°${d.n} « ${d.text} » ${d.status === 'atteint' ? '✅' : `${fmt(d.total)}/${fmt(d.goal)}`}`).join(' · ') + ` → !soutenir numéro mise` : `Aucun défi en cours : propose le tien avec !defi ton défi (${fmt(cfg.defiCost)} ${C}).`; };
  if (cmd === '!defis' || cmd === '!défis' || (cmd !== '!soutenir' && !rest.length)) return list();
  if (cmd === '!soutenir') {
    const d = find(rest[0]);
    const p = await P.get(ev.userId);
    const stake = amount(rest[1], p.n);
    if (!d || !stake) return `${name}, utilisation : !soutenir numéro mise (par exemple !soutenir 2 100)`;
    if (d.status !== 'ouvert') return d.status === 'atteint' ? `Le défi n°${d.n} est déjà atteint, merci !` : `Le défi n°${d.n} est terminé.`;
    const put = Math.min(stake, d.goal - d.total); // on ne prend pas plus que ce qu'il manque
    if (p.n < put) return `${name}, tu n’as que ${fmt(p.n)} ${C}.`;
    p.n -= put; await P.put(ev.userId, p);
    d.total += put; d.backers[ev.userId] = (d.backers[ev.userId] || 0) + put;
    if (d.total >= d.goal) { d.status = 'atteint'; d.reachedAt = now; log(G, `🎯 Défi atteint : ${d.text}`, now); return `🎯 Défi n°${d.n} atteint grâce à ${Object.keys(d.backers).length} viewer(s) : « ${d.text} » ! À toi de jouer 💪`; }
    return null; // pas de message à chaque mise : l'overlay montre la cagnotte
  }
  const action = (rest[0] || '').toLowerCase(), target = find(rest[1]);
  if (isMod && /^(fait|ok|valid[ée]|done)$/.test(action) && rest.length === 2) {
    if (!target || (target.status !== 'ouvert' && target.status !== 'atteint')) return 'Défi introuvable.';
    target.status = 'fait'; target.endedAt = now; log(G, `✅ Défi relevé : ${target.text}`, now);
    return `✅ Défi n°${target.n} relevé : « ${target.text} » ! Merci à ceux qui l’ont soutenu.`;
  }
  if (isMod && /^(non|refus[ée]?|refuser|retirer|annuler)$/.test(action) && rest.length === 2) {
    if (!target || (target.status !== 'ouvert' && target.status !== 'atteint')) return 'Défi introuvable.';
    await refundDefi(P, target); target.status = 'refusé'; target.endedAt = now; log(G, `❌ Défi refusé : ${target.text}`, now);
    return `❌ Défi n°${target.n} refusé : les mises sont rendues.`;
  }
  // proposition
  const text = str(rest.join(' ').replace(/\s+/g, ' ').trim(), 120);
  if (text.length < 3) return `${name}, utilisation : !defi ton défi (par exemple !defi joue sans HUD pendant 10 minutes)`;
  if (liveDefis(G).length >= DEFI_MAX) return `Il y a déjà ${DEFI_MAX} défis en cours : soutiens-en un avec !soutenir.`;
  if (!isMod && liveDefis(G).filter((d) => d.byId === String(ev.userId)).length >= 2) return `${name}, tu as déjà 2 défis en cours.`;
  const p = await P.get(ev.userId);
  if (!isMod && p.n < cfg.defiCost) return `${name}, proposer un défi coûte ${fmt(cfg.defiCost)} ${C} (tu en as ${fmt(p.n)}).`;
  const cost = isMod ? 0 : Math.min(cfg.defiCost, cfg.defiGoal);
  if (cost) { p.n -= cost; await P.put(ev.userId, p); }
  const d = { n: ++G.defiSeq, text, by: str(name, 30), byId: String(ev.userId), total: cost, goal: cfg.defiGoal, status: cost >= cfg.defiGoal ? 'atteint' : 'ouvert', backers: cost ? { [ev.userId]: cost } : {}, at: now };
  G.defis.push(d); log(G, `🎯 ${d.by} propose : ${text}`, now);
  return `🎯 Défi n°${d.n} proposé par ${d.by} : « ${text} » (${fmt(d.total)}/${fmt(d.goal)} ${C}). Soutenez-le avec !soutenir ${d.n} mise`;
}

export async function resolvePred(cfg, G, P, i, now) {
  const p = G.pred;
  if (!p || p.resolved) return 'Aucune prédiction en cours.';
  if (!(i >= 0 && i < p.options.length)) return `Choix invalide (1 à ${p.options.length}).`;
  const pool = p.options.reduce((s, o) => s + o.total, 0), win = p.options[i].total;
  const winners = Object.entries(p.bets).filter(([, b]) => b.option === i);
  for (const [id, b] of winners) { const u = await P.get(id); u.n += win ? Math.floor((b.stake / win) * pool) : 0; await P.put(id, u); }
  if (!winners.length) for (const [id, b] of Object.entries(p.bets)) { const u = await P.get(id); u.n += b.stake; await P.put(id, u); } // personne n'a gagné : on rembourse
  p.resolved = true; p.open = false; p.winner = i; p.resolvedAt = now;
  log(G, `🔮 « ${p.options[i].label} » l’emporte (${winners.length} gagnant${winners.length > 1 ? 's' : ''})`, now);
  return winners.length ? `🔮 Résultat : « ${p.options[i].label} » ! ${winners.length} gagnant(s) se partagent ${fmt(pool)} ${cfg.currency}.` : `🔮 Résultat : « ${p.options[i].label} ». Personne n’avait parié dessus : tout le monde est remboursé.`;
}
export async function cancelPred(cfg, G, P, now) {
  const p = G.pred;
  if (!p || p.resolved) return 'Aucune prédiction en cours.';
  for (const [id, b] of Object.entries(p.bets)) { const u = await P.get(id); u.n += b.stake; await P.put(id, u); }
  p.resolved = true; p.open = false; p.cancelled = true; p.resolvedAt = now;
  log(G, '🔮 Prédiction annulée, mises remboursées', now);
  return '🔮 Prédiction annulée : toutes les mises sont remboursées.';
}

/* Ce que voient l'overlay et le public (pas de réponses du quiz, pas d'identifiants) */
export function publicGames(cfg, G, top, now, ranks) {
  const p = G.pred;
  return {
    enabled: cfg.enabled, currency: cfg.currency, now,
    pred: p ? { question: p.question, open: p.open && now < p.endsAt, endsAt: p.endsAt, resolved: p.resolved, resolvedAt: p.resolvedAt || 0, winner: p.winner, cancelled: !!p.cancelled,
      options: p.options.map((o) => ({ label: o.label, total: o.total, bettors: Object.values(p.bets).filter((b) => p.options[b.option] === o).length })) } : null,
    quiz: G.quiz ? { question: G.quiz.question, open: G.quiz.open && now < G.quiz.endsAt, endsAt: G.quiz.endsAt, winner: G.quiz.winner, answer: G.quiz.open ? null : G.quiz.answers[0] } : null,
    duel: G.duel && now < G.duel.expires ? { from: G.duel.from, to: G.duel.to, stake: G.duel.stake } : null,
    events: G.events.slice(0, 6), top,
    defis: cfg.defis ? (G.defis || []).filter((d) => d.status === 'ouvert' || d.status === 'atteint' || now - (d.endedAt || 0) < 30 * 60000)
      .map((d) => ({ n: d.n, text: d.text, by: d.by, total: d.total, goal: d.goal, status: d.status, backers: Object.keys(d.backers || {}).length })) : [],
    ranks: ranks || null, month: month(now),
  };
}
