/* Lecteur du mode synchro : héberge le lecteur YouTube (youtube-nocookie) et le pilote par son API postMessage.
 * Il est chargé comme page de l'extension dans la carte, pour ne pas dépendre des règles de sécurité de Twitch.
 * Ordres reçus de la page : load { id, start } · seek { t } · play · pause · volume { v } · rate { r } · stop
 * Renvoie à la page : state { time, state, id } et error { code, id }. */
(function () {
  'use strict';
  let frame = null, cur = null, info = { time: 0, state: -1 };
  const yt = (func, args) => { if (frame && frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [], id: 'sbx', channel: 'widget' }), '*'); };
  const up = (o) => parent.postMessage(Object.assign({ sbx: 'player' }, o), '*');
  function create(id, start) {
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.allow = 'autoplay; encrypted-media';
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&autoplay=1&controls=0&disablekb=1&playsinline=1&start=${Math.max(0, Math.floor(start))}`;
    frame.onload = () => frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'sbx', channel: 'widget' }), '*');
    document.body.appendChild(frame);
  }
  addEventListener('message', (e) => {
    if (frame && e.source === frame.contentWindow) { // nouvelles du lecteur YouTube
      let d; try { d = JSON.parse(e.data); } catch (err) { return; }
      if (d.event === 'infoDelivery' && d.info) { if (d.info.currentTime != null) info.time = d.info.currentTime; if (d.info.playerState != null) info.state = d.info.playerState; up({ type: 'state', time: info.time, state: info.state, id: cur }); }
      else if (d.event === 'onError') up({ type: 'error', code: d.info, id: cur });
      return;
    }
    if (e.source !== parent) return;
    const m = e.data || {};
    if (m.cmd === 'load') { cur = m.id; info = { time: m.start || 0, state: -1 }; create(m.id, m.start || 0); if (m.volume != null) setTimeout(() => yt('setVolume', [m.volume]), 800); }
    else if (m.cmd === 'seek') yt('seekTo', [Math.max(0, m.t), true]);
    else if (m.cmd === 'play') yt('playVideo');
    else if (m.cmd === 'pause') yt('pauseVideo');
    else if (m.cmd === 'volume') yt('setVolume', [Math.max(0, Math.min(100, m.v))]);
    else if (m.cmd === 'rate') yt('setPlaybackRate', [m.r]);
    else if (m.cmd === 'stop') { if (frame) frame.remove(); frame = null; cur = null; }
  });
  up({ type: 'ready' });
})();
