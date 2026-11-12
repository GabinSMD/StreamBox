/* Automatisations : « quand il se passe X, faire Y ».
 * Définitions (pour la page d'édition) et moteur (pour l'overlay invisible dans OBS).
 * Une règle : { id, name, on, trigger: { type, ...réglages }, cooldown, actions: [{ type, ...réglages }] }
 */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const LEVELS = [['everyone', 'Tout le monde'], ['sub', 'Abonnés'], ['vip', 'VIP'], ['mod', 'Modos']];
  const TOOLS = [['compteurs', 'Compteurs'], ['sons', 'Sons des viewers'], ['roue', 'Roue'], ['qrdons', 'QR code de dons'], ['generique', 'Générique de fin'], ['minuteur', 'Compte à rebours'], ['sondage', 'Sondage'], ['giveaway', 'Giveaway'], ['objectifs', 'Objectif'], ['alertes', 'Alertes'], ['tts', 'Lecture à voix haute'], ['subathon', 'Subathon'], ['pngtuber', 'PNGTuber (humeur)'], ['shoutout', 'Shoutout vidéo (pseudo)'], ['clips', 'Lecteur de clips (« suivant »)'], ['etiquettes', 'Étiquettes (« reset »)']];

  /* Déclencheurs : f = champs à remplir dans l'éditeur */
  const TRIGGERS = {
    command: { label: '💬 Commande du chat', f: [['cmd', 'Commande', 'text', '!hype'], ['level', 'Qui peut l’utiliser', LEVELS, 'everyone']] },
    keyword: { label: '🔎 Mot dans le chat', f: [['words', 'Mots (séparés par des virgules)', 'text', 'gg, bravo'], ['level', 'Qui', LEVELS, 'everyone']] },
    points: { label: '✨ Récompense de points de chaîne', f: [['reward', 'Nom de la récompense (vide = toutes)', 'text', '']] },
    follow: { label: '💜 Nouveau follow', f: [] },
    sub: { label: '⭐ Abonnement ou réabonnement', f: [['months', 'Mois minimum', 'number', 0]] },
    gift: { label: '🎁 Abonnements offerts', f: [['min', 'Nombre minimum', 'number', 1]] },
    bits: { label: '💎 Bits', f: [['min', 'Bits minimum', 'number', 100]] },
    raid: { label: '🚀 Raid', f: [['min', 'Viewers minimum', 'number', 1]] },
    don: { label: '💸 Don', f: [['min', 'Montant minimum', 'number', 1]] },
    online: { label: '🔴 Début du live', f: [] },
    timer: { label: '⏰ Toutes les X minutes', f: [['minutes', 'Toutes les (min)', 'number', 15]] },
  };
  /* Actions */
  const ACTIONS = {
    scene: { label: '🎬 Changer de scène OBS', f: [['scene', 'Scène', 'scene', '']] },
    source: { label: '👁️ Afficher / masquer une source OBS', f: [['source', 'Source', 'source', ''], ['scene', 'Dans la scène (vide = scène en cours)', 'scene', ''], ['mode', 'Action', [['show', 'Afficher'], ['hide', 'Masquer'], ['toggle', 'Inverser']], 'show'], ['secs', 'Puis revenir après (s, 0 = non)', 'number', 0]] },
    filter: { label: '🎨 Activer un filtre OBS', f: [['source', 'Source ou scène', 'source', ''], ['filter', 'Filtre', 'text', ''], ['mode', 'Action', [['on', 'Activer'], ['off', 'Désactiver']], 'on'], ['secs', 'Puis revenir après (s, 0 = non)', 'number', 0]] },
    media: { label: '▶️ Relancer une source média', f: [['source', 'Source média', 'source', '']] },
    replay: { label: '📼 Sauvegarder le replay (Replay Buffer)', f: [] },
    overlay: { label: '🧩 Commande d’un overlay StreamBox', f: [['tool', 'Overlay', TOOLS, 'sons'], ['args', 'Commande (ex. « tada » pour un son, « mort + » pour un compteur)', 'text', 'tada']] },
    sound: { label: '🔊 Jouer un son (lien)', f: [['url', 'Lien du fichier audio (https)', 'text', ''], ['volume', 'Volume (0 à 1)', 'number', 0.6]] },
    tts: { label: '🗣️ Dire un texte', f: [['text', 'Texte', 'text', 'Merci {user} !']] },
    chat: { label: '💬 Message dans le chat', f: [['text', 'Message', 'text', 'Merci {user} ! 💜']] },
    discord: { label: '📣 Message sur Discord', f: [['text', 'Message', 'text', '{user} vient de déclencher une automatisation !']] },
    wait: { label: '⏳ Attendre', f: [['secs', 'Secondes', 'number', 3]] },
  };
  const VARS = '{user} {amount} {months} {count} {reward} {input} {args} {channel}';
  const uid = () => Math.random().toString(36).slice(2, 10);
  function blank(defs, type) { const o = { type }; (defs[type].f || []).forEach(([k, , , d]) => { o[k] = d; }); return o; }
  SB.AUTO = { TRIGGERS, ACTIONS, VARS, LEVELS, TOOLS, uid, newTrigger: (t) => blank(TRIGGERS, t), newAction: (t) => blank(ACTIONS, t),
    newRule: () => ({ id: uid(), name: 'Nouvelle automatisation', on: true, cooldown: 10, trigger: blank(TRIGGERS, 'command'), actions: [blank(ACTIONS, 'overlay')] }) };

  /* Nettoie les règles (provenant de l'URL ou du compte) */
  SB.AUTO.sanitize = function (rules) {
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const clean = (defs, x) => {
      if (!x || !defs[x.type]) return null;
      const o = { type: x.type };
      defs[x.type].f.forEach(([k, , kind, d]) => { const v = x[k] == null ? d : x[k]; o[k] = kind === 'number' ? (Number.isFinite(+v) ? +v : d) : str(v, 300); });
      return o;
    };
    return (Array.isArray(rules) ? rules : []).slice(0, 50).map((r) => ({
      id: str(r.id || uid(), 20), name: str(r.name, 60), on: r.on !== false, cooldown: Math.max(0, Math.min(3600, +r.cooldown || 0)),
      trigger: clean(TRIGGERS, r.trigger), actions: (Array.isArray(r.actions) ? r.actions : []).slice(0, 15).map((a) => clean(ACTIONS, a)).filter(Boolean),
    })).filter((r) => r.trigger);
  };

  /* ---------- Moteur ---------- */
  SB.AUTO.Engine = class {
    constructor(rules, io) { this.rules = SB.AUTO.sanitize(rules); this.io = io; this.last = {}; this.log = []; }
    note(text) { this.log.unshift({ t: Date.now(), text }); this.log = this.log.slice(0, 30); if (this.io.log) this.io.log(text); }
    level(m) { return m.isBroadcaster ? 4 : m.isMod ? 3 : m.isVip ? 2 : m.isSub ? 1 : 0; }
    /* Un événement arrive : on lance chaque règle qui correspond */
    emit(type, ev) {
      for (const r of this.rules) {
        if (!r.on || r.trigger.type !== type || (ev.ruleId && ev.ruleId !== r.id) || !this.match(r.trigger, ev)) continue;
        const now = Date.now();
        if (!ev.force && r.cooldown && now - (this.last[r.id] || 0) < r.cooldown * 1000) continue;
        this.last[r.id] = now;
        this.run(r, ev);
      }
    }
    match(t, ev) {
      const LV = { everyone: 0, sub: 1, vip: 2, mod: 3 };
      switch (t.type) {
        case 'command': return ev.cmd === String(t.cmd).trim().toLowerCase() && (ev.level || 0) >= (LV[t.level] || 0);
        case 'keyword': { const words = String(t.words).toLowerCase().split(',').map((w) => w.trim()).filter(Boolean); const txt = String(ev.text || '').toLowerCase(); return (ev.level || 0) >= (LV[t.level] || 0) && words.some((w) => txt.includes(w)); }
        case 'points': return !t.reward.trim() || String(ev.reward).trim().toLowerCase() === t.reward.trim().toLowerCase();
        case 'sub': return (ev.months || 1) >= (t.months || 0);
        case 'gift': case 'bits': case 'raid': case 'don': return (ev.n || 0) >= (t.min || 0);
        case 'timer': return true;
        default: return true;
      }
    }
    fill(text, ev) {
      const v = { user: ev.user || '', amount: ev.amount || '', months: ev.months || '', count: ev.n || '', reward: ev.reward || '', input: ev.input || '', args: ev.args || '', channel: this.io.channel || '' };
      return String(text || '').replace(/\{(\w+)\}/g, (all, k) => (k in v ? v[k] : all));
    }
    async run(r, ev) {
      const test = !!(SB.testing && SB.testing()); // événement de test : on montre ce qui se passerait, sans rien faire pour de vrai
      this.note(`${test ? '🧪 test · ' : '▶ '}${r.name || r.trigger.type}${ev.user ? ' · ' + ev.user : ''}`);
      if (test) { r.actions.forEach((a) => this.note(`  ${SB.AUTO.ACTIONS[a.type].label} (non exécuté pendant un test)`)); return; }
      for (const a of r.actions) {
        try { await this.act(a, ev); } catch (e) { this.note(`⚠️ ${SB.AUTO.ACTIONS[a.type].label} : ${e.message}`); }
      }
    }
    async act(a, ev) {
      const io = this.io, obs = io.obs, sleep = (s) => new Promise((ok) => setTimeout(ok, Math.max(0, s) * 1000));
      const need = () => { if (!obs || !obs.ready) throw new Error('OBS non connecté (mot de passe du serveur WebSocket dans les réglages)'); return obs; };
      const later = (secs, fn) => { if (secs > 0) setTimeout(() => fn().catch(() => {}), secs * 1000); };
      switch (a.type) {
        case 'wait': return sleep(Math.min(a.secs, 600));
        case 'scene': return need().call('SetCurrentProgramScene', { sceneName: a.scene });
        case 'source': {
          const o = need();
          const scene = a.scene || (await o.call('GetCurrentProgramScene')).currentProgramSceneName;
          const { sceneItemId } = await o.call('GetSceneItemId', { sceneName: scene, sourceName: a.source });
          const cur = (await o.call('GetSceneItemEnabled', { sceneName: scene, sceneItemId })).sceneItemEnabled;
          const want = a.mode === 'show' ? true : a.mode === 'hide' ? false : !cur;
          await o.call('SetSceneItemEnabled', { sceneName: scene, sceneItemId, sceneItemEnabled: want });
          later(a.secs, () => o.call('SetSceneItemEnabled', { sceneName: scene, sceneItemId, sceneItemEnabled: cur }));
          return;
        }
        case 'filter': {
          const o = need(), want = a.mode !== 'off';
          await o.call('SetSourceFilterEnabled', { sourceName: a.source, filterName: a.filter, filterEnabled: want });
          later(a.secs, () => o.call('SetSourceFilterEnabled', { sourceName: a.source, filterName: a.filter, filterEnabled: !want }));
          return;
        }
        case 'media': return need().call('TriggerMediaInputAction', { inputName: a.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
        case 'replay': return need().call('SaveReplayBuffer');
        case 'overlay': return need().call('BroadcastCustomEvent', { eventData: { streambox: { tool: a.tool, args: this.fill(a.args, ev) } } });
        case 'sound': {
          if (!/^https:\/\//.test(a.url)) throw new Error('lien https attendu');
          const au = new Audio(a.url); au.volume = Math.max(0, Math.min(1, a.volume)); return au.play();
        }
        case 'tts': {
          if (!window.speechSynthesis) throw new Error('voix indisponible');
          const u = new SpeechSynthesisUtterance(this.fill(a.text, ev)); u.lang = window.SB_LANG_TAG || 'fr-FR'; speechSynthesis.speak(u); return;
        }
        case 'chat': case 'discord': {
          if (!io.say) throw new Error('enregistre cet overlay dans ton compte StreamBox');
          return io.say(this.fill(a.text, ev), a.type);
        }
      }
    }
  };
})();
