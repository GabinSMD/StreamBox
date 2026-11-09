/* StreamBox · Musiques des redifs
 * Sur une VOD Twitch ou une rediffusion de live YouTube, retrouve la musique qui passait à ce moment
 * du live (liste envoyée par l'overlay Musique de StreamBox au relais), et l'affiche sur le lecteur.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  let relay = self.SBX_DEFAULT_RELAY || '';
  let ctx = null;          // { key, start, tracks[], video }
  let lastKey = null;
  let host, ui;

  const getRelay = () => new Promise((res) => {
    try { api.storage.sync.get({ relay: relay }, (o) => res((o && o.relay) || relay)); } catch (e) { res(relay); }
  });

  /* ---------- Où sommes-nous ? ---------- */
  function pageKey() {
    const u = new URL(location.href);
    if (u.hostname.endsWith('twitch.tv')) { const m = u.pathname.match(/^\/videos\/(\d+)/); return m && { kind: 'twitch', id: m[1] }; }
    if (u.hostname.endsWith('youtube.com') && u.pathname === '/watch' && u.searchParams.get('v')) return { kind: 'youtube', id: u.searchParams.get('v') };
    return null;
  }

  async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }

  async function load(key) {
    relay = await getRelay();
    if (!relay) return null;
    const base = relay.replace(/\/$/, '');
    let start, end, source;
    if (key.kind === 'twitch') {
      const v = await getJSON(`${base}/twitch/video/${key.id}`);
      const m = String(v.duration || '').match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
      start = v.start; end = start + (((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 || 12 * 3600000);
      source = `${base}/tracks/${encodeURIComponent(v.login)}`;
    } else {
      // La page de la vidéo contient la chaîne et l'heure de début du live (rediffusions uniquement)
      const html = await (await fetch('/watch?v=' + encodeURIComponent(key.id), { credentials: 'omit' })).text();
      const st = html.match(/"startTimestamp":"([^"]+)"/);
      const ch = html.match(/"channelId":"(UC[\w-]{20,})"/);
      if (!st || !ch) return null; // pas une rediffusion de live
      start = Date.parse(st[1]);
      const en = html.match(/"endTimestamp":"([^"]+)"/);
      end = en ? Date.parse(en[1]) : start + 12 * 3600000;
      source = `${base}/yt/${ch[1]}`;
    }
    const d = await getJSON(`${source}?from=${start}&to=${end}`);
    const tracks = (d.tracks || []).sort((a, b) => a.at - b.at);
    return tracks.length ? { start, end, tracks } : null;
  }

  /* ---------- Interface (Shadow DOM : n'abîme pas la page) ---------- */
  function buildUI() {
    host = document.createElement('div');
    host.id = 'streambox-musiques';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .card { position: fixed; z-index: 2147483000; left: 16px; bottom: 16px; max-width: 360px; font: 13px/1.4 system-ui, sans-serif; color: #fff;
          background: rgba(16, 12, 26, .94); border: 1px solid rgba(155, 92, 255, .5); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.45); overflow: hidden; }
        .row { display: flex; gap: 10px; align-items: center; padding: 10px 12px; }
        img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: linear-gradient(135deg, #9b5cff, #ff5ca8); flex: none; }
        .info { min-width: 0; flex: 1; }
        .k { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #b48cff; }
        .t { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .a { opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .links { display: flex; gap: 6px; padding: 0 12px 10px; flex-wrap: wrap; }
        a, button { font: 600 12px system-ui, sans-serif; color: #fff; background: rgba(255,255,255,.1); border: 0; border-radius: 99px; padding: 4px 10px; text-decoration: none; cursor: pointer; }
        a:hover, button:hover { background: rgba(155, 92, 255, .6); }
        .x { background: none; padding: 2px 6px; opacity: .7; align-self: flex-start; }
        .list { max-height: 260px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,.1); }
        .list div { display: flex; gap: 8px; padding: 6px 12px; cursor: pointer; }
        .list div:hover, .list .on { background: rgba(155, 92, 255, .25); }
        .list b { font-variant-numeric: tabular-nums; color: #b48cff; flex: none; width: 52px; }
        .list span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini { cursor: pointer; }
      </style>
      <div class="card" hidden>
        <div class="row"><img alt=""><div class="info"><div class="k">🎵 Pendant le live</div><div class="t"></div><div class="a"></div></div><button class="x" title="Réduire">–</button></div>
        <div class="links"><a class="sp" target="_blank" rel="noopener">Spotify</a><a class="dz" target="_blank" rel="noopener">Deezer</a><a class="yt" target="_blank" rel="noopener">YouTube Music</a><button class="ls">Liste</button></div>
        <div class="list" hidden></div>
      </div>`;
    document.documentElement.appendChild(host);
    const $ = (s) => root.querySelector(s);
    ui = { root, card: $('.card'), img: $('img'), t: $('.t'), a: $('.a'), sp: $('.sp'), dz: $('.dz'), yt: $('.yt'), list: $('.list'), info: $('.info'), links: $('.links') };
    $('.ls').onclick = () => { ui.list.hidden = !ui.list.hidden; };
    $('.x').onclick = () => { const mini = ui.links.hidden = !ui.links.hidden; ui.list.hidden = true; $('.x').textContent = mini ? '+' : '–'; };
  }

  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function fillList() {
    ui.list.replaceChildren(...ctx.tracks.map((t, i) => {
      const d = document.createElement('div');
      const b = document.createElement('b'); b.textContent = fmt(t.at - ctx.start);
      const s = document.createElement('span'); s.textContent = `${t.title} — ${t.artist}`;
      d.append(b, s); d.dataset.i = i;
      d.onclick = () => { const v = video(); if (v) v.currentTime = Math.max(0, (t.at - ctx.start) / 1000 + 1); };
      return d;
    }));
  }

  function video() { return document.querySelector('video'); }
  let shown = -2;
  function tick() {
    if (!ctx) return;
    const v = video();
    if (!v) return;
    const abs = ctx.start + v.currentTime * 1000;
    let i = -1;
    for (let k = 0; k < ctx.tracks.length; k++) { if (ctx.tracks[k].at <= abs) i = k; else break; }
    // un morceau s'arrête au suivant, ou au plus tard 12 min après son début (pause musicale)
    if (i >= 0 && abs - ctx.tracks[i].at > 12 * 60000) i = -1;
    if (i === shown) return;
    shown = i;
    ui.card.hidden = i < 0;
    [...ui.list.children].forEach((d) => d.classList.toggle('on', +d.dataset.i === i));
    if (i < 0) return;
    const t = ctx.tracks[i], q = encodeURIComponent(`${t.title} ${t.artist}`);
    ui.t.textContent = t.title; ui.a.textContent = t.artist;
    if (t.art) ui.img.src = t.art; else ui.img.removeAttribute('src'); // pas de pochette : dégradé
    ui.sp.href = t.url && t.url.includes('spotify.com') ? t.url : 'https://open.spotify.com/search/' + q;
    ui.dz.href = 'https://www.deezer.com/search/' + q;
    ui.yt.href = 'https://music.youtube.com/search?q=' + q;
  }

  async function check() {
    const key = pageKey();
    const k = key && key.kind + ':' + key.id;
    if (k === lastKey) return;
    lastKey = k; ctx = null; shown = -2;
    if (ui) ui.card.hidden = true;
    if (!key) return;
    try {
      const data = await load(key);
      if (lastKey !== k || !data) return;
      if (!ui) buildUI();
      ctx = data; fillList(); tick();
    } catch (e) { /* chaîne sans StreamBox ou relais injoignable : on ne montre rien */ }
  }

  setInterval(check, 1500); // Twitch et YouTube changent de page sans recharger
  setInterval(tick, 1000);
  check();
})();
