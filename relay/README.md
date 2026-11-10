# Relais StreamBox

Petit serveur gratuit (Cloudflare Workers) qui sert à trois choses :

0. **Les comptes StreamBox** : connexion avec Twitch, réglages et intégrations enregistrés par streamer (jetons chiffrés), liens courts pour les overlays, mise à jour en direct dans OBS.
1. **Recevoir les dons Ko-fi** (Ko-fi ne sait qu'envoyer des webhooks) et les transmettre en direct aux overlays dans OBS : alertes, subathon, objectifs. Il accepte aussi n'importe quel service capable d'envoyer un webhook JSON, par exemple via Zapier ou Make.
2. **Garder la liste des musiques jouées en live**, pour l'extension « Musiques des redifs ».

## Déployer (une seule fois, environ 5 minutes)

```bash
npm install -g wrangler
cd relay
wrangler login
wrangler deploy
```

Wrangler affiche l'adresse du relais, par exemple `https://streambox-relay.<ton-compte>.workers.dev`. Mets-la dans `js/config.js` (`relayUrl`).

### Activer les comptes (recommandé)

1. Dans https://dev.twitch.tv/console/apps, ton application StreamBox doit être de type **Confidentiel**. Son URL de redirection est `https://<ton-site>/connexion.html`.
2. Donne au relais l'identifiant et le secret de cette application, ainsi qu'une clé de chiffrement pour les jetons des streamers :

```bash
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

3. Dans `js/config.js`, mets le même `twitchClientId` et l'adresse du relais (`relayUrl`). Le bouton « Se connecter avec Twitch » apparaît alors sur le site.

Le secret Twitch ne quitte jamais le relais. C'est lui qui renouvelle les accès Twitch des streamers, si bien que leurs overlays ne « périment » pas.

### Activer le bot de chat

Le bot reçoit le chat par des webhooks EventSub signés. Ajoute un secret de signature (10 à 100 caractères) :

```bash
openssl rand -hex 32 | wrangler secret put EVENTSUB_SECRET
```

Ensuite, redéploie (`wrangler deploy`) pour activer les messages automatiques.

**Compte bot du site (facultatif).** Pour que le bot écrive sous un nom comme « StreamBoxBot » plutôt qu'avec le compte de chaque streamer :
1. crée ce compte Twitch ;
2. lance `wrangler secret put BOT_LOGIN` et donne-lui le nom de ce compte ;
3. sur la page Bot de chat, clique sur « Connecter le compte bot » en étant connecté à Twitch **avec ce compte**.

Les streamers qui le choisissent tapent `/mod StreamBoxBot` dans leur chat pour que la modération marche.

### Voix française du TTS

L'overlay « Lecture à voix haute » peut utiliser une voix générée par **Workers AI** (modèle MeloTTS, français). Elle est déjà déclarée dans `wrangler.toml` (`[ai] binding = "AI"`) : il suffit de redéployer. L'offre gratuite de Workers AI a un quota quotidien, et le relais limite à 20 lectures par minute et par compte.

### Chat multiplateforme (Kick, YouTube)

Le relais sert aussi le **planning Twitch** d’une chaîne (`/schedule/:pseudo`, pour l’overlay Planning et la page « Image du planning ») : ce sont des données publiques, lues avec le jeton d’application et gardées 10 minutes en cache.

Rien à configurer. Le relais trouve le salon de chat d'une chaîne Kick (`/kick/:pseudo`, mis en cache 1 h) et lit le chat public d'un live YouTube (`/yt/live/:@pseudo`, `/yt/chat/:video`), comme la fenêtre « chat en pop-up » de YouTube : pas de clé d'API ni de quota. Chaque overlay YouTube ouvert fait un appel au relais toutes les 2 à 5 secondes pendant le live (l'offre gratuite de Workers permet 100 000 appels par jour). Ces deux services n'ont pas d'API officielle pour ça : si Kick ou YouTube changent leur site, il faudra mettre à jour `relay/multichat.js` et `js/multichat.js`.

### Statistiques des lives

Activées depuis la page Statistiques. Pendant le live, l'alarme du compte relève chaque minute les viewers, le titre et la catégorie (API Twitch, jeton d'application) ; hors live, elle vérifie toutes les 5 minutes si le live a commencé. Avec `EVENTSUB_SECRET`, les follows, abos, bits, raids et messages du chat sont aussi comptés (le chat demande les permissions du bot). Les 200 derniers lives sont gardés ; seuls le nombre de chatteurs et le top 10 sont conservés, pas la liste complète.

### Sous-titres en direct

La page Sous-titres (Chrome ou Edge) reconnaît la voix et envoie chaque phrase au relais par un WebSocket, ouvert avec un ticket d'une minute à usage unique (`POST /me/captions/ticket`, puis `GET /captions/:userId?t=…`). Le relais transmet les phrases aux overlays « soustitres » du compte. La traduction est faite par le navigateur quand Chrome le permet, sinon par Workers AI (`@cf/meta/m2m100-1.2b`, binding `AI` déjà déclaré), pour les phrases finies seulement, 60 par minute au plus.

### Automatisations

Les règles sont enregistrées comme réglages d'un overlay `automatisations` (18 Ko au plus). La source invisible dans OBS les exécute ; pour les messages du chat ou de Discord, elle passe par `POST /o/:id/say { text, to: chat | discord }` (20 messages par minute au plus, permissions du bot pour le chat, webhook de Mon compte pour Discord).

### Générique de fin et `!clip`

Le générique de fin lit les pseudos notés par les Statistiques (`GET /o/:id/credits` : live en cours, ou dernier live s'il date de moins de 12 h ; 300 pseudos au plus par liste). `!clip` crée le clip avec le compte du streamer (permission `clips:edit`, déjà demandée à la connexion) et le poste sur Discord si un webhook est enregistré dans Mon compte.

### Panneau de modération

Rien à configurer sur le relais : chaque modo se connecte avec son compte Twitch (permissions de modération demandées à ce moment-là). La page récupère le jeton du modo par `GET /me/twitch-token`, le garde en mémoire et agit directement auprès de Twitch, en son nom.

### Mini-jeux du chat

Rien à configurer en plus du bot (EVENTSUB_SECRET) : les points, duels, prédictions et quiz sont gardés dans le Durable Object du compte. Les points sont virtuels et n'ont aucune valeur.

### Demandes de musique (facultatif)

- **Recherche YouTube par titre et durée maximum** : crée une clé API « YouTube Data API v3 » sur https://console.cloud.google.com (gratuite, 10 000 unités par jour, soit environ 100 recherches), puis `wrangler secret put YOUTUBE_API_KEY`. Sans clé, les viewers envoient un lien YouTube.
- **Spotify** : il n'y a pas d'application Spotify commune (Spotify réserve son API aux comptes Premium). Le relais utilise le Client ID que chaque streamer enregistre avec sa connexion Spotify ; `SPOTIFY_CLIENT_ID` reste possible si tu as une application commune.

> ⚠️ Ne perds pas `ENCRYPTION_KEY` : sans elle, les jetons enregistrés ne peuvent plus être lus, et chaque streamer devra les ressaisir. Ces mêmes identifiants servent aussi à l'extension, pour trouver le début des VODs Twitch.

## Brancher Ko-fi

1. Choisis une **clé secrète** de 12 à 64 caractères (lettres, chiffres, `-` ou `_`), par exemple avec `openssl rand -hex 16`.
2. Ko-fi → Settings → API → Webhook URL : `https://<relais>/kofi/<ta-clé>`.
3. Avec un compte StreamBox : enregistre la clé et le **jeton de vérification Ko-fi** (Ko-fi → API → Advanced → Verification Token) dans **Mon compte**. Le relais refuse alors tout don qui ne porte pas ce jeton, même envoyé avec ta clé, et le webhook générique ci-dessous doit le fournir aussi (`?v=<jeton>` ou en-tête `X-StreamBox-Token`). Une clé ne peut être reliée qu'à un seul compte.
4. Sans compte : mets la même clé dans le champ « Clé Ko-fi » des alertes, du subathon ou des objectifs, et ajoute `?v=<ton jeton de vérification Ko-fi>` à l'adresse du webhook pour que le relais vérifie chaque don.

La clé sert aussi aux overlays pour recevoir les dons : traite-la comme un mot de passe.

## Webhook générique

`POST https://<relais>/hook/<ta-clé>` avec `{"name": "Lou", "amount": 5, "currency": "EUR", "message": "Bravo !"}`.
