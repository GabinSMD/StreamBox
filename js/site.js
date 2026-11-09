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
    if (SBA.loggedIn()) { acc.href = 'compte.html'; acc.title = 'Mon compte'; label('👤 ' + SBA.session().login, '👤'); }
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
