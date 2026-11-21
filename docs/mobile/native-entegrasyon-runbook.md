# Native entegrasyon, signing metadata ve cihaz runbook’u

> 14 Kasım 2026. Şimdilik gerçek developer/signing kimlikleri yok; kullanıcı bunlar olmadan ilerlemeyi seçti. Website ve development app için bu ayarlar zorunlu değildir. [Faz 7 raporu](faz-7-entegrasyon-raporu-2026-11-14.md) gerçek yerel kanıtları kaydeder.

## Şimdilik kimlik bilgileri olmadan çalışma

`apps/mobile/.env.example` içindeki API/web origin ve `scorelogic-dev` scheme ile development kaynakları hazırlanabilir. `MOBILE_RELEASE` ve crash reporting kapalı kalır. Gelen link örneği `scorelogic-dev://puzzles/ckscorepuzzlecamp000000001`; custom scheme OS domain doğrulaması değildir. Yerel API, reviewed/test fixture içeriği ve 22 backend migration ayrıca gerekir. Metro/Hermes export kurulu uygulama üretmez; native çalıştırmak için Xcode veya Android SDK gerekir.

Server’daki dört association env’inin tamamı boş bırakılabilir. Well-known dosyalarının bu durumda 404 olması bilinçlidir; normal website/healthcheck bundan etkilenmez. Gerçek kimlikler olmadan örnek prefix/fingerprint yayınlanmaz.

## Bilgiler daha sonra nereden alınır?

| Bilgi | Kaynak ve yapılacak iş |
|---|---|
| Domain/host | Kontrol ettiğiniz HTTPS host. Mevcut Railway domain’inizi kontrol ediyor ve bu backend’i orada yayınlayabiliyorsanız özel domain satın almak zorunlu değildir. Host, invitation web origin ve native associated host aynı olmalı |
| iOS bundle id | Apple Developer hesabında uygulama için oluşturulan explicit App ID’nin bundle identifier’ı; örneğin `com.sirket.scorelogic`. Gerçek organizasyon/uygulama kararıdır, örnek kopyalanmaz |
| Apple App ID prefix | Apple App ID kaydındaki prefix. Genelde Team ID ile aynı olabilir, eski hesaplarda farklı olabilir. `MOBILE_IOS_APP_ID` = `PREFIX.bundleIdentifier`. Associated Domains capability ve signing entitlement aynı gerçek App ID’ye bağlanır |
| Android package | Uygulamanın gerçek package/application id kararı; ilk store kurulumu/yayınıyla kalıcı kimlik olarak yönetilir. Native `MOBILE_APPLICATION_ID` ile aynı olmalı |
| Android signing SHA-256 | İmzalanan app’in sertifikası. Google Play App Signing kullanıldığında Play Console’daki **App signing certificate** SHA-256 kullanılır; upload certificate veya rastgele debug fingerprint aynı değildir |
| Build numarası | Her yayımlanan native build için artırılan pozitif tam sayı; `MOBILE_BUILD_NUMBER`. iOS buildNumber/Android versionCode buradan alınır |
| Crash reporting projesi | İstenirse sahibin Sentry projesi ve public DSN; org/project ve upload token build ortamında. Bunlar sağlanana kadar reporting kapalı tutulur |

Apple/Google developer kaydı, signing erişimi ve olası ücretli hizmetler bu çalışma sırasında satın alınmadı/oluşturulmadı. Özel anahtar, keystore şifresi ve upload token sohbet veya repo’ya yazılmaz. [Apple rehberi](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [Android App Links rehberi](https://developer.android.com/codelabs/android-app-links-introduction).

## Public association ayarları

Gerçek değerler hazır olunca **backend** ortamında:

```dotenv
MOBILE_LINK_HOST=kontrol-ettiginiz-host
MOBILE_IOS_APP_ID=GERCEK_PREFIX.gercek.bundle.identifier
MOBILE_ANDROID_PACKAGE=gercek.android.package
MOBILE_ANDROID_SHA256_FINGERPRINTS=GERCEK_32_BYTE_COLON_DELIMITED_SHA256
```

Bunlar bilerek geçersiz açıklayıcı örneklerdir; doğrulanmış değerlerle değiştirilir. iOS veya Android bağımsız etkinleştirilebilir; Android package/fingerprint birlikte gerekir. Birden çok fingerprint virgülle ayrılır. Backend association doğrulamasını `npm run mobile:verify-links` ile çalıştırın; 200 JSON/no-redirect ve configured payload eşleşmesini kontrol eder. Script gerçek DNS/TLS’ye gider; bu ortamda public host kontrolü yapılmadı.

**Native build** ortamında `MOBILE_APPLICATION_ID`, aynı `MOBILE_LINK_HOST`, `MOBILE_BUILD_NUMBER`, `EXPO_PUBLIC_SCHEME`, HTTPS `EXPO_PUBLIC_API_URL` ve eşleşen `EXPO_PUBLIC_WEB_ORIGIN` ayarlanır. Production profili `MOBILE_RELEASE=true` kullanır. Uygulamanın yeni native build’i gerekir; JS export tek başına entitlement/manifest’i değiştirmez.

## Diagnostics ve symbolication

Varsayılan reporting kapalıdır. Açılması owner’ın gerçek proje/retention/privacy kararını ve native event incelemesini gerektirir:

```dotenv
EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true
EXPO_PUBLIC_SENTRY_DSN=https://PUBLIC_KEY@SENTRY_HOST/PROJECT_NUMBER
SENTRY_ORG=gercek-org
SENTRY_PROJECT=gercek-proje
# Yalnız güvenli build ortamında; EXPO_PUBLIC_ kullanmayın:
SENTRY_AUTH_TOKEN=...
```

SDK debug/native metadata’sından release/dist alır. Sentry Expo plugin’i native build map/debug symbol upload adımlarını, Metro Debug ID’lerini ekler. `npm run export:native:maps && npm run check:export` bytecode-map eşleşmesini yerelde kontrol eder; upload veya symbolication kabulü değildir. Map’ler private artifact’tir, public website’ye kopyalanmaz. Cloud build, Sentry upload veya test crash’i bu görevde başlatılmadı.

JS privacy filtresi test edildi. Native-only event’ler JS `beforeSend` filtresini atlayabilir; release build’de örnek JS/native crash ve ANR event envelope’larını inceleyin, credential/not/input/user id bulunmadığını ve project-side scrubbing/retention ayarını doğrulayın. Screen capture/replay/logs/tracing/session collection kapalı kalır. Gerçek native event incelemesi tamamlanmadan bu kabul kutusu işaretlenmez.

## Cihaz test matrisi

Dedicated test app/backend kullanın; gerçek kullanıcı verisini silmeyin. Artifact sürümü, OS/cihaz, backend sürümü ve test zamanını her kayda ekleyin.

| Test | Adımlar | Kabul |
|---|---|---|
| Cold verified link | App kapalıyken aynı HTTPS puzzle link’ini aç | Tam puzzle, doğru owner; installed/absent durumda web fallback |
| Warm/auth link | App açıkken, login pending iken ve session gate açıkken link gönder | Eski owner’da command yok; yeni hazır owner’da doğru puzzle |
| Yanlış/kilitli/retired link | Başka host, bozuk yol, kilitli veya retired içerik | Yetki atlanmaz, açık hata/back; eski board yanlış puzzle diye görünmez |
| iPad paylaşım | Solved sonucu Share ile aç; split view/rotation da dene; cancel et | Doğru anchor, tek dialog, sayaç/sonuç değişmez |
| Clipboard | Copy invitation’a bas; başka uygulamada yapıştır; clipboard erişimini engelle | Canonical içerik, credentials/not yok; başarısız yazıma sahte başarı yok |
| Vault/lock | Hint/progress pending iken ekranı kilitle; vault okunamıyorsa unlock/retry | Yeni guest yaratılmaz; özgün command/owner korunur |
| Süreç sonlandırma | Yerel kayıt veya pending command kalıcılaştıktan sonra OS’ten kapat/relaunch | Aynı receipt, tek Hint/completion; kaydedilmiş skor/not geri gelir |
| Memory pressure | Oyunda ve analysis açıkken OS memory pressure uygula | Kalıcı draft/outbox korunur; transient analysis bırakılabilir |
| Uzun offline/çok cihaz | A offline edit; B Hint/solve/replay; A reconnect | Açık conflict; server Hint/terminal protected; ikinci solve/Hint charge yok |
| Saat/timezone | Saat ±30 gün, timezone değişimi, İstanbul gece yarısı ve uzun background | Resmi server zamanı; yeni daily ayrı timer; offline gösterim tahmini |
| App upgrade/downgrade | v1 SQLite’dan v2 app’e; future schema’dan eski app’e | Atomik upgrade; downgrade veriyi silmez ve engellenir |
| Uninstall/reinstall | iOS/Android’de vault var/yok, DB var/yok ve backup/transfer varyantları | Belgelenen ayrımlar; eski owner command’i yeni guest olarak gönderilmez |
| Tablet/fold/resize | Edit/save veya Hint pending iken rotate/split/fold; büyük yazı | Aynı attempt/skor/not; yeni işlem yaratılmaz |
| Crash/ANR | Owner tarafından açılan reporting ile release test crash/ANR üret | Doğru release/dist, okunur symbols, privacy filtreleri; tekrar açılışta draft korunur |

Bu matris henüz bütün fiziksel cihazlarda tamamlanmadı. 20 Kasım'da Android Studio/SDK/adb ve proje JDK 17 hazırlandı; SM-G970F / Android 12'ye gerçek debug APK kuruldu. Home/Daily/Campaign, tek Hint ve gerçek process-stop sonrası skor/not/hint korunumu ürün sahibiyle doğrulandı. Tam Xcode/CocoaPods, iOS ve release cihaz matrisi açık; Maestro koşusu yapılmış değildir. Ayrıntılar [Faz 8 raporundadır](faz-8-kabul-raporu-2026-11-20.md). Ürün sahibinin isteğiyle kapsamlı arayüz/200% çalışması sonraya bırakıldı; bu kabul koşulları passed sayılmaz.

Aynı günün devamında yalnız Railway test DB/backend'i yeniden çalıştırıldı; şifreli yedek ve 5 native migration sonrası HTTPS v1 doğrulandı. ScoreLogic Test 0.1.0 (2) internal APK'sı gömülü JS ile üretildi; Metro/API/yerel DB kapatılıp USB çıkarıldıktan sonra Home/Daily/Campaign/Hint devamı fiziksel telefonda doğrulandı. [Android rehberi §5](android-cihaz-kurulumu.md#5-güncel-bağımsız-test-apksı) yeniden derleme ve kullanım adımlarını içerir. Internal build development sertifikası kullanır; production signing veya verified association kabulü değildir.

Manuel runner için:

```sh
maestro test --env APP_ID=dev.scorelogic.localpoc \
  --env PUZZLE_URL=scorelogic-dev://puzzles/ckscorepuzzlecamp000000001 \
  apps/mobile/.maestro/resilience.yaml
```

Flow dedicated test kurulumunda yeni replay başlatır; bir Hint’i doğruladıktan sonra stop/relaunch/cold/warm link boyunca sayının aynı kaldığını sınar. Store signing ve gerçek domain verification bu flow’dan ayrı kabul edilir.
