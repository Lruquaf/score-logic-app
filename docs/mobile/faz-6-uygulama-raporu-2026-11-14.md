# Faz 6 — Bütün oyuncu ekranları

> 14 Kasım 2026. Kaynak implementasyonu ve aşağıdaki yerel testler tamamlandı. İmzalı iOS/Android build, gerçek cihaz kabulü ve canlı rollout açık kalır.

Kapsam [ana planın Faz 6 maddeleridir](../mobil-uygulama-donusum-plani-2026-11-12.md). Faz 4 veri/session/navigation temeli ve Faz 5 oyun bileşenleri üzerinde oyuncu ekranları tamamlandı. Mevcut oyun özelliklerinden biri yalnız web bağlantısına devredilmedi. İngilizce ürün dili korundu.

## Oyuncu davranışları

- **Home:** Attempt başlatmayan daily önizlemesi, sunucunun daily tarihi/zorluk/takım bilgileri, bugünkü oyuna giriş, yerel taslaktan veya son server kayıtlarından devam, campaign/account ve yeniden açılabilen örnekli rehber.
- **Campaign:** Beş pack seçimi, canonical catalog’daki otuzar seviye, solved/in-progress/revealed/open/locked durumları. Kilitli seviyeye dokunmak açıklama gösterir; puzzle açmaz. Board üzerindeki Previous/Next canonical sırayı izler, pack sınırını geçebilir ve erişimi sunucunun `isUnlocked` alanından alır. Terminal solve/reveal sonrası catalog yenilenir; client kilit açmaz.
- **Stats:** Mevcut 15 canonical metrik: totalSolved, successfulAttempts, totalAttempts, firstTrySolves, assistedSolves, answerReveals, perfectSolves, totalTimeSec, bestDurationSec, solvedEasy/Medium/Hard, currentStreak, bestStreak, avgTimeSec. Nullable süreler `—` olur; servis hatası uydurma sıfır üretmez.
- **Son altı kayıt:** Web’deki mevcut aggregate davranışla aynı altı **puzzle progress kaydı** gösterilir; bu altı ayrı attempt satırı değildir. Puzzle etiketi, durum, attempt/hint sayısı, resmi kayıt süresi, son aktivite tarihi ve puzzle’a dönüş vardır. İlk/resmi/best attempt ayrımı board üzerinde korunur.
- **Login/register:** Native e-posta/şifre, kayıt şifre tekrarı, geçerli schema, hata mesajı ve guest devam. Bilinen yanlış şifre/kayıt hatası formu düzenlenebilir bırakır. Süresi dolmuş account recovery’sinde yanlış şifre eski sahibin ekranlarını açmaz; session kapısı korunur.
- **Auth dönüşü:** Anlamlı son tab veya exact puzzle intent’i SecureStore’a işlemden önce yazılır. Başarılı login/register ve belirsiz yanıt sonrası restart aynı yere döner. Guest merge öncesi command/draft bariyeri korunur. Geçiş sırasında skor/geri hareketleri engellenir.
- **Account/Settings:** Guest/account eylemleri, onaylı sign-out, korunmuş owner taslakları, native silme formu, in-app yardım/privacy/support; uygulama sürümü, OS, public build id, API host, dil/tema bilgisi. Çıkış yanıtı kaybolduğunda aynı refresh capability ile revoke doğrulanır; otomatik olarak eski hesabın ekranlarına dönülmez.
- **Paylaşım:** Yalnız çözülen mevcut attempt’in server süresi/hint sayısı, daily veya pack/level kimliği, standard/replay ayrımı, spoiler içermeyen metin ve exact HTTPS puzzle link’i kullanılır. Native dialog/subject/iPad anchor ayarlanır. Çift basış aynı anda iki share açmaz. Hata halinde seçilip kopyalanabilen davet metni kalır; cancel sonucu değiştirmez veya teslim edildiğini iddia etmez.
- **Ortak durumlar:** Focus/foreground/reconnect ve aktif ekranda bir dakikalık polling; owner-scoped cache, offline etiketi, loading, veri yok, bakım/hata ve retry. Cache yokken oyun/içerik varmış gibi davranılmaz. Süresi dolmuş session veya bozuk kritik yerel veri ayrı recovery kapısında kalır.

Kaynaklar: [oyuncu ekranları](../../apps/mobile/src/ui/player/PlayerScreens.tsx), [hesap/rehber](../../apps/mobile/src/ui/player/AccountScreens.tsx), [campaign geçişleri](../../apps/mobile/src/ui/player/CampaignNavigation.tsx), [navigation](../../apps/mobile/src/ui/AppShell.tsx), [paylaşım/oyun](../../apps/mobile/src/ui/GameScreen.tsx), [runtime](../../apps/mobile/src/core/runtime.ts), [session](../../apps/mobile/src/core/session.ts).

## Silme akışında giderilen protokol açığı

Başarılı silme session’ları iptal ediyordu. HTTP yanıtı kaybolursa istemci sonraki denemede 401 alabilir; bu tek başına silmenin başarı kanıtı değildir. Sadece yerel veriyi silip başarı göstermek de güvenilir olmaz.

[Silme recovery servisi](../../lib/auth/native/deletion.ts) ve [migration](../../prisma/migrations/20261114000000_native_deletion_receipts/migration.sql) eklendi. Native istemci UUID + 32-byte random secret içeren aynı body’yi SecureStore’a göndermeden önce yazar. İlk silme hâlâ geçerli kimlik, açık confirmation ve account için güncel şifre ister. Aynı transaction’da yalnız command UUID, capability hash’i ve timestamps içeren 90 günlük receipt yazılır; user/email/şifre/raw secret tutulmaz. Aynı proof, session silinmiş olsa da tamamlanmış silmeyi doğrulayabilir. Farklı proof aynı UUID’yi kullanamaz.

Onaydan sonra yerel temizlik kendi recovery işaretini ve owner listesini saklar. Hesap ve ona birleşmiş guest owner’larının SQLite cache/draft/outbox/archive verisi silinir, başka sahiplerin verisi korunur. Temizlik yarıda kalırsa onaydan devam edilir; yeni server silme isteği gerekmez. Başarı ekranı kendiliğinden guest oluşturmaz. Yeni guest açık eylemdir. Legacy web silme body’si, account password ve cookie-origin kontrolleri korunur.

Bu bir backup erasure garantisi değildir. Eski backup’tan restore sırasında silme kararlarını tekrar uygulama ve production cleanup zamanlama işleri release operasyon kapılarıdır. [API sözleşmesi](api-v1.md) ayrıntıları kaydeder.

## Ekran ve durum envanteri

| Ekran/yüzey | Veri ve eylemler | Ele alınan durumlar |
|---|---|---|
| Başlangıç/recovery | SecureStore, SQLite owner hydration | Loading; offline/maintenance; geçersiz local state; session recovery; retry |
| Home | Daily GET, yerel draft, son progress GET | Önizleme; devam; solved/replay; unavailable; cached/offline; retry |
| Daily board | Server business date, mevcut attempt | İlk açılış; devam; gün devri; Hint/Check/Reveal/replay; offline/pending/conflict |
| Campaign pack/level | Catalog + canonical progress | Beş pack; açık/kilitli; in-progress/solved/revealed; boş catalog; cache/retry |
| Campaign board gezintisi | Canonical sıralı komşular | İlk/son sınır; pack geçişi; locked disabled; sonuç sonrası refetch |
| Oyun/Final Table/skor/not | Faz 5 bileşenleri ve command outbox | Given/Hint readonly; editable; saving; unknown/reconcile; Check feedback |
| Hint/Reveal/replay sheets | Açık onay, bir immutable command | Busy; cancel; tek eylem; unknown recovery; başarıda kapanma |
| Analyze/sonuç | Snapshot analysis, current/official/first/best | SAT/UNSAT/UNKNOWN; stale; normal/replay/assisted; resmi sonuç korunumu |
| Share | Canonical solved attempt + HTTPS davet | Busy; native dismiss; hata; selectable fallback; attempt değişince eski metin temizlenir |
| Stats/Recent puzzles | 15 metrik + altı aggregate kayıt | Başarı; gerçek sıfır; nullable zaman; boş history; cache/maintenance/retry |
| Login/Register | Schema + guest merge/auth intent | Validation; yanlış şifre; email conflict; loading; belirsiz reply/restart; guest devam |
| Account/Settings | Session + owner archive + build info | Guest/account; onaylı sign-out; lost reply/recovery; local read error |
| Delete data | DELETE confirmation + account password | Disabled form; yanlış şifre; pending proof; lost reply; local cleanup recovery |
| Deletion success | Doğrulanmış server + local cleanup | Başarı; restart sonrası başarı; yalnız açık yeni guest |
| Help | P/W/D/L/GF/GA, örnekler, giriş/yardım kuralları | Tekrar açma/geri; scroll; ağ gerektirmeyen içerik |
| Privacy | İşlenen veri, depolama ve silme yolu | Native içerik; backup/operasyon sınırı; web’e zorunlu devretme yok |
| Support | Troubleshooting + isteğe bağlı HTTPS contact | Contact yokken açıklama; OS URL açma hatası; public build bilgisine yönlendirme |

Native touch/keyboard/font/screen-reader özellikleri kaynakta vardır; bu tablo gerçek cihazın bütün boyutlarında görsel kabul kanıtı değildir.

## Test ve build kanıtı

| Kontrol | Sonuç ve kapsam |
|---|---|
| Native core/protokol/disk | **75/75**; auth intent, bilinen/unknown auth, expired-account gate, deletion/password/owner isolation, cleanup crash ve logout retry dahil |
| Native component/navigation | **33/33**; Home’da attempt başlamama, 5×30, kilit açıklaması, pack sınırından Next/Previous, bütün stats/history, login retry, registration/guest devam, guest delete ve share fallback/cancel |
| Root unit | **348/348** |
| Gerçek PostgreSQL integration | **52 başarılı, 2 koşullu bootstrap testi skip**; eşzamanlı deletion, unauthenticated receipt recovery, yanlış password/proof ve kimliksiz/hash’li kayıt dahil |
| Gerçek HTTP + disk SQLite account smoke | Başarılı; aşağıdaki zincir. Credential vault bellek test portu |
| TypeScript / ESLint / diff | Root/native TS başarılı; lint uyarısı yok; whitespace kontrolü başarılı |
| Production backend | Next production build + standalone static assets başarılı |
| Native export | iOS ve Android Metro/Hermes export başarılı; imzalı binary değildir |

[Testler](../../apps/mobile/tests/player.test.ts), [arayüz akışları](../../apps/mobile/tests/components/player.test.tsx) ve [DB integration](../../tests/integration/native-api.integration.test.ts) kaynakta tutulur. Önceki fazların oyun/lifecycle/disk senaryoları suite içinde korunur.

Yeni localhost-only [smoke:account](../../apps/mobile/scripts/smoke-account.ts) production standalone API üzerinde şu zinciri doğruladı:

1. Guest notunu disk SQLite’a kaydet → register yanıtını commit sonrasında kaybet → aynı komutla recovery.
2. Guest geçmişini hesaba merge et → intent’i geri yükle → Hint/solve → canonical stats/history oku.
3. Logout yanıtını kaybet → restart/revoke recovery → ayrı guest’in sıfır stats’ı → eski hesaba login → korunmuş sonucu oku.
4. Silme yanıtını kaybet → aynı proof’la receipt recovery → yerel account/merged guest verisini temizle → credentials kaldır → deleted success.

Script rastgele test hesabı oluşturup siler, gerçek kullanıcıya/production’a bağlanmaz ve secret/şifre loglamaz. Kullanılan SQLite gerçek geçici disk dosyasıdır; Node script OS SecureStore davranışını doğrulamaz.

```sh
# Repo kökünde
npm run type-check
npm run lint
npm run test:unit
npm run test:integration
npm run build

# Node 22 ile apps/mobile içinde
npm run type-check
npm test
npm run test:components
npm run export:native
MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:account
```

Integration komutu ayrı test DB ister. Smoke için localhost fixture backend, reviewed seed ve 22 migration gerekir. [Manuel cihaz workflow’u](../../.github/workflows/native-device-e2e.yml) artık smoke/gameplay/player seçeneklerini sunar; yeni [player akışı](../../apps/mobile/.maestro/player.yaml) yalnız salt-okuma gezintisi yapar. Bu ortamda cihaz workflow’u çalıştırılmadı; hazır runner ve kurulu doğru build gerektirir.

## Deployment ve açık kapılar

- Public contract **1.2.0**, wire API **v1**. Native local dependency kopyası ve lockfile güncellendi.
- Server’da toplam **22 migration**, yenisi `20261114000000_native_deletion_receipts`. Yeni migration yalnız yerel smoke/integration PostgreSQL veritabanlarına uygulandı. Railway değişikliği/deploy yapılmadı.
- Backend migration/API yayını native kullanımından önce gelmeli. SQLite schema v2 değişmedi.
- `EXPO_PUBLIC_SUPPORT_URL` isteğe bağlı, owner’ın gerçek HTTPS adresi olmalı; yokken in-app yardım çalışır. `EXPO_PUBLIC_BUILD_ID` public bilgi olarak opsiyoneldir. Secret bu alanlara girilmez.
- Fiziksel iPhone/iPad/Android, gerçek share sheet/iPad anchor, klavye/large text/VoiceOver/TalkBack, background/OS kill ve signed link kabulü açık. Makinede tam Xcode/CocoaPods/Android SDK/Maestro/signing olmadığı için Hermes/Jest bunların yerine geçirilmez.
- Privacy metninin son hukuki/store declaration onayı, gerçek support işletimi, signing, production domain association, beta ve mağaza kabulü sonraki fazlardadır.

[P01–P20 parite kontrol listesi](parite-kontrol-listesi.md) kaynak kapsamını ve açık cihaz/operasyon kapılarını birlikte izler. Faz 6 kaynak ve yerel test teslimi tamamlandı; Faz 7 native entegrasyon/sertleştirme sonraki kapsamdır.
