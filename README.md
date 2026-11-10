# StreamBox

[![Licence : AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-9b5cff)](LICENSE) [![Site](https://img.shields.io/badge/site-streambox.gabin--simond.fr-ff5ca8)](https://streambox.gabin-simond.fr/)

**Fait par Igatax, inspiré par PiRDub.** Projet open source : toute contribution est la bienvenue (voir [CONTRIBUTING.md](CONTRIBUTING.md)). Une suggestion ou une contribution au projet principal vaut mieux qu'un fork.

Une boîte à outils gratuite pour streamers. Elle regroupe dans un seul site ce qui demande d’habitude une dizaine de services différents. Rien à installer, aucun compte à connecter.

## Ce qui est inclus

| Outil | Type | Remplace (d’après [awesome-twitch](https://github.com/sammwyy/awesome-twitch)) |
|---|---|---|
| 💬 Chat en overlay : Twitch, Kick et YouTube réunis (5 thèmes, emotes 7TV/BTTV/FFZ, Super Chats) | Overlay OBS | ChatIS, showmy.chat, StreamElements Chatbox… |
| 🔔 Alertes : subs, resubs, subs offerts, raids, bits, follows, points de chaîne, dons | Overlay OBS | Alertes StreamElements / Streamlabs |
| 🎯 Objectifs (abonnés, followers, bits, dons, perso) avec paliers | Overlay OBS | Objectifs StreamElements / Streamlabs |
| 🎡 Roue de la fortune (commande, tous les X abos, bits ; relie le subathon) | Overlay OBS | Wheel of Item, PickerSpin |
| 📊 Sondage piloté par le chat | Overlay OBS | chat.vote |
| 🎁 Giveaway avec tirage animé (aléatoire Web Crypto) | Overlay OBS | PickerSpin, Wheel of Item |
| 😂 `!showemote` et pluie d’emotes | Overlay OBS | Show Emote |
| ⏳ Écran « Ça commence bientôt » avec compte à rebours | Overlay OBS | Packs d’écrans d’attente |
| ⏱️ Timer de subathon (abos, subs offerts, bits, dons, raids, happy hour, durée max, sauvegarde) | Overlay OBS | marathon-timer.com |
| ⏪ Rewind : condensé vidéo des temps forts, repérés grâce aux réactions du chat et à la voix du streamer | Overlay OBS + obs-websocket | ClipMe, Voding (repérage) |
| 🎵 Musique en cours : Spotify direct, Deezer, YouTube Music et Apple Music via Last.fm | Overlay OBS | Tuna, Amuse |
| 📣 Annonces Discord : début du live, récap de fin, gagnant du giveaway, `!discord` | Source OBS invisible | Bots d’annonce |
| 🧩 Extension « Musiques des redifs » (VOD Twitch et rediffusions YouTube) | Extension navigateur | |
| 🔊 Lecture à voix haute : `!tts`, cheers, dons, points de chaîne ; voix du navigateur ou voix française du relais | Overlay OBS | TTS StreamElements / Streamlabs |
| 🧪 Testeur d’emotes : tes emotes dans un faux chat Twitch / Discord (sombre et clair, vraies tailles) avec vérification du format, du poids, de la transparence et du contraste | Page web | Emote Tester |
| 🐱 PNGTuber : avatar qui parle quand tu parles (micro lu dans OBS), clignements, humeurs ; images envoyées dans ton compte | Overlay OBS | Veadotube mini, PNGTuber Plus |
| 📣 Shoutout vidéo : `!so @pseudo` (modos) ou un raid joue un clip de la chaîne citée, avec son nom, son avatar et son dernier jeu | Overlay OBS | Shoutout vidéo de Streamer.bot |
| 🎞️ Lecteur de clips : tes meilleurs clips en boucle pour l’écran « pause », mis en pause quand la scène n’est pas affichée | Overlay OBS | Clip player des écrans d’attente |
| 🏷️ Étiquettes et bandeau : dernier follow, abo, don, top bits, top don, nombre de followers et d’abonnés, en liste, à tour de rôle ou en bandeau défilant | Overlay OBS | Labels Streamlabs / StreamElements, Snaz |
| 💬 Sous-titres traduits en direct : ta voix transcrite (Chrome / Edge) et traduite (dans le navigateur ou par Workers AI) | Page web + overlay OBS + relais | StreamTranslate |
| ⚡ Automatisations : « quand il se passe X, fais Y » (commande, points de chaîne, follow, abo, bits, raid, don, début du live, minuterie → scène, source, filtre, média, replay, overlay, son, voix, chat, Discord, pause) | Page web + source OBS invisible | Streamer.bot, SAMMI |
| 🎬 Générique de fin : abos, abos offerts, bits, dons, raids, follows et chatteurs du live qui défilent | Overlay OBS + relais | Crédits Streamer.bot |
| 🔢 Compteurs (morts, victoires…) pilotés par `!mort +` dans le chat ou depuis le panneau | Overlay OBS | Compteurs StreamElements / Nightbot |
| 🔉 Sons des viewers : commande, points de chaîne ou bits, sons intégrés ou tes fichiers | Overlay OBS | SoundAlerts |
| 📱 QR code de dons (Ko-fi, PayPal, Tipeee…), généré sans service extérieur | Overlay OBS | TipStreams |
| 📅 Planning des lives tiré du planning Twitch, en liste ou en semaine, et image à partager (Discord, réseaux) avec le texte prêt à coller | Overlay OBS + page web + relais | Plannings faits main sur Canva |
| 🚂 Hype Train : niveau, progression, temps restant, meilleurs contributeurs, record de la chaîne | Overlay OBS | Hype Train StreamElements / Streamlabs |
| 🎬 `!clip` : le bot crée un clip et le poste sur Discord | Bot (relais) | — |
| 📊 Statistiques des lives : viewers minute par minute, chat, follows, abos, bits, raids, dons, catégories ; tendances et export CSV | Page web + relais | TwitchTracker, StreamsCharts |
| 🛡️ Panneau de modération : sanctions en un clic, fiche viewer, AutoMod, journal de l’équipe, débans, modes du chat, annonces, sondages, prédictions, file des récompenses de points de chaîne, titre et raid ; chaque modo avec son compte Twitch | Page web (dock OBS) + relais | Mod View de Twitch |
| 🌐 Page publique de la chaîne : commandes du bot, planning Twitch, liens, musique et subathon ; `!commandes` y renvoie | Page web + relais | Pages de commandes Nightbot / StreamElements, Linktree |
| 🎲 Mini-jeux du chat : points virtuels gagnés en discutant, duels, prédictions, quiz, classement (aucune valeur réelle) | Page web + relais + overlay | Loyalty de StreamElements / Streamlabs |
| 🎶 Demandes de musique (`!sr`) : YouTube (overlay Lecteur) ou Spotify (file Premium), limites, modération, page publique | Page web + relais + overlay | Song Requests de Nightbot / StreamElements |
| ⏱️ Subathon en direct : timer sur le relais, page publique pour les viewers (paliers, idées, votes) | Page web + relais | marathon-timer.com |
| 🤖 Bot de chat : commandes, messages automatiques, modération, remerciements (24 h/24 sur le relais) | Page web + relais | Nightbot, Moobot, Fossabot |
| 🎛️ Panneau de contrôle : boutons pour tous les overlays et les scènes OBS | Page web / dock OBS | Kloot, Poltergeist, Xenon |
| 🖼️ Redimensionneur d’emotes et de badges | Page web | EmoteResizer, Twitch Emote Resizer |
| 💰 Calculateur de revenus | Page web | Calculateurs divers |
| ✅ Vérifier mon installation : relais, connexion Twitch et permissions, abonnements aux événements, overlays ouverts dans OBS, test d’OBS ; simulateur qui envoie de faux follows, abos, raids, bits, dons, points de chaîne ou Hype Train aux overlays ouverts | Page web + relais | Bouton « Test alert » de Streamlabs |
| 🧭 Annuaire des autres outils (clips, bots, stats…) | Page web | |

## Comment ça marche

- **100 % statique** : du HTML, du CSS et du JavaScript, sans serveur ni build. Le site s’héberge gratuitement sur GitHub Pages, Netlify ou Cloudflare Pages.
- **Chat Twitch en anonyme** : les overlays se connectent au chat en lecture seule (`justinfan…` via `wss://irc-ws.chat.twitch.tv`), donc sans token ni OAuth. Le chat donne déjà accès aux messages, aux abonnements, aux raids et aux bits.
- **Réglages dans l’URL** : le configurateur (`outil.html?id=…`) génère un lien que l’on colle dans OBS (Source navigateur). Il n’y a aucune base de données.
- **Contrôle depuis le chat** : le streamer et ses modos pilotent sondages, giveaways et minuteur avec des commandes (`!sondage`, `!giveaway tirage`, `!timer +5`…).
- **Mode démo** : ajoute `&demo=1` à n’importe quel overlay pour voir de faux messages et événements. C’est ce qu’utilise l’aperçu du configurateur.

## Personnaliser l’apparence

Chaque overlay a un panneau « 🎨 Personnaliser l’apparence » : couleur du texte et des fonds, opacité, arrondi, ombres, contour, et un champ de **CSS libre** pour aller plus loin. Tout est enregistré dans le lien de l’overlay. Pour modifier un overlay déjà installé, colle son lien dans « Modifier » : le configurateur reprend tous ses réglages. On peut aussi importer une capture de son propre jeu comme fond d’aperçu.

## Rewind : comment les temps forts sont repérés

La source Rewind reste dans OBS pendant tout le live et calcule chaque seconde un score d’intensité :

- **Chat** : messages des 10 dernières secondes comparés au rythme habituel (moyenne sur 5 min), part de réactions (KEKW, LUL, mdr, ptdr, POG, ???, clip…) et nombre de personnes différentes.
- **Voix** : niveau du micro (lu dans OBS via obs-websocket) sur 1,5 s, comparé au niveau habituel de parole (médiane sur 2 min). Un cri ou un fou rire dépasse nettement ce niveau.

Au-delà du seuil, StreamBox attend quelques secondes (pour inclure la réaction), puis sauvegarde le **Replay Buffer** d’OBS. Au stream suivant, il rejoue les meilleurs moments dans l’ordre, via une source Média, avec un bandeau (raison, heure, réactions du chat, intensité). En option, il peut créer des clips Twitch à la place, et compléter avec les meilleurs clips de la communauté.

## Comptes StreamBox

Avec le relais (voir `relay/README.md`), chaque streamer se connecte avec **son compte Twitch** :

- ses overlays et ses intégrations sont enregistrés dans son compte (page **Mon compte**) ;
- le lien à coller dans OBS est court (`overlays/chat.html?o=…`) et **ne contient aucun jeton** ;
- quand il modifie un réglage sur le site, l'overlay dans OBS se recharge tout seul ;
- les jetons (Twitch, Spotify, StreamElements, Streamlabs, Ko-fi, Discord, OBS) sont **chiffrés** sur le relais. Chaque overlay ne reçoit que ceux dont son outil a besoin, et l'accès Twitch est renouvelé automatiquement ;
- s'il a montré un lien par erreur, il peut le régénérer : l'ancien cesse de marcher.
- il peut **sauvegarder sa configuration** dans un fichier (overlays, bot, automatisations, subathon, demandes de musique, mini-jeux, page publique) et la réimporter, sur le même compte ou un autre. Le fichier ne contient jamais de jeton ni de clé.

Sans compte, tout fonctionne comme avant, avec les réglages dans le lien.

## Intégrations

| Service | Ce qu’il apporte | Serveur ? |
|---|---|---|
| Twitch | Chat (sans compte), follows, points de chaîne, abonnés, clips, début et fin du live | Non |
| OBS (obs-websocket) | Micro et Replay Buffer (Rewind), panneau de contrôle, scènes | Non |
| Discord | Webhook : annonces, récap, gagnants, messages des modos | Non |
| Spotify | Morceau en cours (connexion PKCE, sans secret) | Non |
| Deezer, YouTube Music, Apple Music | Via Last.fm (scrobbling natif ou extension Web Scrobbler) | Non |
| StreamElements, Streamlabs | Dons en direct | Non |
| Ko-fi, et tout service à webhook | Dons en direct via le relais | Relais Cloudflare gratuit (`relay/`) |

Toutes les clés publiques (Client ID Twitch et Spotify, clé API Last.fm, adresse du relais) se règlent dans `js/config.js`.

## Dons automatiques du subathon

Les dons comptent tout seuls dans le subathon du relais, et chacun n'est compté qu'une fois :

| Source | Comment | Délai | OBS fermé |
|---|---|---|---|
| Ko-fi et tout webhook (Tipeee via Zapier…) | webhook vers le relais (clé Ko-fi de Mon compte) | instantané | ✅ |
| StreamElements | le relais lit les derniers dons chaque minute pendant le subathon (jeton JWT) | ≤ 1 min | ✅ |
| Streamlabs | l'overlay du subathon (mode « relais », lien de compte) transmet le don au relais | instantané | ❌ |
| Autres | `!subathon don 15 Pseudo` ou le bouton de la page de gestion | — | ✅ |

Le bot peut aussi remercier chaque donateur dans le chat (événement « Don »).

## Panneau de contrôle

`panneau.html` se connecte au serveur WebSocket d’OBS et envoie des `BroadcastCustomEvent`. Chaque overlay où « Contrôlable depuis le panneau » est coché les reçoit, et les traite comme la commande de chat correspondante, tapée par le streamer. On peut l’ouvrir dans un navigateur sur le PC du stream, ou comme dock OBS (Docks → Docks de navigateur personnalisés). La roue utilise le même canal pour ajouter ou retirer du temps au subathon.

## Connexion Twitch

Une seule connexion sert à tous les outils : follows et points de chaîne (EventSub WebSocket, sans serveur), total d’abonnés et de followers, création et lecture de clips. Pour l’activer sur ton site :

1. Crée une application sur https://dev.twitch.tv/console/apps : type de client **Public**, URL de redirection `https://<ton-site>/connexion.html` (et `http://localhost:8000/connexion.html` pour tester en local).
2. Copie le *Client ID* dans `js/config.js` (`twitchClientId`).

La connexion n’utilise aucun secret. Permissions demandées : `clips:edit`, `moderator:read:followers`, `channel:read:redemptions`, `channel:read:subscriptions`, `channel:read:hype_train`. Rien d’autre : ni messages privés, ni modification de la chaîne. Sans connexion, le Rewind fonctionne quand même, mais il ne montre que les statistiques du chat enregistrées pendant le stream.

## Lancer en local

```bash
cd streambox
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Structure

```
index.html            Accueil (outils phares, étapes, panneau des modos, catégories)
outils.html           Catalogue complet des outils : recherche et filtres (type, connexion, plateforme) gardés dans l’adresse
img/logo.svg          Logo (symbole) ; img/og.png : image de partage ; img/apercus/ : aperçus des cartes du catalogue
js/catalogue.js       Cartes d’outils communes à l’accueil et au catalogue
js/icons.js           Icônes à la place des emojis de l’interface (sprite img/icons.svg, Lucide, licence ISC)
outil.html            Configurateur générique (formulaire, lien, aperçu)
annuaire.html         Annuaire des outils externes
redimensionneur.html  Redimensionneur d'emotes
calculateur.html      Calculateur de revenus
overlays/*.html       Les overlays OBS
js/sb.js              Noyau : client chat Twitch, emotes, apparence, liens courts, mode démo
js/account.js         Compte StreamBox côté site (session, appels au relais)
compte.html           Mon compte : overlays, intégrations, page publique, images, compte (une section à la fois : #integrations, #page…)
js/site.js            En-tête, pied de page et barre latérale « Mon espace » (écrans du streamer ; ?dock=1 la masque dans un dock OBS)
bot.html              Bot de chat
subathon.html         Gestion du subathon (streamer)
live.html             Page publique du subathon (viewers)
chaine.html           Page publique de la chaîne (commandes, planning, liens)
relay/subathon.js     Logique du subathon côté relais
relay/sr.js           Logique des demandes de musique
sr.html / demandes.html  Gestion / file publique des demandes de musique
overlays/lecteur.html Lecteur YouTube des demandes
relay/bot.js          Logique du bot (commandes, modération, messages automatiques, événements)
relay/equipe.js       Actions faites pour les modos (sondages, prédictions, récompenses) et page publique
js/highlights.js      Détecteur de temps forts (chat + voix)
js/obs.js             Client obs-websocket v5
js/eventsub.js        Client EventSub WebSocket (follows, points de chaîne, début/fin du live)
js/dons.js            Dons : StreamElements, Streamlabs, relais Ko-fi
relay/                Relais Cloudflare Worker (Ko-fi, webhooks, musiques des redifs)
extension/            Extension navigateur « Musiques des redifs »
panneau.html          Panneau de contrôle
js/tools.js           Registre des outils et de leurs réglages (ajouter un outil = ajouter une entrée)
js/annuaire-data.js   Données de l'annuaire
```

## Feuille de route

Prochaines étapes :

- [x] Alertes de follows et de points de chaîne
- [x] Objectifs, et follows et points de chaîne dans le subathon
- [x] Roue de la fortune
- [x] Dons automatiques : StreamElements, Streamlabs, Ko-fi (et tout webhook via le relais)
- [x] Discord, musique (Spotify, Deezer, YouTube Music), extension des redifs
- [x] Bot de chat : commandes personnalisées, messages automatiques, modération, événements
- [x] Panneau de contrôle (dock OBS)
- [x] Lecture des messages à voix haute (TTS) et demandes de musiques par le chat
- [x] Mini-jeux du chat : points, duels, prédictions, quiz
- [x] Panneau de modération (sanctions, modes du chat, AutoMod, fiche viewer)
- [x] Statistiques des lives
- [x] Multi-plateforme : chat Kick et YouTube fusionnés (overlay Chat)
- [x] Site, overlays et réponses du bot en français, anglais et espagnol
- [x] Comptes StreamBox (connexion Twitch, réglages et jetons enregistrés, liens courts)
- [x] Planning des lives (overlay et image à partager), Hype Train, sauvegarde et import de la configuration
- [x] Vérification de l’installation et simulateur d’événements

## Contribuer

Idées, bugs, code : tout est bienvenu. Voir [CONTRIBUTING.md](CONTRIBUTING.md).
- 💡 [Proposer une idée](https://github.com/GabinSMD/StreamBox/issues/new?template=suggestion.md)
- 🐛 [Signaler un bug](https://github.com/GabinSMD/StreamBox/issues/new?template=bug.md)

## Licence

StreamBox est un logiciel libre sous licence [GNU AGPL-3.0](LICENSE) : tu peux l'utiliser, l'étudier, le modifier et le partager. Une version modifiée, même hébergée en ligne, doit publier son code sous la même licence.
