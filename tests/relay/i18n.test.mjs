import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tr } from '../../relay/i18n.js';

test('traduction des réponses du bot', () => {
  assert.equal(tr('Défi introuvable.', 'en'), 'Challenge not found.');
  assert.equal(tr('Lou, tu as déjà 2 défis en cours.', 'en'), 'Lou, you already have 2 challenges going.');
  assert.equal(tr('texte inconnu', 'en'), 'texte inconnu');
  assert.equal(tr('Défi introuvable.', 'fr'), 'Défi introuvable.');
});

test('un message piégé ne bloque pas la traduction (pas de retour arrière catastrophique)', () => {
  for (const suffix of ['', ').', ' x).']) {
    const s = 'Viewer hugs ' + 'a : '.repeat(60) + ' (total '.repeat(60) + suffix;
    for (const lang of ['en', 'es']) {
      const t0 = performance.now(); tr(s, lang);
      assert.ok(performance.now() - t0 < 250, `${lang} ${JSON.stringify(suffix)} : ${Math.round(performance.now() - t0)} ms`);
    }
  }
});
