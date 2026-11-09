// Assemble les traductions en js/i18n/{en,es}.json et vérifie les variables
import fs from 'node:fs';
const [outDir, ...inputs] = process.argv.slice(2);
const D = { en: {}, es: {} }, bad = [];
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
for (const f of inputs) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const l of ['en', 'es']) for (const [fr, tr] of Object.entries(d[l] || {})) {
    if (typeof tr !== 'string') continue;
    if (vars(fr) !== vars(tr)) { bad.push([l, fr, tr]); continue; }
    if (tr !== fr) D[l][fr] = tr;
  }
}
for (const l of ['en', 'es']) {
  const sorted = Object.fromEntries(Object.entries(D[l]).sort(([a], [b]) => a.localeCompare(b, 'fr')));
  fs.writeFileSync(`${outDir}/${l}.json`, JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"').replace(/^\{/, '{\n').replace(/\}$/, '\n}\n'));
  console.log(l, Object.keys(sorted).length, 'entrées');
}
if (bad.length) { console.log('variables différentes (ignorées) :'); bad.forEach((b) => console.log(' ', JSON.stringify(b))); }
