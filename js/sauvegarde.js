/* Sauvegarde et import de la configuration d'un compte StreamBox.
 * Tout passe par les routes habituelles du relais : l'import est donc validé exactement comme une modification faite à la main.
 * Les jetons et les clés (Twitch, Spotify, dons, webhook, OBS) ne sont jamais dans le fichier. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const VERSION = 1;
  // Réglages hors overlays : [clé dans le fichier, route, extraction depuis la réponse GET]
  const PARTS = [
    ['bot', '/me/bot', (d) => d.cfg],
    ['subathon', '/me/subathon', (d) => d.cfg],
    ['sr', '/me/sr', (d) => d.cfg],
    ['jeux', '/me/jeux', (d) => d.cfg],
    ['page', '/me/page', (d) => { const p = Object.assign({}, d); delete p.url; return p; }],
    ['team', '/me/team', (d) => ({ mods: !!d.mods })],
    ['stats', '/me/stats', (d) => d.cfg],
  ];
  const noSecrets = (settings) => { const o = Object.assign({}, settings || {}); (window.SBA ? SBA.SECRET_FIELDS : []).forEach((k) => delete o[k]); return o; };
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

  SB.backup = {
    async build() {
      const me = await SBA.api('GET', '/me');
      const overlays = [];
      for (const o of me.overlays || []) {
        try { const d = await SBA.api('GET', '/me/overlays/' + o.id); overlays.push({ id: o.id, tool: d.tool, name: d.name, settings: noSecrets(d.settings) }); } catch (e) { /* overlay supprimé entre-temps */ }
      }
      const out = { streambox: VERSION, exportedAt: new Date().toISOString(), login: me.login, overlays };
      for (const [k, path, pick] of PARTS) { try { const v = pick(await SBA.api('GET', path)); if (v) out[k] = v; } catch (e) { /* fonction absente de ce relais */ } }
      return out;
    },
    /* Lit et vérifie un fichier ; renvoie { data, summary } ou lève une erreur lisible */
    parse(text) {
      let d; try { d = JSON.parse(text); } catch (e) { throw new Error(SB.t('ce fichier n’est pas une sauvegarde StreamBox')); }
      if (!isObj(d) || d.streambox !== VERSION || !Array.isArray(d.overlays)) throw new Error(SB.t('ce fichier n’est pas une sauvegarde StreamBox'));
      const tools = new Set((window.SB_TOOLS || []).map((t) => t.id));
      d.overlays = d.overlays.filter((o) => isObj(o) && tools.has(o.tool) && isObj(o.settings || {})).slice(0, 50);
      const parts = PARTS.map(([k]) => k).filter((k) => isObj(d[k]));
      return { data: d, summary: { overlays: d.overlays.length, parts, login: String(d.login || ''), date: d.exportedAt } };
    },
    /* Applique la sauvegarde : un overlay déjà présent (même identifiant) est mis à jour et garde son lien ; les autres sont créés */
    async apply(d, onStep) {
      const me = await SBA.api('GET', '/me');
      const mine = new Set((me.overlays || []).map((o) => o.id));
      const r = { updated: 0, created: 0, parts: [], errors: [] };
      for (const o of d.overlays) {
        const body = { name: String(o.name || o.tool).slice(0, 80), settings: noSecrets(o.settings) };
        try {
          if (o.id && mine.has(o.id)) { await SBA.api('PUT', '/me/overlays/' + o.id, body); r.updated++; }
          else { await SBA.api('POST', '/me/overlays', Object.assign({ tool: o.tool }, body)); r.created++; }
        } catch (e) { r.errors.push(`${body.name} : ${e.message}`); }
        if (onStep) onStep(r);
      }
      for (const [k, path] of PARTS) {
        if (!isObj(d[k])) continue;
        const body = k === 'page' ? Object.assign({}, d[k], { site: location.href.split('#')[0].split('?')[0] }) : d[k];
        try { await SBA.api('PUT', path, body); r.parts.push(k); } catch (e) { r.errors.push(`${k} : ${e.message}`); }
        if (onStep) onStep(r);
      }
      return r;
    },
    LABELS: { bot: 'bot', subathon: 'subathon', sr: 'demandes de musique', jeux: 'mini-jeux', page: 'page publique', team: 'accès des modos', stats: 'statistiques' },
  };
})();
