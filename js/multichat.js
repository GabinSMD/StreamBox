/* Chat multiplateforme : Kick et YouTube, avec la même interface que SB.TwitchChat
 * (on('message'), on('delete'), on('clearuser'), on('status'), connect(), stop()).
 * Les messages ont la même forme que ceux de Twitch, plus `platform` et `parts` (texte et images, sans HTML).
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const relay = () => ((window.SB_CONFIG && SB_CONFIG.relayUrl) || '').replace(/\/$/, '');

  class Emitter {
    constructor() { this.handlers = {}; }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { if (window.SB && SB._real) SB._real(ev); (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }
  }

  /* ---------- Kick ---------- */
  // Clé publique du chat de Kick (Pusher), la même pour tous les spectateurs du site kick.com
  const KICK_PUSHER = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false';
  SB.kickParts = function (content) {
    const parts = [], re = /\[emote:(\d+):([^\]]{1,60})\]/g;
    let last = 0, m;
    while ((m = re.exec(content))) {
      if (m.index > last) parts.push({ text: content.slice(last, m.index) });
      parts.push({ img: `https://files.kick.com/emotes/${m[1]}/fullsize`, alt: m[2] });
      last = re.lastIndex;
    }
    if (last < content.length) parts.push({ text: content.slice(last) });
    return parts;
  };
  SB.kickMessage = function (d) {
    const s = d.sender || {}, id = s.identity || {}, badges = (id.badges || []).map((b) => b.type);
    const content = String(d.content || '').slice(0, 1000), parts = SB.kickParts(content);
    const name = String(s.username || '?');
    return {
      platform: 'kick', id: 'kick-' + d.id, login: (s.slug || name).toLowerCase(), name, userId: 'kick-' + s.id,
      color: /^#[0-9a-f]{6}$/i.test(id.color || '') ? id.color : null, parts, text: parts.map((p) => (p.text != null ? p.text : p.alt)).join(''),
      ts: Date.parse(d.created_at) || Date.now(), emotes: [], bits: 0, action: false,
      isBroadcaster: badges.includes('broadcaster'), isMod: badges.includes('broadcaster') || badges.includes('moderator'), isVip: badges.includes('vip'), isSub: badges.includes('subscriber') || badges.includes('founder'),
    };
  };
  SB.KickChat = class extends Emitter {
    constructor(slug, room) { super(); this.slug = String(slug || '').trim().toLowerCase().replace(/^.*kick\.com\//, '').replace(/\/.*$/, ''); this.room = /^\d+$/.test(String(room || '')) ? +room : null; this.retry = 0; }
    async connect() {
      if (!this.slug && !this.room) return this;
      if (!this.room) {
        try {
          const d = await (await fetch(relay() + '/kick/' + encodeURIComponent(this.slug))).json();
          if (!d.chatroom) throw new Error(d.error || 'salon introuvable');
          this.room = d.chatroom;
        } catch (e) { this.emit('status', 'Kick : ' + e.message); if (!this.stopped) setTimeout(() => this.connect(), 60000); return this; }
      }
      this.open();
      return this;
    }
    open() {
      const ws = (this.ws = new WebSocket(KICK_PUSHER));
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        const data = typeof m.data === 'string' ? (() => { try { return JSON.parse(m.data); } catch (err) { return {}; } })() : m.data || {};
        if (m.event === 'pusher:connection_established') { this.retry = 0; ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${this.room}.v2` } })); }
        else if (m.event === 'pusher_internal:subscription_succeeded') this.emit('status', 'connected');
        else if (m.event === 'pusher:ping') ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        else if (m.event === 'App\\Events\\ChatMessageEvent') this.emit('message', SB.kickMessage(data));
        else if (m.event === 'App\\Events\\MessageDeletedEvent' && data.message) this.emit('delete', 'kick-' + data.message.id);
        else if (m.event === 'App\\Events\\UserBannedEvent' && data.user) this.emit('clearuser', 'kick-' + data.user.id);
        else if (m.event === 'App\\Events\\ChatroomClearEvent') this.emit('clear', 'kick');
      };
      clearInterval(this.ping);
      this.ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ event: 'pusher:ping', data: {} })); }, 60000);
      ws.onclose = () => {
        clearInterval(this.ping);
        this.emit('status', 'disconnected');
        if (!this.stopped && this.ws === ws) setTimeout(() => this.open(), Math.min(30000, 1000 * 2 ** this.retry++));
      };
    }
    stop() { this.stopped = true; clearInterval(this.ping); if (this.ws) this.ws.close(); }
  };

  /* ---------- YouTube ---------- */
  SB.youtubeTarget = function (v) {
    v = String(v || '').trim();
    const vid = v.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/);
    if (vid && !v.startsWith('@')) return { video: vid[1] };
    const ch = v.match(/(?:youtube\.com\/)?(@[\w.\-]{2,40}|UC[\w-]{22})/);
    return ch ? { channel: ch[1] } : null;
  };
  SB.YouTubeChat = class extends Emitter {
    constructor(target) { super(); this.target = SB.youtubeTarget(target); }
    connect() { if (this.target && relay()) this.find(); return this; }
    async find() { // une chaîne : on attend que son live commence (vérifié chaque minute)
      if (this.stopped) return;
      if (this.target.video) return this.poll(this.target.video, null);
      try {
        const d = await (await fetch(relay() + '/yt/live/' + encodeURIComponent(this.target.channel))).json();
        if (d.video && d.live) return this.poll(d.video, null);
        this.emit('status', 'YouTube : pas de live en cours');
      } catch (e) { this.emit('status', 'YouTube : ' + e.message); }
      this.timer = setTimeout(() => this.find(), 60000);
    }
    async poll(video, next) {
      if (this.stopped) return;
      let wait = 5000;
      try {
        const d = await (await fetch(`${relay()}/yt/chat/${video}${next ? '?c=' + encodeURIComponent(next) : ''}`, { cache: 'no-store' })).json();
        if (d.error) {
          this.emit('status', 'YouTube : ' + d.error);
          if (!this.target.video || d.ended) { this.timer = setTimeout(() => this.find(), 30000); return; } // live terminé : on attend le suivant
          wait = 15000; next = null;
        } else {
          if (!next) this.emit('status', 'connected');
          (d.messages || []).forEach((m) => this.emit('message', Object.assign(m, { emotes: [], bits: 0, action: false, color: null })));
          (d.deleted || []).forEach((id) => (id.startsWith('author:') ? this.emit('clearuser', id.slice(7)) : this.emit('delete', id)));
          next = d.next; wait = d.wait || 3000;
          if (!next) { this.timer = setTimeout(() => this.find(), 30000); return; }
        }
      } catch (e) { this.emit('status', 'YouTube : ' + e.message); wait = 10000; }
      this.timer = setTimeout(() => this.poll(video, next), Math.max(2000, wait));
    }
    stop() { this.stopped = true; clearTimeout(this.timer); }
  };
})();
