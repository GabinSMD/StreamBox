/* Configuration du site StreamBox.
 * twitchClientId : identifiant d'une application Twitch (https://dev.twitch.tv/console/apps).
 *   - Type de client : « Public » (aucun secret n'est utilisé, tout se passe dans le navigateur)
 *   - URL de redirection OAuth : https://<ton-site>/connexion.html  (et http://localhost:8000/connexion.html pour tester)
 * Sans cet identifiant, les outils marchent quand même ; seules les fonctions qui demandent
 * l'API Twitch (clips du Rewind, infos de la VOD) sont désactivées.
 */
window.SB_CONFIG = {
  twitchClientId: 'j2u8uxo89sbgljg5ni1v5idwdthf4b',
  // Spotify (overlay Musique) : https://developer.spotify.com/dashboard, URL de redirection https://<ton-site>/spotify.html
  spotifyClientId: '',
  // Last.fm (overlay Musique : Deezer, YouTube Music, Apple Music…) : https://www.last.fm/api/account/create
  lastfmApiKey: '',
  // Relais StreamBox (dons Ko-fi, musiques des redifs) : voir relay/README.md
  relayUrl: '',
};
