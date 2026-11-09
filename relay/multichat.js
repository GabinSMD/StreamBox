/* Chat multiplateforme : Kick et YouTube, en plus de Twitch.
 *
 * Kick : l'overlay se connecte directement au chat public de Kick (Pusher). Le relais sert seulement à trouver
 *   l'identifiant du salon à partir du pseudo (l'API de Kick refuse les appels venant d'un navigateur).
 * YouTube : pas de quota de l'API officielle suffisant pour un live entier ; le relais lit le chat public
 *   du live comme la fenêtre « chat en pop-up » de YouTube, et l'overlay le relit toutes les quelques secondes.
 *   Aucun compte ni jeton n'est utilisé : seulement des données publiques.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const YT_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' }; // évite la page de consentement (UE)
export const KICK_SLUG = /^[a-z0-9_-]{2,40}$/i;
export const YT_VIDEO = /^[\w-]{11}$/;
export const YT_CHANNEL = /^(@[\w.\-]{2,40}|UC[\w-]{22})$/;
const CONT = /^[\w%=-]{20,3000}$/;

/* ---------- Kick ---------- */
export async function kickChannel(slug) {
  const r = await fetch('https://kick.com/api/v2/channels/' + encodeURIComponent(slug.toLowerCase()), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (r.status === 404) return { error: 'chaîne Kick introuvable', status: 404 };
  if (!r.ok) return { error: `Kick a refusé la recherche (${r.status}) : indique l’identifiant du salon à la main`, status: 502 };
  const d = await r.json().catch(() => null);
  if (!d || !d.chatroom || !d.chatroom.id) return { error: 'réponse de Kick inattendue : indique l’identifiant du salon à la main', status: 502 };
  return { chatroom: d.chatroom.id, channelId: d.id, name: (d.user && d.user.username) || slug, live: !!d.livestream };
}

/* ---------- YouTube : trouver le live en cours d'une chaîne ---------- */
export async function ytLive(channel) {
  const base = channel.startsWith('@') ? 'https://www.youtube.com/' + channel : 'https://www.youtube.com/channel/' + channel;
  const r = await fetch(base + '/live', { headers: YT_HEADERS, redirect: 'follow' });
  if (!r.ok) return { error: `YouTube ne répond pas (${r.status})`, status: 502 };
  return parseLivePage(await r.text());
}
export function parseLivePage(html) {
  const canon = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  const live = /"isLiveNow":\s*true/.test(html) || /"isLive":\s*true/.test(html);
  if (!canon) return { live: false };
  return { video: canon[1], live };
}

/* ---------- YouTube : lire le chat ---------- */
function extractJson(html, name) {
  const i = html.indexOf(name);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, j + 1)); } catch (e) { return null; } }
  }
  return null;
}
function nextCont(conts) {
  for (const c of conts || []) {
    const d = c.invalidationContinuationData || c.timedContinuationData || c.reloadContinuationData || c.liveChatReplayContinuationData;
    if (d && d.continuation) return { next: d.continuation, wait: Math.max(1500, Math.min(10000, d.timeoutMs || 3000)) };
  }
  return { next: null, wait: 5000 };
}
const runs = (r) => (r && r.runs) || (r && r.simpleText ? [{ text: r.simpleText }] : []);
export function ytParts(message) {
  return runs(message).map((x) => {
    if (x.text != null) return { text: String(x.text).slice(0, 500) };
    if (x.emoji) {
      const th = (x.emoji.image && x.emoji.image.thumbnails) || [];
      const alt = (x.emoji.shortcuts && x.emoji.shortcuts[0]) || (x.emoji.image && x.emoji.image.accessibility && x.emoji.image.accessibility.accessibilityData && x.emoji.image.accessibility.accessibilityData.label) || x.emoji.emojiId || '';
      // les émojis Unicode s'affichent en texte ; les émojis de la chaîne (membres) en image
      if (!x.emoji.isCustomEmoji && x.emoji.emojiId && !/^UC/.test(x.emoji.emojiId)) return { text: x.emoji.emojiId };
      const url = th.length ? th[th.length - 1].url : '';
      return /^https:\/\//.test(url) ? { img: url, alt: String(alt).slice(0, 60) } : { text: String(alt) };
    }
    return { text: '' };
  }).filter((p) => p.text !== '' || p.img);
}
export function ytItem(item) {
  const k = Object.keys(item || {})[0], r = item && item[k];
  if (!r || !r.id) return null;
  const kind = { liveChatTextMessageRenderer: 'message', liveChatPaidMessageRenderer: 'superchat', liveChatPaidStickerRenderer: 'sticker', liveChatMembershipItemRenderer: 'membre' }[k];
  if (!kind) return null;
  const badges = (r.authorBadges || []).map((b) => b.liveChatAuthorBadgeRenderer || {});
  const icon = (t) => badges.some((b) => b.icon && b.icon.iconType === t);
  const parts = ytParts(r.message || (kind === 'membre' ? r.headerSubtext : null));
  const name = (r.authorName && r.authorName.simpleText) || '?';
  return {
    platform: 'youtube', id: 'yt-' + r.id, kind, name: name.replace(/^@/, ''), login: name.replace(/^@/, '').toLowerCase(), userId: r.authorExternalChannelId || '',
    parts, text: parts.map((p) => (p.text != null ? p.text : p.alt)).join(''),
    ts: Math.round((+r.timestampUsec || Date.now() * 1000) / 1000),
    isBroadcaster: icon('OWNER'), isMod: icon('OWNER') || icon('MODERATOR'), isVip: false, isSub: badges.some((b) => b.customThumbnail), verified: icon('VERIFIED'),
    amount: r.purchaseAmountText ? r.purchaseAmountText.simpleText : '',
  };
}
export function ytActions(actions) {
  const messages = [], deleted = [];
  for (const a of actions || []) {
    const add = a.addChatItemAction || (a.replayChatItemAction && a.replayChatItemAction.actions && a.replayChatItemAction.actions[0] && a.replayChatItemAction.actions[0].addChatItemAction);
    if (add) { const m = ytItem(add.item); if (m) messages.push(m); }
    if (a.markChatItemAsDeletedAction) deleted.push('yt-' + a.markChatItemAsDeletedAction.targetItemId);
    if (a.markChatItemsByAuthorAsDeletedAction) deleted.push('author:' + a.markChatItemsByAuthorAsDeletedAction.externalChannelId);
  }
  return { messages, deleted };
}
/* Premier appel : page du chat (contient la suite à demander et la version du client web) */
export function parseChatPage(html) {
  const data = extractJson(html, 'ytInitialData');
  const lc = data && data.contents && data.contents.liveChatRenderer;
  if (!lc) return { error: 'pas de chat en direct pour cette vidéo (live terminé ou chat désactivé)' };
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([\d.]+)"/) || [])[1] || '2.20241101.00.00';
  const { next, wait } = nextCont(lc.continuations);
  return Object.assign({ next: next && ver + '.' + next, wait }, ytActions(lc.actions));
}
export function parseChatResponse(d, ver) {
  const lc = d && d.continuationContents && d.continuationContents.liveChatContinuation;
  if (!lc) return { error: 'le chat est terminé', ended: true };
  const { next, wait } = nextCont(lc.continuations);
  return Object.assign({ next: next && ver + '.' + next, wait }, ytActions(lc.actions));
}
export async function ytChat(video, cont) {
  if (!cont) {
    const r = await fetch(`https://www.youtube.com/live_chat?is_popout=1&v=${video}`, { headers: YT_HEADERS });
    if (!r.ok) return { error: `YouTube ne répond pas (${r.status})`, status: 502 };
    const out = parseChatPage(await r.text());
    out.messages = []; // l'historique n'est pas réaffiché à chaque ouverture de l'overlay
    return out;
  }
  // « suite » = version du client + continuation YouTube (le relais ne garde rien entre deux appels)
  const m = String(cont).match(/^(\d+\.\d+\.\d+\.\d+)\.(.+)$/);
  if (!m || !CONT.test(m[2])) return { error: 'suite invalide', status: 400 };
  const r = await fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, YT_HEADERS),
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: m[1], hl: 'fr' } }, continuation: m[2] }),
  });
  if (!r.ok) return { error: `YouTube ne répond pas (${r.status})`, status: 502 };
  return parseChatResponse(await r.json().catch(() => null), m[1]);
}
