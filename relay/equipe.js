/* Équipe et page publique : logique pure (aucun appel réseau ici).
 *
 * 1. Actions déléguées aux modos : Twitch n'accepte les sondages, les prédictions et la file des récompenses
 *    de points de chaîne qu'avec le jeton du streamer. Si le streamer l'autorise, le relais fait ces actions
 *    pour ses modos (et seulement celles-là), après avoir vérifié auprès de Twitch qu'ils sont bien modos.
 * 2. Page publique de la chaîne : commandes du bot, planning, liens, file de musique, subathon.
 */

/* Actions Helix autorisées : [méthode, chemin, réservé au streamer ?] */
const ALLOWED = [
  ['GET', 'polls', false], ['POST', 'polls', false], ['PATCH', 'polls', false],
  ['GET', 'predictions', false], ['POST', 'predictions', false], ['PATCH', 'predictions', false],
  ['GET', 'channel_points/custom_rewards', false],
  ['GET', 'channel_points/custom_rewards/redemptions', false], ['PATCH', 'channel_points/custom_rewards/redemptions', false],
  // créer, modifier ou supprimer une récompense : le streamer seulement
  ['POST', 'channel_points/custom_rewards', true], ['PATCH', 'channel_points/custom_rewards', true], ['DELETE', 'channel_points/custom_rewards', true],
];
const PARAMS = /^(id|reward_id|status|sort|first|after|only_manageable_rewards)$/;

/* Vérifie et réécrit une action demandée : le broadcaster_id est toujours celui du streamer (jamais celui envoyé).
 * Renvoie { method, url, body } ou { error } */
export function teamRequest(req, ownerId, isOwner) {
  const method = String(req.method || 'GET').toUpperCase();
  const [path, query = ''] = String(req.path || '').split('?');
  const rule = ALLOWED.find(([m, p]) => m === method && p === path);
  if (!rule) return { error: 'action non autorisée' };
  if (rule[2] && !isOwner) return { error: 'seul le streamer peut créer, modifier ou supprimer une récompense' };
  const q = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(query)) {
    if (!PARAMS.test(k) || v.length > 100) return { error: 'paramètre non autorisé : ' + k };
    q.append(k, v);
  }
  if (q.getAll('id').length > 50) return { error: '50 éléments au plus' };
  let body = null;
  if (method !== 'GET' && method !== 'DELETE' && req.body != null) {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) return { error: 'contenu invalide' };
    const j = JSON.stringify(req.body);
    if (j.length > 4000) return { error: 'contenu trop long' };
    body = JSON.parse(j);
    if ('broadcaster_id' in body || path === 'polls' || path === 'predictions') body.broadcaster_id = ownerId;
  }
  // sondages et prédictions (création, fin) : le broadcaster_id va dans le corps ; sinon dans l'adresse
  if (!(body && (path === 'polls' || path === 'predictions'))) q.set('broadcaster_id', ownerId);
  return { method, url: 'https://api.twitch.tv/helix/' + path + (q.toString() ? '?' + q.toString() : ''), body };
}

/* ---------- Page publique ---------- */
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const httpUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString().slice(0, 300) : ''; } catch (e) { return ''; } };
export const DEFAULT_PAGE = { enabled: false, about: '', links: [], sections: { commands: true, responses: true, schedule: true, music: true, subathon: true }, site: '' };

export function sanitizePage(input, prev) {
  const c = input || {}, p = prev || DEFAULT_PAGE;
  const sec = Object.assign({}, DEFAULT_PAGE.sections, p.sections);
  for (const k of Object.keys(DEFAULT_PAGE.sections)) if (typeof (c.sections || {})[k] === 'boolean') sec[k] = c.sections[k];
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : !!p.enabled,
    about: str(c.about != null ? c.about : p.about, 600),
    links: (Array.isArray(c.links) ? c.links : p.links).slice(0, 12).map((l) => ({ label: str(l && l.label, 40).trim(), url: httpUrl(l && l.url) })).filter((l) => l.label && l.url),
    sections: sec,
    // adresse du site StreamBox (pour que !commandes renvoie vers la page) : https seulement
    site: c.site != null ? (/^https:\/\//.test(httpUrl(c.site)) ? httpUrl(c.site) : '') : p.site || '',
  };
}

/* Ce que voit le public : uniquement les commandes accessibles à tout le monde */
export function publicPage(page, bot, profile, extra) {
  const s = page.sections;
  const out = { login: profile.login, about: page.about, links: page.links, sections: Object.keys(s).filter((k) => s[k] && k !== 'responses') };
  if (s.commands && bot) {
    out.commands = bot.commands.filter((c) => c.enabled && c.level === 'everyone').map((c) => ({ name: c.name, aliases: c.aliases, response: s.responses ? c.response : '' }));
    const B = bot.builtins || {};
    out.builtins = [B.uptime && '!uptime', B.followage && '!followage', B.clip && '!clip', B.commandes && '!commandes'].filter(Boolean);
    out.botOn = !!bot.enabled;
  }
  return Object.assign(out, extra || {});
}

export function pageUrl(page, login) {
  if (!page || !page.enabled || !page.site) return '';
  return page.site.replace(/[^/]*$/, '') + 'chaine.html?c=' + encodeURIComponent(login);
}

/* Simulateur : faux événement nettoyé avant d'être envoyé aux overlays (texte borné, nombres plafonnés) */
const SIM_KINDS = ['follow', 'sub', 'resub', 'gift', 'raid', 'bits', 'don', 'points', 'hype', 'chat', 'first', 'ad', 'poll', 'pred', 'feature'];
export function simEvent(input) {
  const e = input && typeof input === 'object' ? input : {};
  if (!SIM_KINDS.includes(e.kind)) return null;
  const int = (v, min, max, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const name = /^[A-Za-z0-9_]{2,25}$/.test(String(e.name || '')) ? String(e.name) : 'Viewer_Test';
  const out = { kind: e.kind, name };
  if (e.kind === 'resub') out.months = int(e.months, 2, 120, 12);
  if (e.kind === 'gift') out.count = int(e.count, 1, 100, 5);
  if (e.kind === 'raid') out.viewers = int(e.viewers, 1, 100000, 42);
  if (e.kind === 'bits') out.bits = int(e.bits, 1, 100000, 500);
  if (e.kind === 'don') { out.amount = Math.min(10000, Math.max(0.5, Math.round((+e.amount || 5) * 100) / 100)); out.currency = /^[A-Z]{3}$/.test(e.currency) ? e.currency : 'EUR'; }
  if (e.kind === 'points') { out.reward = String(e.reward || 'Hydrate-toi').slice(0, 45); out.cost = int(e.cost, 1, 1000000, 500); }
  if (e.kind === 'hype') out.level = int(e.level, 1, 25, 2);
  if (e.kind === 'ad') out.duration = int(e.duration, 5, 180, 30);
  if (['resub', 'bits', 'don', 'points', 'chat', 'first', 'feature'].includes(e.kind)) out.message = String(e.message || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
  return out;
}

/* Message en vedette : un message du chat, nettoyé (texte borné, couleur et emotes vérifiées) */
export function featureMsg(input) {
  const m = input && typeof input === 'object' ? input : null;
  if (!m) return null;
  const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 500);
  const name = String(m.name || '').slice(0, 25);
  if (!text.trim() || !/^[\p{L}\p{N}_]{1,25}$/u.test(name)) return null;
  const emotes = (Array.isArray(m.emotes) ? m.emotes : []).slice(0, 80)
    .filter((e) => e && /^[\w-]{1,64}$/.test(String(e.id)) && Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end >= e.start && e.end < 500)
    .map((e) => ({ id: String(e.id), start: e.start, end: e.end }));
  return {
    name, login: String(m.login || name).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25), text, emotes,
    color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : null,
    isBroadcaster: !!m.isBroadcaster, isMod: !!m.isMod, isVip: !!m.isVip, isSub: !!m.isSub, action: !!m.action,
  };
}
