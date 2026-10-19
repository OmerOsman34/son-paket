// Son Paket bildirim göndericisi. GitHub Actions'ta 15 dakikada bir çalışır.
// Bağımlılığı yok: Google OAuth, Firestore REST ve Web Push (RFC 8291 + RFC 8292)
// Node'un kendi crypto modülüyle yapılır.
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const VAPID_PUBLIC = 'BJnBqs52ajaLN04u4vjEh5vrewk7tpV5l3lgI15mp57almeerO9dMTtBTwFCOnaKr9rsKBQV5orGJiuHJuIPSKw';
export const SUBJECT = 'https://omerosman34.github.io/son-paket/';
const TOKEN_URL = process.env.SP_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const FS_BASE = process.env.SP_FIRESTORE_BASE || 'https://firestore.googleapis.com/v1';
const b64u = b => Buffer.from(b).toString('base64url');

/* ---------- Google erişim anahtarı (servis hesabı) ---------- */
export async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), sa.private_key);
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + b64u(sig) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google erişim anahtarı alınamadı (' + r.status + '): ' + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}

/* ---------- Firestore REST ---------- */
export function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; for (const k in f) o[k] = fromValue(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
export function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  const f = {}; for (const k in x) f[k] = toValue(x[k]); return { mapValue: { fields: f } };
}
export async function listUsers(tok, pid) {
  const out = []; let page = '';
  do {
    const u = new URL(`${FS_BASE}/projects/${pid}/databases/(default)/documents/kullanicilar`);
    u.searchParams.set('pageSize', '300');
    for (const f of ['veri', 'push', 'pushSent', 'aktif']) u.searchParams.append('mask.fieldPaths', f);
    if (page) u.searchParams.set('pageToken', page);
    const r = await fetch(u, { headers: { authorization: 'Bearer ' + tok } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Firestore okunamadı (' + r.status + '): ' + JSON.stringify(j).slice(0, 300));
    for (const d of j.documents || []) {
      const o = { name: d.name };
      for (const k in d.fields || {}) o[k] = fromValue(d.fields[k]);
      out.push(o);
    }
    page = j.nextPageToken || '';
  } while (page);
  return out;
}
export async function patchDoc(tok, name, fields, paths) {
  const u = new URL(`${FS_BASE}/${name}`);
  for (const p of paths) u.searchParams.append('updateMask.fieldPaths', p);
  u.searchParams.set('currentDocument.exists', 'true');
  const r = await fetch(u, { method: 'PATCH', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('Firestore yazılamadı (' + r.status + '): ' + (await r.text()).slice(0, 300));
}

/* ---------- Web Push ---------- */
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
export function encryptPayload(p256dh, auth, plaintext, opts = {}) {
  const ua = Buffer.from(p256dh, 'base64url'), secret = Buffer.from(auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(Buffer.from(opts.asPrivate, 'base64url')); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const ikm = hkdf(secret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32);
  const salt = opts.salt ? Buffer.from(opts.salt, 'base64url') : crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
export function vapidAuth(endpoint, pub, priv, subject, now = Date.now()) {
  const raw = Buffer.from(pub, 'base64url');
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: priv, x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${pub}`;
}
export async function sendPush(sub, msg, priv) {
  const body = encryptPayload(sub.keys.p256dh, sub.keys.auth, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { TTL: '43200', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: 'normal', Authorization: vapidAuth(sub.endpoint, VAPID_PUBLIC, priv, SUBJECT) }, body });
  return r.status;
}

/* ---------- ne zaman, ne gönderilecek ---------- */
const MILES = [
  [20 * 60, '20 dakika', 'Kalp atışın ve tansiyonun düşmeye başladı.'],
  [12 * 3600, '12 saat', 'Kandaki karbonmonoksit düzeyi normale iniyor.'],
  [48 * 3600, '2 gün', 'Tat ve koku duyun iyileşmeye başladı.'],
  [14 * 86400, '2 hafta', 'Dolaşımın iyileşiyor, ben de daha rahat çalışıyorum.'],
  [30 * 86400, '1 ay', 'Öksürük ve nefes darlığı azalmaya başladı.'],
  [365 * 86400, '1 yıl', 'Kalp hastalığı riskin, içmeye devam eden birinin yaklaşık yarısına indi.'],
  [5 * 365 * 86400, '5 yıl', 'İnme riskin hiç içmeyen birinin düzeyine iniyor.'],
  [10 * 365 * 86400, '10 yıl', 'Akciğer kanserinden ölüm riskin, içmeye devam eden birinin yaklaşık yarısına indi.'],
  [15 * 365 * 86400, '15 yıl', 'Kalp hastalığı riskin hiç içmeyen birininkiyle aynı.']
];
const clampInt = (v, a, b, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const dayNum = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? (+m[1] % 24) * 60 + +m[2] : null; };
export function localNow(tz, now) {
  let f;
  try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  catch (e) { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
/* Saat dilimindeki bir günün gece yarısının zaman damgası */
function zonedMidnight(key, tz) {
  let t = dayNum(key) * 864e5;
  for (let i = 0; i < 2; i++) { const l = localNow(tz, new Date(t)); t -= (dayNum(l.key) * 864e5 + l.min * 60000) - dayNum(key) * 864e5; }
  return t;
}
function addDaysKey(k, n) { return new Date((dayNum(k) + n) * 864e5).toISOString().slice(0, 10); }
function plan(st) {
  const s = (st && st.settings) || {};
  const B = clampInt(s.baseline, 1, 60, 20), W = [2, 3, 4, 6, 8].includes(Number(s.weeks)) ? Number(s.weeks) : 6;
  return { start: /^\d{4}-\d{2}-\d{2}$/.test(s.start || '') ? s.start : null, B, R: W * 7 };
}
const limitAt = (p, i) => i < 0 ? p.B : i >= p.R ? 0 : Math.max(1, Math.floor(p.B * (p.R - 1 - i) / p.R));
function windows(st) {
  const s = (st && st.settings) || {};
  const wake = toMin(s.wake) ?? 480; let sleep = toMin(s.sleep) ?? 0;
  if (sleep <= wake) sleep += 1440;
  const morning = Math.min(wake + 20, 1380);
  const evening = Math.max(morning + 60, Math.min(sleep - 90, 1410));
  return { wake, sleep, morning, evening };
}
const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length];
const KFR = '#@%!&*$?';
const grawlix = w => { let s = ''; const n = Math.max(3, Math.min(7, w.length)); for (let i = 0; i < n; i++) s += KFR[(i * 3 + w.length) % KFR.length]; return s; };
/* [[...]] içindeki küfürler, küfür ayarı kapalıysa #@%! olur */
export const kufurle = (text, on) => String(text).replace(/\[\[(.+?)\]\]/g, (m, w) => on ? w : grawlix(w));

/* Nuri Dayı: küfürlü, kara mizah. Ciğerim: tatlı ve yardımsever. */
const UZAK_ICEN = [
  [24, 'angry', 'Ya benden çok içiyorsun ya da benden çok içtiğin için mi buraya girmiyorsun, [[şerefsiz]]? Bir gündür ortalıkta yoksun.'],
  [48, 'smug', 'İki gündür yoksun [[lan]]. Kayıt girmeyince içmemiş mi sayılıyor sandın? Gel bakalım, çay demledim.'],
  [72, 'angry', 'Üç gün oldu [[orospu çocuğu]]! Ciğerin bana "kurtar beni" diye mesaj atıyor. Aç şu uygulamayı.']
];
const UZAK_BIRAKAN = [
  [72, 'sad', 'Neredesin [[orospu çocuğu]]? Bıraktın diye dayını unuttun mu? Gel bir çay iç, sigara içme ama.'],
  [144, 'smug', 'Bir haftadır yoksun [[lan]]. Sigarasız mutlu musun bari? Ciğerin seni özledi, ben özlemedim.']
];

export function decide(st, sentIn, subIds, tz, now, aktif) {
  const sent = { sabah: sentIn.sabah || '', aksam: sentIn.aksam || '', yavas: sentIn.yavas || '', mil: Object.assign({}, sentIn.mil || {}), hg: {}, uzak: Object.assign({ a: 0, n: 0 }, sentIn.uzak || {}) };
  for (const id of subIds) if (sentIn.hg && sentIn.hg[id]) sent.hg[id] = true;
  const s = (st && st.settings) || {};
  const kufur = s.kufur !== false;
  const ciger = String(s.mascot || '').trim() || 'Ciğerim';
  const name = String(s.name || '').trim();
  const sel = name ? ', ' + name : '';
  const dayi = (face, body, tag, url) => ({ who: 'dayi', face, title: 'Nuri Dayı', body: kufurle(body, kufur), tag, url: url || './?v=today' });
  const cig = (face, body, tag, url) => ({ who: 'ciger', face, title: ciger, body, tag, url: url || './?v=today' });
  const jobs = [];
  for (const id of subIds) if (!sent.hg[id]) jobs.push({ kind: 'hg', id, to: [id], msg: cig('happy', 'Bildirimler açık! Sabah planını ve akşam özetini ben getireceğim. Nuri Dayı da arada laf atacak, şimdiden kusura bakma.', 'hosgeldin', './') });
  const p = plan(st);
  if (!st || !p.start || !s.onboarded) return { jobs, sent };
  const pref = Object.assign({ sabah: true, aksam: true, basari: true, dayi: true }, s.bildirim || {});
  const L = localNow(tz, now), w = windows(st);
  const i = dayNum(L.key) - dayNum(p.start), lim = limitAt(p, i), R = p.R;
  const n = (((st.days || {})[L.key] || {}).log || []).length;
  const awake = L.min >= w.wake + 30 && L.min < Math.min(w.sleep, 1440) - 30;
  const act = Math.max(aktif || 0, st.updatedAt || 0);
  const idleH = act ? (now.getTime() - act) / 3600e3 : 0;
  if (sent.uzak.a !== act) sent.uzak = { a: act, n: 0 };
  const idle = act && idleH >= 24;
  const more = [];
  // uygulamaya girmeyene Nuri Dayı
  if (pref.dayi && act && i >= 0 && awake) {
    const steps = i < R ? UZAK_ICEN : UZAK_BIRAKAN;
    const due = steps.filter(x => idleH >= x[0]).length;
    if (due > sent.uzak.n) { const x = steps[due - 1]; more.push({ kind: 'uzak', level: due, msg: Object.assign(dayi(x[1], x[2], 'uzak', './'), { image: true }) }); }
  }
  // gün ortasında hakkını bitirmeye yaklaşana Nuri Dayı
  if (pref.dayi && i >= 0 && i < R && sent.yavas !== L.key && L.min >= w.wake) {
    const f = (L.min - w.wake) / (w.sleep - w.wake);
    if (f >= 0.1 && f < 0.6 && n >= 2 && n >= 0.75 * lim) {
      const body = n > lim ? `Yavaş ulan [[orospu çocuğu]]! Daha gün yarılanmadı, ${n} tane içtin, limitin ${lim}. Benimle yarışma, kaybedersin.`
        : `Yavaş ulan [[orospu çocuğu]]! Günün yarısı gitmeden ${n}/${lim} oldun. Akşama ne bıraktın?`;
      more.push({ kind: 'yavas', msg: Object.assign(dayi('shock', body, 'yavas'), { image: true }) });
    }
  }
  // sigarasız başarılar
  if (i >= R) {
    let last = 0; for (const k in st.days || {}) for (const e of (st.days[k].log || [])) if (e && e.t > last) last = e.t;
    const since = (now.getTime() - Math.max(last, zonedMidnight(addDaysKey(p.start, R), tz))) / 1000;
    const crossed = MILES.filter(m => since >= m[0] && !sent.mil[m[0]]);
    if (crossed.length) {
      if (pref.basari && awake) { const m = crossed[crossed.length - 1]; more.push({ kind: 'mil', marks: crossed.map(x => x[0]), msg: Object.assign(cig('proud', `Sigarasız ${m[1]}! ${m[2]}`, 'basari', './?v=progress'), { image: true }) }); }
      else if (!pref.basari) crossed.forEach(m => { sent.mil[m[0]] = true; });
    }
  }
  // akşam özeti (uzun süredir girmeyene gönderilmez, onunla Nuri Dayı ilgileniyor)
  if (pref.aksam && !idle && i >= 0 && sent.aksam !== L.key && L.min >= w.evening && L.min < w.evening + 90) {
    let msg;
    if (i < R) {
      if (n === 0) msg = cig('happy', 'Bugün hiç kayıt yok. Hiç içmediysen harika! İçtiysen kaydetmeyi unutma, planımız doğru kalsın.', 'aksam');
      else if (n <= lim) msg = cig('proud', `Bugün ${n}/${lim}. Ciğerlerimiz iyi durumda! Unuttuğun bir kayıt varsa şimdi ekleyebilirsin.`, 'aksam');
      else msg = dayi('laugh', `Bugün ${n} tane içmişsin, limitin ${lim}'ydi. Dayın gurur duydu, ciğerin duymadı [[lan]]. Yarın yine dene bakalım.`, 'aksam');
    } else msg = n === 0 ? cig('proud', 'Bir gün daha sigarasız! Ciğerlerimiz pırıl pırıl. Nuri Dayı ise çayını tek başına içiyor.', 'aksam')
      : cig('happy', 'Bugün bir kayma oldu. Dert etme, her şey bitmedi. Yarın yeniden başlıyoruz, ben buradayım.', 'aksam');
    more.push({ kind: 'aksam', msg });
  }
  // sabah planı
  if (pref.sabah && !idle && sent.sabah !== L.key && L.min >= w.morning && L.min < w.morning + 120) {
    let body;
    if (i < 0) body = `Planımız ${-i} gün sonra başlıyor. Bugün neden bırakmak istediğini bir kez daha düşün, ben buradayım.`;
    else if (i < R) body = i === R - 1 ? `Günaydın${sel}! Bugünkü limitin ${lim}. Yarın bırakma günü, az kaldı!` : `Günaydın${sel}! Bugünkü limitin ${lim} sigara. Bırakma gününe ${R - i} gün kaldı, birlikte başarırız.`;
    else if (i === R) body = 'Bugün bırakma günü! Son paket artık geride. Zor an gelirse Kriz düğmesine bas, hemen yanındayım.';
    else { const q = i - R + 1; body = pick([`Günaydın${sel}! Bırakmanın ${q}. günündeyiz. Bugün de derin derin nefes alıyoruz.`, `Bırakmanın ${q}. günü. Bu sabah ne kadar rahat nefes aldım, teşekkürler!`, `${q}. gün! Nuri Dayı yine sigarasını yaktı, biz yakmıyoruz. Fark bu.`], q); }
    more.push({ kind: 'sabah', msg: cig(i >= R ? 'proud' : 'happy', body, 'sabah') });
  }
  // her çalışmada en fazla bir bildirim (öncelik sırası yukarıdaki gibi)
  if (more.length) jobs.push(Object.assign(more[0], { to: subIds }));
  return { jobs, sent, dayKey: L.key };
}

/* anahtar sırasından bağımsız karşılaştırma */
const stable = o => o && typeof o === 'object' ? (Array.isArray(o) ? '[' + o.map(stable).join(',') + ']' : '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}') : JSON.stringify(o);

/* ---------- ana akış ---------- */
export async function run(env = process.env, now = new Date(), log = console.log) {
  let sa;
  try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { sa = null; }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT gizli anahtarı eksik ya da bozuk.');
  const priv = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (Buffer.from(priv, 'base64url').length !== 32) throw new Error('VAPID_PRIVATE_KEY gizli anahtarı eksik ya da bozuk.');
  const tok = await accessToken(sa);
  const users = await listUsers(tok, sa.project_id);
  const stats = { kullanici: users.length, abone: 0, gonderilen: 0, silinen: 0, hata: 0 };
  for (const u of users) {
    const subs = (u.push && u.push.subs) || {};
    const ids = Object.keys(subs).filter(id => subs[id] && subs[id].endpoint && subs[id].keys && subs[id].keys.p256dh && subs[id].keys.auth);
    if (!ids.length) continue;
    stats.abone++;
    let st = null; try { st = u.veri ? JSON.parse(u.veri) : null; } catch (e) { }
    const tz = ids.map(id => subs[id]).sort((a, b) => (b.at || 0) - (a.at || 0))[0].tz || 'Europe/Istanbul';
    const prev = u.pushSent || {};
    const aktif = Math.max(Number(u.aktif) || 0, ...ids.map(id => Number(subs[id].at) || 0));
    const { jobs, sent, dayKey } = decide(st, prev, ids, tz, now, aktif);
    const dead = new Set();
    for (const job of jobs) {
      let okAny = false, failAny = false;
      for (const id of job.to) {
        if (dead.has(id)) continue;
        try {
          const s = await sendPush(subs[id], job.msg, priv);
          if (s === 404 || s === 410) dead.add(id);
          else if (s >= 200 && s < 300) { okAny = true; stats.gonderilen++; }
          else { failAny = true; stats.hata++; log('Gönderilemedi: HTTP ' + s + ' (' + new URL(subs[id].endpoint).host + ')'); }
        } catch (e) { failAny = true; stats.hata++; log('Gönderilemedi: ' + e.message); }
      }
      const done = okAny || !failAny;
      if (!done) continue;
      if (job.kind === 'hg') sent.hg[job.id] = true;
      else if (job.kind === 'sabah') sent.sabah = dayKey;
      else if (job.kind === 'aksam') sent.aksam = dayKey;
      else if (job.kind === 'yavas') sent.yavas = dayKey;
      else if (job.kind === 'uzak') sent.uzak.n = job.level;
      else if (job.kind === 'mil') job.marks.forEach(m => { sent.mil[m] = true; });
    }
    for (const id of dead) delete sent.hg[id];
    const changed = stable(sent) !== stable(prev);
    if (!changed && !dead.size) continue;
    const paths = ['pushSent'];
    for (const id of dead) { paths.push('push.subs.' + id); stats.silinen++; }
    try { await patchDoc(tok, u.name, { pushSent: toValue(sent) }, paths); }
    catch (e) { stats.hata++; log(e.message); }
  }
  log(`Kullanıcı: ${stats.kullanici}, bildirim açık: ${stats.abone}, gönderilen: ${stats.gonderilen}, silinen abonelik: ${stats.silinen}, hata: ${stats.hata}`);
  return stats;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  // GitHub Actions'ta özet satırı "notice" olarak görünür; böylece çalışma kaydına girmeden sonuç okunur.
  const GH = process.env.GITHUB_ACTIONS === 'true';
  const note = (lvl, msg) => console.log(GH ? `::${lvl} title=Bildirimler::${msg}` : msg);
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.VAPID_PRIVATE_KEY) {
    note('warning', 'Gizli anahtarlar (FIREBASE_SERVICE_ACCOUNT, VAPID_PRIVATE_KEY) henüz eklenmemiş; bildirim gönderilmedi.');
  } else run(process.env, new Date(), m => note(/hata|yazılamadı|Gönderilemedi/i.test(m) && !/hata: 0$/.test(m) ? 'warning' : 'notice', m))
    .catch(e => { note('error', e.message); process.exit(1); });
}
