/* Détecteur de temps forts : combine l'emballement du chat et l'intensité de la voix du streamer.
 *
 * Chat  : messages des 10 dernières secondes comparés au rythme habituel (moyenne glissante sur 5 min),
 *         part de messages « réaction » (KEKW, LUL, mdr, ???, Pog, clip…).
 * Voix  : niveau du micro (dB) sur 1,5 s comparé au niveau habituel de parole (médiane sur 2 min).
 *         Un cri ou un fou rire dépasse nettement ce niveau habituel.
 * Score = poids_chat × chat + poids_voix × voix (de 0 à 1). Au-delà du seuil → temps fort.
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const REACTIONS = /^(kekw|lul|lulw|omegalul|lmao|lol|mdr+|ptdr+|xptdr+|xd+|ahah\w*|haha\w*|pog\w*|poggers|pogchamp|kreygasm|wow+|omg+|wtf|ez|gg+|w|l|no+n+|nooo+|oula+|monkas|pepelaugh|catjam|clip|\?+|!+|😂|🤣|💀|😱|🔥)$/i;

  SB.HighlightDetector = class {
    constructor(opts) {
      this.o = Object.assign({ threshold: 0.55, cooldown: 90, wchat: 0.6, wvoice: 0.4, minmsgs: 4 }, opts);
      this.msgs = [];          // { t, login, reaction, tokens[] , text }
      this.rateHist = [];      // historique du rythme (messages / 10 s), un point par seconde
      this.levels = [];        // { t, db } niveau micro toutes les ~100 ms
      this.speech = [];        // niveaux de parole récents (pour la médiane)
      this.voiceActive = false;
      this.lastTrigger = 0;
      this.current = null;     // temps fort en cours de mesure
      this.handlers = {};
      this.lastScores = { chat: 0, voice: 0, total: 0, rate: 0, base: 0 };
      this._tick = setInterval(() => this.tick(), 1000);
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, d) { (this.handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

    addMessage(m, now) {
      const t = now || Date.now();
      const tokens = (m.text || '').trim().split(/\s+/).filter(Boolean);
      const reaction = tokens.some((w) => REACTIONS.test(w)) || /mdr|ptdr|hahaha|clip/i.test(m.text || '');
      this.msgs.push({ t, login: m.login, reaction, tokens: tokens.filter((w) => REACTIONS.test(w) || w.length <= 12), text: (m.text || '').slice(0, 80) });
    }

    /* niveau crête du micro, en amplitude linéaire 0..1 (fourni par obs-websocket) */
    addLevel(peak, now) {
      const t = now || Date.now();
      const db = peak > 0 ? 20 * Math.log10(peak) : -100;
      this.voiceActive = true;
      this.levels.push({ t, db });
      if (db > -50) this.speech.push(db); // on ne garde que la parole, pas le silence
      if (this.speech.length > 1200) this.speech.splice(0, this.speech.length - 1200); // ~2 min
      const cut = t - 3000;
      while (this.levels.length && this.levels[0].t < cut) this.levels.shift();
    }

    chatScore(now) {
      const t = now || Date.now();
      while (this.msgs.length && this.msgs[0].t < t - 300000) this.msgs.shift();
      const recent = this.msgs.filter((x) => x.t >= t - 10000);
      const rate = recent.length;
      const hist = this.rateHist.slice(-300);
      const base = Math.max(2, hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 2);
      if (rate < this.o.minmsgs) return { score: 0, rate, base, recent };
      const surge = Math.max(0, Math.min(1, (rate / base - 1.3) / 2.5));
      const reactions = recent.filter((x) => x.reaction).length / rate;
      const users = new Set(recent.map((x) => x.login)).size / rate; // beaucoup de monde différent = vraie réaction
      const score = Math.min(1, 0.6 * surge + 0.3 * Math.min(1, reactions * 1.4) + 0.1 * users);
      return { score, rate, base, recent };
    }

    voiceScore() {
      if (!this.voiceActive || !this.levels.length) return 0;
      const t = this.levels[this.levels.length - 1].t;
      const win = this.levels.filter((x) => x.t >= t - 1500);
      const avg = win.reduce((a, b) => a + b.db, 0) / win.length;
      if (this.speech.length < 50) return 0;
      const sorted = this.speech.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return Math.max(0, Math.min(1, (avg - median - 4) / 10)); // +4 dB au-dessus de la parole normale → début, +14 dB → maximum
    }

    tick(now) {
      const t = now || Date.now();
      const chat = this.chatScore(t);
      this.rateHist.push(chat.rate);
      if (this.rateHist.length > 600) this.rateHist.shift();
      const voice = this.voiceScore();
      const wv = this.voiceActive ? this.o.wvoice : 0;
      const wc = this.voiceActive ? this.o.wchat : 1;
      // une réaction très forte d'un seul côté compte aussi (fou rire seul, chat qui explose seul)
      const total = Math.min(1, Math.max(wc * chat.score + wv * voice, chat.score * 0.85, voice * 0.8));
      this.lastScores = { chat: chat.score, voice, total, rate: chat.rate, base: chat.base };
      this.emit('scores', this.lastScores);

      if (this.current) {
        if (total > this.current.score) Object.assign(this.current, { score: total, chat: chat.score, voice });
        this.collect(this.current, chat.recent);
        return;
      }
      if (this.paused || total < this.o.threshold || t - this.lastTrigger < this.o.cooldown * 1000) return;
      this.lastTrigger = t;
      this.current = { t, score: total, chat: chat.score, voice, tokens: {}, texts: {} };
      this.collect(this.current, chat.recent);
      this.emit('trigger', this.current);
    }

    /* Temps fort marqué à la main (bouton du panneau ou !rewind clip) */
    force(now) {
      const t = now || Date.now();
      if (this.current) { this.current.manual = true; return; }
      this.lastTrigger = t;
      this.current = { t, score: 1, chat: this.lastScores.chat, voice: this.lastScores.voice, tokens: {}, texts: {}, manual: true };
      this.emit('trigger', this.current);
    }

    collect(h, recent) {
      recent.forEach((m) => {
        if (m._seen === h) return; m._seen = h;
        m.tokens.forEach((w) => { if (REACTIONS.test(w) || w.length > 2) h.tokens[w] = (h.tokens[w] || 0) + 1; });
        const k = m.text.toLowerCase();
        h.texts[k] = (h.texts[k] || 0) + 1;
      });
    }

    /* Clôt le temps fort courant et renvoie son résumé */
    finish() {
      const h = this.current; this.current = null;
      if (!h) return null;
      const top = Object.entries(h.tokens).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const quote = Object.entries(h.texts).sort((a, b) => b[1] - a[1])[0];
      const reasons = [];
      if (h.chat >= 0.4) reasons.push('chat');
      if (h.voice >= 0.4) reasons.push('voix');
      if (h.manual) reasons.push('manuel');
      return { t: h.t, score: Math.round(h.score * 100) / 100, chat: Math.round(h.chat * 100) / 100, voice: Math.round(h.voice * 100) / 100, reasons, top, quote: quote ? quote[0] : '' };
    }
  };
})();
