# Faz 7 — Native entegrasyon ve dayanıklılık

> 14 Kasım 2026. Kaynak implementasyonu ve aşağıdaki yerel kanıtlar tamamlandı. Signing/domain kimlikleri henüz yok; kullanıcı bu bilgiler olmadan devam edilmesini istedi. Gerçek OS, imzalı binary ve production association kabulü açık tutuldu.

Kapsam [ana planın Faz 7 maddeleridir](../mobil-uygulama-donusum-plani-2026-11-12.md). Bu çalışma kaynak/test teslimidir; fiziksel cihazda uçtan uca kabulün tamamlandığı anlamına gelmez.

## Domain ve signing association

- Backend artık `/.well-known/apple-app-site-association` ve `/.well-known/assetlinks.json` yollarını JSON olarak sunabilir. Apple kapsamı `/puzzles/*`; Android package ve gerçek imza SHA-256 listesi yapılandırılır. İmza rotasyonu için birden çok fingerprint desteklenir.
- Tüm ayarlar boşsa 404 döner; website deployment’ına yeni zorunlu env eklenmedi. Kısmi/bozuk konfigürasyon 503/no-store olur, başlangıç validator’ı da bunu reddeder. Public Host allowlist dışında signing metadata yayınlanmaz. Standalone bind adresinden farklı public Host desteklenir.
- Native release ayarları HTTPS API/web origin, invitation host/association host eşleşmesi, uygulamaya özel scheme ve pozitif build numarası ister. iOS buildNumber ve Android versionCode aynı kaynak numaradan üretilir. Bu kontroller gerçek domain/signing sahipliğini kanıtlamaz.
- Production standalone sunucusunda **yerel reserved-domain fixture Host’u** ile her iki dosya HTTP 200 `application/json`, redirect olmadan doğrulandı; farklı host 404 verdi. Bu test dış DNS, HTTPS sertifikası, Apple CDN veya Android OS verification kanıtı değildir.

Kaynak: [association servisi](../../lib/mobile/associations.ts), [Apple route](../../app/.well-known/apple-app-site-association/route.ts), [Android route](../../app/.well-known/assetlinks.json/route.ts), [build guard](../../apps/mobile/build-config.cjs).

## Link, auth, clipboard ve paylaşım

[IncomingLinks](../../apps/mobile/src/core/links.ts) son geçerli daveti kuyrukta tutar. Hydration, blocked session veya hesap geçişi sırasında eski kullanıcıya yönlendirme yapılmaz. Geç gelen cold-start URL, daha yeni warm daveti ezmez. Hazır yeni owner ile yönlendirme yapılır; allowlist, credentials/query/hash ve yol kontrolleri korunur. Bu kuyruk aktif JS sürecindedir; OS’nin açılış link’i ve Faz 6’nın kalıcı auth dönüş intent’iyle birlikte çalışır, tam navigation history’sinin disk yedeği değildir.

Gerçek navigator testleri cold/warm yarışını, hydration beklemesini ve login devam ederken gelen davetin yalnız **account token** ile açılmasını doğrular. Kilitli/retired puzzle yetkisi yine server’dadır; URL parse etmek erişim vermez.

`Copy invitation` yalnız açık kullanıcı eylemiyle Expo Clipboard’a canonical solved-attempt davetini yazar. Clipboard okunmaz, gözlenmez ve background’da değiştirilmez. Başarısız/false yazım başarı olarak gösterilmez. Süre/hint/puzzle link’i server sonucundan gelir; not/skor gönderilmez. Native Share’in çift basış koruması, cancel ve iPad anchor davranışı korunur. Gerçek OS share sheet ve iPad anchor kabulü henüz çalıştırılmadı.

Kaynak: [navigation](../../apps/mobile/src/ui/AppShell.tsx), [oyun/paylaşım](../../apps/mobile/src/ui/GameScreen.tsx).

## Lifecycle, offline ve veri bütünlüğü

- Offline cold start cached server saatine dayanır; cihaz duvar saatini 30 gün ileri almak timer’a 30 gün eklemez. Aktif süreçte monotonic server anchor korunur; reconnect resmi server zamanını yeniden kurar. Uygulama kapalıyken geçen süre offline ortamda kesin bilinemez: gösterim tahmindir, Check/Reveal resmi süresi server’da hesaplanır.
- Memory warning ağır geçici Check/analysis snapshot’larını bırakır ve başlamış yerel yazımları bekler. Draft, owner, outbox, pending command ve hints/completion değiştirilmez. Background/ekran kilidi akışındaki yazım bariyeri korunur. OS bir yazımı bitirmeden zorla kapatırsa o yazım için kalıcılık garantisi verilmez.
- Resize/fold boyutlarında mevcut attempt/not/skor ve local-save durumu korunur; yeni command üretilmez. Bu bir mocked RN boyut testi olup fiziksel foldable ölçümü değildir.
- Android kaynak config’de `allowBackup:false`; SecureStore backup exclusion kuralları korunur. Üretilen manifest’te ayar doğrulandı. OEM device transfer ve iOS backup/reinstall davranışı gerçek cihaz matrisi gerektirir; “uninstall bütün veriyi siler” veya “guest reinstall ile kurtarılır” garantisi yoktur.
- Vault kilitliyken startup engellenir, guest yaratılmaz ve eski command gönderilmez. Vault yok/SQLite kalmışsa eski owner karantinada kalır; ayrı guest eski outbox’ı göndermez. Vault kalmış/SQLite yoksa aynı session canonical server progress’i yeniden okur. Bunlar test port senaryolarıdır, OS Keychain/Keystore üzerinde çalıştırılmış değildir.
- Uyumsuz API sürümünde canonical yazma durur; varsa owner cache ve yerel notlar korunur. SQLite v1→v2 migration ve daha yeni schema’yı downgrade etmeme kuralları önceki disk suite içinde korunur.

## Gerçek HTTP + iki oturum + disk SQLite kanıtı

Yeni [smoke:resilience](../../apps/mobile/scripts/smoke-resilience.ts) localhost-only fixture backend kullanır. Aynı synthetic account için iki ayrı server session ve iki ayrı disk SQLite dosyası oluşturur; SecureStore bellek test portudur.

1. A offline not kaydeder; B Hint alır ve canonical revision ilerler.
2. A cihaz saati +30 gün ile cached board’u açar; timer sıçramaz.
3. Reconnect eski local revision’ı sessiz yazmaz; açık conflict gösterir. Kullanıcı local editable girdiyi seçer; B’nin Hint’i readonly olarak korunur.
4. A/B aynı revision’dan Hint ister: yalnız biri commit eder. Bir önceki Hint ile birlikte toplam **iki Hint** vardır; üçüncü request 409 alır.
5. A/B Check gönderir; başarılı çözümün yanıtı bilerek kaybedilir. Receipt recovery sonrasında iki ekranda tek canonical SOLVED sonucu ve **bir successful attempt/unique solve** vardır.
6. Test kendi hesabını siler ve geçici dosyalarını kaldırır.

Mevcut account smoke da tekrar geçti: lost register/logout/delete reply, merge, auth dönüşü ve local merged-owner cleanup. DB suite aynı Hint’in sekiz tekrarında tek event, çoklu command CAS, web/native ortak revision, alternatif doğru çözüm, >120 dakika ve deletion recovery senaryolarını korur.

## Crash/ANR, release ve privacy

- Expo SDK 58’in önerdiği **`@sentry/react-native 8.28.0`** ve **`expo-clipboard 58.0.4`** sabitlendi. Native crash/ANR/app-hang SDK config’i, React render recovery boundary, Sentry Expo build plugin’i ve Metro Debug ID/source-map zinciri eklendi.
- Crash reporting **varsayılan kapalıdır**. `EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true` ve geçerli public HTTPS DSN gerekir. Development runtime event gönderimi kapalıdır. Release’de açık olacaksa build-time Sentry org/project gerekir; upload token yalnız build ortamında tutulur. Kullanıcı/proje oluşturulmadı, telemetry veya symbol upload gönderilmedi.
- JS `beforeSend` allowlist’i credential, user id/email, request/body, breadcrumb, contexts, notes/scores, free error text, frame variables/source ve attachments’ı kaldırır. Symbolication için public bundle basename, line/column ve Debug ID korunur. Logs/replay/performance/session tracking, screenshot/view hierarchy, otomatik breadcrumbs ve user interaction tracing kapalıdır. SDK’ye oyuncu id/email veya board snapshot eklenmez.
- **Önemli kapsam sınırı:** JS `beforeSend`, native SDK’nin doğrudan gönderdiği bütün crash/ANR envelope’larını filtrelediğini kanıtlamaz. Native SDK collection ayarları azaltıldı; gerçek native envelope, cihaz/network metadata’sı, Sentry project-side scrubbing ve retention owner tarafından **açılmadan önce** doğrulanmalıdır. Varsayılan kapalı teslim bu dış doğrulamayı tamamlanmış saymaz.
- Native SDK release/dist bilgisini derlenen app metadata’sından alır; native build plugin’i maps/debug symbols yükleme adımlarını hazırlar. Gerçek upload/symbolication ve crash/ANR üretimi, sahibi olunan proje + imzalı native build ile ayrıca sınanır.
- İki platform Hermes bundle ve map üretildi. [check:export](../../apps/mobile/scripts/check-export.mjs), map’in UUID Debug ID’sinin aynı bytecode içinde bulunduğunu, map koordinatlarının dolu olduğunu ve private engine/Prisma kaynaklarının native source listesine girmediğini doğruladı. JS bundle yaklaşık 3.7 MB/platform; bu binary boyutu değildir. Map’ler yaklaşık 9 MB/platform ve **özel build artifact’i** olarak tutulmalı; public web/static hosting’e konmamalıdır.
- Sentry açık fixture config ile iOS/Android prebuild başarılı; native symbol-upload adımları kaynaklarda oluştu. Bu işlem CocoaPods/Gradle compile, signing, install veya crash gönderimi değildir.

Kaynak: [privacy filtresi](../../apps/mobile/src/core/diagnostics.ts), [SDK adaptörü](../../apps/mobile/src/diagnostics.ts), [render recovery](../../apps/mobile/src/ui/CrashBoundary.tsx), [Metro](../../apps/mobile/metro.config.cjs).

## Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Native core/disk/protocol | **86/86 başarılı**; 75 önceki senaryo + 11 yeni sertleştirme senaryosu |
| Native component/navigation | **39/39 başarılı**; 33 önceki + clipboard, 2 link/auth yarışı, resize, SDK privacy ve render recovery |
| Root unit | **353/353 başarılı**; 5 yeni association testi |
| PostgreSQL integration | **52 başarılı; 2 koşullu bootstrap testi skip** |
| Real HTTP account + resilience smoke | Başarılı; test hesapları kaldırıldı |
| Association HTTP | Yerel public Host fixture ile 200 JSON/no redirect; farklı host 404 |
| TypeScript/lint/diff | Root/native TS, ESLint uyarısız ve whitespace kontrolü başarılı |
| Production build | Next standalone ve static assets başarılı |
| SDK uyumu | `expo install --check` başarılı; Sentry SDK önerilen 8.28.0 |
| Expo Doctor | **19/20**; CocoaPods/native tooling kontrolü açık |
| Native source/map | Sentry plugin açık prebuild, iOS/Android Hermes/map export ve Debug ID eşlemesi başarılı |
| Native production audit | High/critical yok; **6 moderate** transitive build-tool advisory açık. Zorla major dependency değişimi uygulanmadı |

[Test kaynakları](../../apps/mobile/tests/hardening.test.ts), [link navigator testleri](../../apps/mobile/tests/components/shell.test.tsx), [clipboard/resize](../../apps/mobile/tests/components/player.test.tsx), [diagnostics](../../apps/mobile/tests/components/diagnostics.test.tsx), [association testleri](../../tests/unit/mobile/associations.test.ts).

## Sürüm uyumluluk kaydı

| Bileşim | Kaynak/yerel kanıt | Açık doğrulama |
|---|---|---|
| Yeni native + mevcut API v1 | Ortak contracts 1.2.0; gameplay/account/resilience HTTP smoke | Deployment ve gerçek cihaz |
| Önceki native/web deletion body + yeni backend | Optional proof alanları; legacy web silme integration | Canlı rollback/client dağılımı |
| Uyumsuz API v2 response + local v1 client | Cached draft korunur; resmi eylem durur | Gerçek staged upgrade |
| SQLite v1→v2 | Disk close/reopen + exact draft/outbox | Native app upgrade |
| Yeni SQLite→eski app | Future user_version reddedilir; veri silinmez | Native downgrade/restore |
| Vault kalır / SQLite yok | Canonical aynı owner yeniden okunur | iOS reinstall/Keychain davranışı |
| Vault yok / SQLite kalır | Eski owner outbox karantinada | Android restore/OEM transfer |

Yeni DB migration yok; public contract 1.2.0 / wire API v1 / SQLite v2 kaldı. Backend phase 6’daki toplam 22 migration ve önceki native API/session yayınını yine gerektirir. Railway env, domain, deploy veya signing hesabı değiştirilmedi.

## Çalıştırma ve açık cihaz kapıları

```sh
# Root
npm run type-check
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run mobile:verify-links  # Gerçek signing metadata/host girildikten sonra

# apps/mobile, Node 22
npm run type-check
npm test
npm run test:components
npm run export:native:maps
npm run check:export
MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:resilience
```

[Yapılandırma ve cihaz runbook’u](native-entegrasyon-runbook.md) public metadata’nın nereden alınacağını ve açık test adımlarını gösterir. [Maestro resilience flow](../../apps/mobile/.maestro/resilience.yaml) tek Hint → stop/relaunch → cold/warm link → aynı Hint sayısını kontrol eder; dedicated test installation’da yeni replay başlatır. [Manuel cihaz workflow’u](../../.github/workflows/native-device-e2e.yml) smoke/gameplay/player/resilience seçeneklerini sunar. Bu ortamda Maestro çalıştırılmadı.

Makinede tam Xcode, CocoaPods, Android SDK/adb ve Maestro yok. JS/disk testleri; gerçek OS kill/low-memory/lock, Keychain/Keystore, native crash/ANR, tablet/foldable, iPad share, verified HTTPS association ve source-map upload kabulü yerine geçirilmez. Faz 7’nin fiziksel çıkış kapısı açık kalır; kaynak/yerel test teslimi tamamlandı.

## Kullanılan resmi kaynaklar

- [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [Apple applinks details](https://developer.apple.com/documentation/bundleresources/applinks/details-swift.dictionary).
- [Android App Links kurulumu ve doğrulama](https://developer.android.com/codelabs/android-app-links-introduction).
- [Expo SDK 58 Clipboard](https://docs.expo.dev/versions/v58.0.0/sdk/clipboard/).
- [Sentry Expo entegrasyonu](https://docs.sentry.io/platforms/react-native/guides/expo/), [source maps](https://docs.sentry.io/platforms/react-native/guides/expo/sourcemaps/uploading/expo/), [veri toplama](https://docs.sentry.io/platforms/react-native/data-management/data-collected/).

SDK option/bridge davranışı ayrıca kurulu Expo/RN/Sentry kaynak ve TypeScript tanımlarıyla kontrol edildi. Native-only event filtreleme sınırı kabul kaydında açık bırakıldı.
