/* En-tête, pied de page et petits utilitaires communs aux pages du site. */
(function () {
  const REPO = 'https://github.com/GabinSMD/StreamBox';
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [['outils.html', 'Outils'], ['integrations.html', 'Intégrations', 'opt-link'], ['annuaire.html', 'Annuaire', 'opt-link'], ['apropos.html', 'À propos', 'opt-small']];
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = '<div class="wrap"><a class="logo" href="index.html"><i><svg class="ic" aria-hidden="true" focusable="false"><use href="img/icons.svg#play"/></svg></i>StreamBox</a><nav></nav></div>';
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
    else { acc.href = '#'; label('Se connecter avec Twitch', 'Connexion'); acc.onclick = (e) => { e.preventDefault(); SBA.login(); }; }
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

  /* ---------- Mon espace : barre latérale commune aux écrans du streamer ----------
   * Chaque écran garde sa page et son adresse ; ?dock=1 (dock OBS) masque la barre. */
  const ESPACE = [
    ['Pendant le live', [['panneau.html', 'Panneau de contrôle', 'sliders-horizontal'], ['moderation.html', 'Modération', 'shield'], ['sous-titres.html', 'Sous-titres', 'message-square']]],
    ['Mes réglages', [['compte.html', 'Mes overlays', 'layout-grid'], ['bot.html', 'Bot de chat', 'bot'], ['automatisations.html', 'Automatisations', 'zap'], ['subathon.html', 'Subathon', 'timer'], ['sr.html', 'Demandes de musique', 'list-music'], ['jeux.html', 'Mini-jeux', 'dices']]],
    ['Après le live', [['stats.html', 'Statistiques', 'chart-column']]],
    ['Mon compte', [['compte.html#integrations', 'Intégrations', 'plug'], ['compte.html#page', 'Page publique', 'globe'], ['compte.html#images', 'Images', 'image'], ['compte.html#compte', 'Compte', 'user']]],
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

  // Pied de page : crédits, licence (AGPL : lien vers le code source), pages légales
  const footer = document.createElement('footer');
  footer.innerHTML = `<div class="wrap foot">
    <div class="foot-main">
      <a class="logo" href="index.html"><i><svg class="ic" aria-hidden="true" focusable="false"><use href="img/icons.svg#play"/></svg></i>StreamBox</a>
      <p>Des outils gratuits pour streamers, sans rien installer. Fait par Igatax, inspiré par PiRDub.</p>
      <p class="foot-small">Logiciel libre sous licence <a href="${REPO}/blob/main/LICENSE" target="_blank" rel="noopener">AGPL-3.0</a>. Annuaire basé sur <a href="https://github.com/sammwyy/awesome-twitch" target="_blank" rel="noopener">awesome-twitch</a>. StreamBox n’est ni affilié à Twitch, ni approuvé par Twitch.</p>
    </div>
    <div class="foot-cols">
      <div><b>Projet</b><a href="apropos.html">À propos</a><a href="${REPO}" target="_blank" rel="noopener">Code source</a><a href="${REPO}/issues/new?template=suggestion.md" target="_blank" rel="noopener">Proposer une idée</a><a href="${REPO}/issues/new?template=bug.md" target="_blank" rel="noopener">Signaler un bug</a></div>
      <div><b>Légal</b><a href="legal.html#cgu">Conditions d’utilisation</a><a href="legal.html#confidentialite">Confidentialité</a><a href="legal.html#mentions">Mentions légales</a></div>
    </div>
  </div>`;
  document.body.appendChild(footer);

  window.toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  };
})();
