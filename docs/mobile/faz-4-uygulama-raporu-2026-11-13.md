# Faz 4 — Native client temeli ve veri dayanıklılığı

> 13 Kasım 2026. Kaynak implementasyonu ve aşağıdaki yerel doğrulamalar tamamlandı. İmzalı uygulama, gerçek Keychain/Keystore ve fiziksel cihaz kabulü açık kalır.

Kapsam [ana planın Faz 4 maddeleridir](../mobil-uygulama-donusum-plani-2026-11-12.md). Faz 2–3'ün guest/API/command PoC'si, tekrar kullanılabilir navigation, oturum, lifecycle ve sürümlü yerel depolama altyapısına dönüştürüldü.

## Uygulanan işler

| Plan maddesi | Teslim |
|---|---|
| AppShell, dört tab, stack | React Navigation ile Home / Daily / Campaign / Stats; puzzle, account ve help stack'i; görünür geri eylemi, Android back ve focus lifecycle temeli |
| API/token/error | HTTPS config sınırı, runtime DTO doğrulaması, timeout, tek refresh; geç kalan refresh waiter ve 401 sırasında owner değişimi koruması; hata türüne göre recovery |
| SecureStore + SQLite | Async owner hydration gate; tek process bootstrap; credential ve gameplay deposu ayrımı; owner/ortam izolasyonu |
| Outbox/revision/migration | SQLite v1→v2 atomik migration; immutable command/ack; eski/yeni attempt conflict; arşivlenen taslaklar ve tam payload kurtarma |
| AppState/online/focus/timer | Expo Network, AppState ve route focus koordinatörü; reconnect ve foreground refresh; arka planda durdurulan UI tick/autosave zamanlayıcısı; monotonic server clock |
| Offline/session/bakım ekranları | Cache yok, offline cache, bakım, okunamayan/yeni sürümlü storage, expired session ve unknown işlem için görünür durumlar ve retry |
| Native test/CI | Node core + gerçek disk SQLite/restart testleri, Jest/Expo + gerçek navigator component akışları; mevcut CI'a bağlandı. Maestro cihaz smoke'u ve ayrı manuel runner workflow'u hazır |

Kaynaklar: [AppShell](../../apps/mobile/src/ui/AppShell.tsx), [runtime/lifecycle](../../apps/mobile/src/core/runtime.ts), [SQLite adaptörü](../../apps/mobile/src/core/sqlite.ts), [session](../../apps/mobile/src/core/session.ts), [puzzle controller](../../apps/mobile/src/core/controller.ts).

## Navigation ve açılış

Açılışta config, yerel DB migration'ı, credential ve ilgili owner'ın draft/outbox verileri okunmadan oyuncu ekranları gösterilmez. Bootstrap, aynı JS process içindeki remount'larda paylaşılır; birden fazla installation secret veya DB bağlantısı yarışmaz. Başka owner'ın geçmiş ekran, cache veya timer'ı yeni oturuma taşınmaz.

Home puzzle başlatmaz. Daily odağa geldiğinde güncel daily yüklenir; campaign içinden açılan puzzle stack üzerinde kalır. Eski veya farklı hedefin board'u, yeni hedefte cache bulunamadığında görünmeye devam etmez. Cold/warm puzzle bağlantıları allowlist üzerinden aynı stack'e gider. Modal ve işlem kimliği puzzle değişiminde ayrılır.

Home/campaign/game PoC arayüzü ayrı modüle taşındı. Stats sekmesi canonical temel sayaçları okur ve owner bazlı offline cache kullanır. Account stack'i session bilgisi ve korunmuş draft arşivine erişim verir. Bütün hesap/kayıt/stats/history ekranlarının son ürün kapsamı, Analyze Board ve oyun arayüzünün tam paritesi Faz 5–6'dadır.

## Oturum ve veri izolasyonu

- `MobileRuntime`, guest/account geçişini ve yerel hydration'ı yönetir. Geçiş başlamadan düzenleme kilidi alınır; sync bariyeri kurulurken yeni skor/not/Hint eklenemez.
- Home'da açık board olmasa bile diskteki ilgili guest'in dirty draft ve unknown command'leri merge öncesi çözülür. Bu bariyer yeni bir daily başlatmaz.
- Kayıp refresh yanıtı, cache'e erişmek için cold start'ı ağ isteğine zorlamaz. Bir API isteğinden önce aynı özgün refresh command'i çözülür; yeni UUID üretilmez.
- Bir 401 yanıtından sonra session başka owner'a geçmişse eski body yeni token ile gönderilmez. Daha önce tamamlanmış rotation'ı bekleyen geç istek ikinci rotation başlatmaz.
- Account session expiry'de retry ve yeniden giriş; açık onayla yeni guest başlatma seçenekleri vardır. Yeni guest eski owner'ın draft/outbox verisini göndermeden ayrı kimlik oluşturur. Eski guest credential'ından vazgeçmenin kurtarma sınırı onayda açıklanır.
- Unknown account authentication sonucu çözülmeden yeni guest başlatılamaz. Bozuk credential/refresh/auth recovery kaydı korunur ve storage recovery ekranına gider; sunucuya gönderilip sessizce silinmez.
- Logout mevcut refresh capability ile yapılır; expired access veya kayıp logout yanıtı aynı iptalin güvenli tekrarını engellemez. Credential yalnız doğrulanmış sonuçtan sonra temizlenir. Yeni guest'e geçiş niyeti kesintiye dayanıklı bir SecureStore marker'ı taşır.

Credential'lar SecureStore'da; SQLite'ta yalnız public cache, owner draft/outbox ve arşiv bulunur. SQLite varsayılan şifreli kabul edilmez. Reinstall'ın guest kurtarması olduğu iddia edilmez.

## SQLite güncelleme ve işlem protokolü

`user_version` artık her açılışta 1'e çekilmez. Sürüm 0→1 temel tabloları, 1→2 resource cache ve draft arşivini ekler. Migration ve sürüm artışı aynı transaction'dır. Kesinti rollback olur. Daha yeni bir DB sürümü görüldüğünde uygulama downgrade/reset yapmaz, güncelleme ister. Bozuk JSON/owner eşleşmesi olan kritik kayıtlar silinmez.

Aynı owner+puzzle için tek pending command vardır. Yazımlar sıraya alınır; okumalar önceki yerel yazımların bitmesini bekler. Ack, birebir özgün komutu doğruladıktan sonra draft yazımı ve outbox silmeyi aynı transaction'da tamamlar. Eski bir ack farklı pending command'i silemez. Geçmiş receipt yeni server revision'ını geri alamaz.

Conflict seçiminde bırakılan dirty taslak arşivlenir. Arşiv yalnız ilgili owner'ın Account ekranında seçilebilir metin olarak görünür; not ve skorların kurtarılabilir bir kopyası kalır. Terminal veya başka attempt'in yerel snapshot ile yeniden aktifleştirilmesi engellenir. İlk attempt henüz oluşmadan offline kaydedilmiş not/skorlar, aynı kullanıcının ilk STANDARD attempt'i oluşturulduktan sonra korunup senkronize edilir.

## Lifecycle, hata ekranları ve Hint

Bağlantı dönüşünde, foreground'da ve açık puzzle'ın periyodik kontrolünde önce server/session/puzzle okunur; sonra varsa eski command receipt'i çözülür. Focus yenilemeleri birleştirilir; gizli tab yeni daily başlatmaz. Arka plana geçiş son yerel yazımı bekler ve daha sonra biten local write'ın arka planda yeniden autosave timer'ı kurmasını önler.

Ekrandaki süre, server zamanına hizalanan monotonic saatten ilerler. Cihaz duvar saati bir gün değişse bile aktif timer bir gün sıçramaz. Foreground/reconnect yeni server başlangıcı ve business date ile tekrar hizalanır. Yeni daily kendi taslağını ve timer'ını kullanır; eski draft korunur. 120 dakika sınırı eklenmedi.

Offline veya bakımda cached board üzerinde yerel girişler korunur; resmi Hint/Check/Reveal için bağlantı gerekir. Cache olmayan hedef açık mesaj gösterir. Session/storage hataları önceki oyuncu ekranını kapatır; otomatik yeni guest oluşturmaz. Unknown işlem, aynı işlemin onaylanacağı ve ek Hint satın alınmayacağı açıklamasıyla retry sunar.

Hint sheet'i açık eylem düğmesini korur. Manuel retry ve foreground'da receipt kurtarma dahil başarıda kapanır. Background refresh sheet'i yeniden açmaz; pending progress onayı yeni Hint sayılmaz.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Core/protokol/disk testleri | 45/45 başarılı; önceki 21 core senaryosu da dahil |
| Native component/navigation | 6/6 başarılı; gerçek React Navigation, Jest Expo native port mock'ları |
| Disk restart/migration | v1 dosyasını güncelle→kapat/aç; migration rollback; bozuk kayıt koruma; owner izolasyonu; ack rollback/immutability başarılı |
| Abrupt process kill | Ayrı Node process SIGKILL ile durduruldu; commit edilmiş SQLite draft/outbox yeniden okundu; aynı Hint receipt'iyle ek POST olmadan kurtarıldı |
| Gerçek HTTP + disk SQLite | Local production standalone API üzerinden guest, campaign/daily/stats/progress/analysis DTO'ları, kayıp Hint kurtarma, ikinci Hint, doğru Check, refresh ve guest silme başarılı |
| TypeScript | Native ve root başarılı |
| ESLint | Başarılı, uyarı yok |
| SDK dependency check | Başarılı |
| Prebuild | iOS/Android proje kaynak üretimi başarılı |
| Hermes export | İki platform yaklaşık 2,9 MB bytecode; son Metro/Hermes export başarılı |
| Expo Doctor | 19/20; tek eksik CocoaPods/native toolchain kontrolü |
| Production mobil audit | High/critical yok; 3 moderate transitif bulgu kaldı |
| CI YAML | Ana workflow, cihaz workflow'u ve Maestro akışının iki YAML belgesi sözdizimi doğrulandı |

Component testleri hydration, dört tab/stack geri dönüşü, hata recovery ekranları, expired session izolasyonu ve manuel/foreground Hint receipt kurtarmasını sınar. Sabit snapshot karşılaştırmasıyla yetinilmez.

Disk/HTTP testinde credential portu bellektir. Node process kill, gerçek mobil OS kill veya Keychain/Keystore testi değildir. Hermes çıktısı da IPA/APK boyutu veya native cold-start ölçümü değildir.

## CI ve cihaz kabulü

Ana [CI](../../.github/workflows/ci.yml) native job'ı bağımsız `npm ci`, type-check, core/disk/restart testleri, component testleri, SDK check ve iki platform JS export çalıştıracak şekilde güncellendi.

[Maestro flow](../../apps/mobile/.maestro/smoke.yaml), mevcut kurulumun state'ini temizlemeden dört tab/stack, daily yükleme ve uygulamayı durdurup yeniden açma senaryosunu tanımlar. [Cihaz workflow'u](../../.github/workflows/native-device-e2e.yml) manuel başlatılır; yalnız main/develop üzerinde `self-hosted`, `scorelogic-mobile`, `ios|android` etiketli özel runner ve o cihazda kurulu doğru build gerektirir. Ücretli cloud build veya signing işlemi başlatmaz. Bu runner/device henüz provision edilmedi; Maestro cihaz koşusu yapılmadı.

Çalıştırma örneği:

```sh
cd apps/mobile
npm ci
npm test
npm run test:components
npm run type-check
npm run export:native
MOBILE_SMOKE_SQLITE=true MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:api
maestro test --env APP_ID=dev.scorelogic.localpoc .maestro/smoke.yaml
```

HTTP smoke yalnız localhost fixture backend'i kabul eder ve oluşturduğu guest'i siler. Maestro için signed/test build, çalışır backend, günlük içerik ve hazır test cihazı gerekir. [React Navigation test rehberi](https://reactnavigation.org/docs/testing/), [Expo Jest rehberi](https://docs.expo.dev/develop/unit-testing/), [Expo Network](https://docs.expo.dev/versions/v58.0.0/sdk/network/), [Maestro CLI](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options).

## Açık kabul kapıları

Tam Xcode/CocoaPods, Android SDK/emulator ve signing erişimi önceki fazdan açık kalır. Gerçek iOS/Android build üzerinde SecureStore, SQLite upgrade, kill/restart, network toggle, OS back/swipe, saat/timezone, keyboard ve erişilebilirlik kabulü gerekir. Özellikle disk yazımı bitmeden öldürülen son karakterin kayıp penceresi cihazda ölçülmelidir.

Expo Network Android modülü `ACCESS_NETWORK_STATE` ve `ACCESS_WIFI_STATE` normal izinlerini bildirir. Uygulama IP/MAC adresi okumaz; yalnız bağlantı state'i kullanır. Final merged release manifest'i native build sırasında tekrar incelenmelidir. Kamera/mikrofon/konum gibi yeni runtime izinleri eklenmedi.

Faz 4 kaynak/test teslimi tamamlandı; gerçek OS kill/restart çıkış kapısı açık. Railway deploy veya yeni server migration yapılmadı; SQLite v2 migration cihazda ilk açılışta çalışır. Faz 5 çekirdek oyun paritesi ve Faz 6 tam oyuncu ekranları sonraki kapsamdır.
