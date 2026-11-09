# Relais StreamBox

Petit serveur gratuit (Cloudflare Workers) qui sert à deux choses :

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

Pour que l'extension trouve le début des VODs Twitch, ajoute les identifiants de ton application Twitch. Il faut ici un client « Confidentiel », séparé de celui du site :

```bash
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
```

## Brancher Ko-fi

1. Choisis une **clé secrète** de 12 à 64 caractères (lettres, chiffres, `-` ou `_`), par exemple avec `openssl rand -hex 16`.
2. Ko-fi → Settings → API → Webhook URL : `https://<relais>/kofi/<ta-clé>?v=<ton jeton de vérification Ko-fi>`.
3. Dans StreamBox (alertes, subathon ou objectifs), mets la même clé dans le champ « Clé Ko-fi ».

Le paramètre `?v=` fait vérifier au relais que chaque webhook vient bien de Ko-fi.

## Webhook générique

`POST https://<relais>/hook/<ta-clé>` avec `{"name": "Lou", "amount": 5, "currency": "EUR", "message": "Bravo !"}`.
