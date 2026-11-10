/* Compte StreamBox côté site : session (après connexion Twitch) et appels au relais. */
(function () {
  'use strict';
  const KEY = 'sb-session';
  const relay = () => ((window.SB_CONFIG && SB_CONFIG.relayUrl) || '').replace(/\/$/, '');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

  window.SBA = {
    enabled: () => !!relay() && !!(window.SB_CONFIG && SB_CONFIG.twitchClientId),
    relay,
    session: () => read(),
    loggedIn: () => !!(read() && read().session),
    set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
    login(retour) { location.href = 'connexion.html?compte=1&retour=' + encodeURIComponent(retour || (location.pathname.split('/').pop() + location.search)); },
    async logout(everywhere) { // everywhere : toutes les sessions du compte (les liens d'overlay continuent de marcher)
      const s = read();
      if (s) await fetch(relay() + (everywhere ? '/me/logout-all' : '/auth/logout'), { method: 'POST', headers: { Authorization: 'Bearer ' + s.session } }).catch(() => {});
      this.clear(); location.href = 'index.html';
    },
    async api(method, path, body) {
      const s = read();
      if (!s) throw new Error('non connecté');
      const r = await fetch(relay() + path, { method, headers: { Authorization: 'Bearer ' + s.session, 'Content-Type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { this.clear(); throw Object.assign(new Error(d.error || 'session expirée : reconnecte-toi'), { auth: true }); }
      if (!r.ok) throw new Error(d.error || 'erreur ' + r.status);
      return d;
    },
    async deleteAccount() { await this.api('DELETE', '/me'); this.clear(); try { localStorage.removeItem('sb-wants-bot'); localStorage.removeItem('sb-wants'); localStorage.removeItem('sb-twitch-token'); } catch (e) { /* ignore */ } },
    overlayLink(tool, id) { return new URL(tool.overlay + '?o=' + id, location.href).toString(); },
  };

  // Jetons et identifiants gérés dans « Mon compte » (jamais dans le lien de l'overlay)
  SBA.SECRET_FIELDS = ['token', 'spotify', 'spotifycid', 'lastfm', 'lfmkey', 'sejwt', 'sltoken', 'kofi', 'kofiv', 'webhook', 'obspass'];
})();
