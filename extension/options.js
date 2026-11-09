const api = typeof browser !== 'undefined' ? browser : chrome;
const input = document.getElementById('relay');
api.storage.sync.get({ relay: '' }, (o) => { input.value = o.relay || ''; input.placeholder = self.SBX_DEFAULT_RELAY || input.placeholder; });
document.getElementById('save').onclick = () => {
  const v = input.value.trim();
  if (v && !/^https:\/\/[\w.-]+(\/.*)?$/.test(v)) { document.getElementById('ok').textContent = 'Adresse invalide (https://…)'; return; }
  api.storage.sync.set({ relay: v || self.SBX_DEFAULT_RELAY }, () => { document.getElementById('ok').textContent = 'Enregistré ✓'; });
};
