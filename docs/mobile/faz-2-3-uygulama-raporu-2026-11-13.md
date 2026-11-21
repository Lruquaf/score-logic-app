# Faz 2–3 uygulama ve doğrulama raporu

> 13 Kasım 2026. Native PoC, API ve kimlik altyapısı kodlandı. Yerel testler aşağıdadır; Railway yayını, imzalı IPA/APK veya gerçek cihaz kabulü yapılmış sayılmaz.

Ana kapsam [mobil dönüşüm planının](../mobil-uygulama-donusum-plani-2026-11-12.md) Faz 2 ve Faz 3 maddeleridir. Önerilen Expo + React Native yaklaşımı uygulandı. Faz 4–6'nın bütün ekran ve özellik paritesi bu teslimin kapsamı değildir.

## Uygulanan mobil temel

[apps/mobile](../../apps/mobile/README.md), kendi `package-lock.json` dosyasıyla ayrı bir Expo projesidir. Web root'u taşınmadı. Ayrı kurulum, web React/TypeScript sürümleri ile native toolchain'in birbirini değiştirmesini önler. Yerel public contract paketi kurulumda kopyalanır; native runtime sunucu alias'larını, Prisma'yı veya private solver'ı import etmez.

| Bileşen | Sabitlenen sürüm / kaynak sonucu |
|---|---|
| Node | 22; native engine `>=22.13.0 <23` |
| Expo / React Native / React | 58.0.25 / 0.88.1 / 19.3.0 |
| TypeScript / React tipleri | 6.0.3 / 19.3.0 |
| SecureStore / SQLite | 58.0.3 / 58.0.17 |
| Crypto / Linking / Dev Client / System UI | 58.0.8 / 58.0.17 / 58.0.20 / 58.0.7 |
| Safe Area / Zod | 5.11.1 / 4.6.6 |
| iOS/iPadOS alt sınırı | Üretilen Podfile ve ExpoModulesCore: 16.4 |
| Android alt / target / compile SDK | RN kaynak matrisi: 24 / 36 / 37 |

[Resmi Expo SDK matrisi](https://docs.expo.dev/versions/v58.0.0/) Xcode 26.4+ gerektirir. Alt OS sürümleri kaynak matrisidir; cihazlarda çalıştırılmış minimum destek garantisi değildir. Mağaza build SDK şartları ayrıca ana planda izlenir.

PoC; Home, campaign kataloğu ve oyun ekranını içerir. Guest bootstrap, puzzle/attempt yükleme, 0–19 skor girişi, notlar, yerel taslak, autosave, Hint, Check, Reveal, replay, paylaşım ve güvenilir puzzle bağlantısını açma akışları hazırdır. Büyük ekranda yeterli yükseklik ve uygun font ölçeğinde iki panel kullanılır. Native hesap ekranları, Stats, yardım ve tam navigation/parite Faz 4–6'da tamamlanır; bunların API ve session çekirdeği bu fazda mevcuttur.

`SessionClient` credential ve auth komutlarını SecureStore portunda; SQLite adaptörü owner/ortam bazlı taslak, public cache ve işlem kuyruğunu saklar. İşlem UUID'si ve tam payload ağ isteğinden önce yazılır. Onay, canonical taslakla birlikte kuyruktan atomik kaldırılır. Yanıt bilinmiyorsa yeni Hint üretilmez; aynı receipt okunur veya aynı komut tekrar gönderilir. Başka kullanıcıya ait cache gösterilmez.

Hint sheet'i açık eylem düğmesi içerir. Açılması ücretsizdir; başarıda kapanır. Bekleyen bir progress işlemini onaylamak yeni Hint almak sayılmaz. Eşzamanlı eylem ve board yüklenirken yeni işlem engellenir. Foreground yenilemesi mevcut Hint açıklamasını korur; yeni daily'ye eski açıklama/süre taşınmaz.

Resmi süre server attempt başlangıcından hesaplanır ve 120 dakika sınırı yoktur. Foreground/daily kontrolü yalnız açık oyun ekranında çalışır. Gün devrinde yeni puzzle ayrı draft ve timer alır; eski draft korunur. Offline cache üzerinde giriş/not tutulabilir; yeni resmi Hint/Check/Reveal için bağlantı gerekir. Çok cihaz revision çakışması kullanıcı seçimi gerektirir; verilen skorlar ve server Hint'leri seçimden bağımsız korunur. Gecikmiş yerel okuma başka owner/puzzle ekranını değiştiremez. Yeni/terminal attempt eski dirty taslağı sessizce silmez; eski command receipt daha yeni revision'ı geriletemez. Retry kilidi ilk depolama okumasından önce alınır.

Native paylaşım spoiler içermez; puzzle kimliği, süre, Hint sayısı, davet metni ve HTTPS bağlantısı taşır. Link parser yalnız yapılandırılan origin/scheme ve public puzzle kimliğini kabul eder. Gerçek Universal Links/App Links sahiplik dosyaları ve OS teslimi henüz doğrulanmadı.

## Uygulanan backend ve web uyumu

[Public contracts](../../packages/contracts/src/index.ts), [API v1 sözleşmesi](api-v1.md) ve [ortak servisler](../../lib/services/mobile-api.ts) eklendi. Eski web route'ları aynı gameplay servislerini kullanmaya devam eder. Native başarı/hata envelope'ları `apiVersion`, server saati, İstanbul business date ve sonraki daily sınırını taşır. Public puzzle DTO'su private çözümleri içermez; açık Reveal yetkisi ayrı yanıt üretir.

Native kimlik, web cookie'sinden ayrıdır:

- 10 dakikalık access JWT; account refresh 30 gün kayan / 90 gün mutlak, guest refresh 365 gün inactivity ömrü.
- Rastgele opaque refresh credential'ın yalnız hash'i tutulur. Rotation ve kayıp guest/login/register/refresh yanıtı için değişmez komut ve şifreli receipt kullanılır. Farklı UUID ile tüketilmiş token tekrar kullanımı session ailesini iptal eder.
- Her access doğrulaması session/user durumunu DB'den okur. Logout/revoke, merge ve deletion eski access token'ın süresini beklemez. Süresi dolmuş access durumunda refresh capability ile logout da desteklenir.
- Guest merge, kanıtlanmış guest credential'ı, client sync bariyeri ve canonical geçmiş birleştirmesiyle tek transaction'dır. Ham web guest cookie'si native guest sahipliğini veya merge yetkisini kanıtlamaz. Kayıp merge onayı eski guest geçmişini yeniden aktarmadan kurtarılır.
- Account/guest silme bütün aktif kişisel gameplay ve session kayıtlarını kaldırır. Account şifresi yeniden doğrulanır. Web formu [/delete-account](../../app/(legal)/delete-account/page.tsx) üzerinden gerçek endpoint'e bağlanır; cookie akışında aynı origin/CSRF kontrolleri korunur. Silinen hesaba ait diğer web JWT oturumları da kullanıcı kontrolünde düşürülür.
- Eski bootstrap'ın silinen guest'i yeniden yaratmasını önlemek için 365 günlük installation hash tombstone'u; eski register komutunu önlemek için 90 günlük salted command digest'i tutulur. Raw credential, şifre veya oyun geçmişi bu kayıtlara yazılmaz.

[Kimlik servisinin ayrıntıları](../../lib/auth/native/README.md) anahtar ayrımı, retention ve rotation sınırlarını açıklar. `AUTH_SECRET`, canonical `AUTH_URL` origin'i ve environment birlikte anahtar bağlamıdır; bunları değiştirmek mevcut token/receipt recovery'sini etkiler. Bu sürümde eski anahtarları koruyan bir keyring rotasyonu yoktur.

Bütün canonical puzzle writer'ları aynı DB transaction/advisory lock, revision kontrolü ve receipt protokolünü kullanır. Native `baseRevision`, web `x-scorelogic-base-revision` gönderir. Native bir progress üzerinde revision gerekliliğini açtıktan sonra eski header'sız web istemcisi üzerine yazamaz. Yeni web istemcisi açık conflict seçimi gösterir; eski taslağı yeni revision'a sessiz taşımaz. Hint/submit/reveal/replay kayıp yanıtları commit edilmiş receipt'ten çözülür. Aynı UUID'nin farklı payload ile eşzamanlı kullanımı yalnız bir commit ve yapılandırılmış 409 üretir.

Web regresyonunda ayrıca kayıp Hint onayı beklerken autosave'in gereksiz CAS çakışması üretmesi düzeltildi. Engelleme yalnız ilgili owner/puzzle/attempt'e uygulanır; sonraki daily'nin kaydı devam eder. Giriş/kayıt/çıkış sonrasındaki yönlendirme mevcut web origin'ini korur.

## Migration ve yayın sırası

Eklenen migration'lar:

1. `20261113000000_mobile_identity`: native session/auth receipt, puzzle command, progress revision.
2. `20261113010000_native_installation_tombstones`: silinen guest bootstrap koruması.
3. `20261113020000_native_guest_boundary`: kalıcı native guest kimlik sınırı.
4. `20261113030000_native_deleted_auth_commands`: silinen account auth komutunun yeniden yaratmayı önlemesi.

Toplam 21 migration, yeni oluşturulan yerel PostgreSQL veritabanlarında başarıyla uygulandı. Railway veritabanına bu çalışma sırasında migration/yayın yapılmadı.

Yayın sırası: yedek ve geri dönüş hazırlığı → `npm ci` / Prisma generate → `npm run db:deploy` → API ve revision destekli web'in aynı sürümde yayını → health/content ve API smoke kontrolü → native development build bağlantısı. Native istemci eski canlı backend'e bağlandığında v1 endpoint'leri bulunmaz; backend önce yayınlanmalıdır. Test ve production credential/cache alanları ayrıdır. Public mobil env içine DB URL, AUTH_SECRET veya token yazılmaz.

Migration'lar eklemelidir; rollback sırasında aktif native writer varken tabloları veya revision alanlarını düşürmek güvenli değildir. Önce native erişim/yazım trafiği kontrol altına alınmalı; receipt/revision anlayan backend korunmalıdır. Header'sız eski web istemcilerinin yeni revision koruması açılmış board'larda yenilenmesi gerekir.

`npm run ops:cleanup-native-sessions` süresi dolmuş kayıtları sınırlı batch'lerle temizler ve yalnız sayıları loglar; komut yerel test DB'sinde çalıştırıldı. Production scheduler bu teslimde provision edilmedi. Backup/restore'da silme kararlarının yeniden uygulanması ve backup retention politikası operasyonel kabul kapısıdır; bütün yedeklerden anında silinme iddiası yoktur.

## Doğrulama kaydı

| Kontrol | Sonuç / kapsam |
|---|---|
| Root TypeScript ve ESLint | Başarılı |
| Web/unit | 347 test başarılı |
| PostgreSQL integration | Son tam seri koşuda 49 başarılı + 2 koşullu bootstrap skip. Ayrı bootstrap koşusunda 2/2 başarılı; toplam 51 farklı integration senaryosu doğrulandı. |
| Native core | 21/21 başarılı; SQLite/SecureStore için bellek test portları kullanılır |
| Gerçek HTTP native smoke | Production standalone üzerinde campaign/daily/stats/progress/analysis runtime sözleşmeleri ve guest → attempt → kayıp Hint yanıtı → yeniden controller ile receipt kurtarma → ikinci Hint → doğru Check → refresh → guest silme başarılı. İki Hint harcandı, kayıp yanıt üçüncü harcama oluşturmadı. Depolama bu testte bellek portlarıdır. |
| Web Playwright | 60 başarılı, 3 tasarımsal skip: mobil senaryolar desktop Chromium projesinde atlanır, iki mobil projede çalışır. Chromium, mobil Chromium ve mobil WebKit doğrulandı. |
| Native type-check / dependency check | Başarılı |
| Native prebuild | iOS/Android proje kaynak üretimi başarılı; Pod/Gradle derlemesi değildir |
| Hermes export | iOS 757 / Android 755 modül; her biri yaklaşık 2,4 MB bytecode. APK/IPA boyutu veya cold-start ölçümü değildir. |
| Expo Doctor | Prebuild öncesi 20/20; üretilen native projelerle son koşu 19/20: CocoaPods kurulu değil. Bağımlılık/yapılandırma kontrolleri geçti. |
| Production build | Next.js 16.4.6 ve standalone asset hazırlığı başarılı; localhost production ana sayfa 200 ve CSP nonce kontrolü geçti |
| Operasyon config | 8 panel / 7 alarm doğrulandı |
| Production dependency audit | High/critical yok; 5 moderate transitif advisory kaldı. Native audit'te 3 moderate kaldı. |

Üretim audit'inde mevcut Next/Sentry ve Zod açıkları görüldüğünden aynı major içinde Next 16.4.6, Sentry 10.78.0 ve Zod 4.6.6'ya güncellendi. Zod 4 record şemaları uyarlanıp kontrat/regresyon testleri çalıştırıldı. [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [resmi migration rehberi](https://zod.dev/v4/changelog), [Sentry advisory](https://github.com/advisories/GHSA-mchm-gjx6-7h55). Kalan moderate transitif bulgular zorunlu major değişikliğiyle otomatik zorlanmadı. Development bağımlılıkları için tamamen temiz audit iddiası yoktur.

CI; native bağımsız `npm ci`, type-check, core test, Expo dependency check ve iki platform JS export işini içerir. CI'ye signing secret veya ücretli EAS işi eklenmedi. Integration dosyaları paylaşılan canonical DB fixture'ları nedeniyle seri çalıştırılır.

## Açık native kabul kapıları

Bu makinede tam Xcode/iOS Simulator toolchain'i, CocoaPods, Android SDK/emulator ve doğrulanmış signing/mağaza projesi yoktur. Development bundle id'si `dev.scorelogic.localpoc` geçici isimdir; üretim id'si olarak seçilmedi. Release config, doğrulanmış application id/link host/HTTPS API ve ayrı scheme olmadan bilerek durur.

Faz 2'nin imzalı platform kabulünü kapatmak için iOS ve Android development build'leri alınmalı; gerçek cihazlarda SecureStore/SQLite, OS process kill, klavye, system back, share cancel, cold/warm link, AppState/daily rollover ve büyük font/VoiceOver/TalkBack doğrulanmalıdır. İndirilen uygulama boyutu, ilk açılış ve yazılmamış input penceresi cihazlarda ölçülmelidir. Android 16 KB sayfa uyumu final artifact üzerinde kontrol edilmelidir.

Android prebuild manifestinde internet ve vibration bulunur; dev client overlay izni development'a aittir ve release config'te kaldırılır. Geniş harici depolama okuma/yazma izinleri `tools:node="remove"` ile bloklanır. Kamera, mikrofon, konum, kişi veya bildirim izni istenmez. Gerçek release manifest/entitlement incelemesi native build kabulünde tekrarlanır.

Faz 3'ün kod/DB/protokol testleri tamamlandı; gerçek iOS/Android ile ortak hesap geçmişi ve canlı ortam rollout/restore doğrulaması dış kabul adımıdır. Faz 1'in insan görev denemesi de açık kalır. Bu kapılar tamamlanmadan mağazaya hazır veya bütün özellikleri tamamlanmış mobil uygulama denmez.
