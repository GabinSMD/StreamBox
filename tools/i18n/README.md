# Traductions de StreamBox

Le français est la langue du code. Chaque texte affiché est traduit à la volée par `js/i18n.js`
à partir de son texte français, grâce à `js/i18n/en.json` et `js/i18n/es.json`. Le relais utilise
les mêmes fichiers pour les réponses du bot (`relay/i18n.js`).

## Ajouter ou modifier des textes

1. Écris le texte en français dans le code, comme d'habitude.
2. Liste les textes à traduire :
   ```bash
   cd tools/i18n && npm install
   node extract.mjs ../.. catalogue.json
   node missing.mjs catalogue.json ../../js/i18n/en.json > a-traduire.json
   ```
3. Ajoute les traductions dans `js/i18n/en.json` et `js/i18n/es.json` (clé = texte français exact).
   Les variables (`{0}`, `{name}`…) doivent rester identiques.

Un texte qui contient une valeur (`${n} joueur(s)` dans le code) devient le modèle `{0} joueur(s)`.
Un texte absent du dictionnaire reste simplement en français.

## Ajouter une langue

Crée `js/i18n/<code>.json`, puis ajoute la langue dans `LANGS` et `TAGS` (`js/i18n.js`),
dans `relay/i18n.js` et dans le réglage « Langue de l’overlay » (`js/tools.js`).
