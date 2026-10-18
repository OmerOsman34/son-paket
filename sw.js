const CACHE='sonpaket-ed5b2093';
const LIB='sonpaket-lib';
const SHELL=['./','./index.html','./fb.js?v=ed5b2093','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/badge-96.png','./icons/n-ciger-happy.png','./icons/n-ciger-proud.png','./icons/n-dayi-angry.png','./icons/n-dayi-laugh.png','./icons/n-dayi-shock.png','./icons/n-dayi-sad.png','./icons/n-dayi-smug.png','./icons/n-dayi-banner.png','./icons/n-ciger-banner.png'];
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
/* bildirimler: Nuri Dayı ya da Ciğerim, kendi resmiyle */
const NOTIF_IMG={dayi:['angry','laugh','shock','sad','smug'],ciger:['happy','proud']};
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(x){d={body:e.data?e.data.text():''};}
  const who=d.who==='dayi'?'dayi':'ciger',face=NOTIF_IMG[who].indexOf(d.face)>=0?d.face:NOTIF_IMG[who][0];
  const opt={body:d.body||'',icon:'icons/n-'+who+'-'+face+'.png',badge:'icons/badge-96.png',tag:d.tag||'sonpaket',renotify:true,lang:'tr',data:{url:d.url||'./'}};
  if(d.image)opt.image='icons/n-'+who+'-banner.png';
  e.waitUntil(self.registration.showNotification(d.title||'Son Paket',opt));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){if(w.url.indexOf(self.registration.scope)===0&&'focus' in w)return w.focus().then(c=>c&&'navigate' in c?c.navigate(url):c).catch(()=>{});}
    return self.clients.openWindow(url);
  }));
});
