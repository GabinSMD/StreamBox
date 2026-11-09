/* Clips Twitch : trouver les clips d'une chaîne et les lire dans un overlay.
 * Twitch ne donne plus de lien direct vers la vidéo d'un clip : on utilise son lecteur intégré
 * (clips.twitch.tv/embed), qui exige le domaine du site dans « parent ». */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const cache = new Map();
  SB.Clips = {
    async user(login, token) {
      const k = 'u:' + login.toLowerCase();
      if (!cache.has(k)) cache.set(k, SB.helix('users?login=' + encodeURIComponent(login.replace(/^@/, '')), token).then((d) => (d.data || [])[0] || null));
      return cache.get(k);
    },
    async channel(id, token) { return ((await SB.helix('channels?broadcaster_id=' + id, token)).data || [])[0] || {}; },
    /* Clips d'une chaîne, les plus vus d'abord (days = 0 : depuis toujours) */
    async list(broadcasterId, token, { days = 0, first = 50 } = {}) {
      const k = `c:${broadcasterId}:${days}:${first}`;
      if (cache.has(k)) return cache.get(k);
      let q = `clips?broadcaster_id=${broadcasterId}&first=${Math.min(100, first)}`;
      if (days > 0) q += '&started_at=' + new Date(Date.now() - days * 86400000).toISOString();
      const p = SB.helix(q, token).then((d) => (d.data || []).map((c) => ({ id: c.id, title: c.title, creator: c.creator_name, views: c.view_count, duration: c.duration || 30, thumb: c.thumbnail_url, game: c.game_id, at: c.created_at })));
      cache.set(k, p); setTimeout(() => cache.delete(k), 30 * 60000);
      return p;
    },
    async byIds(ids, token) { return ids.length ? ((await SB.helix('clips?' + ids.slice(0, 100).map((i) => 'id=' + encodeURIComponent(i)).join('&'), token)).data || []).map((c) => ({ id: c.id, title: c.title, creator: c.creator_name, views: c.view_count, duration: c.duration || 30, thumb: c.thumbnail_url, broadcaster: c.broadcaster_name })) : []; },
    /* Identifiant d'un clip depuis son lien (clips.twitch.tv/ID ou twitch.tv/chaine/clip/ID) */
    idFrom(s) { const m = String(s || '').trim().match(/(?:clips\.twitch\.tv\/(?:embed\?clip=)?|\/clip\/)([\w-]+)/) || String(s || '').trim().match(/^([A-Za-z0-9][\w-]{10,})$/); return m && m[1]; },
    embed(id, muted) { return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(id)}&parent=${encodeURIComponent(location.hostname || 'localhost')}&autoplay=true&muted=${muted ? 'true' : 'false'}&preload=auto`; },
    /* Lit un clip dans `box` ; renvoie une promesse résolue à la fin du clip (durée connue) ou après maxSecs */
    play(box, clip, { muted = false, maxSecs = 60 } = {}) {
      const f = document.createElement('iframe');
      f.allow = 'autoplay; encrypted-media'; f.setAttribute('allowfullscreen', ''); f.className = 'clip-frame';
      f.src = SB.Clips.embed(clip.id, muted);
      box.replaceChildren(f);
      const secs = Math.min(maxSecs || 60, (clip.duration || 30) + 1.5);
      return new Promise((done) => setTimeout(done, secs * 1000));
    },
  };
})();
