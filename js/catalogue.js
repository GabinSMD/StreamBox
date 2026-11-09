/* Cartes d'outils, communes à l'accueil (outils phares) et au catalogue complet (outils.html).
 * Chaque outil reçoit des métadonnées déduites du registre (js/tools.js) pour la recherche et les filtres :
 * type (overlay OBS, page web, extension), connexion Twitch nécessaire ou non, plateformes. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // Pages qui ont besoin d'un compte StreamBox (connexion Twitch)
  const ACCOUNT = ['bot', 'moderation', 'stats', 'subathon-live', 'sr', 'minijeux', 'automatisations', 'chaine', 'sous-titres'];
  // Plateformes : Twitch par défaut ; « toutes » pour ce qui ne dépend d'aucune plateforme
  const PLATFORMS = { chat: ['twitch', 'kick', 'youtube'], extension: ['twitch', 'youtube'], qrdons: ['toutes'], panneau: ['toutes'], 'sous-titres': ['toutes'], integrations: ['toutes'], annuaire: ['toutes'] };
  // Aperçus disponibles (img/apercus/<id>.jpg)
  const PREVIEWS = new Set('alertes annuaire automatisations bot calc chaine chat clips compteurs discord emotes etiquettes extension generique giveaway integrations minijeux minuteur moderation musique objectifs panneau pngtuber qrdons resizer rewind roue shoutout sondage sons sous-titres sr stats subathon-live testeur'.split(' '));
  const all = [...window.SB_TOOLS, ...window.SB_PAGES].filter((t) => !t.mergedInto).map((t) => {
    const f = t.fields || [];
    t.kind = t.overlay ? 'overlay' : t.id === 'extension' ? 'extension' : 'page';
    t.login = f.some((x) => x.type === 'twitch') || ACCOUNT.includes(t.id);
    t.platforms = PLATFORMS[t.id] || ['twitch'];
    return t;
  });
  const KIND = { overlay: 'Overlay OBS', page: 'Page web', extension: 'Extension' };
  const hrefOf = (t) => t.href || 'outil.html?id=' + t.id;
  const icon = (emoji) => { const n = SB.iconOf ? SB.iconOf(emoji) : null; return n ? SB.icon(n) : el('span', null, emoji); };
  function card(t, opts) {
    const a = el('a', 'tool'); a.href = hrefOf(t);
    if (PREVIEWS.has(t.id)) {
      const fig = el('span', 'tool-shot');
      const img = el('img'); img.src = 'img/apercus/' + t.id + '.jpg'; img.alt = ''; img.width = 640; img.height = 360; img.loading = 'lazy'; img.decoding = 'async';
      fig.appendChild(img); a.appendChild(fig);
    }
    const head = el('span', 'tool-head'); const ic = el('span', 'tool-ic'); ic.appendChild(icon(t.icon)); head.append(ic, el('h3', null, t.name));
    a.append(head, el('p', null, t.tagline));
    const meta = el('span', 'tool-meta');
    meta.append(el('span', 'tag-kind', KIND[t.kind]));
    if (t.login) meta.append(el('span', 'tag-login', 'Connexion Twitch'));
    if (t.platforms.includes('kick') || t.platforms.includes('youtube')) meta.append(el('span', null, 'Aussi ' + t.platforms.filter((p) => p !== 'twitch').map((p) => ({ kick: 'Kick', youtube: 'YouTube' })[p]).join(' et ')));
    if (t.platforms.includes('toutes')) meta.append(el('span', null, 'Toutes plateformes'));
    a.appendChild(meta);
    if (t.links && !(opts && opts.short)) {
      const row = el('span', 'tool-links');
      t.links.forEach(([label, href]) => { const l = el('span', 'tool-link', label); l.onclick = (e) => { e.preventDefault(); location.href = href; }; row.appendChild(l); });
      a.appendChild(row);
    }
    if (t.replaces && t.replaces.length && !(opts && opts.short)) { // une seule ligne, le détail au survol
      const r = el('span', 'rep', 'Remplace ' + t.replaces.join(', ')); r.title = t.replaces.join(', '); a.appendChild(r);
    }
    return a;
  }
  // Recherche plein texte (nom, description, outils remplacés), sans accents ni casse
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function match(t, { q, kind, login, platform }) {
    if (kind && t.kind !== kind) return false;
    if (login === 'oui' && !t.login) return false;
    if (login === 'non' && t.login) return false;
    if (platform && !(t.platforms.includes(platform) || t.platforms.includes('toutes'))) return false;
    if (q) { const hay = norm([t.name, t.tagline, (t.replaces || []).join(' '), KIND[t.kind]].join(' ')); return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w)); }
    return true;
  }
  SB.catalogue = { all, card, icon, hrefOf, match, KIND, byId: (id) => all.find((t) => t.id === id) };
})();
