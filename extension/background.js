/* Mode synchro : trouve la vidéo YouTube d'un morceau (titre + artiste) sans clé d'API.
 * La recherche se fait ici, et pas dans la page Twitch, car seul le service de l'extension peut lire youtube.com. */
const api = typeof browser !== 'undefined' ? browser : chrome;
const cache = new Map();
async function search(q) {
  if (cache.has(q)) return cache.get(q);
  const r = await fetch('https://www.youtube.com/results?sp=EgIQAQ%253D%253D&search_query=' + encodeURIComponent(q), { credentials: 'omit' });
  const html = await r.text();
  const ids = [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, 5); // 5 résultats : si une vidéo refuse d'être intégrée, on essaie la suivante
  cache.set(q, ids);
  return ids;
}
api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'yt-search' || typeof msg.q !== 'string') return false;
  search(msg.q.slice(0, 200)).then((ids) => reply({ ids }), (e) => reply({ ids: [], error: String(e && e.message || e) }));
  return true; // réponse asynchrone
});
