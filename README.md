# StreamBox

Une boîte à outils gratuite pour streamers. Elle regroupe dans un seul site ce qui demande d’habitude une dizaine de services différents. Rien à installer, aucun compte à connecter.

## Ce qui est inclus

| Outil | Type | Remplace (d’après [awesome-twitch](https://github.com/sammwyy/awesome-twitch)) |
|---|---|---|
| 💬 Chat en overlay (5 thèmes, emotes 7TV/BTTV/FFZ) | Overlay OBS | ChatIS, showmy.chat, StreamElements Chatbox… |
| 🔔 Alertes : subs, resubs, subs offerts, raids, bits | Overlay OBS | Alertes StreamElements / Streamlabs |
| 📊 Sondage piloté par le chat | Overlay OBS | chat.vote |
| 🎁 Giveaway avec tirage animé (aléatoire Web Crypto) | Overlay OBS | PickerSpin, Wheel of Item |
| 😂 `!showemote` et pluie d’emotes | Overlay OBS | Show Emote |
| ⏳ Écran « Ça commence bientôt » avec compte à rebours | Overlay OBS | Packs d’écrans d’attente |
| 🖼️ Redimensionneur d’emotes et de badges | Page web | EmoteResizer, Twitch Emote Resizer |
| 💰 Calculateur de revenus | Page web | Calculateurs divers |
| 🧭 Annuaire des autres outils (clips, bots, stats…) | Page web | |

## Comment ça marche

- **100 % statique** : du HTML, du CSS et du JavaScript, sans serveur ni build. Le site s’héberge gratuitement sur GitHub Pages, Netlify ou Cloudflare Pages.
- **Chat Twitch en anonyme** : les overlays se connectent au chat en lecture seule (`justinfan…` via `wss://irc-ws.chat.twitch.tv`), donc sans token ni OAuth. Le chat donne déjà accès aux messages, aux abonnements, aux raids et aux bits.
- **Réglages dans l’URL** : le configurateur (`outil.html?id=…`) génère un lien que l’on colle dans OBS (Source navigateur). Il n’y a aucune base de données.
- **Contrôle depuis le chat** : le streamer et ses modos pilotent sondages, giveaways et minuteur avec des commandes (`!sondage`, `!giveaway tirage`, `!timer +5`…).
- **Mode démo** : ajoute `&demo=1` à n’importe quel overlay pour voir de faux messages et événements. C’est ce qu’utilise l’aperçu du configurateur.

## Lancer en local

```bash
cd streambox
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Structure

```
index.html            Accueil et catalogue
outil.html            Configurateur générique (formulaire, lien, aperçu)
annuaire.html         Annuaire des outils externes
redimensionneur.html  Redimensionneur d'emotes
calculateur.html      Calculateur de revenus
overlays/*.html       Les overlays OBS
js/sb.js              Noyau : client chat Twitch, emotes, mode démo
js/tools.js           Registre des outils et de leurs réglages (ajouter un outil = ajouter une entrée)
js/annuaire-data.js   Données de l'annuaire
```

## Feuille de route

Ce qui demande une connexion à un compte Twitch (OAuth et EventSub), donc un petit backend :

- [ ] Alertes de **follows** et de **points de chaîne** (absentes du chat anonyme)
- [ ] Objectifs (abonnés, followers) et subathon automatique
- [ ] Bot de chat : commandes personnalisées, minuteurs, modération
- [ ] Panneau de contrôle (dock OBS) pour piloter les overlays sans commandes
- [ ] Multi-plateforme : chat Kick et YouTube fusionnés
- [ ] Musique en cours de lecture (Spotify) et TTS
- [ ] Compte utilisateur pour sauvegarder ses overlays
