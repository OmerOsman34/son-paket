# Son Paket

Azaltarak sigarayı bırakmak için bir telefon uygulaması (PWA). Hesaplar ve kayıtlar Firebase'de tutulur.

- E-posta ya da kullanıcı adıyla kayıt ve giriş, e-postayla şifre sıfırlama
- Kendine benzeyen bir avatar, günlük limit, paket görünümü, nikotin takibi
- Nuri Dayı: her gün yeni bir hikâye bölümü, istediğin zaman yumruk
- Kriz modu: 5 dakikalık nefes egzersizi ya da dayıya vur
- İlerleme, rozetler ve sağlık kazanımları
- Bildirimler: sabah planı, akşam özeti ve sigarasız başarılar Ciğerim'den; uygulamaya uğramayana ya da hakkını erkenden bitirene küfürlü laflar Nuri Dayı'dan

## Telefona kurma

1. https://omerosman34.github.io/son-paket/ adresini telefonda aç.
2. iPhone: Safari > Paylaş > Ana Ekrana Ekle.
   Android: Chrome > üç nokta > Uygulamayı yükle (ya da Ana ekrana ekle).

## Teknik not

`index.html` uygulamanın tamamını içerir. `fb.js` Firebase Authentication ve Firestore Lite'ı
gstatic'ten yükler. Her kullanıcının verisi `kullanicilar/{uid}` belgesinde durur ve Firestore
kurallarıyla yalnızca o kullanıcıya açıktır. Firebase web yapılandırması gizli bir bilgi değildir.

Bildirimleri `.github/workflows/bildirim.yml` 15 dakikada bir çalıştırır. `bildirim/gonder.mjs` bağımlılıksız bir
Node betiğidir: Firestore'dan bildirimi açık kullanıcıları okur, zamanı gelen mesajı Web Push (VAPID) ile gönderir.
Çalışması için depo ayarlarında iki gizli anahtar gerekir: `FIREBASE_SERVICE_ACCOUNT` (Firebase servis hesabı JSON'u)
ve `VAPID_PRIVATE_KEY`.
