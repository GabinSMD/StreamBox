# Extension « Musiques des redifs »

Quand tu regardes une **VOD Twitch** ou une **rediffusion de live YouTube** d'une chaîne qui utilise StreamBox, l'extension affiche la musique qui passait à ce moment du live, avec des liens vers Spotify, Deezer et YouTube Music. La liste complète est cliquable et saute au bon moment de la vidéo. C'est pratique quand la musique est coupée dans la rediffusion pour des raisons de droits d'auteur.

### Mode synchro 🔄

Le bouton **🔄 Synchro** de la carte joue la musique **en même temps que la VOD**, au bon moment du morceau, dans un petit lecteur YouTube :
- l'extension cherche le morceau sur YouTube (titre + artiste), ou utilise directement son lien YouTube s'il en a un ; si une vidéo refuse d'être intégrée, elle essaie la suivante ;
- le lecteur suit la VOD : lecture, pause, avance ou retour, vitesse ; il se recale tout seul s'il s'écarte de plus de 2 secondes ;
- au changement de morceau, il passe au suivant ; à la fin d'un morceau, il s'arrête jusqu'au prochain ;
- le volume de la musique se règle sous le lecteur. Le choix (synchro activée, volume) est mémorisé.

Le mode synchro a besoin de la permission de lire youtube.com (pour trouver le morceau) : le navigateur la demande à l'installation.

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
- En mode synchro, la version YouTube trouvée peut différer de celle jouée en live (version live, remix…), et la position est celle du début réel du morceau noté par l'overlay Musique : l'écart est de l'ordre d'une ou deux secondes.
- Spotify et Deezer ne permettent pas de choisir la position dans leurs lecteurs intégrés : le mode synchro passe donc par YouTube.
