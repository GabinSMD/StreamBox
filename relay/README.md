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

### Demandes de musique (facultatif)

- **Recherche YouTube par titre et durée maximum** : crée une clé API « YouTube Data API v3 » sur https://console.cloud.google.com (gratuite, 10 000 unités par jour, soit environ 100 recherches), puis `wrangler secret put YOUTUBE_API_KEY`. Sans clé, les viewers envoient un lien YouTube.
- **Spotify** : si le site a son propre Client ID Spotify, `wrangler secret put SPOTIFY_CLIENT_ID` (sinon, celui enregistré par chaque streamer est utilisé).

> ⚠️ Ne perds pas `ENCRYPTION_KEY` : sans elle, les jetons enregistrés ne peuvent plus être lus, et chaque streamer devra les ressaisir. Ces mêmes identifiants servent aussi à l'extension, pour trouver le début des VODs Twitch.

## Brancher Ko-fi

1. Choisis une **clé secrète** de 12 à 64 caractères (lettres, chiffres, `-` ou `_`), par exemple avec `openssl rand -hex 16`.
2. Ko-fi → Settings → API → Webhook URL : `https://<relais>/kofi/<ta-clé>?v=<ton jeton de vérification Ko-fi>`.
3. Dans StreamBox (alertes, subathon ou objectifs), mets la même clé dans le champ « Clé Ko-fi ».

Le paramètre `?v=` fait vérifier au relais que chaque webhook vient bien de Ko-fi.

## Webhook générique

`POST https://<relais>/hook/<ta-clé>` avec `{"name": "Lou", "amount": 5, "currency": "EUR", "message": "Bravo !"}`.
