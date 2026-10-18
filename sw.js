const CACHE='sonpaket-55d450af';
const LIB='sonpaket-lib';
const SHELL=['./','./index.html','./fb.js?v=55d450af','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==LIB).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  if(url.hostname==='www.gstatic.com'&&url.pathname.indexOf('/firebasejs/')===0){
    e.respondWith(caches.open(LIB).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r&&r.ok)c.put(req,r.clone());return r;}))));
    return;
  }
  const font=url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
  if((url.origin===self.location.origin&&url.pathname.indexOf('/__')<0)||font){
    e.respondWith(caches.match(req).then(hit=>{
      const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return r;}).catch(()=>hit);
      return hit||net;
    }));
  }
});
