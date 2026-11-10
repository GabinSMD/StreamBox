// Génère relay/tool-keys.js : la liste des réglages qu'un overlay peut enregistrer dans le compte,
// tirée du registre js/tools.js (les mêmes champs que le configurateur).
// Usage : node tools/relay/tool-keys.mjs   (à relancer quand on ajoute un champ dans js/tools.js)
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url);
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('js/tools.js', root), 'utf8'), ctx);
const NEVER = new Set(['token']); // fourni par le relais, jamais stocké dans les réglages
const out = {};
const EXTRA = { automatisations: ['rules'] }; // outils réglés par leur propre page
for (const [id, keys] of Object.entries(EXTRA)) out[id] = keys;
for (const t of ctx.window.SB_TOOLS) out[t.id] = [...new Set(t.fields.map((f) => f.key))].filter((k) => !NEVER.has(k)).sort();
writeFileSync(new URL('relay/tool-keys.js', root), '// Généré par tools/relay/tool-keys.mjs depuis js/tools.js : ne pas modifier à la main.\n'
  + '// Réglages acceptés pour chaque overlay (le relais ignore toute autre clé).\nexport const TOOL_KEYS = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(Object.keys(out).length + ' outils');
