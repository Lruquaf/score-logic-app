# Mobil uygulama karar kaydı

> Tarih: 12 Kasım 2026
> Durum: Önerilen başlangıç kararları kullanıcı tarafından seçildi; uygulama ve kabul kanıtları ilgili fazlarda üretilecek.
> Dayanak: [Mobil dönüşüm planı](../mobil-uygulama-donusum-plani-2026-11-12.md), özellikle Bölüm 4, 6–8, 11 ve 18; [kanonik ürün kuralları](../product-rules.md).
> Bu kaydın kapsamı: Karar, gerekçe, sorumlu alt sistem ve doğrulama kapıları. Mevcut backend/auth/deployment davranışının değiştirilmiş olduğu anlamına gelmez.

## 1. Kararların uygulanma durumu

Kullanıcının önerilen seçeneklerle ilerleme kararı, aşağıdaki başlangıç tercihlerini
seçer. Teknik PoC, güvenlik doğrulaması, gerçek kullanıcı denemesi ve mağaza erişimi
gibi kanıt gerektiren kapılar açık kalır. İlk uygulama paketi Faz 1 mobil UX
prototipidir; bu prototip native build veya çalışan API entegrasyonu sayılmaz.

Faz 0'ın kapsam/karar hazırlığı bu kayıtla ilerletilmiştir. Web unit/lint/type-check
ve production build baseline'ı yeniden geçti; prototype browser kabulü ayrı koşuldu.
Web integration/browser, production readiness/backup, mağaza sahipliği, domain ve
signing erişimi bu çalışmada yeniden doğrulanmadığından **Faz 0 tamamen kabul
edilmiş değildir**. Kanıtlar [teslim raporundadır](faz-1-uygulama-raporu.md).

## 2. Mimari ve ürün kararları

20 Kasım UI/UX eki: Kullanıcı mevcut arayüzün estetikten yoksun olduğunu belirterek ortak görsel geliştirme ortamı ve yeni tasarım sistemi istedi. **Modern skor defteri, yeşil ve tonlarıyla** seçildi. [Tasarım sistemi](ui-ux-tasarim-sistemi-2026-11-20.md) renk/type/yerleşim ve ekran taşıma sırasını tanımlar. Ortak inceleme Expo Web / React Native Web, gerçek native bileşenler ve bellek içi fixture servisleriyle yapılır; Phase 1 HTML prototipi tarihsel kalır. Kullanıcının ikinci geri bildirimiyle Figtree ailesi, kısa işlevsel metinler ve daha dengeli başlıklar uygulandı. Final Table gerçek GameScreen'de de telefonda yapışkan, geniş düzende ayrı sabit panel oldu. Sonraki görsel incelemeyle dekoratif saha/genel kartlar yerine public skor önizlemesi, eşlenmiş skor işareti ve maç/seviye/kayıt çizelgeleri uygulandı; dar ve yatay görünüm kendimizce incelenip düzeltildi. Kullanıcı bulmaca çözme ekranını referans seçince Home/Campaign/Stats aynı açık çizelge, başlık ve skor hücresi ölçülerine taşındı; ayrı koyu panel/hero ve büyük sayaçlar kaldırıldı. İlk kompozisyonlar production ekranlarının tümü için kabul anlamına gelmez; gerçek klavye/OS accessibility/final cihaz kabulü korunur.

| ID | Konu | Seçilen yaklaşım | Gerekçe | Uygulama ve doğrulama kapısı |
|---|---|---|---|---|
| K01 | Mobil mimari | Expo + React Native ile ayrı native istemci; mevcut Next.js web ve Railway backend korunur. | Mevcut TypeScript yatırımını ve canonical kayıtları kullanırken native arayüz geliştirmeyi sağlar. | Faz 2: iki platformda imzalı development build ve gerçek bağımlılık PoC'si. PoC başarısızsa bu karar kanıtla yeniden değerlendirilir. |
| K02 | İlk yayın platformları | iOS/iPadOS; Android telefon, tablet ve katlanabilir ekranlar. Mobil web çalışmaya devam eder. | Ana mobil platformlarda tam oyuncu paritesi ve uyarlanabilir arayüz hedefi. | Faz 0/2: cihaz matrisi; Faz 8: fiziksel cihaz kabulü. Bütün geçmiş cihaz/OS sürümleri için sınırsız garanti verilmez. |
| K03 | HarmonyOS ve diğer platformlar | İlk yayın dışında; ayrı fizibilite ve yayın hattı. | Expo/native modüllerin başka OS'lerde çalışacağı kanıtlanmış değil. | Ayrı kapsam kararı; iOS/Android paritesini bekletmez. |
| K04 | Minimum OS ve toolchain | Kesin minimum OS numarası şimdi seçilmez. Expo/RN/React, native modüller, Xcode ve Android toolchain uyumuyla Faz 2'de sabitlenir. | Desteklenmeyen sürüm kombinasyonu veya uydurma cihaz kapsamı oluşturmamak. | Faz 2: resmi uyumluluk kontrolü, kilitli sürümler ve min/current OS build kanıtı. Build SDK ile minimum kullanıcı OS'si ayrı kaydedilir. |
| K05 | Navigation | Home, Campaign, Daily, Stats olmak üzere dört ana tab; Account/Settings ve Help için stack ekranları. | Mevcut ana özellikler sürekli bulunur; hesap ve yardım oyunun üstüne fazla yük bindirmez. | Faz 1: gezinme prototipi; Faz 4/6: native navigation; back/gesture ve tab değişiminde state koruma testi. |
| K06 | Telefon oyun düzeni | A: tablo üstte varsayılan; B: fixture odaklı + tablo sheet'i karşılaştırma adayı. Kullanılabilir en/boy yeterli ve font büyütülmemişse iki panel; dar landscape/split view/büyük fontta tek panel. | Final Table'ı görmeden skor girmek zorlaşır; küçük ekranda klavyeyle birlikte denenmesi gerekir. | Faz 1: aynı görevlerle A/B karşılaştırması; Faz 2: gerçek native klavye/safe-area kontrolü. Nihai yerleşim kullanıcı denemesiyle kesinleşir. |
| K07 | Sayısal giriş | Başlangıç önerisi native numeric TextInput. Erişilebilir özel score pad prototipi karşılaştırma seçeneğidir. | Platform klavyesi, autofill dışı sayısal giriş ve erişilebilirlik altyapısından yararlanır; custom pad ek yüzey ve odak yönetimi getirir. | Faz 1–2: 0/boş, 10–19, silme, ileri/geri, kapatma; VoiceOver/TalkBack ve harici klavye. Tek ana yöntem seçilir; iki klavye birlikte açılmaz. |
| K08 | Dil ve tema | İlk parity yayını İngilizce ve mevcut açık tema. Metin anahtarları ve tasarım tokenları ayrılır. | Mevcut ürün dilini ve görsel kimliğini koruyarak mobil UX'e odaklanmak. | Faz 1/5/6: tüm ekran/state metinleri; büyük font/kontrast ve reduced-motion testi. Türkçe, ek dil ve dark mode ayrı kapsamdır. |
| K09 | Kod paylaşımı | Public contracts/response schema, public config, client core, saf state/view-model ve design tokens ayrılır. Web root'u ilk adımda taşınmaz. | Native bundle sınırını açık tutar; çalışan Railway build'ini gereksiz refactor'a bağlamaz. | Faz 2–4: import sınırları, Metro/peer dependency ve web regresyonları; Faz 8: bundle denetimi. |
| K10 | API | Native için sürümlü `/api/v1` sözleşmesi ve web/native'in kullandığı ortak uygulama servisleri. Mevcut web route'ları geçişte korunur. | Store istemcileri backend ile aynı anda güncellenemez; iş kuralları kopyalanmamalı. | Faz 3: eski/yeni contract testleri, hata kodları ve destek/deprecation penceresi. |
| K11 | Session güvenliği | Kısa access token + sunucuda hash'i tutulan dönen opaque refresh token; session revoke ve reuse tespiti. Web cookie/CSRF akışı korunur. | Native kimliği tarayıcı cookie varsayımlarından ayırırken logout/silme ve kayıp yanıt dayanıklılığı sağlamak. | Faz 3–4; Bölüm 3'teki tasarım varsayımları ve güvenlik testleri. |
| K12 | Çok cihaz ve işlem güvenliği | Kalıcı command outbox; aynı eylem için aynı UUID/değişmez payload; tüm canonical writer'larda server revision/baseRevision. | Bellek içi retry veya cihaz timestamp'i process kill/çok cihaz güvenliğini sağlamaz. | Faz 3–4/7: lost reply, kill, eski web writer, clock skew ve concurrent device testleri. |
| K13 | Guest merge | Sahipliği kanıtlanmış guest session; giriş sırasında geçiş bariyeri, senkronizasyon ve tekrar güvenli merge receipt'i. | Senkronlanmamış guest not/girdileri sunucu merge'i tarafından otomatik görülemez. | Faz 3–4/6: Bölüm 4; merge commit'inden sonra client ack gelmeden kill testi. |
| K14 | Süre ve daily | Resmi süre server attempt başlangıcından geçen duvar saatidir; background süreyi durdurmaz. Daily server'ın Europe/Istanbul business date'ine bağlıdır. | Mevcut canonical ürün davranışını korur; cihaz saati sonucu belirlemez. | Faz 2/4/5/7: >120 dk, background, gün devri, ±24 saat cihaz saati ve timezone testi. |
| K15 | Offline | Cache'teki public puzzle ve owner taslağı yerelde açılır/düzenlenir; outbox/reconcile kalıcıdır. Hint/Check/Reveal ve resmi sonuç için sunucu gerekir. | Veri kaybını önlemek için tam offline solver veya client-authoritative completion gerekmez. | Faz 4–7: cache yok, bakım, reconnect ve unknown command akışları. |
| K16 | Hesap kurtarma ve yeni özellikler | İlk parity sürümüne password recovery/e-posta doğrulama, sosyal login, push, reklam/ödeme, leaderboard, multiplayer veya tam offline solver eklenmez. | Mevcut özellikleri eksiksiz taşımakla yeni ürün kapsamını ayırır. | Yeni kullanıcı talebi/ayrı kapsam kararı. Hesap/guest silme ve privacy teslimleri bu ertelemenin kapsamında değildir. |
| K17 | Mağaza/domain sahipliği | Mağaza hesapları, signing ve production domain ürün sahibinin/kurumun kontrolünde olmalı. Hesap tipi, sahip kişi/kurum ve domain henüz doğrulanmadı. | Yayın ve anahtarların geliştiricinin kişisel hesabına bağımlı kalmaması. | Faz 0/2/9: gerçek sahiplik ve erişim doğrulaması; isim/domain uydurulmaz. |
| K18 | Build/EAS/OTA | İki platformun kendi development/release build'leri zorunlu. Yerel Xcode/Gradle veya EAS seçimi Faz 2 erişim/bütçe doğrulamasında yapılır. OTA ilk yayın için zorunlu değil. | Expo Go tek başına native kabul kanıtı değildir; ücretli bulut bağımlılığı kendiliğinden yaratılmaz. | Faz 2: build erişimi ve maliyet kararı; Faz 9: signing, artifact ve gerekiyorsa OTA runtime/channel politikası. |
| K19 | Ekip, bütçe ve tarih | Ana plandaki aralıklar planlama girdisidir; teslim taahhüdü değildir. Kesin kaynak/tarih PoC ve sahiplik kontrolüyle güncellenir. | Gerçek ekip, mağaza erişimi ve fiziksel cihaz kapasitesi doğrulanmadı. | PoC öncesi/sonrası tahmin kaydı; harcama/satın alma kararı ayrıca. |
| K20 | Gizli çözüm ve sırlar | Canonical hint/check/reveal, solver, private solution kümesi, Prisma ve server secret'ları backend'de kalır. Mobilde gizli offline solver yolu kurulmaz. | Oyun bütünlüğünü ve public/private sınırını korur. | Her paylaşılmış paket incelemesi ve T17 bundle/API denetimi. Kullanıcının açık Reveal isteğiyle dönen yetkili cevap mevcut ürün davranışıdır. |

## 3. Session ve credential tasarım varsayımları

20 Kasım Faz 8 eki: [Kabul raporu](faz-8-kabul-raporu-2026-11-20.md), kaynak/test başarısını fiziksel release kabulünden ayırır. T01–T20 metadata ve performans bütçeleri makineyle kontrol edilir; kanıtların gerçekliği ve artifact imzası insan incelemesi gerektirir. İlk cihaz Android SM-G970F / Android 12'dir. Yerel debug USB/localhost ile ilerler; dış ağ ve release için HTTPS v1 rollout'u gerekir. Java 17 proje oturumunda seçilir; sistem Java'sı değiştirilmez. Doğrulanmış production kimlik/signing/domain eksikleri açık kalır.

Ürün sahibi ilk fiziksel testte 200%/arayüz iyileştirmelerini sonraya bırakıp kurulum/çalışabilirliği öncelemeyi istedi. Bu nedenle büyük font ve kapsamlı accessibility kabulü ertelendi; 200% denemesinden sonra telefonun 1.0 yazı ölçeği geri yüklendi. Bu kapsam sıralaması release accessibility koşullarını kaldırmaz.

Ürün sahibi yalnız Railway `test` ortamını yeniden çalıştırma, yedekleme, migration/deploy ve Metro'suz APK hazırlığını onayladı. Trial-expired engelinden sonra planı kendisi etkinleştirdi. Mevcut test PostgreSQL volume'u korundu; şifreli yedek sonrası 5 native migration uygulandı. Gömülü JS ve HTTPS kullanan `MOBILE_PREVIEW=true` internal mod, native Gradle release variant ve development sertifikasıyla üretildi; production ownership guard'ı korunur. USB/Metro/API kapalıyken bağımsız cihaz smoke'u geçti. [Kanıtlar ve sınırlar](faz-8-kabul-raporu-2026-11-20.md#railway-test-rolloutu-ve-bağımsız-apk--tamamlandı).

Aşağıdaki politika 13 Kasım 2026'da yeni native session servisinde uygulandı ve yerel integration testleriyle doğrulandı; mevcut Auth.js oturum sürelerini değiştirmez. Canlı ortam yayını ve cihaz kabulü henüz yapılmadı. Ayrıntılar [Faz 2–3 raporunda](faz-2-3-uygulama-raporu-2026-11-13.md).

| Alan | Başlangıç politikası | Doğrulama |
|---|---|---|
| Account access token | 10 dakika; imzalı, açık issuer/audience, environment, subject ve session id. | Yanlış issuer/audience/ortam, expiry ve revoked session reddedilir. |
| Account refresh | Başarılı rotation ile en çok 30 gün ileri kayan süre; session başlangıcından en çok 90 gün mutlak ömür. Sonrasında yeniden login. | İki sınırın da server saatine göre uygulanması; idle ve absolute expiry ayrımı. |
| Refresh credential | En az 256 bit rastgele opaque değer; sunucuda yalnız hash; her başarılı kullanımda rotation. | Token sızıntısı olmayan DB/log ve replay/reuse testleri. |
| Guest credential | Mobil kurulum için ayrı opaque session credential; authenticated refresh süresine sessizce tabi tutulup guest geçmişi kaybettirilmez. Native guest refresh 365 gün inactivity ömrüne sabitlendi; kısa access token/rotation ayrı uygulanır. | Uzun süreli guest devam, expiry açıklaması, merge/revoke/deletion; süre kesinleşmeden auth fazı kapanmaz. |
| Cihazda saklama | Access token tercihen bellekte; refresh/guest credential SecureStore üzerinden Keychain/Keystore'da. Taslak ve outbox SQLite'ta. | Credential hiçbir URL'ye, loga, AsyncStorage/genel tercihe veya SQLite payload'ına girmez. |
| Revoke/logout/silme | API principal çözümlemesi session'ın server status/version bilgisini denetler. Yalnız refresh token'ı silmek yeterli sayılmaz. | Henüz expire olmamış access token logout/revoke/silme sonrasında kullanılamaz. Cache varsa iptal gecikmesi ayrıca ölçülüp kabul edilir. |
| Refresh yarışı | Cihazda tek refresh; aynı session için server'da atomik rotation. | Paralel 401 istekleri token ailesini yanlışlıkla iptal etmez. |
| Kayıp rotation yanıtı | Aynı device session/rotation command'i için tekrar güvenli protokol; receipt/recovery ayrıntısı Faz 3 security tasarımıdır. | Server commit → kayıp reply → kill → restart senaryosu. Eski token'a geniş ve koşulsuz kabul penceresi açılmaz. |

Login/auth tokenları public API adresi veya public design tokenlarıyla karıştırılmaz.
`EXPO_PUBLIC_*` değerlerine yalnız public config konur; JWT imzalama anahtarı,
`AUTH_SECRET`, `DATABASE_URL`, Redis credential veya build upload secret'ı konmaz.
Web Auth.js JWT'sini native access token diye yeniden adlandırmak seçilen çözüm
değildir. Rate limiter doğrulanmış native principal'ı kullanır; doğrulanmamış Bearer
string'i kimlik sayılmaz.

## 4. Kalıcı veri, revision ve merge kararının ayrıntıları

### 4.1 Command ve tüm writer'larda revision

- Kullanıcı eylemi göndermeden önce owner/session, attempt, command UUID, işlem tipi,
  baseRevision ve değişmez payload/hash transaction içinde yerelde saklanır.
- Gönderilen payload ancak yeni bir kullanıcı eylemiyle yeni command olabilir.
  Timeout, reconnect, foreground veya process kill kendi başına yeni hint/submit açmaz.
- Pending/unknown eylem önce server receipt/canonical state ile çözülür. Gecikmiş yanıt
  başka owner'a, başka puzzle'a veya yeni attempt'e uygulanmaz.
- PUT progress, hint, submit, reveal ve reset/replay dahil bütün canonical writer'lar
  ortak uygulama servisi/kilit ve server revision kullanır. Yalnız `/api/v1`'e CAS
  eklemek yeterli değildir; eski web route'larının da revision ilerletmesi gerekir.
- Web client baseRevision/reconcile'a taşınır. Geçişte revision taşımayan eski
  payload'ların politikası ayrı contract testleriyle tanımlanır; native veriyi sessiz
  overwrite eden bir legacy writer yolu açık bırakılarak çok cihaz garantisi verilmez.
- Given/hint değerleri, reveal, terminal state, unlock ve resmi süre sunucu üstünlüğünü
  korur. Çakışan kullanıcı skoru/notu atılmaz; iki sürüm kurtarılabilir kalır.
- SQLite schema migration; draft, outbox ve receipt'leri birlikte korur. Son
  tamamlanmış transaction'dan sonraki henüz yazılmamış input penceresi ölçülür;
  başlatılmış her async yazımın ani OS kill'de tamamlanacağı vaat edilmez.

### 4.2 Guest → account geçiş bariyeri

1. Login niyeti ve kaynak guest session güvenli biçimde tutulur; geçiş sırasında
   yeni guest eylemleri durdurulur veya açık bir yeni revision'a kaydedilir.
2. Gönderilmiş pending/unknown guest komutları çözülür. Yerel skor/not taslağı server'a
   gönderilir; gönderilemeyen veri için kalıcı transfer kaydı oluşturulur. Offline'da
   merge tamamlanmış gösterilmez.
3. Account kimliği doğrulanır; guest sahipliği kanıtlanır. Sunucu mevcut canonical
   merge servisini, identity lock sırasını ve tekrar güvenli receipt'i kullanır.
4. Kaynak user silinse bile server commit'inden sonra kaybolan yanıtı çözebilen,
   kaynak session ile bağlı recovery/receipt sözleşmesi korunur. Sadece artık
   bulunmayan guest user id'sine tekrar bakmak recovery sayılmaz.
5. Account canonical state ve merge receipt'i alındıktan sonra yerel owner geçişi
   atomik kaydedilir. Yalnız bu merge'e açıkça bağlı taslak/transfer kayıtları yeni
   owner'a taşınabilir; eski command account tokenıyla körlemesine yeniden oynatılmaz.
6. Başarı ve recovery bilgisi kalıcılaştırıldıktan sonra kaynak credential temizlenir.
   Logout ile yeni guest yaratılması eski account/merged guest outbox'ını geri getirmez.

Bu sıra hem yeni hesap hem mevcut hesaba giriş için uygulanır. Web guest cookie'sini
native uygulamaya anonim aktarma ve reinstall sonrası kesin guest kurtarma ilk yayın
vaadi değildir.

## 5. P01–P20 sahiplik ve faz eşlemesi

Buradaki sahipler sorumlu **alt sistemlerdir**; ekipteki gerçek kişi atamaları henüz
yapılmadı. Ana planın bütün P maddeleri ilk genel yayının kapsamındadır. Faz 1
prototipinde temsili ekran bulunması, o maddenin native/API kabulünü tamamlamaz.

| Parite ID | Sorumlu alt sistem | Uygulama fazları | Gerekli kabul kanıtı |
|---|---|---|---|
| P01 Guest | Native identity + backend session | Faz 2 PoC; Faz 3–4; Faz 6 giriş | T01/T10; login duvarı olmadan daily ve her pack level 1; güvenli guest devam. |
| P02 Home/rehber | Mobil UX + navigation/content | Faz 1; Faz 6 | Rehber tekrar açılır; mevcut açıklamalar erişilebilir; ana görev görünür. |
| P03 Daily | Backend catalog/time + native lifecycle | Faz 3–5; Faz 7 | T07; server business date, farklı timezone ve gün devri. |
| P04 Campaign | Backend access + native catalog/pack ekranı | Faz 3; Faz 6 | T02; 5×30; pack bazlı sıralı unlock ve API erişim kontrolü. |
| P05 Prefill/feedback | Backend public config + gameplay view-model | Faz 3; Faz 5 | Bütün pack/level fixture'ları; given değerlerinin korunması ve feedback politikası. |
| P06 Final Table | Native gameplay UI + accessibility | Faz 1; Faz 5 | T18; bütün metrikler okunur, skor girişinde kaynak tablo değişmez. |
| P07 Skor/not | Native input/persistence | Faz 1–2; Faz 4–5 | 0/boş ve 10–19; readonly hücre, not limiti, klavye ve kalıcılık. |
| P08 Autosave/devam | Storage/outbox + backend revision | Faz 3–4; Faz 7 | T01/T13/T15; tamamlanan yerel yazım kill/update/reconnect sonrasında korunur. |
| P09 Hint | Backend assistance + command + native sheet | Faz 2 PoC; Faz 3–5; Faz 7 | T04/T05; bir eylem bir hücre/sayaç; receipt retry; başarıda kapanış. |
| P10 Check | Backend submit/solve-any + native feedback | Faz 3; Faz 5 | T06/T09; alternatif doğru çözüm, idempotent sonuç ve pack'e uygun feedback. |
| P11 Reveal | Backend attempt/answer + native confirmation | Faz 3; Faz 5 | T06/T08; kayıp reply reconcile; normal completion/unlock üretmeme. |
| P12 Analyze Board | Backend analysis policy + native snapshot UI | Faz 3; Faz 5 | T03; doğru Beginner seviyeleri, SAT/UNSAT/UNKNOWN ve eskimiş snapshot. |
| P13 Reset/replay | Backend attempt lifecycle + command | Faz 3–5; Faz 7 | T08; tek replay command'i, korunmuş first/best/history ve unique solve. |
| P14 Timer/gün devri | Backend authoritative time + AppState adapter | Faz 2 PoC; Faz 3–5; Faz 7 | T05–T07; >120 dk, background, ±24 saat, yeni daily ve eski taslak ayrımı. |
| P15 Stats/streak | Backend canonical aggregates + native Stats | Faz 3; Faz 6 | Web/iOS/Android aynı değerleri gösterir; replay/hint/reveal semantiği değişmez. |
| P16 Son attempt'ler | Backend progress cursor + native history | Faz 3; Faz 6 | Mevcut son altı kayıt; doğru durum, puzzle etiketi ve server süresi. |
| P17 Hesap/kayıt/çıkış | Native identity + canonical merge + cache owner | Faz 3–4; Faz 6–7 | T10–T12/T16; guest geçiş bariyeri, lost merge ack, owner izolasyonu, revoke/deletion. |
| P18 Paylaşım/davet | Shared formatter + native share/link | Faz 2 PoC; Faz 6–7 | T14; exact puzzle, server süre/hint, spoiler'sız metin, cancel ve locked/retired link. |
| P19 Hata/yardım/loading | Tasarım sistemi + typed API/state | Faz 1; Faz 4–6 | Empty/offline/unknown/expired/bakım/retry; sahte başarı veya uydurma sıfır istatistik yok. |
| P20 Sunucu operasyonları | Backend release/content/observability | Faz 0 kontrol; Faz 3 uyumluluk; Faz 7–10 | T20; content/readiness, editorial/daily buffer, backup ve yeni session/deletion recovery. |

Her satır için Faz 8 kabulünde iOS/Android kanıtı veya P20 gibi server kapsamındaki
doğrudan operasyon kanıtı bulunur. Bir özelliği yalnız web bağlantısına bırakmak
oyuncu paritesini tamamlamaz.

## 6. Açık dış doğrulamalar

- Web integration/browser baseline'ının yeniden koşulması; unit/lint/type-check ve
  production build bu teslimde geçti. CI WebKit kurulumu ve ayrı mobile-ux job'ı
  tanımlandı; GitHub üzerinde çalıştırılması push sonrası doğrulanacak.
- Production içerik/readiness, cron/aktivasyon, backup/restore ve silinmiş hesabın
  restore sonrası geri gelmemesi için operasyon kanıtı.
- Expo/RN/native modül/toolchain uyumu; minimum OS; gerçek iPhone/iPad ve Android
  telefon/tablet/foldable test erişimi.
- Apple/Google hesap tipi ve sahipliği, signing erişimi, production/staging domain
  ve Universal/App Links association sahipliği.
- Yerel iOS build kapasitesi veya EAS planı/bütçesi; satın alma ve bulut harcaması
  kararı bu dokümanda verilmiş sayılmaz.
- Gönderim öncesi güncel mağaza target SDK/build SDK, testing, privacy/deletion ve
  native dependency şartları; ana plandaki resmi kaynaklardan yeniden kontrol.
- Faz 1 prototipinin gerçek kullanıcılarla görev denemesi ve native cihaz klavye/
  erişilebilirlik kanıtı; tarayıcı prototipi bunların yerine geçmez.

## 7. Kabul kaydı

- [x] Başlangıç mimarisi, ürün sınırları ve önerilen mobil yaklaşım seçildi.
- [x] Bütün P01–P20 maddeleri sorumlu alt sistem ve uygulama fazına eşlendi.
- [x] Native session, revision/outbox ve guest merge için tasarım başlangıcı yazıldı.
- [ ] Faz 0 baseline, mağaza/domain ve production operasyon doğrulamaları tamamlandı.
- [ ] Faz 1 prototipi ve görev denemeleri kabul edildi.
- [x] Faz 2 kaynak SDK/OS matrisi, PoC ve iki platform Hermes export doğrulandı.
- [ ] Faz 2 signed native PoC ve gerçek cihaz matrisi kabul edildi.
- [x] Faz 3 API/guest session süresi/recovery kodu ve yerel protokol testleri tamamlandı.
- [x] Faz 4 navigation/runtime/SQLite v2 ve yerel test teslimi tamamlandı.
- [x] Faz 5 çekirdek oyun/pack feedback/analysis/history kodu ve yerel servis testleri tamamlandı.
- [x] Faz 6 bütün oyuncu ekranları, auth intent, native silme recovery ve yerel test teslimi tamamlandı.
- [x] Faz 6 P01–P20 kaynak parite listesi ve ekran/state envanteri hazır.
- [x] Faz 7 domain/link/clipboard/lifecycle/opt-in diagnostics kaynak ve yerel failure/recovery testleri tamamlandı.
- [ ] Faz 7 gerçek signing association, native OS dayanıklılık, crash/ANR privacy ve symbolication kabulü tamamlandı.
- [ ] Faz 6 signed iOS/Android oyuncu ekranları ve gerçek OS paylaşım/hesap kabulü tamamlandı.
- [ ] Faz 5 iki platformda imzalı oyun/klavye/accessibility kabulü tamamlandı.
- [ ] Faz 4 gerçek native OS kill/restart ve app-upgrade kabulü tamamlandı.
- [ ] Faz 3 canlı rollout ve gerçek iOS/Android ortak geçmiş kabulü tamamlandı.

Karar değişirse ID korunarak yeni tarih, gerekçe ve etkilenen faz/testler kaydedilir.
Bu dosyadaki seçimler, kabul kanıtı üretilmeden ilgili özelliğin uygulanmış veya
yayına alınmış olduğunu göstermez.

13 Kasım Faz 4 güncellemesi: [uygulama raporu](faz-4-uygulama-raporu-2026-11-13.md). K12/K13 için owner hydration ve Home’dan merge bariyeri; K14 için monotonic saat/focus; yerel DB için atomik v1→v2 migration ve draft arşivi uygulandı.

14 Kasım Faz 5: [uygulama raporu](faz-5-uygulama-raporu-2026-11-14.md). Native keyboard başlangıç tercihi, görünür Next/Done, disclosure kontrollü feedback ve snapshot analysis uygulandı. Gerçek cihaz kabulü K18 kapısını kapatmaz.


14 Kasım Faz 6: [uygulama raporu](faz-6-uygulama-raporu-2026-11-14.md) ve [P01–P20 listesi](parite-kontrol-listesi.md). K12/K13 için native auth dönüşü ve merge lineage, oyuncu ekran/state envanteri; kayıp silme onayı için kimliğe bağlı olmayan 90 günlük hash receipt ve restart edilebilir local cleanup uygulandı. Bu kaynak kararları gerçek OS/store/production kabulünü kapatmaz. Contract 1.2.0/API v1; 22. server migration yerel test DB’lerinde uygulandı, Railway rollout yapılmadı.


14 Kasım Faz 7: [entegrasyon raporu](faz-7-entegrasyon-raporu-2026-11-14.md) ve [runbook](native-entegrasyon-runbook.md). Kullanıcı signing/domain metadata olmadan ilerlenmesini seçti; association varsayılan kapalı kaldı. K12/K14 için gerçek iki-session CAS/receipt ve offline monotonic saat, K18 için mapped export/plugin kaynak kanıtı üretildi. SDK/native-only event privacy, gerçek signing/OS kabulü tamamlanmış sayılmaz.
