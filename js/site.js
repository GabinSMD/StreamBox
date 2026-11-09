/* En-tête, pied de page et petits utilitaires communs aux pages du site. */
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [['index.html', 'Outils'], ['integrations.html', 'Intégrations', 'opt-link'], ['annuaire.html', 'Annuaire'], ['index.html#comment', 'Comment ça marche', 'opt-link']];
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = '<div class="wrap"><a class="logo" href="index.html"><i>▶</i>StreamBox</a><nav></nav></div>';
  const nav = header.querySelector('nav');
  links.forEach(([href, label, cls]) => {
    const a = document.createElement('a');
    a.href = href; a.textContent = label;
    a.className = [href === page ? 'on' : '', cls || ''].join(' ').trim();
    nav.appendChild(a);
  });
  // Compte : bouton « Se connecter » ou pseudo + « Mon compte »
  if (window.SBA && SBA.enabled()) {
    const acc = document.createElement('a');
    acc.className = 'btn small acc';
    if (SBA.loggedIn()) { acc.href = 'compte.html'; acc.textContent = '👤 ' + SBA.session().login; }
    else { acc.href = '#'; acc.textContent = 'Se connecter avec Twitch'; acc.onclick = (e) => { e.preventDefault(); SBA.login(); }; }
    nav.appendChild(acc);
  }
  document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.innerHTML = '<div class="wrap">StreamBox, des outils gratuits pour streamers, sans rien installer. ' +
    'Tout tourne dans ton navigateur ou dans OBS. Le compte est facultatif : on se connecte avec Twitch, sans mot de passe StreamBox. ' +
    'Annuaire basé sur <a href="https://github.com/sammwyy/awesome-twitch" target="_blank" rel="noopener">awesome-twitch</a>. ' +
    'StreamBox n’est pas affilié à Twitch.</div>';
  document.body.appendChild(footer);

  window.toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  };
})();
