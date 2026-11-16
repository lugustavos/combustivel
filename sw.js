/* Service worker: deixa o app abrir sem internet.
   Estratégia: rede primeiro, para pegar atualizações; se a rede falhar ou demorar mais de 3 s, usa a cópia guardada.
   Ao publicar uma versão nova não é preciso mexer aqui: a cópia guardada é trocada a cada abertura com internet. */
const CACHE = 'combustivel-v4-1';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  let copia = null;
  const rede = fetch(req).then(res => { if (res.ok) copia = res.clone(); return res; });
  // Guarda a resposta nova mesmo quando a página já foi atendida pela cópia antiga.
  e.waitUntil(rede.then(() => copia && caches.open(CACHE).then(c => c.put(req, copia))).catch(() => {}));

  const prazo = new Promise((_, rejeita) => setTimeout(rejeita, 3000));
  e.respondWith(
    Promise.race([rede, prazo])
      .catch(() => caches.match(req, { ignoreSearch: true }))
      .then(r => r || rede)                        // nada guardado ainda: espera a rede
      .catch(() => caches.match('./index.html'))   // sem rede e sem cópia do arquivo: abre a tela principal
  );
});
