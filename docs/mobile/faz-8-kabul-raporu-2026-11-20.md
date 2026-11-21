# Faz 8 — Erişilebilirlik, güvenlik ve kabul hazırlığı

> Güncelleme: 20 Kasım 2026. Kaynak/test çalışmaları, Railway test rollout'u ve ilk Metro/USB bağımsız Android internal APK tamamlandı. Ürün sahibi kablosuz Home/Daily/Campaign/Hint devamını doğruladı. Tam cihaz matrisi, arayüz/accessibility ve mağaza kabulü açık kalır.

Kapsam [ana planın Faz 8 maddeleridir](../mobil-uygulama-donusum-plani-2026-11-12.md). Yeni oyun özelliği eklenmedi; mevcut akışların erişilebilirliği, performansı ve yanlış kimlikle işlem gönderme koruması güçlendirildi. API v1, contract 1.2.0, SQLite v2 ve mevcut 22 migration korunur.

## Düzeltilen sorunlar

| Bulgu | Düzeltme | Yerel doğrulama |
|---|---|---|
| Sheet açıldığında arka plan ekran okuyucuya açık kalabiliyor; başlangıç ve geri dönüş odağı tanımlı değildi. | Arka plan accessibility ağacından çıkarılır, başlığa odak verilir, kapanınca açan kontrole dönülür. Escape/system back desteklenir. Android pencere animasyonu kapalıdır; odak dönüşü tahmini animasyon süresine bağlı değildir. | Modal, odak dönüşü, Android kapanışı ve Hint'i ücretsiz kapatma component senaryoları. |
| OS Reduce Motion tercihi kullanılmıyordu. | Tercih yüklenene kadar animasyon kapalı; güncel OS değişikliği navigation ve sheet'e uygulanır. Geç async cevap yeni tercihi ezmez. | Query/event yarış testi. Gerçek OS kabulü açık. |
| Auth alanlarında görünür etiket ve klavyeyle ilerleme eksikti. | Kalıcı Email/Password/Confirmation etiketleri; Next/Done, doğrulama duyurusu ve tekrar submit bariyeri. | Register alanları, klavye submit ve mevcut auth akışları. |
| Tablo ve skorların ekran okuyucu açıklaması yetersizdi. | Takım, sıra ve yedi metrik tek açıklamada; boş skor ile sıfır ayrılır. Butonlar en az 48 dp, görünür klavye odağı ve bağlama özel etiketler taşır. | Tablo metrikleri, 200% font ölçeği ve input erişilebilirlik testleri. |
| Kilitli ancak açıklama için tıklanabilen seviyeler düşük kontrastlıydı. | Opacity yerine okunabilir renkler; kontrol kenarı, placeholder ve focus rengi belirlenir. | Gerçek kaynak paletinden 13 kontrast çifti geçer. |
| Timer her saniye bütün oyun ekranını yeniden render ediyordu. | Timer ayrı leaf component'te; yalnız odaktaki aktif attempt için çalışır. Değişmeyen tablo memo ile korunur; saniyeler live region olarak okunmaz. | Üç timer tick'inde tablo render'ı ve controller publish artmaz. |
| Receipt sorgusu ile yeniden POST arasında owner değişirse eski komut yeni oturumla gönderilebilirdi. | SessionClient çağrısı beklenen owner'a sabitlenir. Receipt, POST ve Analyze owner kontrolü yapar. OWNER_CHANGED eski pending komutu silmez. | Receipt 404 sırasında owner değişimi enjekte edilir; ikinci POST yok, ilk komut korunur. |
| Reveal gibi bir sheet içindeki kayıp cevapta retry arka planda kalıyordu. | Sheet içinde hata ve aynı komutla “Retry confirmation” sunulur. | Kaybolan Reveal cevabından aynı komutla kurtarma testi. |
| SecureStore bağımlılığı kullanılmayan biyometri izinlerini manifest'e ekliyordu. | Android blockedPermissions listesine USE_BIOMETRIC / USE_FINGERPRINT eklendi; uygulama biyometrik giriş kullanmıyor. | Son merged manifest ve gerçek APK'de iki izin de yok; gerçek guest startup başarılı. |

Ekran okuyucu odağı, gerçek numeric keyboard ve büyük fontta taşma, Jest'in OS mock'larıyla tamamlanmış kabul edilmez.

## Test kanıtları ve sınırları

20 Kasım'da yeniden çalıştırılanlar:

| Kapı | Sonuç |
|---|---|
| Native core / disk / protocol / kabul doğrulayıcısı | Preview güvenlik testiyle son koşu **93/93** başarılı (ilk koşu 92) |
| Native component / navigation / erişilebilirlik | **49/49**, 6 suite başarılı |
| Native TypeScript; root ESLint | Başarılı |
| Güncel backend production build | 20 Kasım'da yerel test DB ayarlarıyla yeniden başarılı; standalone statik asset hazırlığı tamamlandı |
| Kaynak kontrastı | **13/13** başarılı |
| iOS / Android mapped Hermes export | Başarılı; Debug ID eşleşir, private engine/Prisma kaynakları ve sentetik server-secret canary yok |
| Hermes boyut sınırı | iOS **3.686.720**, Android **3.684.696 byte**; her ikisi 5.000.000 byte export regresyon bütçesi içinde |
| Yeni USB test backend'inde gerçek HTTP/disk smoke | Public contract, Analyze, lost Hint receipt recovery, solve, refresh ve test guest cleanup başarılı; OS credential vault test portudur |
| Gerçek Android native derleme / imza / yükleme | ARM64 debug APK, Gradle başarılı; apksigner v2 doğrulaması ve ADB install Success; MainActivity/Fabric main başlangıcı başarılı |
| İlk fiziksel ekran kontrolü | Ürün sahibi Home açılışını, Daily ve Campaign yüklenmesini doğruladı; aşağıdaki debug smoke kaydında izlenir |

Faz 8'in 14 Kasım yerel regresyon koşuları: root unit **353/353**; ana PostgreSQL integration **54 başarılı + 2 koşullu skip**, ayrı boş DB koşusunda bu iki bootstrap senaryosu **2/2 başarılı**; production HTTPS browser koşusu **60 başarılı + 3 desktop'ta atlanan mobil senaryo**; root production build ve HTTP/disk gameplay, account ve iki-session resilience smoke başarılı. Engine bütçesi p95 **0,817 ms / 50 ms**. Bu geçmiş koşular 20 Kasım'da yeniden çalıştırılmış gibi sunulmaz.

Node SQLite testleri gerçek diski kullanır; SecureStore test portu gerçek Android Keystore/iOS Keychain kanıtı değildir. Hermes export APK/AAB/IPA veya store imzası değildir. Kaynak map'leri private tutulur; Debug ID eşleşmesi Sentry upload/symbolication kanıtı değildir.

## Güvenlik incelemesi

| Varlık / güven sınırı | Kontrol ve kanıt | Açık kalan kabul |
|---|---|---|
| Web cookie → native kimlik | Native Bearer zorunlu; cookie-only veya sahte Bearer + geçerli başka-account cookie reddedilir. Geçerli Bearer'ın owner'ı cookie ile değişmez. İki yeni DB senaryosu bunu ve cache/body sınırlarını doğrular. | Yayındaki proxy/header davranışı. |
| Eski draft/outbox → yeni hesap | Owner-scoped SQLite, geçiş bariyeri, expectedOwner, immutable command ve receipt/CAS. Yeni sorgu→POST yarış testi başarısızlığı kapalı tutar. | Gerçek OS kill ve hesap geçişi kabulü. |
| Credentials → yerel kayıt/log | Credential vault ayrı; gameplay SQLite public cache/taslak taşır. Kaynak diagnostics allowlist'i serbest metni dışarıda tutar. | OS backup/reinstall, native-only crash envelope ve proje tarafı scrubbing. Crash reporting varsayılan kapalı kalır. |
| Sunucu çözümü/secret → public bundle | Public contract sınırı, import/map taraması, sentetik secret canary ve 5 MB regresyon kapısı CI'a bağlıdır. | Gerçek release artifact incelemesi; canary bütün sırların matematiksel yokluk kanıtı değildir. |
| Yetkisiz yazma / tekrarlı ücret | Owner server principal'dan türetilir; injected userId reddedilir. Body sınırı, revision ve idempotent receipt korunur. | Çok instance rate limit/operasyon ve production rollout. |
| Davet URL → uygulama gezintisi | Scheme/HTTPS host allowlist; hydration/auth sonrası geçerli son intent; release metadata guard. | Gerçek domain sahipliği, signing fingerprint, OS app-link verification. |

## Performans baseline'ı ve ölçüm protokolü

[14 Kasım ham host baseline'ı](acceptance/local-baseline-2026-11-14.json): Node 22.22.2 / macOS arm64 / SQLite v2, 100 commit, p95 **0,20325 ms**, migration **2,78254 ms**. Bu değer Expo SQLite köprüsü, ekranda input gecikmesi veya Android performansı değildir. Tekrar ölçmek için `npm --prefix apps/mobile run benchmark:local -- /istenen/sonuc.json` kullanılır.

[20 Kasım host tekrarı](acceptance/local-baseline-2026-11-20.json): 100 commit, p95 **0,515667 ms**, migration **2,595791 ms**. Native derleme aynı makinede sürerken alınmıştır; kontrollü release karşılaştırması veya native cihaz bütçesinin geçtiği sonucu çıkarılmaz.

Gerçek kabulde aynı release artifact hash'i, backend revision'ı, fiziksel cihaz, OS, araç ve ham örnekler birlikte kaydedilir:

1. Cache hazırken en az 20 cold start; p75 ≤ 3.000 ms. Ölçüm uygulama açılışından kullanılabilir cached ekrana kadardır. İlk kurulum/ağ yüklemesi ayrıca raporlanır.
2. En az 30 input→görsel sonuç; p95 ≤ 100 ms. En az 30 input→yerel commit; p95 ≤ 200 ms. Debug/Metro ölçümü release bütçesini kapatmaz.
3. 60 Hz cihazda campaign/oyun scroll profili, sürekli jank ve büyük font/klavye etkileşimi; native profiler trace'i ve inceleyen kişi kaydedilir.
4. Cold start ve uzun oyun sırasında bellek tepe değeri, background/foreground sonrası büyüme ve enerji incelenir. APK/AAB/IPA boyutu ayrıca ölçülür; Hermes boyutu bunun yerine kullanılmaz.

Bellek/enerji/native binary için ölçülmemiş sayısal baseline uydurulmaz. Android için resmi Android Studio profiler/Perfetto araçları; iOS için Instruments kullanılır. [React Native performans rehberi](https://reactnative.dev/docs/performance).

## Kabul kaydı ve gerçek cihaz durumu

[Kabul kaydı](acceptance/phase8-record.json) T01–T19 için iki platform, T20 için sunucu olmak üzere **39 pending senaryo** içerir. Komut:

```sh
npm --prefix apps/mobile run acceptance:check -- ../../docs/mobile/acceptance/phase8-record.json
```

Mevcut sonuç **BLOCKED, 48 eksik kabul koşulu**. Bu beklenen bir sonuçtur; kaynak testinin başarısızlığı değildir. Doğrulayıcı release artifact hash/kanıtını, cihaz matrisini, T18 erişilebilirlik alt başlıklarını, örnek sayısını/bütçelerini ve P0/P1 kapanış kanıtını ister. `REVIEWABLE`, yalnız metadata/bütçelerin tamamlığı anlamına gelir; kriptografik imza veya dosya kanıtının gerçekliğini kendisi doğrulamaz.

20 Kasım: **Samsung SM-G970F / Android 12 / API 31** USB debug izniyle ADB'de doğrulandı; seri numarası kayda alınmadı. [Araç/cihaz önkontrol kaydı](acceptance/android-usb-preflight-2026-11-20.json) sıfır blocker gösterir. Ayrı `scorelogic_phase8_device_test` yerel DB'sine 22 migration, 150 campaign ve 15 daily test puzzle'ı hazırlandı. Yerel API healthcheck DB/content up ve Redis disabled ile 200 döndü.

**İlk fiziksel debug kurulumu başarılı:** [Artifact kaydı](acceptance/android-debug-artifact-2026-11-20.json) gerçek APK hash'ini, imza ve manifest bilgilerini içerir. APK **77.763.598 byte**, yalnız arm64-v8a, min API 24 / target 36 / compile 37'dir. İlk native build 8 dk 9 sn, izin düzeltmesi sonrası incremental paketleme 11 sn sürdü. Bu süreler cihaz startup veya oyun performansı değildir. Varsayılan development debug sertifikası kullanılmıştır; production signing sahipliği kanıtlanmış değildir.

ADB install Success ve MainActivity başlangıcı doğrulandı; uygulama logunda Fabric `main` çalıştı. Gerçek uygulamanın guest/daily istekleri API'de 200 döndü. Ürün sahibi **“Home açıldı; Daily ve Campaign yükleniyor”** diyerek ilk görsel smoke'u doğruladı. OS accessibility ve release T01–T19 kabulü ayrıca sürüyor. Debug başarıları release JSON'undaki senaryoları otomatik passed yapmaz. Development APK JavaScript'i Metro'dan alır; APK hash'i tek başına canlı JS revizyonunu sabitlemez.

**Fiziksel Hint smoke'u da geçti:** Ürün sahibi Beginner 1'de Close'un ücretsiz olduğunu, tek basışın tek hücre/hint verdiğini, sheet'in kapandığını ve bekleme/sekme dönüşünde kendiliğinden açılmadığını doğruladı. Ayrı yerel DB'de aynı puzzle için **1 HINT_USED event / 1 hintsUsed / 1 hint command** görüldü.

**Gerçek process-stop/restart geçti:** Skor 0 ve “cihaz testi” notu kaydedildikten sonra yalnız ScoreLogic `am force-stop` ile durduruldu, PID'nin kalmadığı ve yeni MainActivity açılışı doğrulandı. Ürün sahibi skor/not/1 hint'in üçünün de korunduğunu doğruladı. Guest oluşturma POST sayısı restart öncesi/sonrası **2 / 2** kaldı (biri daha önce temizlenen Node smoke guest'i); yeni guest oluşmadı. Bu kontrol internet erişimi varken yapıldı; tek başına offline disk veya bütün OS kill/upgrade/backup matrisini kapatmaz.

**Arayüz çalışması ertelendi:** Ürün sahibinin onayıyla OS font_scale 1.0→2.0 yapıldı. Final Table'ın yarısının görünmesi bildirildi; yatay scroll/taşma ayrımı tamamlanmadan kullanıcı 200% ve kapsamlı görünüm çalışmasını sonraya bırakıp kurulum/çalışabilirliğe odaklanılmasını istedi. Önceki **1.0** değer geri yüklendi ve ADB ile doğrulandı. 200%/TalkBack/diğer UI kabulü passed değildir; sonraki arayüz çalışmasında ele alınır.

Kurulum ve sıradaki adımlar [Android cihaz rehberindedir](android-cihaz-kurulumu.md). iOS/iPad, Android tablet/foldable, min/current OS ve release profiler matrisi açık kalır. Yalnız bu Android telefonun başarılı smoke'u bütün matrisi kapatmaz.

14 Kasım salt okunur Railway kontrolünde `/api/health` 200, `/api/v1/user/stats` 404 idi. **20 Kasım rollout öncesi kontrolde** test domain'i Railway `Application not found` 404 dönüyordu; app/Postgres-p5Y6 aktif deployment'ları yoktu. Kullanıcı yalnız test ortamını yeniden başlatma/yedekleme/migration/deploy ve bağımsız APK adımlarını açıkça onayladı. Başlatma isteğinin `Your trial has expired` hatasıyla reddedilmesi üzerine ürün sahibi planı etkinleştirdi; ardından test DB deployment'ı başarılı oldu. Herhangi bir ödeme bilgisi alınmadı.

## Railway test rollout'u ve bağımsız APK — tamamlandı

[Rollout kanıtı](acceptance/railway-test-rollout-2026-11-20.json), [internal APK kanıtı](acceptance/android-internal-artifact-2026-11-20.json).

1. Yalnız `test` ortamındaki **Postgres-p5Y6** mevcut PostgreSQL 18 image/volume ile açıldı. **167 puzzle ve 17 migration** yerindeydi. SSH üzerinden tam custom dump alındı; arşivin tümü pg_restore ile `/dev/null`'a çözüldü, transfer SHA-256 ve AES-256-GCM roundtrip doğrulandı. Şifreli yedek `.backups/mobile-test-predeploy/20261120T125050Z.manifest.json` ile kayıtlı; anahtar ayrı yerel private klasördedir. Gerçek DB restore drill yapılmadı.
2. Test backend deployment'ı **`d2c74ba7-3800-4c55-a1d6-708f8b8fd2f9`** başarılı. Bekleyen **5 native migration** uygulandı; toplam **22** oldu. Mevcut veriye eklenen test daily içeriğiyle toplam **175 puzzle**, hazır **150 campaign / 15 günlük horizon** doğrulandı. `PUZZLE_CONTENT_MODE=test`; Redis güncel kodun varsayılanıyla disabled. Production ortamına deploy/env/migration işlemi yapılmadı.
3. `https://score-logic-app-test.up.railway.app/api/health` **200**, DB/content up, Redis disabled. Kimliksiz `/api/v1/user/stats` **401**. Yalnız bu exact test origin'i kabul eden geçici doğrulama driver'ında gerçek HTTPS + disk SQLite ile guest, bütün public read contract'ları, Analyze, kayıp Hint cevabından aynı receipt ile kurtarma, iki Hint sonrası solve, refresh ve kendi sentetik guest'ini temizleme başarılı. Repository'nin localhost-only smoke guard'ı değiştirilmedi.
4. **ScoreLogic Test 0.1.0 (2)**: Gradle `release` variant, gömülü Hermes, yalnız ARM64. APK **29.856.271 byte**, Hermes **3.684.796 byte**. Aynı development sertifikasıyla imza doğrulandı; app debuggable değil, cleartext/backup kapalı, overlay/biyometri/storage izinleri yok, source map APK'ye eklenmedi. Generated release map'te private engine/db/auth/Prisma kaynakları yok. Internal build **5 dk 31 sn** sürdü; bu startup/performance ölçümü değildir.
5. APK aynı package'a veri silmeden güncelleme olarak yüklendi. Bu testin yerel Metro/API/DB servisleri durduruldu ve USB reverse portları kaldırıldı. Normal launcher intent'iyle açıldı; ürün sahibi kabloyu çıkardı ve **“Kablo olmadan hepsi çalışıyor; hint de korunuyor”** diyerek Home/Daily/Campaign/Hint ve kapat-aç devamını doğruladı.

APK yerel teslim konumu: `.local/mobile-builds/android/scorelogic-test-0.1.0-2-arm64.apk`. `MOBILE_PREVIEW=true` internal yapılandırması HTTPS ve build numarası ister; `MOBILE_RELEASE=true` ile birlikte kullanılamaz ve production ownership guard'ını kaldırmaz. API origin'e göre ayrı storage namespace, önceki localhost guest/draft'ını cloud test guest'iyle karıştırmaz. Bu APK'nin hash'i gömülü JS'yi de sabitler; production signing, verified association, iOS ve kapsamlı cihaz/arayüz/performance kabulü açık kalır.


## UI/UX çalışmasının yeniden başlaması

Bağımsız Android kurulumundan sonra kullanıcı ortak görüntülenebilir geliştirme biçimi ve yeni arayüz sistemi istedi. Yeşil modern skor defteri yönü seçildi; [tasarım sistemi ve stüdyo planı](ui-ux-tasarim-sistemi-2026-11-20.md) bu çalışmanın aktif kaydıdır. Tarayıcı stüdyosu ve ilk kompozisyonlar eklendi; gerçek native cihaz/OS accessibility kabulü ve mevcut APK tesliminin sınırları korunur.
