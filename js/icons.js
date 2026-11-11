/* Icônes du site (Lucide, licence ISC, img/icons.svg) à la place des emojis de l'interface.
 * Les textes gardent leurs emojis dans le code (et dans les messages envoyés sur Twitch ou Discord) :
 * à l'affichage, chaque emoji connu devient une icône SVG. Le contenu (chat, saisies, data-i18n-skip) n'est pas touché. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const MAP = {"↗":"arrow-up-right","↩":"undo-2","↺":"rotate-ccw","↻":"rotate-cw","⏪":"rewind","⏭":"skip-forward","⏰":"alarm-clock","⏱":"timer","⏳":"hourglass","⏸":"pause","⏹":"square","▶":"play","☕":"coffee","♡":"heart","♥":"heart-filled","⚙":"settings","⚠":"triangle-alert","⚡":"zap","✅":"circle-check","✍":"pen-line","✏":"pencil","✓":"check","✕":"x","✨":"sparkles","❔":"circle-help","➕":"plus","⬆":"upload","⬇":"arrow-down","⭐":"star","🌐":"globe","🎁":"gift","🎉":"party-popper","🎙":"mic","🎛":"sliders-horizontal","🎞":"film","🎡":"ferris-wheel","🎥":"video","🎧":"headphones","🎨":"palette","🎬":"clapperboard","🎮":"gamepad-2","🎯":"target","🎲":"dices","🎵":"music","🎶":"list-music","🏁":"flag","🏆":"trophy","🏷":"tag","🐛":"bug","🐢":"snail","🐱":"cat","👁":"eye","👋":"hand","👤":"user","👥":"users","💎":"gem","💜":"heart","💡":"lightbulb","💬":"message-square","💰":"coins","💸":"banknote","🧑‍💻":"code","💾":"save","📅":"calendar","📊":"chart-column","📌":"pin","📋":"list-ordered","📣":"megaphone","📱":"qr-code","📸":"camera","📺":"tv","📼":"cassette-tape","🔁":"repeat","🔉":"volume-1","🔊":"volume-2","🔌":"plug","🔎":"search","🔒":"lock","🔔":"bell","🔢":"hash","🔨":"gavel","🔮":"sparkle","🔴":"radio","🔷":"radio-tower","🕘":"history","🖼":"image","🗑":"trash-2","🗡":"sword","🗣":"speech","😀":"smile","😂":"laugh","🚀":"rocket","🚂":"train-front","📥":"download","🚫":"ban","🛠":"wrench","🛡":"shield","🟢":"disc-3","🟣":"twitch","🤖":"bot","🤝":"handshake","🧠":"brain","🧩":"puzzle","🧪":"flask-conical","🧭":"compass","🧹":"message-square-x","🧽":"eraser","🪝":"webhook","⚔":"swords","🔗":"link","📷":"camera"};
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const RE = new RegExp('(' + Object.keys(MAP).sort((a, b) => b.length - a.length).map(esc).join('|') + ')\ufe0f? ?', 'gu');
  const SPRITE = (document.currentScript && document.currentScript.src.replace(/js\/icons\.js(\?.*)?$/, 'img/icons.svg')) || 'img/icons.svg';
  const NS = 'http://www.w3.org/2000/svg';
  SB.icon = function (name, cls) {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic ic-' + name + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', SPRITE + '#' + name); s.appendChild(u); return s;
  };
  SB.iconOf = (emoji) => MAP[String(emoji || '').replace(/️/g, '')] || null;
  const SKIP = 'script,style,textarea,title,svg,code,pre,[data-i18n-skip],[contenteditable],.no-ic';
  function fix(n) {
    const p = n.parentElement;
    if (!p || !n.nodeValue || p.closest(SKIP)) return;
    RE.lastIndex = 0; if (!RE.test(n.nodeValue)) return;
    if (p.closest('option,select')) { n.nodeValue = n.nodeValue.replace(RE, '').trim() || n.nodeValue; return; }
    const frag = document.createDocumentFragment(); let last = 0; const v = n.nodeValue;
    v.replace(RE, (all, e, i) => { if (i > last) frag.appendChild(document.createTextNode(v.slice(last, i))); frag.appendChild(SB.icon(MAP[e])); last = i + all.length; return all; });
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    n.replaceWith(frag);
    if (!p.textContent.trim()) p.querySelectorAll(':scope > svg.ic').forEach((i) => i.classList.add('ic-solo')); // bouton sans texte : pas de marge
  }
  function tree(root) {
    if (!root) return;
    if (root.nodeType === 3) return fix(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const list = []; let x;
    while ((x = w.nextNode())) list.push(x);
    list.forEach(fix);
  }
  function start() {
    tree(document.body);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(tree); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
