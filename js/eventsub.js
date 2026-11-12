/* Événements Twitch en direct via EventSub WebSocket (sans serveur).
 * Donne ce que le chat anonyme ne voit pas : follows et points de chaîne.
 * Nécessite le jeton de connexion Twitch (paramètre token) du streamer ou d'un modo.
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const TYPES = {
    follow: { type: 'channel.follow', version: '2', cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u }) },
    points: { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', cond: (b) => ({ broadcaster_user_id: b }) },
    online: { type: 'stream.online', version: '1', cond: (b) => ({ broadcaster_user_id: b }) },
    offline: { type: 'stream.offline', version: '1', cond: (b) => ({ broadcaster_user_id: b }) },
    // Panneau de modération : l'événement Twitch est transmis tel quel
    automod: { type: 'automod.message.hold', version: '2', cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u }), raw: true },
    automodUpdate: { type: 'automod.message.update', version: '2', cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u }), raw: true },
    moderate: { type: 'channel.moderate', version: '2', cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u }), raw: true },
    unbanRequest: { type: 'channel.unban_request.create', version: '1', cond: (b, u) => ({ broadcaster_user_id: b, moderator_user_id: u }), raw: true },
    // Hype Train (permission channel:read:hype_train) : l'événement Twitch est transmis tel quel
    hypeBegin: { type: 'channel.hype_train.begin', version: '2', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    hypeProgress: { type: 'channel.hype_train.progress', version: '2', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    hypeEnd: { type: 'channel.hype_train.end', version: '2', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    // Pubs (channel:read:ads), sondages (channel:read:polls) et prédictions (channel:read:predictions) natifs de Twitch
    adBreak: { type: 'channel.ad_break.begin', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    pollBegin: { type: 'channel.poll.begin', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    pollProgress: { type: 'channel.poll.progress', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    pollEnd: { type: 'channel.poll.end', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    predBegin: { type: 'channel.prediction.begin', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    predProgress: { type: 'channel.prediction.progress', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    predLock: { type: 'channel.prediction.lock', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
    predEnd: { type: 'channel.prediction.end', version: '1', cond: (b) => ({ broadcaster_user_id: b }), raw: true },
  };
  const RAW = Object.fromEntries(Object.entries(TYPES).filter(([, t]) => t.raw).map(([k, t]) => [t.type, k]));
  /* Événement Twitch → [nom, données] tel que les overlays le reçoivent (EventSub direct ou poussé par le relais) */
  function shape(st, ev) {
    ev = ev || {};
    if (st === 'channel.follow') return ['follow', { login: ev.user_login, name: ev.user_name }];
    if (st === 'stream.online') return ['online', { start: Date.parse(ev.started_at) || Date.now() }];
    if (st === 'stream.offline') return ['offline', {}];
    if (RAW[st]) return [RAW[st], ev];
    if (st === TYPES.points.type) return ['points', { login: ev.user_login, name: ev.user_name, reward: (ev.reward || {}).title || '', cost: (ev.reward || {}).cost || 0, input: ev.user_input || '' }];
    return null;
  }

  SB.EventSub = class {
    constructor(token, channel, wanted) {
      if (SB.sources) SB.sources('events').push(this); // simulateur
      this.token = token; this.channel = (channel || '').toLowerCase(); this.wanted = wanted || ['follow', 'points'];
      this.handlers = {}; this.seen = new Set(); this.retry = 0;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { if (window.SB && SB._real) SB._real(ev); (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

    async start() {
      if (!this.token || !window.SB_CONFIG || !SB_CONFIG.twitchClientId || !this.channel) return this;
      try {
        const me = await SB.validateToken(this.token);
        if (!me) { this.emit('status', 'connexion Twitch expirée'); return this; }
        this.userId = me.user_id; this.scopes = me.scopes || [];
        const u = await SB.helix('users?login=' + encodeURIComponent(this.channel), this.token);
        this.broadcasterId = u.data[0] && u.data[0].id;
        if (!this.broadcasterId) { this.emit('status', 'chaîne introuvable'); return this; }
        this.connect('wss://eventsub.wss.twitch.tv/ws');
      } catch (e) { this.emit('status', e.message); }
      return this;
    }

    connect(url, isReconnect) {
      const ws = new WebSocket(url);
      ws.onmessage = async (e) => {
        const m = JSON.parse(e.data);
        const type = m.metadata && m.metadata.message_type;
        if (type === 'session_welcome') {
          if (this.ws && this.ws !== ws) this.ws.close();
          this.ws = ws; this.retry = 0;
          if (!isReconnect) await this.subscribe(m.payload.session.id);
          this.emit('status', 'connecté');
        } else if (type === 'session_reconnect') {
          this.connect(m.payload.session.reconnect_url, true);
        } else if (type === 'notification') {
          const id = m.metadata.message_id;
          if (this.seen.has(id)) return; // Twitch peut renvoyer un message en double
          this.seen.add(id); if (this.seen.size > 500) this.seen.clear();
          const x = shape(m.payload.subscription.type, m.payload.event);
          if (x) this.emit(x[0], x[1]);
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws || this.stopped) return; // ancienne connexion remplacée, ou arrêt voulu
        this.emit('status', 'déconnecté');
        setTimeout(() => this.connect('wss://eventsub.wss.twitch.tv/ws'), Math.min(30000, 2000 * 2 ** this.retry++));
      };
      if (!this.ws) this.ws = ws;
    }

    async subscribe(sessionId) {
      for (const key of this.wanted) {
        const t = TYPES[key]; if (!t) continue;
        const r = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: { 'Client-Id': SB_CONFIG.twitchClientId, Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: t.type, version: t.version, condition: t.cond(this.broadcasterId, this.userId), transport: { method: 'websocket', session_id: sessionId } }),
        }).catch(() => null);
        if (!r || !r.ok) this.emit('status', `abonnement ${key} refusé (${r ? r.status : 'réseau'}) : reconnecte-toi sur StreamBox`);
      }
    }

    stop() { this.stopped = true; if (this.ws) this.ws.close(); }
    /* Injecte un faux événement (mode démo) */
    inject(kind, data) { this.emit(kind, data); }
  };

  /* Raccourci : renvoie un client EventSub prêt (ou un client « vide » sans connexion, utile en démo) */
  SB.twitchEvents = function (c, wanted) {
    const es = new SB.EventSub(c.token, c.channel, wanted);
    if (!c.token && SB.ovLink && !c.demo) { // overlay du compte sans jeton : les événements arrivent par le relais
      (SB._twitchRelay = SB._twitchRelay || []).push((ev, d, st) => { const x = st ? shape(st, d) : [ev, d]; if (x && wanted.includes(x[0])) es.inject(x[0], x[1]); });
      return es;
    }
    if (!c.demo) es.start();
    return es;
  };
})();
