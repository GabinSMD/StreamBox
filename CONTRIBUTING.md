# Contribuer à StreamBox

Merci de vouloir aider ! **Toute contribution est la bienvenue**, et pas besoin de savoir coder pour aider.

## Plutôt une suggestion qu'un fork

La licence (AGPL-3.0) autorise les forks, et c'est voulu. Mais si tu veux une fonction, **propose-la ici ou contribue directement au dépôt principal** :

- une seule version commune, c'est une version mieux maintenue et plus sûre ;
- chaque amélioration profite à tous les streamers ;
- plusieurs copies qui divergent, c'est des bugs corrigés à moitié et du travail fait en double.

## Comment aider

| Tu veux… | Fais ceci |
|---|---|
| Proposer une idée | [Ouvre une suggestion](../../issues/new?template=suggestion.md), même en deux phrases. |
| Signaler un bug | [Ouvre un rapport de bug](../../issues/new?template=bug.md), avec ce que tu as fait, ce qui s'est passé et une capture si possible. |
| Corriger ou ajouter du code | Ouvre une pull request sur `main` (voir plus bas). Pour un gros changement, ouvre d'abord une issue pour en discuter. |

## Lancer le projet en local

```bash
git clone https://github.com/GabinSMD/StreamBox.git
```
```bash
cd StreamBox
```
```bash
python3 -m http.server 8000
```

Ouvre ensuite http://localhost:8000. Les overlays ont un mode démo : ajoute `?demo=1` à leur adresse.

Pour le relais (comptes, bot, subathon, demandes de musique), voir [`relay/README.md`](relay/README.md) : `wrangler dev` dans `relay/`.

## Règles du code

- **Site 100 % statique** : HTML, CSS et JavaScript, sans framework ni étape de build. Les overlays doivent aussi marcher dans OBS.
- **Le français d'abord** pour l'interface et les commentaires. Écris des phrases simples, comme pour un streamer qui n'est pas développeur.
- **Pas de `innerHTML` avec des données venant du chat ou des viewers** : utilise `textContent`.
- **Sécurité** : ne mets jamais un jeton dans le code. Les jetons des streamers restent chiffrés sur le relais, et chaque overlay ne reçoit que ceux dont il a besoin (`NEEDS` dans `relay/worker.js`).
- **Un nouvel outil** s'ajoute dans `js/tools.js` (champs du configurateur), avec un overlay dans `overlays/` qui sait tourner en `?demo=1`.
- Teste ta modification (mode démo, et vrai chat si possible), et décris ce que tu as testé dans la pull request.

## Licence

En contribuant, tu acceptes que ta contribution soit publiée sous la licence du projet, [GNU AGPL-3.0](LICENSE).

---

StreamBox est fait par Igatax, inspiré par PiRDub.
