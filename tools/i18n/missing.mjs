// Textes du catalogue absents d'un dictionnaire : node missing.mjs catalogue.json ../../js/i18n/en.json
import fs from 'node:fs';
const [cat, dict] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(dict, 'utf8'));
const miss = JSON.parse(fs.readFileSync(cat, 'utf8')).filter((x) => !(x.s in d));
console.log(JSON.stringify(miss, null, 1));
console.error(miss.length, 'texte(s) sans traduction (certains sont du code : c’est normal)');
