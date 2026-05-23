const CACHE = 'tpc-pdv-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/store.js',
  './js/db.js',
  './js/utils.js',
  './js/app.js',
  './js/modules/caixa.js',
  './js/modules/pdv.js',
  './js/modules/reservas.js',
  './js/modules/estoque.js',
  './js/modules/historico.js',
  './js/modules/pin.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Chamadas ao banco Supabase: sempre vai para rede (dados dinâmicos)
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    // ignoreSearch: true → app.js?v=2 e app.js batem no mesmo cache
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;

      // Não está no cache: busca na rede e armazena para próximas visitas
      // (inclui o módulo esm.sh do Supabase — cacheia após 1ª carga)
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
