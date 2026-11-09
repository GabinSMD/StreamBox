# Extension « Musiques des redifs »

Quand tu regardes une **VOD Twitch** ou une **rediffusion de live YouTube** d'une chaîne qui utilise StreamBox, l'extension affiche la musique qui passait à ce moment du live, avec des liens vers Spotify, Deezer et YouTube Music. La liste complète est cliquable et saute au bon moment de la vidéo. C'est pratique quand la musique est coupée dans la rediffusion pour des raisons de droits d'auteur.

## Côté streamer

1. Déploie le relais (voir `relay/README.md`) et mets son adresse dans `js/config.js` (`relayUrl`) et dans `extension/config.js`.
2. Dans l'overlay **Musique**, coche « Publier la liste des musiques » et connecte-toi avec Twitch.
3. Pour YouTube, relie ta chaîne une fois. `UCxxxx` est l'identifiant de ta chaîne (YouTube Studio → Paramètres → Chaîne → Paramètres avancés) :
   ```bash
   curl -X POST https://<relais>/tracks/<ton_login_twitch>/youtube \
     -H "Authorization: Bearer <ton jeton Twitch>" -H "Content-Type: application/json" \
     -d '{"channelId":"UCxxxx"}'
   ```

## Installer l'extension

- **Chrome, Edge, Brave, Opera** : `chrome://extensions`, active le mode développeur, puis « Charger l'extension non empaquetée » et choisis ce dossier.
- **Firefox** : `about:debugging#/runtime/this-firefox`, puis « Charger un module complémentaire temporaire » et choisis `manifest.json`.

Pour une diffusion publique, il faut la publier sur le Chrome Web Store (5 $ une fois) et sur addons.mozilla.org (gratuit).

## Limites

- L'heure de début de la VOD Twitch peut avoir quelques secondes d'écart avec le vrai début du live.
- Les extraits coupés ou les « Temps forts » Twitch montés à partir d'une VOD ne gardent pas l'heure d'origine : ils ne sont pas pris en charge.
- L'extension n'affiche que le morceau. Elle ne remplace pas le son coupé.
