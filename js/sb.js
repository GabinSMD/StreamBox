/* StreamBox — noyau partagé par tous les overlays.
 * - Lecture des paramètres d'URL
 * - Client chat Twitch anonyme (IRC over WebSocket, aucun token requis)
 * - Emotes Twitch + 7TV + BTTV + FFZ
 * - Générateur de faux messages pour le mode démo
 * Script classique (pas de module ES) pour fonctionner aussi en file:// dans OBS.
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  /* ---------- Lien court d'un compte StreamBox (?o=…) ----------
   * Les réglages et les jetons sont lus sur le relais avant que l'overlay démarre (requête synchrone,
   * le temps d'une fraction de seconde), puis l'overlay se recharge tout seul quand le streamer
   * modifie ses réglages sur le site. Le lien collé dans OBS ne contient donc aucun jeton. */
  const urlQ = new URLSearchParams(location.search);
  let cfgQ = null;
  const ovId = urlQ.get('o');
  const relay = ((urlQ.get('relay') || (window.SB_CONFIG && window.SB_CONFIG.relayUrl) || '') + '').replace(/\/$/, '');
  if (ovId && /^[a-z0-9]{20,48}$/.test(ovId) && relay) {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', relay + '/o/' + ovId, false);
      x.send();
      if (x.status === 200) {
        const d = JSON.parse(x.responseText);
        cfgQ = new URLSearchParams();
        Object.entries(d.params || {}).forEach(([k, v]) => cfgQ.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)));
      } else SB._cfgError = x.status === 404 ? 'Ce lien d’overlay n’existe plus (supprimé ou régénéré).' : 'Relais StreamBox indisponible (' + x.status + ').';
    } catch (e) { SB._cfgError = 'Relais StreamBox injoignable.'; }
    if (SB._cfgError) setTimeout(() => location.reload(), 15000);
    else {
      let retry = 0;
      const live = () => {
        const ws = new WebSocket(relay.replace(/^http/, 'ws') + '/o/' + ovId + '/ws');
        ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.type === 'update' || m.type === 'deleted') location.reload(); else if (m.type === 'sim' && SB.simulate) SB.simulate(m.ev); } catch (err) { /* ignore */ } };
        ws.onopen = () => { retry = 0; };
        ws.onclose = () => setTimeout(live, Math.min(60000, 3000 * 2 ** retry++));
      };
      live();
    }
  }
  /* Paramètres effectifs : ceux du compte, puis ceux de l'URL (qui ont le dernier mot) */
  SB.query = function () {
    const q = new URLSearchParams(cfgQ || '');
    urlQ.forEach((v, k) => { if (k !== 'o') q.set(k, v); });
    return q;
  };

  /* ---------- Paramètres ---------- */
  SB.params = function (defaults) {
    const q = SB.query();
    const out = {};
    if (SB.setLang && q.get('lang')) SB.setLang(q.get('lang')); // langue de l'overlay (réglage « lang »)
    for (const [k, v] of Object.entries(defaults)) {
      if (!q.has(k)) { out[k] = typeof v === 'string' && SB.t ? SB.t(v) : v; continue; } // textes par défaut dans la langue choisie
      const raw = q.get(k);
      if (typeof v === 'number') { const n = parseFloat(raw); out[k] = isNaN(n) ? v : n; }
      else if (typeof v === 'boolean') out[k] = raw === '1' || raw === 'true';
      else out[k] = raw;
    }
    return out;
  };

  SB.loadFont = function (name) {
    if (!name) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400;600;700;800&display=swap';
    document.head.appendChild(l);
    document.documentElement.style.setProperty('--font', `'${name}', system-ui, sans-serif`);
  };

  SB.setAccent = function (color) {
    if (color) document.documentElement.style.setProperty('--accent', color.startsWith('#') ? color : '#' + color);
  };

  SB.random = function () { // aléatoire cryptographique [0,1)
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
  };

  SB.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /* ---------- Parsing IRC ---------- */
  function unescapeTag(v) {
    return v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] ?? c));
  }

  function parseLine(line) {
    const m = { tags: {}, prefix: '', command: '', params: [] };
    if (line[0] === '@') {
      const sp = line.indexOf(' ');
      line.slice(1, sp).split(';').forEach((kv) => {
        const e = kv.indexOf('=');
        m.tags[e < 0 ? kv : kv.slice(0, e)] = e < 0 ? '' : unescapeTag(kv.slice(e + 1));
      });
      line = line.slice(sp + 1);
    }
    if (line[0] === ':') {
      const sp = line.indexOf(' ');
      m.prefix = line.slice(1, sp);
      line = line.slice(sp + 1);
    }
    let trailing = null;
    const ti = line.indexOf(' :');
    if (ti >= 0) { trailing = line.slice(ti + 2); line = line.slice(0, ti); }
    const parts = line.split(' ').filter(Boolean);
    m.command = parts.shift() || '';
    m.params = parts;
    if (trailing !== null) m.params.push(trailing);
    return m;
  }
  SB._parseLine = parseLine;

  function parseBadges(s) {
    const b = {};
    (s || '').split(',').filter(Boolean).forEach((x) => { const [k, v] = x.split('/'); b[k] = v || '1'; });
    return b;
  }

  function parseEmotePositions(s) {
    const out = [];
    (s || '').split('/').filter(Boolean).forEach((part) => {
      const [id, ranges] = part.split(':');
      (ranges || '').split(',').forEach((r) => {
        const [a, b] = r.split('-').map(Number);
        if (!isNaN(a) && !isNaN(b)) out.push({ id, start: a, end: b });
      });
    });
    return out.sort((x, y) => x.start - y.start);
  }

  function buildUser(t, login) {
    const badges = parseBadges(t.badges);
    return {
      login: (t.login || login || '').toLowerCase(),
      name: t['display-name'] || t.login || login,
      color: t.color || null,
      userId: t['user-id'],
      badges,
      isBroadcaster: !!badges.broadcaster,
      isMod: !!badges.broadcaster || !!badges.moderator || t.mod === '1',
      isVip: !!badges.vip,
      isSub: !!(badges.subscriber || badges.founder) || t.subscriber === '1',
    };
  }

  function toMessage(m) {
    const t = m.tags;
    let text = m.params[1] || '';
    let action = false;
    const am = text.match(/^\u0001ACTION (.*)\u0001$/);
    if (am) { text = am[1]; action = true; }
    return Object.assign(buildUser(t, m.prefix.split('!')[0]), {
      id: t.id, text, action,
      emotes: parseEmotePositions(t.emotes),
      bits: parseInt(t.bits, 10) || 0,
      ts: parseInt(t['tmi-sent-ts'], 10) || Date.now(),
      first: t['first-msg'] === '1', // tout premier message sur cette chaîne
    });
  }

  function toNotice(m) {
    const t = m.tags;
    const p = (k) => t['msg-param-' + k];
    return Object.assign(buildUser(t, t.login), {
      type: t['msg-id'],
      text: m.params[1] || '',
      emotes: parseEmotePositions(t.emotes),
      systemMsg: t['system-msg'] || '',
      months: parseInt(p('cumulative-months') || p('months'), 10) || 0,
      plan: p('sub-plan') || '',
      recipient: p('recipient-display-name') || p('recipient-user-name') || '',
      giftCount: parseInt(p('mass-gift-count'), 10) || 0,
      viewers: parseInt(p('viewerCount'), 10) || 0,
      isCommunityGift: !!p('community-gift-id'),
    });
  }

  /* ---------- Simulateur (page « Vérifier mon installation ») ----------
   * Chaque source d'événements de l'overlay (chat, EventSub, dons) s'inscrit ici ; un faux événement envoyé
   * par le relais y est injecté, exactement comme un vrai : l'overlay réagit comme en live. */
  SB.sources = (kind) => { SB._src = SB._src || { chat: [], events: [], dons: [] }; return SB._src[kind]; };
  SB.simulate = function (ev) {
    if (!ev || !ev.kind) return;
    const login = String(ev.name || 'viewer_test').toLowerCase(), user = { login: ev.name || 'Viewer_Test', color: '#9b5cff', sub: true };
    const notice = (type, extra) => Object.assign(SB.fake({ user, text: ev.message || '' }), { type, months: 1, giftCount: 0, viewers: 0, recipient: '', isCommunityGift: false, systemMsg: '' }, extra);
    const chat = SB.sources('chat'), events = SB.sources('events'), dons = SB.sources('dons');
    switch (ev.kind) {
      case 'chat': chat.forEach((c) => c.inject(SB.fake({ user, text: ev.message || 'Message de test' }))); break;
      case 'bits': chat.forEach((c) => c.inject(SB.fake({ user, text: ('Cheer' + ev.bits + ' ' + (ev.message || '')).trim(), bits: ev.bits }))); break;
      case 'sub': chat.forEach((c) => c.emit('usernotice', notice('sub', { plan: '1000' }))); break;
      case 'resub': chat.forEach((c) => c.emit('usernotice', notice('resub', { months: ev.months, plan: '1000' }))); break;
      case 'gift': chat.forEach((c) => c.emit('usernotice', notice('submysterygift', { giftCount: ev.count, plan: '1000' }))); break;
      case 'raid': chat.forEach((c) => c.emit('usernotice', notice('raid', { viewers: ev.viewers }))); break;
      case 'follow': events.forEach((e) => e.emit('follow', { login, name: ev.name })); break;
      case 'points': events.forEach((e) => e.emit('points', { login, name: ev.name, reward: ev.reward, cost: ev.cost, input: ev.message || '' })); break;
      case 'don': dons.forEach((d) => d.don({ id: 'sim-' + Date.now(), source: 'Test', name: ev.name, amount: ev.amount, currency: ev.currency, message: ev.message || '' })); break;
      case 'hype': { // un petit Hype Train : départ, montée d'un niveau, fin
        const id = 'sim-' + Date.now(), lvl = ev.level || 2, exp = () => new Date(Date.now() + 5 * 60000).toISOString();
        const tops = [{ user_name: ev.name, user_login: login, type: 'bits', total: 500 }];
        const base = { id, type: 'regular', goal: 1800, top_contributions: tops, all_time_high_level: lvl + 1 };
        events.forEach((e) => e.emit('hypeBegin', Object.assign({}, base, { level: lvl, progress: 400, total: 400, expires_at: exp() })));
        setTimeout(() => events.forEach((e) => e.emit('hypeProgress', Object.assign({}, base, { level: lvl, progress: 1300, total: 1300, expires_at: exp() }))), 3000);
        setTimeout(() => events.forEach((e) => e.emit('hypeProgress', Object.assign({}, base, { level: lvl + 1, progress: 200, total: 2000, expires_at: exp() }))), 6000);
        setTimeout(() => events.forEach((e) => e.emit('hypeEnd', Object.assign({}, base, { level: lvl + 1, total: 2000, ended_at: new Date().toISOString() }))), 10000);
        break;
      }
    }
  };

  /* ---------- Client chat ---------- */
  SB.TwitchChat = class {
    constructor(channel) {
      SB.sources('chat').push(this);
      this.channel = (channel || '').toLowerCase().replace(/^#/, '').trim();
      this.handlers = {};
      this.roomId = null;
      this.retry = 0;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, data) { (this.handlers[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); }
    connect() {
      if (!this.channel) return this;
      const ws = (this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'));
      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000));
        ws.send('JOIN #' + this.channel);
      };
      ws.onmessage = (e) => String(e.data).split('\r\n').filter(Boolean).forEach((l) => this._handle(parseLine(l)));
      ws.onclose = () => {
        this.emit('status', 'disconnected');
        if (this.stopped) return;
        const delay = Math.min(30000, 1000 * 2 ** this.retry++);
        setTimeout(() => this.connect(), delay);
      };
      return this;
    }
    _handle(m) {
      switch (m.command) {
        case 'PING': this.ws.send('PONG :' + (m.params[0] || 'tmi.twitch.tv')); break;
        case 'JOIN': this.retry = 0; this.emit('status', 'connected'); break;
        case 'ROOMSTATE':
          if (m.tags['room-id'] && m.tags['room-id'] !== this.roomId) { this.roomId = m.tags['room-id']; this.emit('room', this.roomId); }
          break;
        case 'PRIVMSG': {
          const msg = toMessage(m);
          this.emit('message', msg);
          if (msg.bits) this.emit('cheer', msg);
          break;
        }
        case 'USERNOTICE': this.emit('usernotice', toNotice(m)); break;
        case 'CLEARCHAT': this.emit('clearchat', { login: m.params[1] || null }); break;
        case 'CLEARMSG': this.emit('clearmsg', m.tags['target-msg-id']); break;
        case 'RECONNECT': this.ws.close(); break;
      }
    }
    stop() { this.stopped = true; if (this.ws) this.ws.close(); }
    /* Injecte un faux message (mode démo) */
    inject(msg) { this.emit('message', msg); if (msg.bits) this.emit('cheer', msg); }
  };

  /* ---------- Emotes ---------- */
  SB.twitchEmoteUrl = (id, scale) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${scale || '2.0'}`;
  const fixUrl = (u) => (u && u.startsWith('//') ? 'https:' + u : u);

  SB.EmoteStore = class {
    constructor() { this.map = new Map(); }
    get(name) { return this.map.get(name); }
    add(name, url, big) { if (name && url) this.map.set(name, { url, big: big || url }); }
    async load(roomId, opts) {
      const o = Object.assign({ seventv: true, bttv: true, ffz: true }, opts);
      const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const t = [];
      if (o.ffz) {
        t.push(j('https://api.frankerfacez.com/v1/set/global').then((d) => d && this._ffz(d, d.default_sets)));
        if (roomId) t.push(j(`https://api.frankerfacez.com/v1/room/id/${roomId}`).then((d) => d && this._ffz(d)));
      }
      if (o.bttv) {
        t.push(j('https://api.betterttv.net/3/cached/emotes/global').then((d) => Array.isArray(d) && d.forEach((e) => this._bttv(e))));
        if (roomId) t.push(j(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`).then((d) => d && [...(d.channelEmotes || []), ...(d.sharedEmotes || [])].forEach((e) => this._bttv(e))));
      }
      if (o.seventv) {
        t.push(j('https://7tv.io/v3/emote-sets/global').then((d) => d && (d.emotes || []).forEach((e) => this._7tv(e))));
        if (roomId) t.push(j(`https://7tv.io/v3/users/twitch/${roomId}`).then((d) => d && d.emote_set && (d.emote_set.emotes || []).forEach((e) => this._7tv(e))));
      }
      await Promise.all(t);
      return this;
    }
    _ffz(d, only) {
      const sets = d.sets || {};
      Object.keys(sets).forEach((id) => {
        if (only && !only.includes(+id)) return;
        (sets[id].emoticons || []).forEach((e) => {
          const u = e.animated || e.urls || {};
          this.add(e.name, fixUrl(u['2'] || u['1']), fixUrl(u['4'] || u['2'] || u['1']));
        });
      });
    }
    _bttv(e) { this.add(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, `https://cdn.betterttv.net/emote/${e.id}/3x`); }
    _7tv(e) {
      const host = e.data && e.data.host;
      if (!host) return;
      const base = fixUrl(host.url);
      this.add(e.name, base + '/2x.webp', base + '/4x.webp');
    }
  };

  /* Découpe un message en nœuds DOM (texte + <img> d'emotes), sans innerHTML. */
  SB.messageNodes = function (msg, store) {
    const chars = Array.from(msg.text || '');
    const nodes = [];
    let pending = '';
    const flush = () => { if (pending) { nodes.push(document.createTextNode(pending)); pending = ''; } };
    const img = (url, alt) => {
      flush();
      const i = document.createElement('img');
      i.className = 'emote'; i.src = url; i.alt = alt; i.title = alt;
      nodes.push(i);
    };
    const pushText = (s) => s.split(/(\s+)/).forEach((tok) => {
      const e = store && tok && store.get(tok);
      if (e) img(e.url, tok); else pending += tok;
    });
    if (msg.parts) { // Kick, YouTube : morceaux déjà découpés (texte et images)
      msg.parts.forEach((p) => { if (p.img) img(p.img, p.alt || ''); else pushText(p.text || ''); });
      flush();
      return nodes;
    }
    let cur = 0;
    (msg.emotes || []).forEach((e) => {
      if (e.start < cur) return;
      pushText(chars.slice(cur, e.start).join(''));
      img(SB.twitchEmoteUrl(e.id), chars.slice(e.start, e.end + 1).join(''));
      cur = e.end + 1;
    });
    pushText(chars.slice(cur).join(''));
    flush();
    return nodes;
  };

  /* Liste des emotes présentes dans un message (grande taille). */
  SB.extractEmotes = function (msg, store) {
    const chars = Array.from(msg.text || '');
    const out = [];
    const taken = new Set();
    (msg.emotes || []).forEach((e) => {
      for (let i = e.start; i <= e.end; i++) taken.add(i);
      out.push({ name: chars.slice(e.start, e.end + 1).join(''), url: SB.twitchEmoteUrl(e.id, '3.0') });
    });
    let idx = 0;
    (msg.text || '').split(' ').forEach((w) => {
      const len = Array.from(w).length;
      if (!taken.has(idx) && store) { const e = store.get(w); if (e) out.push({ name: w, url: e.big }); }
      idx += len + 1;
    });
    return out;
  };

  /* Reconnaît une commande : renvoie les arguments (string) ou null. */
  SB.command = function (msg, names) {
    const text = (msg.text || '').trim();
    const lower = text.toLowerCase();
    for (const n of [].concat(names)) {
      const c = String(n).toLowerCase().trim();
      if (!c) continue;
      if (lower === c) return '';
      if (lower.startsWith(c + ' ')) return text.slice(c.length + 1).trim();
    }
    return null;
  };

  /* Couleur de pseudo lisible sur fond sombre */
  const PALETTE = ['#ff7a7a', '#7ab8ff', '#7dff9b', '#ffb86b', '#d58bff', '#6bf0ff', '#ff8fd0', '#f5e36b', '#9fa8ff', '#8cffd1'];
  SB.nameColor = function (msg) {
    let c = msg.color;
    if (!c) {
      let h = 0; for (const ch of msg.login || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }
    const n = parseInt(c.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.35) { // trop sombre : on éclaircit
      const mix = (x) => Math.round(x + (255 - x) * 0.45);
      return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    }
    return c;
  };

  /* ---------- API Twitch (Helix) ----------
   * Utilise un jeton « utilisateur » sans aucune permission (scope vide) : il ne permet que de lire
   * des données publiques (clips, VODs). Il est obtenu via connexion.html.
   */
  SB.helix = async function (path, token) {
    const cid = window.SB_CONFIG && SB_CONFIG.twitchClientId;
    if (!cid || !token) throw new Error('Connexion Twitch non configurée');
    const r = await fetch('https://api.twitch.tv/helix/' + path, { headers: { 'Client-Id': cid, Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('API Twitch : erreur ' + r.status);
    return r.json();
  };
  SB.validateToken = async function (token) {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + token } });
    return r.ok ? r.json() : null; // { login, user_id, expires_in }
  };

  /* ---------- Apparence personnalisée (commune à tous les overlays) ----------
   * textcolor, panel (couleur des fonds), opacity (0 à 1), radius (px), shadow=0, outline=1, css (CSS libre) */
  SB.applyStyle = function () {
    const q = SB.query();
    const root = document.documentElement.style;
    const hex = (h) => { const m = String(h).replace('#', '').match(/^([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return `${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}`; };
    if (q.get('textcolor')) root.setProperty('--text', q.get('textcolor'));
    if (q.get('panel') && hex(q.get('panel'))) root.setProperty('--panel-rgb', hex(q.get('panel')));
    if (q.has('opacity') && !isNaN(parseFloat(q.get('opacity')))) root.setProperty('--panel-a', Math.max(0, Math.min(1, parseFloat(q.get('opacity')))));
    if (q.has('radius') && !isNaN(parseFloat(q.get('radius')))) root.setProperty('--radius', parseFloat(q.get('radius')) + 'px');
    const onBody = (fn) => (document.body ? fn() : addEventListener('DOMContentLoaded', fn));
    onBody(() => {
      if (q.get('shadow') === '0') document.body.classList.add('sb-noshadow');
      if (q.get('outline') === '1') document.body.classList.add('sb-outline');
    });
    if (q.get('css')) { const st = document.createElement('style'); st.textContent = q.get('css'); document.head.appendChild(st); }
  };
  SB.applyStyle();

  /* ---------- Mode démo ---------- */
  const DEMO_EMOTES = { Kappa: '25', LUL: '425618', HeyGuys: '30259', Kreygasm: '41', SeemsGood: '64138', BibleThump: '86', VoHiYo: '81274', CoolCat: '58127' };
  const DEMO_USERS = [
    { login: 'pixelmaud', color: '#FF69B4', sub: true },
    { login: 'kevin_le_roux', color: '#1E90FF' },
    { login: 'Moderatrice_Lou', color: '#00FF7F', mod: true },
    { login: 'gamerdu69', color: '', sub: true },
    { login: 'Sacha_VIP', color: '#DAA520', vip: true },
    { login: 'nocturne', color: '#8A2BE2' },
    { login: 'tartiflette_42', color: '#FF4500', sub: true },
  ];
  const DEMO_LINES = [
    'Salut tout le monde HeyGuys', 'Trop fort ce clutch Kreygasm', 'LUL LUL LUL', 'GG !', 'On est là pour le stream du soir SeemsGood',
    "c'est quoi ce jeu ?", 'Kappa', 'premier message ici, je découvre la chaîne VoHiYo', 'la musique est trop bien', 'BibleThump non pas comme ça',
    'CoolCat', 'quelqu\'un a le lien du discord ?', 'insane la partie', 'hype hype hype',
  ];
  SB.demoUsers = DEMO_USERS;
  SB.fake = function (o) {
    const u = o.user || DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const text = o.text != null ? o.text : DEMO_LINES[Math.floor(Math.random() * DEMO_LINES.length)];
    const emotes = [];
    let idx = 0;
    text.split(' ').forEach((w) => {
      const len = Array.from(w).length;
      if (DEMO_EMOTES[w]) emotes.push({ id: DEMO_EMOTES[w], start: idx, end: idx + len - 1 });
      idx += len + 1;
    });
    const badges = {};
    if (u.broadcaster) badges.broadcaster = '1';
    if (u.mod) badges.moderator = '1';
    if (u.vip) badges.vip = '1';
    if (u.sub) badges.subscriber = '12';
    return {
      id: 'demo-' + Math.random().toString(36).slice(2), login: u.login.toLowerCase(), name: u.login, color: u.color || null,
      text, action: false, emotes, bits: o.bits || 0, ts: Date.now(), badges,
      isBroadcaster: !!u.broadcaster, isMod: !!(u.mod || u.broadcaster), isVip: !!u.vip, isSub: !!u.sub,
    };
  };
  SB.demoBroadcaster = { login: 'TaChaine', color: '#9146FF', broadcaster: true };

  /* Petit bandeau d'aide si aucune chaîne n'est configurée */
  /* ---------- Panneau de contrôle (via OBS) ----------
   * Le panneau (panneau.html) envoie un BroadcastCustomEvent par obs-websocket :
   *   { streambox: { tool: 'sondage', args: 'fin' } }
   * L'overlay le reçoit et le traite comme la commande « <cmd> <args> » tapée par le streamer.
   * Activé si l'URL contient remote=1 ou obspass=… ; obs = client OBS déjà ouvert (facultatif). */
  SB.remote = function (tool, cmd, handler, obs) {
    const q = SB.query();
    if (!obs && !(q.get('remote') === '1' || q.has('obspass'))) return;
    const listen = (o) => o.on('CustomEvent', (d) => {
      const s = d && d.streambox;
      if (!s || (s.tool !== tool && s.tool !== '*')) return;
      handler(SB.fake({ user: { login: 'panneau', broadcaster: true }, text: (cmd + ' ' + (s.args || '')).trim() }));
    });
    if (obs) { listen(obs); return; }
    const go = () => { const o = new SB.OBS(q.get('obsurl') || 'ws://127.0.0.1:4455', q.get('obspass') || ''); listen(o); o.connect(); SB._remoteObs = o; };
    if (SB.OBS) go();
    else { const sc = document.createElement('script'); sc.src = new URL('../js/obs.js', location.href).href; sc.onload = go; document.head.appendChild(sc); }
  };

  /* ---------- Discord (webhook, sans serveur) ---------- */
  SB.isDiscordWebhook = (u) => /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(u || '');
  SB.discordPost = async function (webhook, payload) {
    if (!SB.isDiscordWebhook(webhook)) throw new Error('adresse de webhook Discord invalide');
    const r = await fetch(webhook + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ username: 'StreamBox', allowed_mentions: { parse: [] } }, payload)) });
    if (!r.ok) throw new Error('Discord a refusé le message (' + r.status + ')');
    return r.json().catch(() => ({}));
  };

  SB.hintIfNoChannel = function (cfg) {
    if (SB._cfgError) { document.body.appendChild(SB.el('div', 'sb-hint', 'StreamBox : ' + SB._cfgError)); return; }
    if (cfg.channel || cfg.kick || cfg.youtube || cfg.demo) return;
    const d = SB.el('div', 'sb-hint', 'StreamBox : ajoute ?channel=ta_chaine à l’URL (ou configure l’outil sur le site).');
    document.body.appendChild(d);
  };

  /* Bip/carillon synthétisé (aucun fichier audio nécessaire) */
  SB.chime = function (volume) {
    try {
      const ctx = SB._ctx || (SB._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0, now + i * 0.09);
        g.gain.linearRampToValueAtTime(volume, now + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.6);
        o.connect(g).connect(ctx.destination);
        o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.7);
      });
    } catch (e) { /* audio indisponible */ }
  };
})();
