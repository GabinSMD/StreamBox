/* Client obs-websocket v5 minimal (intégré à OBS 28+ : Outils → Paramètres du serveur WebSocket).
 * Sert au Rewind : niveau du micro en direct, sauvegarde du Replay Buffer, lecture des temps forts.
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const SUBS = 0x7ff | (1 << 16); // tous les événements normaux + InputVolumeMeters

  async function sha256b64(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  SB._obsAuth = async (password, salt, challenge) => sha256b64((await sha256b64(password + salt)) + challenge);

  SB.OBS = class {
    constructor(url, password) {
      this.url = url || 'ws://127.0.0.1:4455';
      this.password = password || '';
      this.pending = new Map();
      this.handlers = {};
      this.ready = false;
      this.n = 0;
      this.retry = 0;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

    connect() {
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch (e) { this.emit('status', 'erreur'); return this; }
      ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        const d = msg.d || {};
        if (msg.op === 0) { // Hello
          const id = { rpcVersion: 1, eventSubscriptions: SUBS };
          if (d.authentication) id.authentication = await SB._obsAuth(this.password, d.authentication.salt, d.authentication.challenge);
          ws.send(JSON.stringify({ op: 1, d: id }));
        } else if (msg.op === 2) { // Identified
          this.ready = true; this.retry = 0; this.emit('status', 'connecté'); this.emit('ready');
        } else if (msg.op === 5) {
          this.emit(d.eventType, d.eventData || {});
        } else if (msg.op === 7) {
          const p = this.pending.get(d.requestId);
          if (!p) return;
          this.pending.delete(d.requestId);
          if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
          else p.reject(new Error((d.requestStatus && d.requestStatus.comment) || 'Erreur OBS ' + (d.requestStatus && d.requestStatus.code)));
        }
      };
      ws.onclose = (e) => {
        this.ready = false;
        this.pending.forEach((p) => p.reject(new Error('OBS déconnecté')));
        this.pending.clear();
        this.emit('status', e.code === 4009 ? 'mot de passe incorrect' : 'déconnecté');
        if (e.code !== 4009) setTimeout(() => this.connect(), Math.min(30000, 2000 * 2 ** this.retry++));
      };
      return this;
    }

    call(requestType, requestData) {
      if (!this.ready) return Promise.reject(new Error('OBS non connecté'));
      const requestId = 'r' + ++this.n;
      return new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData: requestData || {} } }));
        setTimeout(() => { if (this.pending.delete(requestId)) reject(new Error('OBS ne répond pas')); }, 10000);
      });
    }

    /* Attend un événement (avec délai max) */
    once(ev, timeout, filter) {
      return new Promise((resolve) => {
        let done = false;
        const fn = (d) => { if (!done && (!filter || filter(d))) { done = true; resolve(d); } };
        this.on(ev, fn);
        setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeout);
      });
    }
  };
})();
