/* En-tête, pied de page et petits utilitaires communs aux pages du site. */
(function () {
  const REPO = 'https://github.com/GabinSMD/StreamBox';
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [['outils.html', 'Outils'], ['integrations.html', 'Intégrations', 'opt-link'], ['annuaire.html', 'Annuaire', 'opt-link'], ['apropos.html', 'À propos', 'opt-small']];
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = '<div class="wrap"><a class="logo" href="index.html"><img class="logo-mark" src="img/logo.svg" alt="" width="24" height="28">StreamBox</a><nav></nav></div>';
  const nav = header.querySelector('nav');
  links.forEach(([href, label, cls]) => {
    const a = document.createElement('a');
    a.href = href; a.textContent = label;
    a.className = [href === page || (href === 'outils.html' && page === 'outil.html') ? 'on' : '', cls || ''].join(' ').trim();
    nav.appendChild(a);
  });
  // Compte : bouton « Se connecter » ou pseudo + « Mon compte »
  if (window.SBA && SBA.enabled()) {
    const acc = document.createElement('a');
    acc.className = 'btn small acc';
    const label = (long, short) => { const l = document.createElement('span'); l.className = 'acc-long'; l.textContent = long; const sh = document.createElement('span'); sh.className = 'acc-short'; sh.textContent = short; acc.append(l, sh); };
    if (SBA.loggedIn()) { acc.href = 'compte.html'; acc.title = 'Mon espace'; label('👤 ' + SBA.session().login, '👤'); }
    else { acc.href = '#'; acc.classList.add('acc-login'); label('🟣 Connexion Twitch', '🟣 Connexion'); acc.onclick = (e) => { e.preventDefault(); SBA.login(); }; }
    nav.appendChild(acc);
  }
  // Langue du site (français, anglais, espagnol) : mémorisée, et envoyée au relais pour les réponses du bot
  if (window.SB && SB.LANGS) {
    const sel = document.createElement('select');
    sel.className = 'lang-sel'; sel.setAttribute('aria-label', 'Langue'); sel.title = 'Langue';
    Object.keys(SB.LANGS).forEach((l) => { const o = document.createElement('option'); o.value = l; o.textContent = l.toUpperCase(); o.title = SB.LANGS[l]; sel.appendChild(o); });
    sel.value = SB.lang();
    sel.onchange = async () => {
      try { localStorage.setItem('sb-lang', sel.value); } catch (e) { /* ignore */ }
      if (window.SBA && SBA.enabled() && SBA.loggedIn()) await SBA.api('PUT', '/me/lang', { lang: sel.value }).catch(() => {});
      const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.toString());
    };
    nav.appendChild(sel);
  }
  document.body.prepend(header);
  // Lien d'évitement : au clavier, Tab puis Entrée saute directement au contenu
  const mainEl = document.querySelector('main');
  if (mainEl) {
    if (!mainEl.id) mainEl.id = 'contenu';
    mainEl.tabIndex = -1;
    const skip = document.createElement('a'); skip.className = 'skip'; skip.href = '#' + mainEl.id; skip.textContent = 'Aller au contenu';
    document.body.prepend(skip);
  }

  /* ---------- Mon espace : barre latérale commune aux écrans du streamer ----------
   * Chaque écran garde sa page et son adresse ; ?dock=1 (dock OBS) masque la barre. */
  const ESPACE = [
    ['Pendant le live', [['panneau.html', 'Panneau de contrôle', 'sliders-horizontal'], ['moderation.html', 'Modération', 'shield'], ['sous-titres.html', 'Sous-titres', 'message-square']]],
    ['Mes réglages', [['compte.html', 'Mes overlays', 'layout-grid'], ['bot.html', 'Bot de chat', 'bot'], ['automatisations.html', 'Automatisations', 'zap'], ['subathon.html', 'Subathon', 'timer'], ['sr.html', 'Demandes de musique', 'list-music'], ['jeux.html', 'Mini-jeux', 'dices']]],
    ['Après le live', [['raid.html', 'Trouver un raid', 'rocket'], ['stats.html', 'Statistiques', 'chart-column']]],
    ['Mon compte', [['compte.html#integrations', 'Intégrations', 'plug'], ['compte.html#page', 'Page publique', 'globe'], ['compte.html#images', 'Images', 'image'], ['compte.html#compte', 'Compte', 'user'], ['diagnostic.html', 'Vérifier mon installation', 'circle-check']]],
  ];
  const main = document.querySelector('main');
  const inEspace = ESPACE.some(([, items]) => items.some(([h]) => h.split('#')[0] === page));
  if (main && inEspace && !new URLSearchParams(location.search).has('dock')) {
    const shell = document.createElement('div'); shell.className = 'esp';
    const nav2 = document.createElement('nav'); nav2.className = 'esp-nav'; nav2.setAttribute('aria-label', 'Mon espace');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'esp-toggle'; toggle.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div'); list.className = 'esp-list'; list.id = 'espList'; toggle.setAttribute('aria-controls', 'espList');
    const links = [];
    ESPACE.forEach(([group, items]) => {
      const h = document.createElement('p'); h.className = 'esp-h'; h.textContent = group; list.appendChild(h);
      items.forEach(([href, label, icon]) => {
        const a = document.createElement('a'); a.href = href; a.dataset.href = href;
        if (window.SB && SB.icon) a.appendChild(SB.icon(icon));
        a.append(label); list.appendChild(a); links.push(a);
      });
    });
    const mark = () => {
      const here = page === 'compte.html' && location.hash && location.hash !== '#overlays' ? 'compte.html' + location.hash : page;
      let cur = null;
      links.forEach((a) => { const on = a.dataset.href === here; if (on) { a.setAttribute('aria-current', 'page'); cur = a; } else a.removeAttribute('aria-current'); });
      toggle.replaceChildren(document.createTextNode(cur ? cur.textContent : 'Mon espace'));
      nav2.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.onclick = () => { const o = nav2.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(o)); };
    nav2.append(toggle, list);
    main.before(shell); shell.append(nav2, main);
    document.body.classList.add('has-esp');
    mark(); addEventListener('hashchange', mark);
  }

  /* ---------- Squelette de chargement ----------
   * Les pages qui attendent le relais ou Twitch cachent leur contenu (#app, ou #in/#out pour Mon compte) :
   * un squelette en a la forme jusqu'à ce que le contenu, une erreur ou une demande de connexion s'affiche. */
  const wait = main && (main.querySelector(':scope > #app[hidden]') || (main.querySelector(':scope > #in[hidden]') && main.querySelector(':scope > #out[hidden]')));
  if (wait) {
    const sk = document.createElement('div'); sk.className = 'skel-page'; sk.setAttribute('aria-busy', 'true'); sk.setAttribute('aria-label', 'Chargement');
    ['skel skel-title', 'skel skel-line', 'skel skel-block', 'skel skel-block'].forEach((c) => { const d = document.createElement('div'); d.className = c; sk.appendChild(d); });
    wait.before(sk);
    const shown = () => [...main.children].some((c) => c !== sk && c.id && !c.hidden && c.offsetParent !== null);
    const stop = () => { obs.disconnect(); sk.remove(); };
    const obs = new MutationObserver(() => { if (shown()) stop(); });
    obs.observe(main, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
    setTimeout(stop, 15000);
  }

  // Pied de page : crédits, licence (AGPL : lien vers le code source), pages légales
  const footer = document.createElement('footer');
  footer.innerHTML = `<div class="wrap foot">
    <div class="foot-main">
      <a class="logo" href="index.html"><img class="logo-mark" src="img/logo.svg" alt="" width="24" height="28">StreamBox</a>
      <p>Des outils gratuits pour streamers, sans rien installer. Fait par Igatax, inspiré par PiRDub.</p>
      <p class="foot-small">Logiciel libre sous licence <a href="${REPO}/blob/main/LICENSE" target="_blank" rel="noopener">AGPL-3.0</a>. Annuaire basé sur <a href="https://github.com/sammwyy/awesome-twitch" target="_blank" rel="noopener">awesome-twitch</a>. StreamBox n’est ni affilié à Twitch, ni approuvé par Twitch.</p>
    </div>
    <div class="foot-cols">
      <div><b>Outils</b><a href="outils.html">Tous les outils</a><a href="integrations.html">Intégrations</a><a href="annuaire.html">Annuaire</a><a href="compte.html">Mon espace</a></div>
      <div><b>Projet</b><a href="apropos.html">À propos</a><a href="${REPO}" target="_blank" rel="noopener">Code source</a><a href="${REPO}/issues/new?template=suggestion.md" target="_blank" rel="noopener">Proposer une idée</a><a href="${REPO}/issues/new?template=bug.md" target="_blank" rel="noopener">Signaler un bug</a></div>
      <div><b>Légal</b><a href="legal.html#cgu">Conditions d’utilisation</a><a href="legal.html#confidentialite">Confidentialité</a><a href="legal.html#mentions">Mentions légales</a></div>
    </div>
  </div>`;
  document.body.appendChild(footer);

  /* Bouton occupé : le bouton cliqué est désactivé pendant l'action (pas de double envoi), puis réactivé */
  let lastBtn = null, lastAt = 0;
  document.addEventListener('click', (e) => { lastBtn = e.target.closest && e.target.closest('button'); lastAt = Date.now(); }, true);
  window.busy = async function (fn) {
    const b = Date.now() - lastAt < 800 ? lastBtn : null;
    if (b) { if (b.getAttribute('aria-busy') === 'true') return undefined; b.setAttribute('aria-busy', 'true'); b.disabled = true; }
    try { return await fn(); } finally { if (b) { b.disabled = false; b.removeAttribute('aria-busy'); } }
  };

  /* Ligne d'informations : chaque morceau dans son élément, séparés par un espace (pas de « A · B · C ») */
  window.SB = window.SB || {};
  SB.meta = function (...parts) {
    const s = document.createElement('small'); s.className = 'meta';
    parts.filter((p) => p != null && p !== false && p !== '').forEach((p) => { const x = document.createElement('span'); if (p instanceof Node) x.appendChild(p); else x.textContent = p; s.appendChild(x); });
    return s;
  };

  /* ---------- Glisser-déposer pour réordonner ----------
   * SB.sortable(conteneur, { items: '.ligne', handle: '.poignee', onEnd(éléments) })
   * À la souris et au doigt (on attrape la poignée), et au clavier : poignée sélectionnée, puis flèches.
   * L'élément reste dans la page pendant le déplacement : la liste se réorganise en direct. */
  window.SB = window.SB || {};
  SB.sortable = function (box, opt) {
    const items = () => [...box.children].filter((x) => x.matches(opt.items) && !x.hidden);
    const done = (el) => { if (opt.onEnd) opt.onEnd(items(), el); };
    let drag = null;
    box.addEventListener('pointerdown', (e) => {
      const h = e.target.closest(opt.handle); if (!h || !box.contains(h) || e.button > 0) return;
      const el = h.closest(opt.items); if (!el || el.parentElement !== box) return;
      e.preventDefault(); drag = { el, id: e.pointerId, moved: false, vy: 0, x: e.clientX, y: e.clientY };
      // défilement automatique près du haut ou du bas de l'écran, pour les longues listes
      const loop = () => { if (!drag) return; if (drag.vy) { scrollBy(0, drag.vy); place(drag.x, drag.y); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      h.setPointerCapture(e.pointerId); el.classList.add('sb-dragging'); try { getSelection().removeAllRanges(); } catch (err) { /* ignore */ } document.body.classList.add('sb-drag-on');
    });
    const place = (x, y) => {
      const over = document.elementsFromPoint(x, y).map((x) => x.closest && x.closest(opt.items)).find((x) => x && x !== drag.el && x.parentElement === box);
      if (!over || over === drag.last) { if (!over) drag.last = null; return; } // pas d'aller-retour tant qu'on reste sur le même élément
      // l'élément survolé passe de l'autre côté : avant lui si on remonte, après lui si on descend (marche aussi pour les blocs très hauts)
      const before = drag.el.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_PRECEDING;
      const ref = before ? over : over.nextSibling;
      if (ref !== drag.el && ref !== drag.el.nextSibling) { box.insertBefore(drag.el, ref); drag.moved = true; drag.last = over; }
    };
    box.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.x = e.clientX; drag.y = e.clientY;
      const edge = 70; drag.vy = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 6) : e.clientY > innerHeight - edge ? Math.ceil((e.clientY - innerHeight + edge) / 6) : 0;
      place(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const { el, moved } = drag; drag = null;
      el.classList.remove('sb-dragging'); document.body.classList.remove('sb-drag-on');
      if (moved) done(el);
    };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('keydown', (e) => {
      const h = e.target.closest(opt.handle); if (!h || !box.contains(h)) return;
      const el = h.closest(opt.items); const list = items(); const i = list.indexOf(el);
      if (i < 0) return;
      let j = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = i - 1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = i + 1;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = list.length - 1;
      if (j == null || j < 0 || j >= list.length || j === i) return;
      e.preventDefault();
      box.insertBefore(el, j > i ? list[j].nextSibling : list[j]);
      h.focus(); done(el);
      if (window.toast) toast(SB.t ? SB.t('Déplacé en position {0} sur {1}', [j + 1, list.length]) : 'Déplacé');
    });
  };
  /* Menu « ⋯ » : actions secondaires d'une ligne. items = [[libellé, fonction, 'danger'?], …] */
  SB.menu = function (label, items) {
    const d = document.createElement('details'); d.className = 'sb-menu';
    const sm = document.createElement('summary'); sm.className = 'btn ghost small'; sm.setAttribute('aria-label', label); sm.title = label;
    sm.appendChild(SB.icon ? SB.icon('ellipsis', 'ic-solo') : document.createTextNode('⋯'));
    const list = document.createElement('div'); list.className = 'sb-menu-list'; list.setAttribute('role', 'menu');
    items.forEach(([text, fn, cls]) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = text; if (cls) b.className = cls;
      b.onclick = () => { d.open = false; fn(); }; list.appendChild(b);
    });
    d.append(sm, list);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { d.open = false; sm.focus(); } });
    d.addEventListener('toggle', () => { if (d.open) { document.querySelectorAll('details.sb-menu[open]').forEach((x) => x !== d && (x.open = false)); const f = list.querySelector('button'); if (f) f.focus(); } });
    return d;
  };
  document.addEventListener('click', (e) => { document.querySelectorAll('details.sb-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });

  /* Poignée de déplacement accessible (bouton : glisser, ou flèches du clavier) */
  SB.grip = function (label) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sb-grip';
    b.setAttribute('aria-label', (SB.t ? SB.t('Déplacer : {0}', [label]) : 'Déplacer : ' + label));
    b.title = SB.t ? SB.t('Glisser pour déplacer (ou flèches du clavier)') : 'Glisser pour déplacer (ou flèches du clavier)';
    if (SB.icon) b.appendChild(SB.icon('grip-vertical')); else b.textContent = '⋮⋮';
    return b;
  };

  window.toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  };
})();
