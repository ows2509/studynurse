const C='studynurse-v0.5.3';
const A=['./','./index.html','./app.css','./app.js','./config.js','./config.dev.js','./data/seed.json','./manifest.webmanifest'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(A)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const u=new URL(e.request.url);

  // Never attempt Cache API operations for browser extensions or unsupported schemes.
  if(u.protocol!=='http:' && u.protocol!=='https:') return;

  e.respondWith(
    fetch(e.request).then(r=>{
      if(r && r.ok){
        const copy=r.clone();
        caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
      }
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
