# Son Paket

Azaltarak sigarayı bırakmak için bir telefon uygulaması (PWA). Hesaplar ve kayıtlar Firebase'de tutulur.

- E-posta ya da kullanıcı adıyla kayıt ve giriş, e-postayla şifre sıfırlama
- Kendine benzeyen bir avatar, günlük limit, paket görünümü, nikotin takibi
- Nuri Dayı: her gün yeni bir hikâye bölümü, istediğin zaman yumruk
- Kriz modu: 5 dakikalık nefes egzersizi ya da dayıya vur
- İlerleme, rozetler ve sağlık kazanımları

## Telefona kurma

1. https://omerosman34.github.io/son-paket/ adresini telefonda aç.
2. iPhone: Safari > Paylaş > Ana Ekrana Ekle.
   Android: Chrome > üç nokta > Uygulamayı yükle (ya da Ana ekrana ekle).

## Teknik not

`index.html` uygulamanın tamamını içerir. `fb.js` Firebase Authentication ve Firestore Lite'ı
gstatic'ten yükler. Her kullanıcının verisi `kullanicilar/{uid}` belgesinde durur ve Firestore
kurallarıyla yalnızca o kullanıcıya açıktır. Firebase web yapılandırması gizli bir bilgi değildir.
