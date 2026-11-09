/* Cartes d'outils, communes à l'accueil (outils phares) et au catalogue complet (outils.html). */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const all = [...window.SB_TOOLS, ...window.SB_PAGES].filter((t) => !t.mergedInto);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hrefOf = (t) => t.href || 'outil.html?id=' + t.id;
  const icon = (emoji) => { const n = SB.iconOf ? SB.iconOf(emoji) : null; return n ? SB.icon(n) : el('span', null, emoji); };
  function card(t, opts) {
    const a = el('a', 'tool'); a.href = hrefOf(t);
    const ic = el('span', 'tool-ic'); ic.appendChild(icon(t.icon));
    a.append(ic, el('h3', null, t.name), el('p', null, t.tagline));
    if (t.links && !(opts && opts.short)) {
      const row = el('div', 'tool-links');
      t.links.forEach(([label, href]) => { const l = el('span', 'tool-link', label); l.onclick = (e) => { e.preventDefault(); location.href = href; }; row.appendChild(l); });
      a.appendChild(row);
    }
    if (t.replaces && t.replaces.length && !(opts && opts.short)) { const r = el('div', 'rep'); r.append('Remplace : '); r.appendChild(el('b', null, t.replaces.join(', '))); a.appendChild(r); }
    return a;
  }
  SB.catalogue = { all, card, icon, hrefOf, byId: (id) => all.find((t) => t.id === id) };
})();
