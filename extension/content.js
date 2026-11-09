/* StreamBox · Musiques des redifs
 * Sur une VOD Twitch ou une rediffusion de live YouTube, retrouve la musique qui passait à ce moment
 * du live (liste envoyée par l'overlay Musique de StreamBox au relais), et l'affiche sur le lecteur.
 * Mode synchro : joue le morceau (via YouTube) au bon moment, et suit la VOD (lecture, pause, avance, vitesse).
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
        .sy.on { background: #9b5cff; }
        .player { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 6px; }
        .player iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 8px; background: #000; }
        .player label { display: flex; align-items: center; gap: 8px; font-size: 12px; opacity: .85; }
        .player input { flex: 1; accent-color: #9b5cff; }
        .player small { opacity: .7; }
      </style>
      <div class="card" hidden>
        <div class="row"><img alt=""><div class="info"><div class="k">🎵 Pendant le live</div><div class="t"></div><div class="a"></div></div><button class="x" title="Réduire">–</button></div>
        <div class="links"><a class="sp" target="_blank" rel="noopener">Spotify</a><a class="dz" target="_blank" rel="noopener">Deezer</a><a class="yt" target="_blank" rel="noopener">YouTube Music</a><button class="ls">Liste</button><button class="sy" title="Joue la musique en même temps que la VOD">🔄 Synchro</button></div>
        <div class="player" hidden><iframe allow="autoplay; encrypted-media" title="Lecteur"></iframe><label>🔊 <input type="range" min="0" max="100" value="60"></label><small class="ps"></small></div>
        <div class="list" hidden></div>
      </div>`;
    document.documentElement.appendChild(host);
    const $ = (s) => root.querySelector(s);
    ui = { root, card: $('.card'), img: $('img'), t: $('.t'), a: $('.a'), sp: $('.sp'), dz: $('.dz'), yt: $('.yt'), list: $('.list'), info: $('.info'), links: $('.links'),
      sy: $('.sy'), player: $('.player'), frame: $('.player iframe'), vol: $('.player input'), ps: $('.ps') };
    ui.sy.onclick = () => setSync(!sync.on);
    ui.vol.oninput = () => { sync.vol = +ui.vol.value; send({ cmd: 'volume', v: sync.vol }); save(); };
    loadPrefs();
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

  /* ---------- Mode synchro ---------- */
  const sync = { on: false, vol: 60, ready: false, track: -1, ids: [], k: 0, state: { time: 0, state: -1, at: 0 }, queue: [] };
  function save() { try { api.storage.local.set({ sync: sync.on, vol: sync.vol }); } catch (e) { /* ignore */ } }
  function loadPrefs() { try { api.storage.local.get({ sync: false, vol: 60 }, (o) => { sync.vol = o.vol; ui.vol.value = o.vol; if (o.sync) setSync(true); }); } catch (e) { /* ignore */ } }
  function send(m) { if (!ui.frame.getAttribute('src')) return; if (!sync.ready) { sync.queue.push(m); return; } ui.frame.contentWindow.postMessage(m, '*'); }
  function setSync(on) {
    sync.on = on; save();
    ui.sy.classList.toggle('on', on); ui.player.hidden = !on;
    if (on && !ui.frame.getAttribute('src')) ui.frame.src = api.runtime.getURL('player.html');
    if (!on) { send({ cmd: 'stop' }); sync.track = -1; }
    tick(true);
  }
  addEventListener('message', (e) => {
    if (!ui || e.source !== ui.frame.contentWindow || !e.data || e.data.sbx !== 'player') return;
    const m = e.data;
    if (m.type === 'ready') { sync.ready = true; const q = sync.queue; sync.queue = []; q.forEach(send); }
    else if (m.type === 'state') sync.state = { time: m.time, state: m.state, at: Date.now() };
    else if (m.type === 'error' && m.id === sync.ids[sync.k]) next(); // vidéo non intégrable : résultat suivant
  });
  const ytId = (u) => { const m = String(u || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([\w-]{11})/); return m && m[1]; };
  function idsFor(t) {
    const direct = ytId(t.url);
    if (direct) return Promise.resolve([direct]);
    return new Promise((res) => { try { api.runtime.sendMessage({ type: 'yt-search', q: `${t.title} ${t.artist}` }, (r) => res((r && r.ids) || [])); } catch (e) { res([]); } });
  }
  function next() { sync.k++; if (sync.k < sync.ids.length) playTrack(); else { ui.ps.textContent = 'Morceau introuvable sur YouTube'; } }
  function playTrack() { // lance la vidéo du morceau en cours, à la bonne position
    const t = ctx.tracks[sync.track], v = video();
    const pos = v ? (ctx.start + v.currentTime * 1000 - t.at) / 1000 : 0;
    send({ cmd: 'load', id: sync.ids[sync.k], start: Math.max(0, pos), volume: sync.vol });
    if (v) send({ cmd: v.paused ? 'pause' : 'play' });
    ui.ps.textContent = '';
  }
  async function syncTick(i, abs, v) {
    if (!sync.on || !ctx) return;
    const t = ctx.tracks[i];
    const pos = t ? (abs - t.at) / 1000 : 0;
    const over = t && t.duration && pos * 1000 > t.duration + 2000; // le morceau est fini (silence jusqu'au suivant)
    if (!t || over) { if (sync.track !== -1) { send({ cmd: 'stop' }); sync.track = -1; } ui.ps.textContent = 'Pas de musique à ce moment de la VOD'; return; }
    if (sync.track !== i) { // nouveau morceau : on cherche sa vidéo, puis on la lance au bon endroit
      sync.track = i; sync.ids = []; sync.k = 0; ui.ps.textContent = 'Recherche du morceau…';
      const ids = await idsFor(t);
      if (sync.track !== i) return;
      sync.ids = ids;
      if (!ids.length) { ui.ps.textContent = 'Morceau introuvable sur YouTube'; return; }
      return playTrack();
    }
    if (!sync.ids.length) return;
    send({ cmd: v.paused ? 'pause' : 'play' });
    if (v.playbackRate !== sync.rate) { sync.rate = v.playbackRate; send({ cmd: 'rate', r: v.playbackRate }); }
    // dérive : on se recale si le lecteur s'écarte de plus de 2 s de la VOD
    const s = sync.state, now = s.state === 1 ? s.time + (Date.now() - s.at) / 1000 * (v.playbackRate || 1) : s.time;
    if (!v.paused && s.at && Math.abs(now - pos) > 2) { send({ cmd: 'seek', t: pos }); sync.state.at = 0; }
  }
  let shown = -2, hooked = null;
  function tick(force) {
    if (!ctx) return;
    const v = video();
    if (!v) return;
    if (hooked !== v) { hooked = v; ['play', 'pause', 'seeked', 'ratechange'].forEach((ev) => v.addEventListener(ev, () => tick(true))); } // la synchro suit la VOD tout de suite
    const abs = ctx.start + v.currentTime * 1000;
    let i = -1;
    for (let k = 0; k < ctx.tracks.length; k++) { if (ctx.tracks[k].at <= abs) i = k; else break; }
    // un morceau s'arrête au suivant, ou au plus tard 12 min après son début (pause musicale)
    if (i >= 0 && abs - ctx.tracks[i].at > 12 * 60000) i = -1;
    syncTick(i, abs, v);
    if (i === shown && force !== true) return;
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
    if (ui) { ui.card.hidden = true; if (sync.on) { send({ cmd: 'stop' }); sync.track = -1; } }
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
