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
  };

  SB.EventSub = class {
    constructor(token, channel, wanted) {
      this.token = token; this.channel = (channel || '').toLowerCase(); this.wanted = wanted || ['follow', 'points'];
      this.handlers = {}; this.seen = new Set(); this.retry = 0;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

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
          const ev = m.payload.event, st = m.payload.subscription.type;
          if (st === 'channel.follow') this.emit('follow', { login: ev.user_login, name: ev.user_name });
          else if (st === TYPES.points.type) this.emit('points', { login: ev.user_login, name: ev.user_name, reward: ev.reward.title, cost: ev.reward.cost, input: ev.user_input || '' });
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return; // ancienne connexion remplacée
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

    /* Injecte un faux événement (mode démo) */
    inject(kind, data) { this.emit(kind, data); }
  };

  /* Raccourci : renvoie un client EventSub prêt (ou un client « vide » sans connexion, utile en démo) */
  SB.twitchEvents = function (c, wanted) {
    const es = new SB.EventSub(c.token, c.channel, wanted);
    if (!c.demo) es.start();
    return es;
  };
})();
