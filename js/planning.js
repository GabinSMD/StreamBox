/* Planning des lives : lecture du planning Twitch (via le relais, données publiques) et mise en forme par jour.
 * Partagé par l'overlay « Planning » et la page « Image du planning ». */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const relay = () => ((window.SB_CONFIG && SB_CONFIG.relayUrl) || '').replace(/\/$/, '');
  const tag = () => window.SB_LANG_TAG || 'fr-FR';
  const DAY = 86400000;
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  SB.planning = {
    /* { login, name, avatar, segments: [{ start, end, title, game, recurring }], vacation } */
    async load(login) {
      if (!relay()) throw new Error(SB.t ? SB.t('Relais StreamBox non configuré') : 'Relais StreamBox non configuré');
      const r = await fetch(relay() + '/schedule/' + encodeURIComponent(String(login || '').toLowerCase().trim()));
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'erreur ' + r.status);
      return d;
    },
    /* Faux planning pour l'aperçu */
    demo(name) {
      const at = (n, h, m) => { const x = midnight(Date.now() + n * DAY); x.setHours(h, m || 0); return x.toISOString(); };
      const seg = (n, h, len, title, game) => ({ start: at(n, h), end: new Date(Date.parse(at(n, h)) + len * 3600000).toISOString(), title, game, recurring: true });
      const t = SB.t || ((s) => s);
      return { login: 'demo', name: name || 'StreamBox', avatar: '', vacation: null, segments: [
        seg(0, 21, 3, t('Soirée chill avec vous'), 'Minecraft'), seg(1, 20, 4, t('Ranked jusqu’au bout'), 'Valorant'),
        seg(3, 14, 6, t('Subathon : jour 1 !'), 'Just Chatting'), seg(4, 21, 3, t('Découverte indé'), 'Hollow Knight: Silksong'),
        seg(6, 18, 3, t('Tournoi de la commu'), 'Rocket League'),
      ] };
    },
    /* Jours à afficher, à partir d'aujourd'hui : [{ date, items: [segment…] }] */
    days(data, count) {
      const start = midnight(Date.now());
      const out = [];
      for (let i = 0; i < count; i++) {
        const d = new Date(start.getTime() + i * DAY), next = d.getTime() + DAY;
        out.push({ date: d, today: i === 0, items: (data.segments || []).filter((g) => { const s = Date.parse(g.start); return s >= d.getTime() && s < next; }) });
      }
      // un live commencé hier et pas encore fini reste affiché aujourd'hui
      const now = Date.now();
      (data.segments || []).forEach((g) => { if (Date.parse(g.start) < start.getTime() && Date.parse(g.end) > now) out[0].items.unshift(g); });
      return out;
    },
    isLive: (g) => { const now = Date.now(); return Date.parse(g.start) <= now && Date.parse(g.end) > now; },
    weekday: (d, style) => new Date(d).toLocaleDateString(tag(), { weekday: style || 'short' }).replace(/\.$/, ''),
    dayNum: (d) => new Date(d).toLocaleDateString(tag(), { day: 'numeric', month: 'short' }).replace(/\.$/, ''),
    time: (iso) => new Date(iso).toLocaleTimeString(tag(), { hour: '2-digit', minute: '2-digit' }),
    longDate: (iso) => new Date(iso).toLocaleDateString(tag(), { weekday: 'long', day: 'numeric', month: 'long' }),
    /* Texte prêt à coller sur Discord ou les réseaux */
    text(data, count) {
      const t = SB.t || ((s) => s);
      const lines = [t('Planning de {0}', [data.name || data.login])];
      if (data.vacation && Date.parse(data.vacation.end) > Date.now()) lines.push(t('En pause jusqu’au {0}', [SB.planning.longDate(data.vacation.end)]));
      SB.planning.days(data, count).forEach((d) => d.items.forEach((g) => {
        lines.push(`${SB.planning.weekday(d.date, 'long')} ${SB.planning.dayNum(d.date)} · ${SB.planning.time(g.start)}${g.end ? '–' + SB.planning.time(g.end) : ''} · ${g.title || g.game || t('Live')}${g.game && g.title ? ' (' + g.game + ')' : ''}`);
      }));
      if (lines.length === 1) lines.push(t('Pas de live prévu pour le moment.'));
      lines.push('twitch.tv/' + (data.login || ''));
      return lines.join('\n');
    },
  };
})();
