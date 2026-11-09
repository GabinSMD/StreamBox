/* Dons en direct : StreamElements, Streamlabs et Ko-fi (via le relais StreamBox).
 * Paramètres d'URL lus :
 *   sejwt   : jeton JWT StreamElements (tableau de bord → Mon compte → Chaînes → Afficher les secrets)
 *   sltoken : jeton « Socket API » Streamlabs (Paramètres → Clés API)
 *   kofi    : clé du relais Ko-fi StreamBox (voir relay/README.md) ; relay = adresse du relais (sinon SB_CONFIG.relayUrl)
 * Événement émis : 'don' → { source, name, amount (nombre), currency, message }
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };

  SB.Donations = class {
    constructor() { this.handlers = {}; this.seen = new Set(); this.status = {}; }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }
    don(d) {
      const key = d.id || [d.source, d.name, d.amount, d.message].join('|') + '|' + Math.floor(Date.now() / 5000);
      if (this.seen.has(key)) return; // même don reçu deux fois
      this.seen.add(key); if (this.seen.size > 300) this.seen.clear();
      this.emit('don', { source: d.source, name: d.name || 'Anonyme', amount: num(d.amount), currency: (d.currency || 'EUR').toUpperCase(), message: d.message || '' });
    }
    setStatus(src, s) { this.status[src] = s; this.emit('status', this.status); }

    /* ---- StreamElements (Astro WebSocket) ---- */
    streamelements(jwt) {
      const ws = new WebSocket('wss://astro.streamelements.com');
      ws.onopen = () => {
        ['channel.tips', 'channel.activities'].forEach((topic) =>
          ws.send(JSON.stringify({ type: 'subscribe', nonce: Math.random().toString(36).slice(2), data: { topic, token: jwt, token_type: 'jwt' } })));
        this.setStatus('StreamElements', 'connecté');
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === 'response' && m.error) this.setStatus('StreamElements', 'refusé : ' + (m.data && m.data.message || m.error));
        if (m.type !== 'message' || !m.data) return;
        let d = m.data;
        if (m.topic === 'channel.activities') { if (d.type !== 'tip') return; d = d.data || {}; }
        const don = d.donation || d;
        const user = don.user || {};
        this.don({ source: 'StreamElements', id: 'se-' + (m.data._id || m.data.activityId || ''), name: user.username || d.displayName || d.username, amount: don.amount, currency: don.currency, message: don.message || d.message });
      };
      ws.onclose = () => { this.setStatus('StreamElements', 'déconnecté'); setTimeout(() => this.streamelements(jwt), 5000); };
    }

    /* ---- Streamlabs (socket.io v2) ---- */
    streamlabs(token) {
      const start = () => {
        const socket = window.io('https://sockets.streamlabs.com?token=' + encodeURIComponent(token), { transports: ['websocket'] });
        socket.on('connect', () => this.setStatus('Streamlabs', 'connecté'));
        socket.on('disconnect', () => this.setStatus('Streamlabs', 'déconnecté'));
        socket.on('event', (e) => {
          if (!e || e.type !== 'donation') return;
          (e.message || []).forEach((m) => this.don({ source: 'Streamlabs', id: 'sl-' + (m.id || m._id || ''), name: m.name || m.from, amount: m.amount, currency: m.currency, message: m.message }));
        });
      };
      if (window.io) return start();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.3.0/socket.io.js';
      s.onload = start; s.onerror = () => this.setStatus('Streamlabs', 'bibliothèque introuvable');
      document.head.appendChild(s);
    }

    /* ---- Relais StreamBox (Ko-fi, et tout service qui envoie des webhooks) ---- */
    relay(base, key) {
      const url = base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/' + encodeURIComponent(key);
      const ws = new WebSocket(url);
      ws.onopen = () => this.setStatus('Ko-fi', 'connecté');
      ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.kind === 'don') this.don(d); } catch (err) { /* ignore */ } };
      ws.onclose = () => { this.setStatus('Ko-fi', 'déconnecté'); setTimeout(() => this.relay(base, key), 5000); };
    }
  };

  /* Ouvre toutes les sources configurées dans l'URL ; renvoie le client (même vide) */
  SB.donations = function (c) {
    const q = new URLSearchParams(location.search);
    const d = new SB.Donations();
    if (c && c.demo) return d;
    if (q.get('sejwt')) d.streamelements(q.get('sejwt'));
    if (q.get('sltoken')) d.streamlabs(q.get('sltoken'));
    const relay = q.get('relay') || (window.SB_CONFIG && SB_CONFIG.relayUrl);
    if (q.get('kofi') && relay) d.relay(relay, q.get('kofi'));
    return d;
  };

  SB.formatMoney = (amount, currency) => {
    try { return Number(amount).toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' }); }
    catch (e) { return amount + ' ' + (currency || ''); }
  };
})();
