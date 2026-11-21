# Android cihazla Faz 8 testi

> 20 Kasım 2026. Samsung SM-G970F / Android 12'de hem USB development build hem de Metro/USB gerektirmeyen **ScoreLogic Test** internal APK doğrulandı. Güncel günlük kullanım için Bölüm 5'e bak. Play Console veya production imza anahtarı henüz gerekmiyor.

## 1. Bir kez yapılacak kurulum

1. [Resmi Android Studio](https://developer.android.com/studio/install) Apple Silicon sürümünü kurup Standard setup'ı bitir.
2. Telefonda Geliştirici seçenekleri → USB hata ayıklamayı aç. Veri aktarabilen USB kablosuyla bağla; ekran kilidini açıp bilgisayarın USB debug isteğine izin ver. Bu ilk cihaz için tamamlandı.
3. Android Studio Welcome → More Actions → SDK Manager (proje açıksa Tools → SDK Manager) → SDK Tools → **Android SDK Command-line Tools (latest)** → Apply. Lisans ekranını ürün sahibi okur/onaylar. Bu adım tamamlandı.
4. SDK Tools'ta **Show Package Details** ile Build-Tools **37.0.0**, NDK (Side by side) **27.1.12297006**, CMake **3.22.1** kurulur. Platform-Tools ve Android SDK Platform **37 / 37.0** gerekir. Android Studio'nun varsayılan Build-Tools sürümü projeyle aynı olmayabilir. Platform klasörü metadata ile kontrol edilir; `android-37.0` geçerlidir.
5. Proje komutlarında Node **22.13+ / 22.x** ve JDK **17** kullanılır. Yeni Android Studio'nun kendi Java'sının 17 olduğu varsayılmaz. Bu çalışma Java 17'yi checksum doğrulanmış resmi Temurin paketinden yalnız `/private/tmp/scorelogic-jdk17` altına hazırladı; sistem Java'sı değiştirilmedi. Geçici klasör silinirse yeniden hazırlanır veya kalıcı JDK 17 kurulur.

[React Native ortam rehberi](https://reactnative.dev/docs/set-up-your-environment) JDK 17 önerir. Paket kurulumları resmi [Android SDK araçlarıyla](https://developer.android.com/tools) yapılır; yeni lisans otomatik kabul edilmez.

## 2. Terminal ortamı ve kontrol

Proje kökünde, bu makine için:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"
# Hazırlanan klasörün gerçek adını kullan; sürüm ileride değişebilir.
export JAVA_HOME='/private/tmp/scorelogic-jdk17/jdk-17.0.21.1+2/Contents/Home'
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
npm --prefix apps/mobile run device:android:check
```

Kontrol tek bir yetkili fiziksel cihaz ve seçili araç sürümlerini ister. Cihaz seri numarasını yazdırmaz. `unauthorized` için telefon iznini; `offline` için kablo/bağlantıyı kontrol et. `adb reverse` yeniden bağlantı/reboot sonrası tekrar gerekebilir.

## 3. USB üzerinden yerel API

Metro yalnız JavaScript'i sunar; API ve PostgreSQL ayrı çalışmalıdır. İlk kurulumda ayrı **yerel test DB** `scorelogic_phase8_device_test`, PostgreSQL port **55439**, API port **3109** kullanılır. Railway production/test DB'sine bağlantı kurulmaz. Bu yerel DB'de 22 migration ve onaylı test fixture'ları vardır; normal editorial içeriğin otomatik onayı için kullanılmaz.

Ignored `apps/mobile/.env.local` yalnız public development değerlerini içerir:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:3109
EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true
EXPO_PUBLIC_WEB_ORIGIN=https://score-logic-app-test.up.railway.app
EXPO_PUBLIC_SCHEME=scorelogic-dev
EXPO_PUBLIC_BUILD_ID=phase8-android-usb-20261120
EXPO_PUBLIC_CRASH_REPORTING_ENABLED=false
```

```sh
"$ANDROID_HOME/platform-tools/adb" -d reverse tcp:3109 tcp:3109
"$ANDROID_HOME/platform-tools/adb" -d reverse tcp:8081 tcp:8081
curl http://127.0.0.1:3109/api/health
cd apps/mobile
npm run android -- --device
```

Tek fiziksel telefonu seç. İlk Gradle/native derlemesi SDK ve Maven bağımlılıkları nedeniyle uzun sürebilir. Bu development build'i Expo Go'dan farklıdır. Sonraki JS çalışmaları için aynı ortamla `npm start -- --localhost` kullanılabilir. USB yönlendirmesiyle telefonun localhost'u Mac'teki servisleri bulur; HTTP istisnası yalnız development runtime ve izin verilen localhost adreslerindedir.

Test boyunca API/DB/Metro çalışır ve USB bağlı kalır. Release uygulamasında HTTP istisnası açılmaz; dış ağ/release testi için geçerli HTTPS v1 backend gerekir. Website healthcheck'i tek başına native API'nin yayımlandığını göstermez.

## 4. İlk cihaz görevleri

20 Kasım'da 1–3'ün temel akışları ürün sahibiyle doğrulandı: Home/Daily/Campaign açılışı, tek Hint/otomatik yeniden açılmama, gerçek process-stop/restart sonrası 0 skor/not/1 hint korunumu. Kaynak ve server kanıtı [artifact kaydındadır](acceptance/android-debug-artifact-2026-11-20.json). 200% denemesindeki kısmi tablo görünümü sonrası kullanıcı kapsamlı UI/görünüm çalışmasını erteledi; telefonun 1.0 font ölçeği geri yüklendi. Aşağıdaki erişilebilirlik maddeleri gelecekteki kabul görevidir.

1. Home → Daily: puzzle görünür, skor girilir; boş ile 0 ayrılır. Klavye açıkken son satır ve kontroller erişilebilir kalır.
2. Campaign: beş pack/seviyeler okunur; açık bir seviyeye girilir. Hint sheet açılır; açıkça Hint al eylemiyle **bir hücre / bir hint** değişir; sheet kapanır ve kendiliğinden yeniden açılmaz. Yalnız kapatmak hint tüketmez.
3. Skor/not kaydı tamamlandıktan sonra uygulamayı kapat/aç; aynı guest/draft/hint sayısı korunur. Check, Reveal onayı ve replay normal akışta denenir.
4. TalkBack ile tablo başlığı, takım/metrikler, skor/not ve Hint/Close okunur. Sheet açıkken arka plan okunmaz; kapanınca açan düğmeye dönülür. System Back klavye/sheet/navigation sırasında incelenir.
5. OS fontunu 200%'e getir; dar ekran ve landscape'te kesilme/örtüşme kontrol et. Animasyon azaltma tercihiyle navigation/sheet denenir. Test sonrası kişisel ayarlarını geri alabilirsin.

Bunlar ilk debug smoke görevleridir. Gerçek lost reply, process kill, auth/merge/deletion, gece yarısı/120 dakika üstü, offline/reconnect, harici klavye ve release performansı ana T01–T20 matrisiyle ayrıca izlenir. Kişisel veriler yerine bu ayrılmış test kurulumunu kullan; fiziksel kullanıcı hesabı silme testi açık onayla yürütülür.

Sonuçları model/OS, build kimliği, backend revision, görev ve gözlenen sonuçla [Faz 8 raporuna](faz-8-kabul-raporu-2026-11-20.md) ekle. Seri numarası, şifre veya özel imza anahtarını paylaşma.

## 5. Güncel bağımsız test APK'sı

Telefona **ScoreLogic Test 0.1.0 (2)** yüklendi. Wi‑Fi/mobil veri açıkken normal uygulama simgesinden açılır; Mac, Android Studio, USB ve Metro'nun açık olması gerekmez. Test backend'i `https://score-logic-app-test.up.railway.app` üzerinde çalışır. Home, Daily, Campaign, Hint ve kapat/aç sonrası hint korunumu kablo çıkarılarak ürün sahibi tarafından doğrulandı.

APK: `.local/mobile-builds/android/scorelogic-test-0.1.0-2-arm64.apk` (proje köküne göre), yalnız ARM64, 29.856.271 byte. Internal dağıtım development sertifikası kullanır; production mağaza paketi değildir. Backend origin'i değiştiği için önceki localhost denemeleri ayrı namespace'te kalır; cloud test ayrı guest ile başlar.

Yerel yeniden derleme, yukarıdaki Node/JDK/SDK ortamında:

```sh
cd apps/mobile
export MOBILE_PREVIEW=true
export MOBILE_RELEASE=false
export MOBILE_BUILD_NUMBER=2
export EXPO_PUBLIC_API_URL=https://score-logic-app-test.up.railway.app
export EXPO_PUBLIC_WEB_ORIGIN=https://score-logic-app-test.up.railway.app
export EXPO_PUBLIC_ALLOW_LOCAL_HTTP=false
export EXPO_PUBLIC_CRASH_REPORTING_ENABLED=false
export EXPO_PUBLIC_BUILD_ID=phase8-android-internal-20261120
npx --no-install expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

Yeni dağıtımda build numarasını artır. Oluşan APK `app/build/outputs/apk/release/app-release.apk` yolundadır. USB development'a dönmek için preview/release env'lerini kaldırıp Bölüm 3 ayarlarıyla yeniden prebuild yap. EAS preview profili de `MOBILE_PREVIEW=true` kullanır; bu teslim yerel Gradle ile yapıldı, EAS hesabı veya bulut build'i kullanılmadı.
