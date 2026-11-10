/* Panneau de modération en widgets : chaque bloc (chat, AutoMod, journal…) se place, se redimensionne,
 * se masque ou se range dans le widget « Onglets ». La disposition est gardée dans ce navigateur (une par modo).
 * Les blocs existants sont simplement déplacés dans la page : leur fonctionnement ne change pas. */
(function () {
  'use strict';
  const KEY = 'sb-mod-layout';
  const PANES = ['automod', 'journal', 'unban', 'modes', 'votes', 'points', 'livetab'];
  const NAMES = { chat: 'Chat', tabs: 'Onglets', automod: 'AutoMod', journal: 'Journal', unban: 'Débans', modes: 'Modes du chat et annonces', votes: 'Sondages et prédictions', points: 'Points de chaîne', livetab: 'Live et équipe' };
  const COUNT = { automod: 'nAutomod', unban: 'nUnban', points: 'nPoints' };
  const W = [[3, '¼'], [4, '⅓'], [6, '½'], [8, '⅔'], [12, 'Toute la largeur']];
  const H = [[1, 'Petit'], [2, 'Moyen'], [3, 'Grand']];
  const PRESETS = {
    onglets: { name: 'Chat et onglets', items: [['chat', 8, 3], ['tabs', 4, 3]], tabs: PANES },
    modo: { name: 'Modo', items: [['chat', 6, 3], ['automod', 3, 2], ['journal', 3, 2], ['tabs', 6, 1]], tabs: ['unban', 'modes', 'votes', 'points', 'livetab'] },
    streamer: { name: 'Streamer', items: [['chat', 6, 3], ['votes', 3, 2], ['livetab', 3, 2], ['tabs', 6, 1]], tabs: ['automod', 'journal', 'unban', 'modes', 'points'] },
    dock: { name: 'Dock OBS étroit', items: [['chat', 12, 2], ['tabs', 12, 2]], tabs: PANES },
  };
  const t = (s, v) => (window.SB && SB.t ? SB.t(s, v) : s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const $ = (id) => document.getElementById(id);
  let L = null, opts = {}, editing = false, tabsNav = null;
  const panes = {};
  const off = {}; // blocs indisponibles pour la chaîne choisie (droits)

  const fromPreset = (k) => { const p = PRESETS[k]; return { items: p.items.map(([id, w, h]) => ({ id, w, h })), tabs: p.tabs.slice(), preset: k }; };
  function valid(x) {
    if (!x || !Array.isArray(x.items) || !Array.isArray(x.tabs)) return null;
    const seen = new Set();
    const items = x.items.filter((i) => i && (i.id === 'chat' || i.id === 'tabs' || PANES.includes(i.id)) && !seen.has(i.id) && seen.add(i.id))
      .map((i) => ({ id: i.id, w: W.some(([v]) => v === i.w) ? i.w : 6, h: [1, 2, 3].includes(i.h) ? i.h : 2 }));
    const tabs = x.tabs.filter((id) => PANES.includes(id) && !seen.has(id) && seen.add(id));
    return items.length ? { items, tabs, preset: x.preset || null } : null;
  }
  const load = () => { try { return valid(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* stockage indisponible */ } };
  const defaultLayout = () => fromPreset(innerWidth < 760 || new URLSearchParams(location.search).has('dock') ? 'dock' : 'onglets');

  /* ---------- Construction ---------- */
  const widgets = {};
  function widget(id, content) {
    const w = el('section', 'wd'); w.dataset.id = id; w.id = 'wd-' + id; w.setAttribute('aria-label', t(NAMES[id]));
    const head = el('div', 'wd-h');
    const title = el('h2', 'wd-t', t(NAMES[id]));
    if (COUNT[id]) { const b = el('b', 'wd-n'); title.appendChild(b); const src = tabsNav.querySelector('#' + COUNT[id]); new MutationObserver(() => { b.textContent = src.textContent; }).observe(src, { childList: true, characterData: true, subtree: true }); }
    const tools = el('div', 'wd-tools');
    head.append(SB.grip(t(NAMES[id])), title, tools);
    const body = el('div', 'wd-b'); body.appendChild(content);
    w.append(head, body);
    widgets[id] = { w, tools, body };
    return w;
  }
  function select(label, list, value, on) {
    const s = el('select'); s.setAttribute('aria-label', label);
    list.forEach(([v, txt]) => { const o = el('option', null, t(txt)); o.value = v; s.appendChild(o); });
    s.value = String(value); s.onchange = () => on(+s.value); return s;
  }
  function toolsFor(item) {
    const { tools } = widgets[item.id];
    const iconBtn = (icon, label) => { const b = el('button', 'btn ghost small'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.appendChild(SB.icon(icon, 'ic-solo')); return b; };
    const hide = iconBtn('eye-off', t('Masquer {0}', [t(NAMES[item.id])]));
    hide.onclick = () => { L.items = L.items.filter((i) => i !== item); change(); };
    const kids = [select(t('Largeur de {0}', [t(NAMES[item.id])]), W, item.w, (v) => { item.w = v; change(); }), select(t('Hauteur de {0}', [t(NAMES[item.id])]), H, item.h, (v) => { item.h = v; change(); })];
    if (PANES.includes(item.id)) { const b = iconBtn('panel-top', t('Ranger {0} dans les onglets', [t(NAMES[item.id])])); b.onclick = () => { L.items = L.items.filter((i) => i !== item); L.tabs.push(item.id); ensureTabs(); change(); }; kids.push(b); }
    if (item.id !== 'chat') kids.push(hide);
    tools.replaceChildren(...kids);
  }
  function ensureTabs() { if (L.tabs.length && !L.items.some((i) => i.id === 'tabs')) L.items.push({ id: 'tabs', w: 4, h: 2 }); }

  /* Applique la disposition : ordre, tailles, onglets, blocs masqués */
  function apply() {
    const dash = $('mdDash');
    const shown = new Set(L.items.map((i) => i.id));
    // un bloc rangé dans les onglets va dans le widget « Onglets », un bloc seul dans son propre widget
    PANES.forEach((p) => {
      const pane = panes[p], btn = tabsNav.querySelector(`[data-t="${p}"]`);
      const inTabs = L.tabs.includes(p) && shown.has('tabs');
      if (shown.has(p)) { widgets[p].body.appendChild(pane); pane.hidden = false; }
      else if (inTabs) widgets.tabs.body.appendChild(pane);
      else { $('mdStore').appendChild(pane); pane.hidden = true; }
      btn.hidden = !inTabs || !!off[p];
    });
    // ordre des onglets
    L.tabs.forEach((p) => tabsNav.appendChild(tabsNav.querySelector(`[data-t="${p}"]`)));
    // widgets dans l'ordre choisi
    Object.keys(widgets).forEach((id) => { if (!shown.has(id)) $('mdStore').appendChild(widgets[id].w); });
    L.items.forEach((i) => {
      const w = widgets[i.id].w; w.style.setProperty('--w', i.w); w.style.setProperty('--h', i.h); dash.appendChild(w);
      w.hidden = !!off[i.id] || (i.id === 'tabs' && !L.tabs.some((p) => !off[p]));
      toolsFor(i);
    });
    // onglet actif : le premier disponible si le précédent n'est plus dans les onglets
    const cur = tabsNav.querySelector('button.on');
    if (!cur || cur.hidden) { const first = [...tabsNav.querySelectorAll('button')].find((b) => !b.hidden); if (first) first.click(); }
    else widgets.tabs.body.querySelectorAll('.md-pane').forEach((p) => { p.hidden = p.id !== 'p-' + cur.dataset.t; });
    renderBar();
  }
  function change() { L.preset = null; save(); apply(); loadStandalone(); }
  function loadStandalone() { L.items.forEach((i) => { if (PANES.includes(i.id) && !off[i.id] && opts.loaders && opts.loaders[i.id]) opts.loaders[i.id](); }); }

  /* ---------- Barre « Personnaliser » ---------- */
  function renderBar() {
    const bar = $('wdBar'); bar.hidden = !editing;
    document.body.classList.toggle('wd-edit', editing);
    $('wdEdit').setAttribute('aria-pressed', String(editing));
    $('wdEdit').lastChild.textContent = editing ? t('Terminer') : t('Personnaliser');
    if (!editing) return;
    const pre = el('select'); pre.setAttribute('aria-label', t('Disposition'));
    pre.appendChild(Object.assign(el('option', null, t('Disposition personnalisée')), { value: '' }));
    Object.entries(PRESETS).forEach(([k, p]) => { const o = el('option', null, t(p.name)); o.value = k; pre.appendChild(o); });
    pre.value = L.preset || ''; pre.onchange = () => { if (!pre.value) return; L = fromPreset(pre.value); save(); apply(); loadStandalone(); };
    const lab = el('label', 'wd-pre'); lab.append(t('Disposition'), ' ', pre);
    const hidden = [...['chat'], ...PANES].filter((id) => !L.items.some((i) => i.id === id) && !(L.tabs.includes(id) && L.items.some((i) => i.id === 'tabs')) && !off[id]);
    const add = el('div', 'wd-add');
    if (hidden.length) {
      add.appendChild(el('span', null, t('Masqués :')));
      hidden.forEach((id) => { const b = el('button', 'btn ghost small'); b.type = 'button'; b.append(SB.icon('plus'), t(NAMES[id])); b.onclick = () => { L.items.push({ id, w: id === 'chat' ? 6 : 4, h: 2 }); L.tabs = L.tabs.filter((x) => x !== id); change(); }; add.appendChild(b); });
    } else add.appendChild(el('span', null, t('Glisse un bloc par sa poignée pour le déplacer.')));
    const reset = el('button', 'btn ghost small', t('Réinitialiser')); reset.type = 'button';
    reset.onclick = () => { L = defaultLayout(); save(); apply(); loadStandalone(); };
    bar.replaceChildren(lab, add, reset);
  }

  window.MDW = {
    init(o) {
      opts = o || {};
      L = load() || defaultLayout();
      const grid = document.querySelector('.md-grid');
      const dash = el('div', 'md-dash'); dash.id = 'mdDash';
      const store = el('div'); store.id = 'mdStore'; store.hidden = true;
      // le chat et le widget Onglets reprennent les blocs existants
      const chat = document.querySelector('.md-chat'); chat.classList.remove('box');
      tabsNav = $('tabs'); const tabsBox = el('div', 'wd-tabs'); tabsBox.appendChild(tabsNav);
      widget('chat', chat); widget('tabs', tabsBox);
      PANES.forEach((p) => { const pane = panes[p] = $('p-' + p); pane.classList.remove('box'); widget(p, el('div')); widgets[p].body.replaceChildren(); widgets[p].body.appendChild(pane); });
      grid.replaceWith(dash); dash.after(store);
      SB.sortable(dash, { items: '.wd', handle: '.sb-grip', onEnd: (els) => { const order = els.map((w) => w.dataset.id); L.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); L.preset = null; save(); renderBar(); } });
      $('wdEdit').onclick = () => { editing = !editing; renderBar(); };
      apply();
    },
    /* Droits pour la chaîne choisie : un bloc indisponible est caché (et son onglet aussi) */
    setOff(id, isOff) { off[id] = !!isOff; },
    refresh() { apply(); loadStandalone(); },
    shown: (id) => !off[id] && (L.items.some((i) => i.id === id) || (L.tabs.includes(id) && L.items.some((i) => i.id === 'tabs'))),
    standalone: (id) => L.items.some((i) => i.id === id),
  };
})();
