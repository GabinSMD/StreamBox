// Le relais importe les dictionnaires (js/i18n/*.json) sans « with { type: 'json' } » : wrangler l'accepte, Node non.
// Ce crochet de chargement ajoute l'attribut pour les .json, sans toucher au code du relais.
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url.endsWith('.json')) return { ...r, importAttributes: { ...(r.importAttributes || {}), type: 'json' } };
  return r;
}
