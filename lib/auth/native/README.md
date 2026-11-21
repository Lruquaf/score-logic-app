# Native kimlik servisi

Bu servis web Auth.js cookie oturumlarından ayrı native principal üretir. Access
JWT on dakika; account refresh otuz gün kayan ve doksan gün mutlak; guest refresh
365 gün kayan inactivity ömrüne sahiptir. Her access doğrulamasında session/user
veritabanından tekrar okunur; logout, account deletion ve kaynak guest merge'i
eski access JWT süresinin bitmesini beklemez.

Native guest kullanıcıları kalıcı `User.nativeGuest` işareti taşır. Public user id
bilinse bile legacy `sl-anon-id` cookie'si bu kullanıcıların kimliğini doğrulamaz;
session cleanup sonrasında da web-cookie kanalına düşerek revoke'u aşamazlar.

İstemci guest oluşturma, login/register ve refresh komutunun UUID ve tam payload'ını
göndermeden önce kalıcılaştırmalıdır. Aynı UUID farklı payload ile kullanılmaz.
Kaybolan refresh yanıtında eski refresh credential'ını yeni UUID ile kullanmak
token reuse sayılır ve session revoke edilir. Aynı UUID ile retry encrypted receipt
üzerinden aynı refresh token'ı döndürür. Daha sonraki rotation önceki receipt'i
supersede eder; eski yanıt yeni credential'ın üzerine yazılmaz.

Refresh ve bootstrap credential'ları 32 rastgele byte'ın base64url değeridir.
Veritabanında credential hash'i ve AES-256-GCM ile şifreli response receipt'i bulunur;
plaintext credential bulunmaz. HKDF anahtarları `AUTH_SECRET`, canonical `AUTH_URL`
origin'i, environment ve amaçla ayrılır. Receipt AAD'si scope, command ve session'ı
bağlar. AUTH_SECRET/origin/environment rotasyonu eski JWT ve receipt key'lerini
geçersizleştirir; deployment bu değişiklikleri sıradan config güncellemesi saymamalı.
Eski receipt decrypt edilemiyorsa servis `AUTH_RECOVERY_UNAVAILABLE` ile fail-closed
sonuç verir; bunu otomatik yeni komutla çözmeye çalışmaz. Kontrollü keyring rotasyonu
eklenecekse önce eski key desteği ve güvenlik testleri tasarlanmalıdır.

Guest merge, canonical history, command receipt taşıması, kaynak session revoke,
yeni account session ve auth receipt'ini tek transaction içinde tamamlar. Kaynak
user silinince `NativeSession.userId` null olabilir; immutable `subjectUserId` ve
account'a bağlı encrypted auth receipt'i kayıp merge onayının recovery'sini sağlar.
Account silme, merge kaynaklarına ait orphan session/receipt'leri de temizler.

Silme sonrası gecikmiş eski guest bootstrap isteğinin boş yeni hesap yaratmasını
önlemek için yalnız installation hash'i taşıyan tombstone tutulur. Tombstone user
id, raw credential veya gameplay içermez; 365 gün sonra temizlenebilir. Kullanıcı
açıkça yeni guest başlattığında istemci yeni installation secret ve yeni UUID üretir.
Silme ile bootstrap aynı installation advisory lock'unu paylaşır.

Account silme ayrıca eski account auth command'lerinin salted digest'ini doksan gün
tutar. Böylece kayıp eski register yanıtını tekrar denemek hesabı yeniden yaratmaz;
yeni UUID ile açık yeni kayıt isteği yine mümkündür. Digest email/user/password/token
saklamaz ve `AUTH_SECRET` rotasyonuyla kaybolmaz. Account deletion ve authentication
aynı account-scope → identity lock sırasını kullanır.

`cleanupNativeSessions` tek çağrıda en çok 1.000 aday/record grubu seçer; süre dolmuş
receipt/session'ları, otuz günden eski revoked session'ları ve süresi dolmuş bootstrap
tombstone'larını temizler. Session cascade'i bağlı receipt'leri de kaldırabilir.
Silme predicate'leri eşzamanlı yenileme/yeniden deletion tombstone güncellemesini
tekrar denetler. Çıktı yalnız sayılardır. Bu fonksiyonun bulunması bir production
cron'un provision edildiği anlamına gelmez; operasyon pipeline'ı ayrıca bağlar.
Backup/restore süreci silme kararlarını korumalı; uygulama içi silme tek başına eski
backup artifact'lerinden veri geri getirilmesini engellemez.


Faz 6 silme onayı recovery’si `NativeDeletionReceipt` kullanır. İstemci UUID +
32-byte random secret’ı SecureStore’a önceden yazar. Account deletion ile aynı
transaction’da yalnız UUID, capability hash’i ve timestamps kaydedilir; kayıt user,
email veya raw secret’a bağlı değildir. 90 gün boyunca aynı proof `{deleted:true}`
onayını session iptalinden sonra da alabilir. Başka proof aynı UUID’yi kullanamaz.
Bu kayıt eski hesabı geri getirmez veya yeni principal oluşturmaz. Web’in proof
vermeyen mevcut silme body’si desteklenir; ilk silmede origin/password kuralları
korunur. Ayrıntılar [API sözleşmesinde](../../../docs/mobile/api-v1.md).

Bounded cleanup çıktısı `receipts`, `sessions`, `tombstones`, `deletedCommands` ve
`deletions` sayılarını içerir; son iki alan 90 günlük eski auth-command digest ve
silme onayı receipt’lerini temizler. Üretimde bu cleanup’ın zamanlanması ve backup
restore sonrasında silme kararlarının yeniden uygulanması ayrı operasyon kapılarıdır.
