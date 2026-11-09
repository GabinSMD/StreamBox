/* En-tête, pied de page et petits utilitaires communs aux pages du site. */
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [['index.html', 'Outils'], ['annuaire.html', 'Annuaire'], ['index.html#comment', 'Comment ça marche', 'opt-link']];
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
  document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.innerHTML = '<div class="wrap">StreamBox, des outils gratuits pour streamers, sans rien installer. ' +
    'Tout tourne dans ton navigateur ou dans OBS. Aucun compte et aucun mot de passe ne sont demandés. ' +
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
