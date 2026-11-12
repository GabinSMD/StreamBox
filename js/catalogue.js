/* Cartes d'outils, communes à l'accueil (outils phares) et au catalogue complet (outils.html).
 * Chaque outil reçoit des métadonnées déduites du registre (js/tools.js) pour la recherche et les filtres :
 * type (overlay OBS, page web, extension), connexion Twitch nécessaire ou non, plateformes. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // Plateformes : Twitch par défaut ; « toutes » pour ce qui ne dépend d'aucune plateforme
  const PLATFORMS = { chat: ['twitch', 'kick', 'youtube'], extension: ['twitch', 'youtube'], qrdons: ['toutes'], panneau: ['toutes'], 'sous-titres': ['toutes'], integrations: ['toutes'], annuaire: ['toutes'] };
  // Aperçus disponibles (img/apercus/<id>.jpg)
  const PREVIEWS = new Set('alertes annuaire automatisations bot calc chaine chat clips compteurs discord emotes etiquettes extension generique giveaway integrations minijeux minuteur moderation musique objectifs panneau pngtuber qrdons resizer rewind roue shoutout sondage sons sous-titres sr stats subathon-live testeur tts planning hypetrain diagnostic vedette pubs votes score raid reseaux bienvenue webcam defis classement'.split(' '));
  const all = [...window.SB_TOOLS, ...window.SB_PAGES].filter((t) => !t.mergedInto).map((t) => {
    t.kind = t.overlay ? 'overlay' : t.id === 'extension' ? 'extension' : 'page';
    t.login = ['twitch', 'compte'].includes((t.need || [])[0]); // connexion vraiment nécessaire (pas « en option »)
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
    a.append(head, el('p', null, t.short || t.tagline)); // description courte ; le détail est dans la page de l'outil
    const meta = el('span', 'tool-meta');
    meta.append(el('span', 'tag-kind', KIND[t.kind]));
    if (t.need) { const n = el('span', 'tag-need tag-' + t.need[0], window.SB_NEED_SHORT[t.need[0]]); n.title = SB.t(t.need[1]); meta.append(n); } // badge court, le détail au survol et sur la fiche
    if (t.platforms.includes('kick') || t.platforms.includes('youtube')) meta.append(el('span', null, 'Aussi ' + t.platforms.filter((p) => p !== 'twitch').map((p) => ({ kick: 'Kick', youtube: 'YouTube' })[p]).join(' et ')));
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
    if (q) { const hay = norm([t.name, t.short, t.tagline, (t.replaces || []).join(' '), KIND[t.kind]].join(' ')); return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w)); }
    return true;
  }
  SB.catalogue = { all, card, icon, hrefOf, match, KIND, byId: (id) => all.find((t) => t.id === id) };
})();
