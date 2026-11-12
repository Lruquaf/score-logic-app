# ScoreLogic — Güncel sürüm feedback analizi ve uygulama planı

Tarih: 9 Kasım 2026  
Durum: Mevcut davranış hatalarının düzeltmeleri uygulandı; güncel kapsam ve doğrulama §16’da.  
Kapsam: `mobil oyun.pdf` dosyasının üç sayfası, ekran görüntüleri, mevcut repository ve paylaşılan PostgreSQL logları.

## Güncel uygulama kapsamı

Kullanıcının sonraki talebiyle yalnız mevcut davranış hataları düzeltildi. DB sleeping /
Railway müdahalesi ve yeni özellikler kapsam dışında bırakıldı. §1–15 ilk analiz ve
gelecek önerilerini korur; bu bölümlerdeki satır referansları analiz anındaki sürüme aittir.
Uygulananlar, sınırlar ve gerçek test sonuçları §16’da bulunur.

## 1. Sonuç ve kapsam sınırı

İlk düzeltme dalgası hesap kimliğinin API tarafından doğru okunması, kullanıcıya ait cache/draft ayrımı, campaign durumlarının güncellenmesi ve deployment kararlılığı olmalıdır. Daily içerik devamlılığı da yayın için önceliklidir. Ardından ipucu deneyimi, reveal açıklamaları ve paylaşım geliştirilmeli; dil desteği ve ödül ekonomisi ayrı aşamalarda ele alınmalıdır.

PDF'teki ifadeler kullanıcı araştırması ve özellik önerisi olarak değerlendirildi. Belgedeki reklam, elmas ve başarı önerileri mevcut ürün kurallarını otomatik değiştiren talimatlar sayılmadı. İlk çalışma yalnız plan oluşturdu. Sonraki hata düzeltme çalışması §16’da kayıtlıdır; production verisi ve Railway ayarları değiştirilmedi.

Kanıt düzeyleri:

- **Doğrulandı:** Kodda doğrudan görüldü veya sınırlı bir deneyle tekrar üretildi.
- **Güçlü aday:** Gözlemle uyumlu kod yolu var; gerçek hesap/production üzerinde doğrulama gerekiyor.
- **Ürün kararı:** Beklenen davranış henüz seçilmeli; teknik hata olarak sunulamaz.
- **Dış ortam doğrulaması:** Railway ayarları ve canlı veritabanı bu çalışmada okunmadı.

PDF ekranları ağırlıklı olarak masaüstünü gösteriyor. Dokümanın adı tek başına mobil cihazda hata yaşandığını kanıtlamıyor. Mobil kabul testleri aşağıdaki plana ayrıca eklendi.

## 2. Feedback → iş eşlemesi

| ID | Kaynak | Sorun / talep | Kanıt ve öncelik |
|---|---|---|---|
| AUTH-01 | PDF s.3 | Sign out → guest → sign in sonrası ilerleme ve stats kayıp görünüyor | HTTPS cookie okuma uyumsuzluğu deneyle doğrulandı; production veri kaybı kanıtlanmadı. **P0** |
| STATE-01 | PDF s.2–3 | Reveal ve in-progress campaign grid'e hemen yansımıyor | Cache yenileme eksikleri doğrulandı. **P1** |
| DAILY-01 | PDF s.1 | Daily quiz bulunamıyor | İçerik yayın zinciri, cache ve mobil erişim ayrı adaylar. Canlı içerik kontrolü gerekli. **P1** |
| HINT-01 | PDF s.1–3 | Hint açıklayıcı değil; yanlış Check sonrasında çalışmıyor gibi | Modal etkileşimi, genel mesajlar ve her istekte kullanım sayılması doğrulandı. **P1** |
| REVEAL-01 | PDF s.1 | Tek eksik kutu varken “6 valid solutions” denmesi | Global çözüm sayısı ile mevcut tahta uyumlu sayısı ayrılmıyor. **P1** |
| REVEAL-02 | PDF s.1–2 | Reveal → reset → aynı cevabı girerek ilerleme amaçsız hissettiriyor | Mevcut kurallar yeni attempt ile çözmeye izin veriyor; ürün kararı. **P2** |
| PROGRESS-01 | PDF s.3 | Reveal sonrası hep turuncu kalma / perfect grid motivasyonu | Sonsuza kadar turuncu kalma iddiası doğrulanmadı; gösterim politikası belirsiz. **P2** |
| SHARE-01 | PDF s.1 | Paylaşımda süre ve yeterli bağlam yok | Paylaşım fonksiyonunda süre/link/pack bilgisi yok. **P2** |
| LANG-01 | PDF s.1 | Çoklu dil seçimi | Sabit İngilizce metinler ve `lang="en"` var; yeni özellik. **P2** |
| ECON-01 | PDF s.2 | Elmas, başarı ve reklam izleyerek ödül | Mevcut wallet/achievement/rewarded-ad sistemi yok; ayrı ürün kapsamı. **P3** |
| DEPLOY-01 | Ek PostgreSQL logları | Railway PostgreSQL sleeping | Düzenli dış shutdown doğrulandı; Serverless olası neden, dashboard doğrulaması gerekli. **P0** |

P0: güven/erişilebilirlik ve kimlik sorunu. P1: temel oyun akışını etkiliyor. P2: ürün açıklığı ve deneyim. P3: temel akıştan sonra yeni büyüme/gelir özellikleri.

## 3. AUTH-01 — Hesap ilerlemesinin kayıp görünmesi

### Kanıt ve olası neden

`lib/auth/anonymous.ts:58` içindeki `resolveSessionUserId`, `getToken({ req, secret })` çağırıyor; `secureCookie` veya ortak bir cookie yapılandırması vermiyor. Kurulu `@auth/core/jwt.js:86`, bu durumda `authjs.session-token` adını varsayıyor. Auth.js'in `lib/init.js:69` ve `lib/utils/cookie.js` kodları HTTPS ortamında varsayılan olarak `__Secure-authjs.session-token` oluşturuyor.

Gerçek kurulu JWT modülüyle sentetik HTTPS Request ve geçerli şifreli token kullanılarak yapılan deney:

```text
defaultLookupFindsSecureCookie: false
explicitSecureLookupFindsAccount: true
```

Bu mekanizma doğrulandı: `/api/auth/session` hesabı tanırken oyun API'leri aynı çerezi bulamayabilir. PDF s.3'te header'ın “Signed in”, stats'ın “No user identified” demesiyle doğrudan uyumlu. Bu, kayıtların silindiğini göstermiyor. İlgili API `user: null, stats: null` döndüğünde `StatsExperience` sıfırları çiziyor.

İkincil sorunlar:

- `HeaderStatus`, stats ve oyun hook'u aynı kullanıcı verisini farklı query key'lerle tutuyor.
- `LoginForm`, girişte yalnız `user-stats` ailesini invalidate ediyor; campaign, progress ve puzzle cache'leri kimliğe bağlı değil.
- `scorelogic-puzzle-store` draft'ları yalnız puzzle ID ile saklanıyor (`store/puzzleStore.ts:1327`); kullanıcı sahibiyle ayrılmıyor. Sign out yalnız user store'u temizliyor.
- Bu durum yanlış hesabın taslağının görünmesi veya eski verinin yeniden eşitlenmesi açısından risk oluşturuyor; gerçek veri taşınması/silinmesi ayrıca test edilmeli.

### Çözüm

1. Auth.js session ve oyun API'leri için tek kimlik çözümleme yolu seç: request'e bağlı Auth.js `auth()` kullanımını veya ortak ve tutarlı secure cookie/salt yapılandırmasını uygula. Sadece cookie adını değiştirmekle yetinme; JWT decode salt'ı da aynı ada bağlıdır. HTTP yerel geliştirme ve HTTPS proxy ortamını birlikte ele al.
2. Geçerli hesap oturumu varken sessizce guest oluşturulmasını önle. Geçersiz/eskimiş oturum ile gerçek misafir durumlarını ayır; tutarsızlıkta yeniden giriş mesajı göster.
3. Sunucunun verdiği kullanıcı kimliğine göre query key ailesi kur: stats, progress, campaign ve puzzle/progress. Kimlik değişirken eski istekleri iptal et, eski cache'in yeni kullanıcı ekranına yazılmasını engelle.
4. Draft'ları kullanıcı kimliği + puzzle/content revision ile ayır. Anonim draft'ı hesaba yalnız başarılı server merge sonrasında aktar. Genel `localStorage.clear()` kullanma; ilgili eski storage sürümü için kontrollü migration yap.
5. Stats ekranında yükleme hatası, kimlik tutarsızlığı ve gerçek sıfır sonucu ayrı gösterilsin.
6. Mevcut kayıtların sağlığını read-only kontrol et: kullanıcı ID'siyle attempt/completion/progress sayıları ve `stats:reconcile` dry-run. Veri kaybı kanıtı olmadan seed/reset/repair uygulama.

### Kabul testleri

- HTTPS secure cookie ile `/api/auth/session`, `/api/user/stats`, `/api/user/progress` ve campaign aynı kullanıcıyı tanır.
- A hesabında çöz → çıkış → guest olarak oyna → A'ya tekrar gir: A'nın geçmişi korunur; guest geçmişi bir kez merge edilir.
- A → guest → B geçişinde A'nın draft/cache'i B'de görünmez. Geç gelen A response'u B store'una yazılmaz.
- Anonim merge retry ve paralel giriş kayıtları çoğaltmaz; mevcut integration merge testleri korunur.
- Gerçek PostgreSQL ve HTTPS oturumuyla E2E yapılır. HTTP-only mevcut Playwright projesi bu hatayı tek başına yakalayamaz.

## 4. STATE-01 — Campaign grid güncelliği

**Doğrulandı:** `CampaignProgress.tsx:149` ve `DailyPuzzleExperience.tsx:66`, `['campaign-puzzles']` için `staleTime: Infinity` kullanıyor. `hooks/usePuzzle.ts` içinde doğru submit campaign'i invalidate ederken attempt start, autosave, hint ve answer reveal başarıları aynı cache'i güncellemiyor. Reveal sonrasında yalnız stats/progress invalidate ediliyor. Bu nedenle sekmeden campaign'e dönünce eski grid görülebilir; tam sayfa yenilemesi cache'i kaldırınca düzelmesi beklenir.

**Çözüm:** Kullanıcıya bağlı campaign key'i ve ortak mutation sonrası güncelleme fonksiyonu oluştur. Attempt start, ilk kayıt, hint, reveal ve submit response'larını ilgili progress cache'ine uygula; ardından hedefli refetch yap. Her tuşta tüm kataloğu yeniden indirme. Autosave ile reveal/submit yarışında eski response yeni durumu geri çevirmesin. Campaign fetch hatasını boş katalog olarak gösterme; hata ve retry sun.

**Kabul:** Campaign → level → ilk giriş/kayıt → campaign aynı oturumda “In progress” gösterir. Reveal turuncu, başarılı çözüm tanımlı completion rengi olur; reload gerekmez. Farklı kullanıcı cache'i paylaşılmaz. Testler istemci yönlendirmesiyle yapılır; `page.goto` ile her adımda yeniden yükleme cache hatasını maskelemesin.

## 5. DAILY-01 — Günlük bulmacanın bulunamaması

Kesin tek neden henüz yok. Üç ayrı olasılık araştırılmalı:

1. **İçerik yok veya aktif değil:** `app/api/puzzles/daily/route.ts`, İstanbul business date'i için aktif/test edilmiş kayıt bulamazsa `503`, business date ve `Retry-After: 300` döndürüyor. Migration içerik üretmez. `db:publish`, QA, editorial onay ve activation ayrı. Daily buffer yeni içeriği incelemeye hazırlar; activation worker yalnız onaylanıp planlanmış içerikleri aktive eder.
2. **Daily cache eskimiş:** `hooks/usePuzzle.ts:40` tarih içermeyen `['daily-puzzle']` key'i ve `staleTime: Infinity` kullanıyor. Gece yarısını açık oturumda geçen kullanıcı eski güne takılabilir; bulunamama şikâyetinin tek başına kanıtlanmış nedeni değil.
3. **Keşfedilebilirlik:** Header menüsü `sm` altında gizleniyor (`Header.tsx`); mobilde eşdeğer ana menü yok. Ana sayfa CTA'sı var, ancak diğer ekranlardan Daily'ye geçiş zorlaşabilir.

**Uygulama:** Önce canlı API'nin status/body ve business date'ini, DB'nin erişilebilirliğini ve o günün içerik lifecycle alanlarını incele. Buffer `--check` çıktısında GAP ile REVIEW_REQUIRED ayrımını kaydet. Bugün ve ileri pencere için publish → QA → insan onayı → schedule/activate akışını tamamla; daily buffer ve activate-due cron'larını doğru manifestlerle bağla. İçeriği request sırasında üretme ve review kapısını atlama. Daily API hatasında içerik bekleniyor, bağlantı sorunu ve auth sorunu ayrıştırılsın. Tarih devrinde aktif attempt'i silmeden yeni daily uyarısı ve hedefli yenileme tasarla. Mobil menüye Daily erişimi ekle.

**Kabul:** İstanbul 23:59 → 00:01, açık sekme ve yeni sekmede doğru gün; kayıt yokken anlaşılır mesaj ve retry; cron arızasında gözlemlenebilir GAP; 375 px ekranda tüm ana bölümlerden Daily erişimi. Readiness'in `SELECT 1` ile geçmesi günlük içeriğin hazır olduğunu göstermez; içerik hazırlığı ayrı deploy sonrası smoke kontrolüdür.

## 6. HINT-01 — İpucu akışı ve öğretici içerik

### Bulgular

- PDF s.2'deki görüntü `HintModal` içindeki “Reveal score cell” butonunun statik açıklaması; API'nin ürettiği hata değil. Header'daki Hint yalnız modal açıyor, gerçek istek ikinci butonla gönderiliyor. İki aşama yeterince açık değil.
- `DailyPuzzleExperience.tsx:361` gerçek ipucu isteğinden hemen sonra modalı kapatıyor. Sonuç veya hata aşağıdaki panelde kalıyor; kullanıcı ipucunu görmeyebilir.
- `lib/engine/hint.ts:107` mevcut dolu hücrelerle uyumlu çözümleri filtreliyor. Sıfır adayda genel çelişki mesajı döndürmesi mevcut yanlış hücreyi ezmemek için doğru; bu tek başına motor arızası değil.
- Motorun mevcut girdileri final standings/team adları içermiyor; açıklamalar çoğunlukla “Home/Away score cell is …”, çelişki veya dallanma mesajı. PDF'in istediği takım/puan ilişkisi anlatımı mevcut değil.
- Hint route'unda `hintsUsed` her istek için artıyor (`hint/route.ts:125`); hücre açılmasa ve aynı genel mesaj dönse de artış var. Elmas eklenmeden önce başarı/ücret semantiği tanımlanmalı.

### Çözüm

1. Modalda açık “İpucu al” eylemi, pending, sonuç ve hata alanları oluştur; istek sırasında otomatik kapatma. Sonuçta ilgili takım/maçı anlaşılır şekilde göster.
2. Hint response'unu yapılandır: `kind` (DEDUCTION, CELL_REVEAL, CONFLICT, NO_SAFE_HINT), `messageKey`, açıklama parametreleri, hedef, `didReveal`, kullanım/ödül durumu. İstemci İngilizce cümleyi parse etmesin.
3. Standings ve mevcut açık bilgilere dayanan deterministik açıklama kuralları ekle: kalan W/D/L, kalan GF/GA, zorunlu sonuç, zorunlu hücre. Örnek mantık: “Takımın toplam bir beraberliği var; diğer iki maçın sonuçları kesinleştiği için kalan maç berabere olmalı.” Yalnız ilgili örneğin verisi bunu gerçekten zorunlu kılıyorsa göster.
4. Her çıkarımı solve-any uyumlu çözüm kümesiyle doğrula. Ortak skor yoksa tek skoru dayatma. Çelişkide girilmiş hücreyi değiştirmeden geri inceleme önerisi sun. Beginner dışına Analyze Board önerme; bu araç yalnız Beginner 1–15'te kullanılabiliyor.
5. Önerilen politika: tekrarlanan/no-op/altyapı hatası ücretsiz; yeni pedagojik bilgi veya hücre açma ayrı assistance olayı. “Hints used” ve ilerideki elmas bedeli açıkça tanımlansın; ilgili ürün kuralları birlikte güncellensin.

**Kabul:** Tek zorunlu hücre, birden çok geçerli dal, yanlış kullanıcı girdisi, tamamen dolu tahta ve servis hatası senaryoları. Yanlış Check sonrası Hint'in ne yaptığı görünür. Girdi değişmedikçe aynı işe yaramayan mesaja tekrar ücret/sayı yazılmaz. Açılan her hücre sonrasında en az bir geçerli tamamlama kalır.

## 7. REVEAL-01 — Çözüm sayısı ve gösterilen cevap

**Doğrulandı:** Answer endpoint `puzzle.allSolutions.length` döndürüyor (`answer/route.ts:179`); store bunu “Showing one of 6 valid solutions” olarak yazıyor (`puzzleStore.ts:1179`). Bu sayı özgün final tablonun toplam çözüm sayısı. Başlangıçta verilen skorlar ve kullanıcının girdilerinden sonra kalan sayı ayrıca hesaplanmıyor. Görüntüde beş maçın verilmiş olması nedeniyle tek oynanabilir tamamlama kalması mümkün. Tek boş hücre olması tek başına çözüm sayısını kanıtlamaz; fixture/verilen hücrelerle tekrar hesaplamak gerekir.

**Çözüm:** Şu kavramları ayır: toplam tablo çözümü, başlangıçta verilen skorlarla uyumlu çözüm, kullanıcının mevcut girdileriyle uyumlu çözüm. UI'da öncelikle oynanabilir durumla ilgili sayıyı anlat; toplam sayı verilecekse kapsamını etiketle. Uyumsuz mevcut girdiler sıfır aday bırakırsa “Mevcut girdiler geçerli bir çözüme uymuyor; örnek çözüm gösteriliyor” de. Başlangıçta verilen skorları koruyan bir örnek seç; mevcut doğru girdilerle uyumlu örnek varsa onu tercih et. Mevcut kod kanonik çözümü tüm tahtaya yazar; değişen kullanıcı hücrelerini önceden açıkla. Normal public/hint response'larında private solution kümesini açma; answer endpoint'inin tüm `allSolutions` yerine tek örnek ve sayıları döndürmesi yeterli olabilir.

**Kabul:** Altı global çözüm + beş verilen maç + tek uyumlu tamamlama fixture'ı; birden çok uyumlu cevap; sıfır uyumlu cevap; revealed/given hücrelerin tutarlılığı. Sayı ve açıklama her durumda doğru kapsamı kullanır.

## 8. REVEAL-02 / PROGRESS-01 — İlerleme, öğrenme ve perfect hedefi

Mevcut ürün kuralları reveal ile sonraki seviyenin açılmamasını, daha sonra yeni attempt ile normal çözüm yapılabilmesini istiyor. `resetCurrentPuzzle` reveal sonrası yeni replay başlatıyor; submit yeni başarılı attempt'te completion kaydı oluşturabiliyor. “Cevabı gördükten sonra aynı cevabı girerek ilerleme” bu nedenle mevcut kararla uyumlu; yalnız reset'in teknik hatası olarak kapatılmamalı.

Grid'de `answerRevealed` kontrolü completion'dan önce (`CampaignProgress.tsx:83`). `isCleared` reveal'i de cleared sayıyor; böylece kullanıcıya “geçildi” hissi verip aynı seviyenin devamını yine kilitli bırakabilir. Yeni başarılı submit `answerRevealed:false` yazabiliyor; dolayısıyla bir kere reveal eden oyuncunun sonsuza kadar turuncu kalacağı kesin değil. Ayrıca ilk completion, en hızlı attempt, en az yardımlı çözüm ve son attempt farklı kavramlar; tek renge indirgenmiş.

**Önerilen ürün politikası:** Reveal geçmişi silinmez, öğrenme amacıyla yeniden çözme mümkündür, normal completion unlock sağlar. Grid ana rengi elde edilmiş çözümü gösterir; “cevap daha önce görüldü” ayrı küçük rozet/detaydır. “Perfect” için tanımı açıkça seç: `hintsiz solve` mu, `cevabı hiç görmeden solve` mu? İkincisi isteniyorsa reveal geçmişi sunucuda mantıksal `contentKey` düzeyinde sorgulanmalı. Oyuncuya hatırladığı cevabı unutturan güvenilir bir teknik kontrol yok; rekabetçi başarı için farklı bir puzzle/revision üzerinde bağımsız çözüm görevi önerilebilir.

**Uygulama:** `Cleared` yerine “Çözüldü” ve “Cevabı görüldü” ayrı sayaçlar; next önerisi gerçek unlock policy ile aynı kaynak; `bestDurationAttempt` ve en iyi assistance sonucu birbirine karıştırılmasın. Gerekirse progress DTO'ya `hasCompletion`, `hasCleanSolve`, `hasEverRevealed`, `latestAttemptStatus` ekle. Reveal öncesi sonucun etkisini açıklayan onay ekranı tasarla. Karar verildikten sonra `docs/product-rules.md`, istatistik türetimi, merge, API ve grid aynı değişiklikte uyarlansın.

**Kabul:** Reveal → reset → hintsiz solve; hintsiz solve → revealed replay; önce yavaş hintsiz sonra hızlı hintli solve; merge edilen hesap geçmişi. İlk completion ve unlock geri alınmaz, reveal geçmişi kaybolmaz; renk ile resmi metrik anlamları çelişmez. Mevcut reveal geçmişini temizleyen migration yapılmaz.

## 9. SHARE-01 — Sonuç paylaşımı

`lib/utils/share.ts` yalnız başlık, kareler ve hint sayısı üretiyor. `VictoryScreen` süre alıyor fakat paylaşım fonksiyonuna geçirmiyor. Verilen başlangıç maçları ile gerçekten çözülen hücreler paylaşımda ayrılmıyor. Clipboard hatası için görünür geri bildirim yok.

**Çözüm:** Pack + level veya daily tarih, kısa oyun açıklaması, sunucudan gelen resmi süre, yardım durumu ve public puzzle/campaign linki ekle. Örnek:

```text
ScoreLogic — Beginner / Seviye 1
Final tablodan maç skorlarını çözdüm.
Süre: 00:47 · İpucu: 0
🟩🟩🟩🟩🟩🟩
<public-uygulama-adresi>/campaign
```

Linki mevcut public origin'den üret; secret, hesap ID'si, özel token veya çözüm içermesin. Başlangıçta verilen maçların sembol semantiğini açıklığa kavuştur. Share iptalini sessiz iptal olarak işle; API/clipboard gerçekten başarısızsa görünür mesaj ve elle kopyalama sun. Dil desteğine hazır anahtarlar kullan.

**Kabul:** Daily/campaign, official/replay, hintli/hintsiz, farklı diller; metinde skor cevabı yok. Süre victory ekranıyla ve resmi attempt'le aynı. Mobil native share ve masaüstü clipboard testleri.

## 10. LANG-01 — Dil seçimi

`app/layout.tsx` sabit `lang="en"` kullanıyor; UI ve server hint/feedback metinleri İngilizce gömülü. Salt metinleri değiştirmek tam dil desteği sağlamaz.

**Önerilen ilk kapsam:** Türkçe + İngilizce. Kullanıcının seçimi cookie ile server/client'ta ortak okunsun; tarayıcı dili yalnız ilk seçimde kullanılsın. Mevcut URL'leri ilk aşamada koruyan locale provider/dictionary çözümü uygulanabilir. Arama motoruna göre ayrı dil URL'leri istenirse `[lang]` yapısına geçiş ayrı migration işidir; typedRoutes, proxy/CSP ve mevcut linkler birlikte ele alınmalı.

**İşler:** Ana ekran/oyun/auth/stats/help/share metinleri, aria etiketleri ve hint/feedback mesaj anahtarları; tarih/sayı/süre biçimleri; takım adlarında varsa `nameTr`, yoksa `nameEn` fallback. Dil ayarı daily iş tarihini değiştirmemeli; business date Europe/Istanbul olarak kalmalı. Yerel Next.js environment ve internationalization kılavuzları uygulama öncesinde yeniden esas alınmalı.

**Kabul:** Reload/giriş sonrası seçim korunur; HTML lang ve görünen dil aynı; eksik çeviri fallback'i; dar ekranda Türkçe uzun metinler; locale değişimi mevcut attempt/cache kimliğini bozmaz.

## 11. ECON-01 — Elmas, başarılar ve ödüllü reklam

Bu maddeler mevcut bug düzeltmelerinden ayrı yeni ürün kapsamıdır. `prisma/schema.prisma`, lib ve components incelemesinde wallet, achievement veya rewarded-ad lifecycle bulunmadı. “Asıl para reklamlardan kazanılıyor” ifadesi bu ürün için doğrulanmış gelir tahmini değildir.

**Aşama 1 — Reklamsız ekonomi:** Server-authoritative ve append-only ödül/harcama ledger'ı; tekrarlanamayan kaynak anahtarı; atomik bakiye kontrolü; negatif bakiye engeli. Ödülü `contentKey` başına ilk uygun completion gibi açık bir olayla ver; replay/idempotent retry/merge iki kez ödüllendirmesin. Başarılar canonical attempt/completion verisinden türetilsin. Bir dakikanın altında zor bölüm gibi başarılar istemci timer'ına güvenmesin. Hint/reveal maliyeti ve no-op/iade kuralları önce seçilsin.

**Aşama 2 — Ödüllü reklam:** Hedef web mi ileride native mi, sağlayıcı ve desteklediği doğrulama modeli araştırılsın. Önce test adapter'ı: başlatıldı/tamamlandı/iptal/başarısız/doğrulandı durumları ve benzersiz işlem kimliği. İstemcinin “izledim” beyanıyla bakiye artırma. Desteklenen server doğrulaması, replay engeli, limitler ve failure durumları netleşmeden canlı ekonomi bağlanmasın. Reklam yüklenmezse mevcut oyun akışı kilitlenmesin; izleme isteğe bağlı olsun. Sağlayıcı seçilirken geçerli yayın, izin ve yaş politikaları ayrıca doğrulanmalı; bu planda sağlayıcı uygunluğu veya gelir sözü verilmez.

**Kabul:** Çift tıklama/eşzamanlı harcama, duplicate callback, reklam yarıda kapatma, sunucu hatası, guest→account merge ve geçmiş başarıların tek seferlik backfill'i. Ödül ledger'ı ile bakiye uzlaşır. Yeni servisler minimum website deploy'un zorunlu bağımlılığı yapılmaz.

## 12. DEPLOY-01 — Railway PostgreSQL sleeping ve deployment süreci

### 12.1 Logların söylediği

Paylaşılan dosya PostgreSQL container logudur; tek başına güncel web deploy sonucu ve platformun kapatma gerekçesini içermez. Aşağıdaki saatler 8 Kasım 2026 içindir:

| UTC | İstanbul | Gözlem | Yorum |
|---|---|---|---|
| 12:07:08 | 15:07:08 | Önceki düzensiz kapanıştan recovery, ardından `ready to accept connections` | Bu açılış recovery ile tamamlanmış; tek satırlık WAL uyarısı kalıcı bozulma kanıtı değil. |
| 12:11–12:25 | 15:11–15:25 | SSL EOF / connection reset | İstemci bağlantısının kesildiğini gösterir; istemciyi ve sebebi bu log belirlemiyor. |
| 12:35:25 | 15:35:25 | `/* railway:dataui */` sorgusunda `pg_stat_statements` bulunamıyor | Railway sorgu istatistiği ekranına ait extension/view eksikliği; uygulama tablosu migration hatası olduğu gösterilmiyor. |
| 13:20:53 | 16:20:53 | `Stopping Container`, fast shutdown, session termination, shutdown checkpoint, `database system is shut down` | Dışarıdan kapanış isteği alınmış ve düzenli kapanış tamamlanmış. |
| 15:26:17 | 18:26:17 | Aynı veri volume'u ile tekrar başlama, önceki temiz kapanış tanınıyor, `ready to accept connections` | En azından bu yeniden açılışta veritabanı erişime hazır hale gelmiş. |
| 15:34:22 | 18:34:22 | Yeniden fast shutdown ve temiz kapanış | Log sonunda DB durmuş durumda; sonraki uyanış hakkında bilgi yok. |

Fast shutdown, aktif işlemleri sonlandırıp temiz kapanış yapar; bu sıradaki `terminating connection due to administrator command` mesajları tek başına veri bozulması anlamına gelmez. [PostgreSQL shutdown belgesi](https://www.postgresql.org/docs/current/server-shutdown.html)

**En güçlü hipotez:** Railway'de PostgreSQL için Serverless/App Sleeping etkin. Railway, Serverless etkin servisleri hareketsizlikte uyutup trafikle uyandırabiliyor; dolayısıyla kullanıcının gördüğü sleeping etiketiyle uyumlu. Ancak aynı shutdown redeploy veya manuel stop ile de oluşabilir. Platform deployment/activity olayları olmadan tetikleyiciyi kesinleştirmek mümkün değil. [Railway Serverless](https://docs.railway.com/deployments/serverless)

“Tini PID 1 değil” uyarısı container process yönetimiyle ilgilidir; mevcut log bunun shutdown sebebi olduğunu kanıtlamıyor. Öncelikli uygulama değişikliği olarak veritabanı image'ını değiştirmek veya WAL/postmaster dosyaları silmek önerilmez.

### 12.2 Dış ortamda yapılacak teşhis ve düzeltme

1. Doğru Railway project/environment içindeki **PostgreSQL servisini** aç. Settings → Deploy → Serverless durumunu ve 16:20 / 18:34 İstanbul saatlerindeki deployment/activity olaylarını kontrol et. Manuel restart, yeni deploy, platform olayı ve kullanım limiti ihtimallerini kayıtla ayır.
2. İlk production sürümü için öneri: PostgreSQL'de Serverless kapalı, web servisinde de ilk yayın doğrulaması boyunca kapalı olsun. Bunun idle compute maliyeti getireceğini deployment kararına yaz. Ayarın container'a uygulanması için ilgili servisi yeniden deploy et. Yerel `railway.toml` yalnız web servisinin manifestidir; PostgreSQL dashboard ayarını buradan değiştirmiş sayamayız. [Railway Serverless](https://docs.railway.com/deployments/serverless)
3. PostgreSQL'in kalıcı volume'unun bağlı olduğunu ve startup sonunda bağlantı kabul ettiğini doğrula. Web'in `DATABASE_URL` referansı aynı environment'taki PostgreSQL servisine gitmeli; bağlantı URL/parolasını rapora veya loga kopyalama.
4. Web container'ından `SELECT 1`, ardından `/api/health` kontrol et. Redis kullanılmıyorsa `REDIS_ENABLED=false`; beklenen yanıt database `up`, redis `disabled`. Önceki Redis healthcheck sorunu ile bugünkü PostgreSQL sleeping olayını aynı hata sayma.
5. Migration başarısını doğrula. Sonra daily içerik hazırlığını ayrıca kontrol et. Başarılı migration/healthcheck, bugünün daily puzzle'ının yayınlandığını veya auth kimliğinin doğru çözüldüğünü garanti etmez.
6. 15–20 dakika kullanılmayan bir aradan sonra ilk gerçek puzzle/stats isteğini dene. DB'nin yeniden sleeping olmaması, bağlantının hata vermemesi ve kullanıcı verisinin korunması kabul koşuludur. Bu süre bir ölçüm penceresidir; kesin platform uyku eşiği iddiası değildir.
7. Serverless zaten kapalı olduğu halde tekrar sleeping görünüyorsa yeni container oluşturulduğunu doğrula; Activity/usage/platform olaylarıyla Railway desteğine deployment kimliği ve saat aralığını ilet. Kanıtsız biçimde uygulamaya sürekli ping veya her DB hatasında sınırsız retry ekleme.

### 12.3 Uygulama ve paketleme işleri

**Mevcut iyi taraflar:** `railway.toml` pre-deploy migration, standalone başlangıç ve `/api/health` için 120 saniyelik pencere tanımlıyor. `scripts/deploy-migrations.ts` geçici DB hazırlık hatalarına sınırlı retry uyguluyor. Readiness DB'yi gerçekten sorguluyor; dependency failure metadata'sı credentials olmadan loglanıyor. Redis açık opt-in ile yönetiliyor.

**Planlanan ekler:**

- Web ve DB lifecycle kararını `docs/deployment.md` içine ayrı servisler olarak yaz; web manifestinde dashboard Serverless ayarıyla çelişki varsa gider. Config-as-code seçilecekse güncel Railway şemasındaki sleep alanını doğrula. [Railway config referansı](https://docs.railway.com/config-as-code/reference)
- Health sorgularının sürelerini ve hata sınıflarını güvenli biçimde gözlemle. İstek süresini gerçekten sınırlayacak driver/query timeout yaklaşımını seç; yalnız `Promise.race` ile sorguyu arka planda çalışır bırakma. İlk açılış gecikmesinde GET okumalarına sınırlı retry düşünülebilir; auth/submit/hint/reveal gibi yazımlar ancak mevcut idempotency/transaction garantileriyle tekrar edilmeli.
- `StatsExperience` gibi ekranlar altyapı hatasında sahte sıfır göstermesin. “Veriler yüklenemedi” ve retry, gerçek boş hesap durumundan ayrı olsun.
- Deployment healthcheck'i sürekli izleme sanma: Railway canlıya çıktıktan sonra bu endpoint'i sürekli izlemez. İhtiyaç halinde ayrı düşük maliyetli uptime/synthetic kontrolü kullan; minimum web başlangıcına yeni zorunlu servis ekleme. [Railway healthcheck belgesi](https://docs.railway.com/deployments/healthchecks)
- Önceki build logunda `.next-dev.stale/package.json` dosyasının taranması ve 86,9 MB snapshot görülmesi paketleme hijyeni işi açmayı gerektiriyor. Yerel `.gitignore` yalnız `.next-dev` ve iki env dosyasını dışlıyor; `.railwayignore` yok. Git kaynaklı deploy ile CLI snapshot deploy'un dışlama davranışı ayrıca test edilmeli. `.next*`, yerel DB, test çıktıları ve gerçek `.env*` dosyalarının artifact'e girmediğini denetle; `.env.example` korunabilir. Yalnız URL/token silme varsayımına dayanma. Standalone artifact içeriği otomatik taransın; dosyaların içeriği loglanmasın.

`pg_stat_statements` hatası ayrı ve düşük öncelikli: Uygulama çalışması için zorunlu kılma. Railway Data UI sorgu istatistiği kullanılacaksa önce `pg_extension`, `pg_available_extensions` ve `SHOW shared_preload_libraries` ile durumu read-only incele; uygun konfigürasyon/izin varsa extension'ı ilgili veritabanında etkinleştir. Yalnız `CREATE EXTENSION` komutunun her durumda yeterli olduğu varsayılmamalı; modül preload ve restart gereksinimi var. [PostgreSQL pg_stat_statements](https://www.postgresql.org/docs/18/pgstatstatements.html)

### 12.4 Deployment kabul koşulları

- Serverless seçimi web ve PostgreSQL için kayıtlı; ilgili container ayar değişikliğinden sonra oluşturulmuş.
- Migration başarılı; runtime DB sorgusu ve `/api/health` başarılı; Redis kapalıysa bağlantı denenmiyor.
- Sessizlik sonrası ilk istek, cold-start tercihiyle uyumlu davranıyor; DB'nin devamlılığı doğrulanıyor.
- Geçici DB kesintisinde readonly endpoint/ekranlar anlaşılır hata veriyor; yazımların tekrarları çift completion/hint/ödül üretmiyor.
- Artifact'te gerçek env dosyası, yerel veritabanı veya eski build cache'i yok.
- Günlük içerik ve HTTPS auth smoke testleri ayrıca geçmiş; yalnız healthcheck ile sürüm kabul edilmiyor.

## 13. Uygulama dalgaları ve bağımlılıklar

| Dalga | İşler | Bağımlılık / çıkış koşulu | Yaklaşık mühendislik eforu |
|---|---|---|---|
| A | DEPLOY-01 + AUTH-01 ilk düzeltmeler | DB erişimi ve HTTPS kimlik uyumu; mevcut veri read-only denetlenmiş | 2–3 gün |
| B | Kimlik bazlı cache/draft + STATE-01 + DAILY-01 | A; tam sayfa yenilemesiz grid ve tarih devri testleri | 2–4 gün |
| C | HINT-01 + REVEAL-01 | A/B; response contract ve no-op kullanım politikası | 3–5 gün |
| D | REVEAL-02 / PROGRESS-01 + SHARE-01 | Perfect/reveal ürün kararı; server ve UI aynı semantik | 2–4 gün |
| E | LANG-01 | Mesaj anahtarları C'de hazırlanmış; TR/EN sözlükleri | 3–5 gün |
| F | ECON-01 reklamsız ledger/başarılar | Kimlik, idempotency ve yardım semantiği kararlı | 5–8 gün |
| G | Ödüllü reklam sağlayıcı denemesi ve entegrasyon | F; platform/sağlayıcı ve doğrulama modeli seçilmiş | Araştırma sonrası tahmin |

Tahminler tek geliştirici için ilk planlama aralığıdır; gerçek veri doğrulama, ürün seçimi ve sağlayıcı onay süreleri dahil kesin teslim tarihi değildir. Deployment erişimi beklenirken yerel auth/cache çalışması ilerleyebilir; canlı sonuç alınmadan olay kapatılmaz. Ekonomi, website deploy'un önkoşulu değildir.

Her dalga ayrı küçük PR/commit gruplarıyla ilerlemeli. Auth düzeltmesiyle ledger migration'ını aynı release'e bağlama. Şema gerektirmeyen A/B önce yayınlanabilir. Yeni şema gerekiyorsa geriye uyumlu alanlar eklenir; read-only backfill planı, idempotent uygulama ve geri dönüş davranışı hazırlanır. Production verisini sıfırlayan migration yok.

## 14. Karar gerektiren noktalar ve önerilen varsayımlar

| Karar | Öneri | Etki |
|---|---|---|
| Reveal sonrası yeniden çözme | İzin ver; reveal geçmişini ayrı koru | Öğrenme ve mevcut kanonik kurallarla uyum |
| Perfect tanımı | Hintsiz solve ile “cevabı hiç görmeden solve” rozetini ayır | Motivasyon korunur, başarı anlamı açık olur |
| İşe yaramayan/tekrarlanan hint | Yeni yardım sayma veya ücret alma | Mevcut artış davranışı değişir; ürün kuralları güncellenir |
| İlk dil kapsamı | TR + EN, mevcut URL'leri koru | Düşük routing değişikliği, sınırlı SEO dil kapsamı |
| İlk yayın lifecycle'ı | PostgreSQL ve web sürekli açık | İlk istek kararlılığı; idle compute maliyeti |
| Ekonomi/reklam sırası | Önce temel hatalar, sonra ledger, en son reklam | Yeni bağımlılıklarla yayın engellenmez |

Bu öneriler planın uygulanabilir bir başlangıç noktasıdır; henüz seçilmemiş ürün değişiklikleri yapılmış gibi raporlanmamalı.

## 15. Doğrulama planı ve bu çalışmanın sınırı

### Mevcut test açığı

`playwright.config.ts` tek Desktop Chrome projesi ve HTTP dev server kullanıyor. Auth secure cookie, gerçek production HTTPS davranışı, cache'in aynı SPA oturumunda eskimesi ve mobil share/menü davranışı bu kapsamla yeterince güvence altında değil.

### Hedef kontroller

- **Unit:** secure/normal cookie çözümlemesi; kimlikli query key ve response yarışları; progress renk/projection; global/uyumlu çözüm sayıları; hint çıkarımlarının doğruluğu; share formatı; İstanbul business date sınırı.
- **PostgreSQL integration:** guest/account merge ve retry; reveal→replay→completion; aggregate reconciliation; ekonomi aşamasında ledger ve eşzamanlı harcama. Sadece güvenli izole `_test` veritabanı kullan.
- **E2E:** HTTPS oturum + A/guest/B geçişi; SPA campaign geri dönüşü; hint sonucu görünürlüğü; midnight daily geçişi; gerçek hata ekranları. Mobil Chromium ve WebKit projeleri ekle; platforma özgü share/clipboard manuel kontrolünü kaydet.
- **Release:** değişen alanlara uygun unit/integration/E2E; type-check, lint ve minimum production env ile build. Opsiyonel servisler olmadan website açılabilmeli. Gerçek veri/servis doğrulamaları staging'de ve sınırları kaydedilerek yapılmalı.

### Bu analizde yapılanlar

PDF'nin üç sayfasının metni ve görüntüleri incelendi. Auth, anonymous merge, query/cache/store, campaign projection, daily publication/cron, hint, reveal, share, layout ve deployment dosyaları karşılaştırıldı. HTTPS secure cookie varsayılanındaki uyumsuzluk kurulu JWT modülüyle küçük ve gerçek veri içermeyen deneyde tekrar üretildi. Railway ve PostgreSQL açıklamaları resmi belgelerle karşılaştırıldı.

Canlı Railway ayarlarına, gerçek kullanıcı hesabına ve production DB'ye erişilmedi. Ekran görüntüleri mevcut repository commit'iyle birebir aynı sürüm sayılmadı. İlk analiz sırasında uygulama değişikliği veya production müdahalesi yapılmadı. Yukarıdaki geniş kabul planı, §16’da ayrıca tamamlandığı belirtilmeyen testler için gelecek işidir.


## 16. Uygulama kaydı — 9 Kasım 2026

### 16.1 Yapılan düzeltmeler

| İş | Durum | Uygulama |
|---|---|---|
| AUTH-01 | Düzeltildi | API JWT okuması production secure-cookie adı/salt ile tutarlı; HTTP local korunuyor. Giriş/kayıt sonrası tam yönlendirme yeni session cache'iyle başlıyor. |
| Hesap/cache/taslak ayrımı | Düzeltildi | Session sahibi değişince ayrı QueryClient; aktif tahta sıfırlanıyor; draft'lar hesap bazında saklanıyor. Eski owner/puzzle/attempt yanıtları uygulanmıyor. Header/stats aynı key ailesini kullanıyor. |
| Eski taslak migration'ı | Düzeltildi | Sahibi bilinmeyen version-0 draft'lar `unclaimedDrafts` altında korunuyor; yeni hesaba otomatik atanıp yüklenmiyor. Sunucudaki geçmiş esas alınıyor. Yeni owner draft'ları kendi alanından geri yükleniyor. |
| STATE-01 | Düzeltildi | Attempt start, save, hint, reveal ve submit, campaign/progress/stats cache'lerini stale yapıyor. Save sırasında aktif olmayan ekranlara gereksiz refetch yapılmıyor; SPA geri dönüşünde güncel veri geliyor. |
| DAILY-01 istemci cache'i | Düzeltildi | Daily için sonsuz stale kaldırıldı; 30 saniyelik stale süresi, focus yenilemesi ve görünür sekmede 60 saniyelik refetch. Tarih kararı API'ye ait; eski günün draft'ı tutuluyor. |
| DAILY-01 local bootstrap | Düzeltildi | Testte ilk batch'in yalnız 100/151 revision'ı onayladığı ve daily'nin dışarıda kaldığı görüldü. `db:setup` local/CI bootstrap onaylarında batch boyutu 500'e çıkarıldı. Production review kuralları değişmedi. |
| HINT-01 etkileşimi | Düzeltildi | Gerçek “Get a hint” eylemi netleştirildi. İstek pencereyi kapatmıyor; pending, sonuç ve hata aynı alanda, live region ile gösteriliyor. |
| REVEAL-01 | Düzeltildi | Global, verilen skorlarla oynanabilir ve mevcut girdilerle uyumlu sayılar ayrıldı. Uyumlu çözüm varsa girdiler korunuyor; aksi halde çelişki anlatılarak verilen skorlarla uyumlu örnek gösteriliyor. |
| Stats/campaign hata ekranları | Düzeltildi | Ağ/API hatası sıfır istatistik veya “All cleared” gibi gösterilmiyor. Loading, hata ve gerçek boş hesap ayrıldı; retry korunuyor. |
| Auth formu başlangıç yarışı | Düzeltildi | Oturum kontrolü bitmeden giriş/kayıt alanlarına yazılamıyor; session çözülürken yeniden mount sırasında girdilerin silinmesi engellendi. |
| CSP-01 — production etkileşiminin durması | Düzeltildi | HTTPS production testinde statik `/daily`, `/campaign`, `/stats` script'lerinin nonce eksikliğiyle engellendiği doğrulandı. Root layout `connection()` ile istek zamanında render ediyor; strict CSP korunuyor. |

CSP-01 ilk PDF analizinde ayrı iş olarak listelenmemişti; production testinde ortaya çıktı.
Bir özellik eklemesi değil, var olan oyun ekranlarının production'da çalışmasını engelleyen
uyumsuzluktur. Sonuç olarak HTML sayfaları dinamik render edilir; nonce kullanan bu
kurulumda eski static/ISR HTML davranışı kullanılmaz. Metadata asset'leri ayrı kalır.

### 16.2 Bilerek değiştirilmemiş konular

- **DEPLOY-01:** PostgreSQL sleeping, Railway Serverless, volume veya production DB ayarları.
- **DAILY-01 canlı içerik:** Production'da bugüne ait revision'ın yayın/QA/editorial/activation
  durumu kontrol edilmedi veya değiştirilmedi. İstemci artık çalışıyor; içerik yoksa API yine
  anlaşılır 503 döndürür. Bu durum kod düzeltmesi tamamlandı diye READY sayılmaz.
- **HINT-01 yeni öğretici motor:** Takım/puan açıklamaları, yeni hint tipleri ve yeni response
  lifecycle'ı eklenmedi. Çelişki mesajı mevcut kurala göre çalışıyor. No-op hint kullanımını
  ücretsiz yapma veya sayaç semantiğini değiştirme, henüz seçilmemiş ürün kararı olarak kaldı.
- **REVEAL-02 / PROGRESS-01:** Reveal sonrası yeni attempt ile çözme, unlock ve perfect/renk
  politikası değişmedi. Yeni rozet veya başarı tanımı eklenmedi; geçmiş silinmedi.
- **SHARE-01:** Süre/link/pack bilgisiyle paylaşım genişletme yeni özellik kapsamına bırakıldı.
- **LANG-01 / ECON-01:** Dil seçimi, elmas, başarılar ve reklam entegrasyonu eklenmedi.
- Mobil ana menü ve yeni navigation tasarımı bu hata düzeltme kapsamına alınmadı.

### 16.3 Doğrulama

Son test sonuçları ve ortam bilgisi bu bölümün devamında kayıtlıdır. Test hazırlığı yalnız
localhost üzerindeki izole `scorelogic_feedback_20261109_test` veritabanında yapıldı;
production'a fixture yazılmadı ve editorial kuralları production için atlanmadı.

| Kontrol | Gerçek sonuç |
|---|---|
| `npm run test:unit` | **289 test / 61 dosya geçti** |
| PostgreSQL integration | **15 test / 2 dosya geçti**; yeni, izole localhost `_test` DB |
| Production HTTPS Playwright | **12 test geçti**; standalone build, yerel TLS proxy ve Chromium |
| `npm run lint` | Geçti |
| `npm run type-check` ve build TypeScript aşaması | Geçti |
| Minimum production env ile `npm run build` | Geçti; Redis/Sentry/OTel/PostHog kapalı |

Özellikle doğrulanan regresyonlar: gerçek şifreli secure JWT çerezi, HTTP local cookie,
owner'lar arası draft ayrımı ve legacy draft koruması, terk edilmiş cache'e gelen geç yanıt,
reveal sonrası aynı SPA oturumunda campaign rengi, hint penceresinin sonuçla açık kalması,
daily'nin focus ile yenilenmesi ve önceki draft'ın korunması, verilen skorlarla çözüm sayısı,
alternatif geçerli girdilerin reveal sırasında korunması ve hata ekranlarının sahte sıfır
çizmemesi. HTTPS browser testinde `__Secure-authjs.session-token` varlığı da doğrulandı.

Testte iki ortam engeli görüldü ve ayrıştırıldı: mevcut eski `_test` DB'de önceki fixture'larla
unique-key çakışması vardı; testler yeni ayrı DB'de geçirildi. Local bootstrap'ın 100'lük
varsayılan review batch'i daily içeriğini dışarıda bıraktı; bu kod hatası yukarıda düzeltildi.
İlk production testinde CSP statik-render hatası, sonraki kayıt testinde session/form
başlangıç yarışı yakalandı; ikisi giderildikten sonra 12 HTTPS testinin tamamı geçti.

Playwright artık `E2E_BASE_URL` ile önceden çalıştırılmış production/staging sunucusunu
hedefleyebilir; bu durumda kendi dev server'ını açmaz. Yerel, kendinden imzalı TLS testinde
`E2E_IGNORE_HTTPS_ERRORS=true` kullanıldı. Normal test koşusunda sertifika doğrulaması açık.
Bu çalışma WebKit/iOS veya canlı Railway smoke testi içermez.

### 16.4 Yayın ve veri etkisi

- Yeni Prisma migration'ı, paket bağımlılığı veya zorunlu env değişkeni yok.
- Session/cache/taslak düzeltmeleri tarayıcı ve API tarafındadır. Canonical kullanıcı geçmişi
  silinmez veya yeniden seed edilmez. Eski sahibi bilinmeyen local draft'lar otomatik
  kullanıma açılmadan saklanır; ihtiyaç halinde sahibi doğrulanarak kurtarılabilir.
- Strict nonce CSP korunur; HTML'in request-time render edilmesi bu politikanın gereğidir.
- Railway/PostgreSQL sleeping işi açık kalır. Production içeriğinin o gün için aktif olması
  halen yayın operasyonunun sorumluluğudur; bu çalışmada canlı içerik değiştirilmedi.


## 17. Canlı testte boş puzzle tablosu — 10 Kasım 2026

### Kanıt ve önceki doğrulamanın açığı

Kullanıcının paylaştığı `https://score-logic-app-test.up.railway.app/` adresinde doğrudan
API okumaları ve TinyFish guest tarayıcı kontrolü yapıldı:

- `/api/health`: database `up`, redis `disabled`, HTTP 200.
- `/api/puzzles/campaign`: `puzzles: []`, `progress: []`.
- `/api/puzzles/daily`: HTTP 503.
- Daily yeniden denemeyle de açılmıyor; campaign paket başlıkları var ama oynanabilir seviye yok.

Bu olay guest kimlik hatası veya Redis gereksinimi değil; boş içerik tablosu ve release
hazırlığının eksikliği. Önceki HTTPS testleri önceden yayımlanmış fixture veritabanında
çalıştığı için boş DB'den deploy açığını yakalamadı. Önceki “testler geçti” kaydı bu
kapsamdadır; canlı ortamın oynanabilir hale geldiğine kanıt sayılmamalıdır.

### Düzeltme

- `db:release`: migration + içerik hazırlığı/doğrulaması. Railway pre-deploy bu komuta geçti.
- `PUZZLE_CONTENT_MODE=test`: yalnız açıkça seçilen izole test modu; 150 campaign ve bugün
  dahil 15 daily oluşturulur, gerçek domain/content QA uygulanır, yalnız bu hazırlayıcının
  kendi fixture'ları audit kaydıyla onaylanıp aktive edilir.
- Varsayılan `reviewed` modunda otomatik onay yok; eksik oynanabilir içerikte release durur.
- `/api/health` bağlantı yanında güncel oynanabilir içeriği denetler. Boş DB artık sağlıklı
  sayılmaz. Boş campaign katalog API'si de yanıltıcı başarı yerine 503 verir.
- Yeniden çalıştırma mevcut içeriği/ilerlemeyi silmez. Global approval, reset veya request
  sırasında generation yok. Başka editörün pending/rejected içeriğine dokunulmaz.
- `railway.test-content.toml`: isteğe bağlı ayrı günlük test içerik yenileme cron'u.
  Cron yoksa pencere bittikten sonra release/ensure-content yeniden çalıştırılmalıdır.
- `.railwayignore`: gerçek local env/DB ve eski build klasörlerinin snapshot'a taşınması önlenir.

### Doğrulama ve uygulama durumu

- 295 unit test geçti; boş DB readiness, tarih devri, test opt-in ve boş campaign yanıtı dahil.
- Yeni, boş yerel DB'de 2 integration testi geçti: 165 içerik; ikinci çalışmada sıfır
  değişiklik; sonraki gün yalnız bir yeni tarih; başka aktörün pending kaydı korunuyor.
- Gerçek `db:release` komutu yerel test DB'sinde production modunda çalıştırıldı;
  bugünün içerik penceresi `READY` oldu.
- Bu release'in ürettiği içerikle production standalone HTTPS'te 12 Playwright testi geçti;
  guest daily/campaign, çözüm, unlock, hint, reveal ve hesap geçişleri dahil.
- Minimum env production build, type-check ve lint geçti.

### Canlı test ortamına uygulama tamamlandı

Kullanıcı Railway oturumunu yeniledikten sonra doğru project/environment/service ve
veritabanı host'u doğrulandı. Yalnız `chic-optimism` projesinin **test** ortamındaki
`score-logic-app` servisi değiştirildi; production ortamı ve production DB ayarlarına
dokunulmadı. Web servisinin `AUTH_URL` değeri yanlışlıkla production domainini gösteriyordu;
test domainine düzeltildi ve `PUZZLE_CONTENT_MODE=test` tanımlandı.

Yeni kaynak snapshot'ı deploy edildi:

- Deployment: `5795cb90-f873-4569-b719-cfd43e581914` — **SUCCESS**.
- Adres: https://score-logic-app-test.up.railway.app/
- Canlı `/api/health`: HTTP 200; database/content `up`, Redis `disabled`.
- Canlı campaign API: **150 seviye**; Beginner/Easy/Medium/Hard/Expert ilk seviyeleri açık.
- Canlı daily API: HTTP 200; **2026-11-10**, **6 maç**.
- Canlı domain üzerinde **12 Playwright testi geçti**: guest daily ve campaign, doğrudan
  skor girişi, hint, reveal durumu, çözüm ve sonraki seviye erişimi, kayıt/merge,
  çıkış→guest→giriş sonrası history/draft korunması ve CSP.

Yeni kaynak CLI snapshot ile test ortamına yüklendi; GitHub'a commit/push yapılmadı.
Günlük test-content cron manifesti repoda hazır; ayrı cron servisi bu çalışmada kurulmadı.
Mevcut 15 günlük pencere sonrasında otomatik devam için bu cron bağlanmalı veya
`db:ensure-content`/yeni release çalıştırılmalıdır.

Canlı container'da salt-okuma sayımı ayrıca doğrulandı: **165 puzzle = 150 campaign +
15 daily**; daily aralığı **10–24 Kasım 2026**. Ayrı TinyFish guest browser doğrulamasında
Daily'nin final tablosu ve altı maçı açıldı; Beginner 1 iki hint sonrasında doğru çözüldü,
Beginner 2'nin açıldığı görüldü. [Canlı guest doğrulama kaydı](https://agent.tinyfish.ai/runs/28a008cb-facb-4ca5-b689-4cf47ed062ee).
Eski deployment'tan boş katalog cache'i tutan açık tarayıcı sekmesinin bir kez normal
refresh edilmesi yeterlidir; localStorage veya kullanıcı ilerlemesinin silinmesi gerekmez.

## 18. Hint getirisi, mobil sekmeler ve paylaşım daveti — 10 Kasım 2026

Kullanıcı bu üç iyileştirmeyi ayrıca uygulama kapsamına aldı. Önceki kapsam dışı
notlarından bağımsız olarak aşağıdaki davranışlar uygulanmıştır.

### Sorunlar ve çözümler

- **Hint çıkmazı:** Eski motor, uyumlu çözüm veya ortak boş hücre bulamadığında yalnız
  açıklama döndürüyordu. Artık uyumlu çözüm varsa ortak boş hücre önceliklidir; ortak
  hücre yoksa geçerli bir çözüm yolundan boş skor açılır. Hiç uyumlu çözüm yoksa verilen
  ve önceki hint skorları korunarak en az değişiklik isteyen yoldaki bir yanlış dolu
  hücre düzeltilir. Çoklu hatada her hint minimum uyuşmazlığı bir azaltır; tek hint ile
  bütün hataların giderildiği iddia edilmez. Tamamen doğru dolu tahtada Check önerilir,
  hint sayacı ve HINT_USED olayı artmaz. Sunucu kendi kayıtlı given/hint değerlerini
  istemci snapshot'ının üzerine geri koyar.
- **Mobil gezinme:** Eski nav `hidden sm:flex` yüzünden telefonda tamamen kayboluyordu.
  Home/Campaign/Daily/Stats mobil header'ın ikinci satırında sürekli görünür ve aktif
  sekme işaretlidir. Campaign seviyeleri telefonda beş sütun; seviye ve skor hedefleri
  en az 44 px. Skor satırları ve notlar dar ekrana göre düzenlendi; final tablo sütunları
  320 px için sıkıştırıldı. Hint/sonuç pencereleri dinamik viewport içinde kaydırılabilir.
- **Zayıf paylaşım:** Mesaj artık paket/seviye veya daily tarihi, tamamlanan attempt'in
  sunucu süresi, hint sayısı, spoiler içermeyen grid, meydan okuma metni ve **aynı puzzle**
  bağlantısını içerir. Replay süresi eski en iyi süreyle karıştırılmaz. Native paylaşım
  desteklenir; hata halinde clipboard ve son olarak seçilebilir metin sunulur. Davet
  alıcısının campaign seviye erişim kuralları korunur; referral/hesap daveti değildir.

### Doğrulama

- **301 unit test geçti**: yanlış dolu hücre düzeltme, çoklu hata, önceki hint/given
  korunması, ortak hücre yokken çözüm yolu açılması, doğru tam tahtada sayaç/olay
  oluşturmama, paylaşım kimliği/süre/URL ve mevcut regresyonlar dahil.
- TypeScript, lint ve opsiyonel Redis/telemetri servisleri kapalı minimum production
  build geçti. Yeni migration, paket veya zorunlu env yok.
- Playwright matrisi masaüstü Chromium, Pixel/Chromium ve iPhone/WebKit olarak genişletildi.
  Mobil kontroller ana sayfa, campaign, daily, stats, doğrudan puzzle, login ve register'ı
  **320 / 390 / 768 px** genişliklerde açar; yatay taşma, görünür sekmeler, dokunma
  hedefleri ve altı fixture'ın gerçekten çizildiğini denetler. Yanlış skor → hint
  düzeltmesi → çözüm → tam puzzle daveti ve clipboard hatası fallback'i ayrıca sınanır.
- Tarayıcı testleri cihaz emülasyonudur; fiziksel iPhone paylaşım paneli otomasyonu değildir.

- Production standalone üzerinde yerel HTTPS ile **42 Playwright testi geçti**; yalnız
  mobil senaryoların masaüstü projesindeki 3 kopyası bilinçli skip edildi. WebKit ve
  Chromium daily/campaign/stats ekran görüntüleri ayrıca incelendi.

### Test ortamına yayın

- Railway test deployment: `70e9a29f-6cd3-4801-9cc9-e4c634f150d7` — **SUCCESS**.
- Adres: https://score-logic-app-test.up.railway.app/
- Canlı healthcheck: HTTP 200; database/content `up`, Redis `disabled`.
- Yeni deployment'ın public HTTPS adresinde aynı matrisle **42 Playwright testi geçti**
  (3 masaüstü mobil-senaryo kopyası skip). iPhone/WebKit dahil mobil genişlikler, skor
  girişi, hint düzeltmesi, çözüm/unlock, davet mesajının süre/hint/URL içeriği, clipboard
  hatası, hesap geçişleri ve CSP canlı ortamda doğrulandı.
- Release içerik kontrolü mevcut 150 campaign ve 15 daily kaydını hazır buldu;
  `createdCount=0`, `activatedCount=0`. İçerik veya kullanıcı geçmişi sıfırlanmadı.
- Yalnız test ortamı güncellendi. Snapshot deploy kullanıldı; commit/push yapılmadı.

## 19. Hint akışı: anlaşılır onay ve tek eylem/tek hint — 10 Kasım 2026

### Yeniden oluşturulan sorun ve önceki testlerin açığı

Kullanıcı modalde hint alma eyleminin anlaşılmadığını ve bir hint isterken birden fazla
hint açıldığını bildirdi. Önceki tarayıcı testleri butona tek, aralıklı tıklamalar yapıyor;
aynı event-loop içindeki tekrarları veya sunucuda tamamlanan isteğin yanıtının kaybolmasını
sınamıyordu. Yeni hook regresyonu eski kodda **1 yerine 3 HTTP çağrısı** üreterek başarısız
oldu. `isPending` render'ı geciktiği için art arda çağrılar geçiyordu; API aggregate kilidi
bunları sıraya koyuyor ama her birini yeni hint olarak sayıyordu. Motor tek çağrıda bir
hücre döndürüyordu; sorun eylemin birden fazla kez işlenmesiydi.

Ayrıca mobilde Given badge gizliyken başlangıç skorları da hint skorlarıyla aynı mavi tonda
görünüyordu. Bu, başlangıçtaki çok sayıda skorun yeni hint gibi algılanmasına yol açabiliyordu.

### Uygulanan düzeltmeler

- Açıklama kutusu tıklanabilir eylem olmaktan çıkarıldı. Ayrı, belirgin **Use 1 hint**
  butonu, tek skor etkisi ve pencereyi açmanın hint tüketmediği açıklaması eklendi.
- Akış onay → bekleme → sonuç olarak ayrıldı. Beklemede buton kilitli; sonuçta yalnız
  **Back to puzzle** sunulur. İkinci hint için puzzle'a dönüp Hint yeniden açılır.
  Yeni açılış eski mesajı yeni alınmış hint sonucu gibi göstermez.
- Modal ve hook'ta eşzamanlı ref kilidi var; React pending render'ından önceki tekrarlar
  da engellenir. Hata sonrası kilit açılır ve açık bir retry eylemi gösterilir.
- Her eylem UUID `requestId` ve görülen `expectedHintCount` taşır. Aynı eylemin ağ tekrarında
  kimlik korunur. Sunucu attempt kilidi altında HINT_USED olayına kaydettiği yanıtı yeniden
  döndürür; yeni hücre/sayaç/olay oluşturmaz. Farklı eylem eski sayacı taşıyorsa 409 ile
  tahta yenilenir. Bu alanlar eski istemciler için opsiyoneldir; yeni UI her ikisini gönderir.
- Geciken autosave, istemci saati ileride olsa bile hint değerlerini veya reveal metadata'sını
  silemez/değiştiremez; bunlar sunucudan korunur. İstemci kendi kendine yeni hint hücresi
  işaretleyemez. Eski cached response yerelde daha yeni bir hint sayacını geri düşürmez.
- Given skorlar nötr/yeşil, hint skorları mavi olarak ayrıldı; erişilebilir skor kaynağı
  açıklaması eklendi. Hint mesajında takım, rakip ve home/away tarafı açıkça belirtilir.
- Yeni tablo/migration, paket veya zorunlu env değişkeni yok. Mevcut attempt event JSON'u
  tekrar-işleme yanıtını taşır; önceki progress ve kullanıcı geçmişi sıfırlanmaz.

### Canlıda yakalanan ek yarış

İlk yerel 48 browser testi geçti; ancak `425b46d0-f7b6-44b7-9462-ab1307fc8356`
test deployment'ında ikinci hint'in sonucu kayboldu. Arka plan progress yenilemesi
`isLoading` geçişiyle modal alt bileşenini yeniden oluşturuyor, modaldeki yerel sonuç
state'i onaya dönüyordu. Hücre/sayaç kaydedilmiş olmasına rağmen yeni hint butonu tekrar
görünüyordu. Sonuç snapshot'ı oyun ekranının state'ine taşındı; bu geçici alt bileşen
remount'unda artık kaybolmaz. Daily'nin 60 saniyelik arka plan yenilemesini kontrollü
ilerleten yeni test eski deployment'ta deterministik olarak başarısız oldu; bu senaryo
üç tarayıcı projesine eklendi. İlk deployment nihai başarı kaydı değildir.

Ağ hatası ile bu yenilemenin birleştiği senaryo da eklendi: arka plan read'i ilk hint'i
keşfedip sayacı artırınca retry kimliği değişmemelidir. Eski count-eşitliği kontrolü bu
durumda yeni UUID üretiyordu; unit testte yeniden oluşturulup kaldırıldı. Kimlik artık
aynı owner/attempt için açıkça yanıt alınana kadar korunur. Lost-response browser testi
retry'dan önce gerçek daily refetch yaptırarak bu birleşimi de doğrular. Bu test ayrıca
yeni yerel draft'ın sunucudaki daha yüksek hint sayısını/hücresini gizlediğini yakaladı.
Draft seçimi artık yeni yerel notları ve düzenlenebilir girdileri korurken sunucuda
alınmış ek hint'leri birleştirir; timestamp hint'i silemez. Ayrı store testi bu birleştirme
ve kilit korunmasını doğrular.

### Test kapsamı

- **304 unit test geçti**. Yeni testler render öncesi üçlü çağrının tek isteğe düşmesini,
  ağ hatasında aynı requestId'nin kullanılmasını ve onaylanmış sonraki hint'in yeni kimlik
  ve güncel sayacı taşımasını doğrular.
- **5 gerçek PostgreSQL integration testi geçti:** sekiz eşzamanlı aynı istekte tek hücre,
  tek hint ve tek HINT_USED; sonraki hint'ten sonra eski isteği tekrar gönderme; ayrı
  kimliklerle aynı board sayacını yarıştırma; geciken/eksik autosave'de hint'in korunması;
  çoklu yanlış dolu hücrede yalnız bir düzeltme; doğru tam tahtada tekrarda sıfır tüketim.
  Fixture ve kullanıcılar yalnız ayrı yerel test DB'sinde oluşturulup temizlenir.
- Yeni Playwright senaryoları üç tarayıcı projesinde modal aç/kapatın sıfır istek üretmesini,
  sekiz hızlı etkinleştirmenin yalnız bir hücre/sayaç değiştirmesini, bekleme kilidini,
  sonuçtan sonra ikinci isteğin bulunmamasını, kasıtlı ikinci açılışı, yenileme sonrası
  kalıcılığı, Given/hint ayrımını ve gerçek yanıt-kaybı sonrası güvenli retry'ı denetler.
- iPhone/WebKit ve Android Chromium dahil 320 px dar ekranda onay/sonuç pencereleri ve
  eylem görünürlüğü kontrol edilir. Tarayıcı emülasyonu kullanılır; fiziksel cihaz testi yapılmadı.
- TypeScript, lint ve Redis/telemetri kapalı minimum production build geçti.
- Nihai production standalone HTTPS koşusunda **51 Playwright testi geçti** (3 bilinçli
  skip). Lost-response testi retry öncesi gerçek refetch'i de içerir; hem bu birleşik
  senaryo hem açık modalde background refresh üç tarayıcıda doğrulandı. Daily/campaign,
  yanlış skor düzeltmesi, paylaşım, auth ve erişim regresyonları da bu koşuya dahildir.

### Nihai test deployment'ı

- Deployment: `c836f3ff-8ec4-46d4-97d3-deb420aa9e4c` — **SUCCESS**.
- Adres: https://score-logic-app-test.up.railway.app/
- Canlı readiness: HTTP 200; database/content `up`, Redis `disabled`.
- Nihai public HTTPS domaininde **51 Playwright testi geçti** (3 bilinçli skip).
  Hızlı tekrar, kayıp yanıt + refetch + retry ve açık modalde arka plan yenilemesi dahil
  bütün yeni hint senaryoları masaüstü Chromium, Android Chromium ve iPhone/WebKit'te
  doğrulandı. Mevcut daily/campaign, auth, paylaşım, unlock ve mobil regresyonları geçti.
- Yalnız Railway **test** ortamına snapshot deploy yapıldı; production ortamı değişmedi.
  Yeni migration/env/dependency yok; kullanıcı ilerlemesi ve mevcut içerik sıfırlanmadı.
- Kod commit/push edilmedi. Ürün kuralları ve API sözleşmesi de güncellendi.

## 20. Hint modalinin otomatik açılması, daily gün devri ve 120 dakika sınırı — 12 Kasım 2026

### Tespit ve çözüm

- **Hint penceresi:** Önceki tasarım başarıdan sonra sonuç ekranını aynı modalde tutuyordu;
  arka plan yenilemesindeki yeniden çizimler pencereyi yeniden açılmış gibi gösteriyordu.
  Başarılı hint yanıtı artık ilgili modal oturumunu kapatır; mesaj oyun ekranındaki status
  alanında kalır. Modal yalnız açık bir Hint butonu eylemiyle açılır. Oturum ve puzzle
  kimliği kontrolü, eski bir isteğin yeni pencereye/günlük oyuna etki etmesini engeller.
  Hata durumunda pencere retry için açık kalır; tek-hint/idempotency korumaları korunur.
- **Gün değişimi:** Görünen timer state'i puzzle kimliği taşımıyordu. Ayrıca eski timer
  effect cleanup'ı yeni yüklenen süreyi ezebiliyordu; hook regresyonunda 9000 saniyelik
  durumu 0'a düşürmesi yeniden oluşturuldu. Ekran saati artık puzzle kimliğine bağlıdır;
  cleanup yalnız halen sahibi olduğu clock snapshot'ını durdurabilir. Yeni daily'de
  önceki ilerleme yoksa süre 0'dan başlar; eski günün girdileri/notları/süresi saklanır.
- **120 dakika:** Sunucu `authoritativeElapsedTimeSec` içinde 7200'e kırpıyor, beş Zod
  süre alanı 7200 üstünü reddediyordu. Tarayıcı timer'ı ilerlediğinde Check/Reveal ve
  autosave bu yüzden 400 alabiliyordu. Oyun süresi sınırı kaldırıldı. Bütün süre alanları,
  istemci timer normalizasyonu ve sunucu ölçümü PostgreSQL Int kapasitesiyle uyumludur
  (2.147.483.647 saniye; oyun süresi politikası değildir). Resmi süre halen sunucuya aittir.
  Eski aktif attempt 7200'de kaydedilmiş olsa da başlangıç tarihiyle gerçek süre hesaplanır.
- **Türetilmiş istatistikler:** Difficulty observation tablosunun median/p75 CHECK
  constraint'i de 7200 sınırı taşıyordu. `20261112120000_extend_solve_time_range` migration'ı
  yalnız bu üst sınırı kaldırır; negatif süre ve p75 >= median koşulları korunur.
  Mevcut kullanıcı/ilerleme kayıtları sıfırlanmaz ve eski tamamlanmış süreler yeniden yazılmaz.

### Doğrulama

- **315 unit test geçti:** eski saatin yeni daily render'ına sızmaması, eski draft'ın
  korunması, sunucu süresinin 7200 sonrasında ilerlemesi, 7200/7201/9001/172800 saniyelerin
  istek/state/response şemalarında kabulü ve geçersiz sürelerin reddi dahil.
- **7 PostgreSQL integration testi geçti:** 150 dakikayı aşmış gerçek attempt'te autosave,
  Reveal ve Check; istemcinin 99999 iddiası yerine sunucunun ~9001 saniyesinin saklanması;
  aynı uzun sürenin median/p75 kalibrasyon kayıtlarına yazılması ve önceki hint yarışları.
- Migration ayrı yerel test DB'sine uygulandı. TypeScript, lint ve opsiyonel servisler
  kapalı minimum production build geçti.
- Playwright'ta başarılı hint'in otomatik kapanması, refresh sonrası kapalı kalması,
  ağ hatası/retry, tarayıcı saati 150 dakikadayken Check/Reveal ve açık tabda gerçek
  yayımlanmış ertesi gün puzzle'ına geçişte timer/notes/modal ayrımı sınanır.
  Tarayıcı saatini ilerletme UI testidir; gerçek sunucu süresi ayrı integration testinde
  attempt başlangıcını 9001 saniye geriye alarak doğrulanır.

- Production standalone HTTPS'te **60 Playwright testi geçti** (3 bilinçli skip).
  Masaüstü Chromium, Android Chromium ve iPhone/WebKit'in üçünde de yeni hint/timer
  senaryoları ve mevcut auth/paylaşım/erişim regresyonları doğrulandı.

### Canlı test ortamı

- Deployment: `0272ac46-b1b2-4ce8-8cb8-894f508c9a47` — **SUCCESS**.
- Adres: https://score-logic-app-test.up.railway.app/
- Canlı readiness HTTP 200: database/content `up`, Redis `disabled`.
- Public HTTPS domaininde **60 Playwright testi geçti** (3 bilinçli skip). Masaüstü,
  Android Chromium ve iPhone/WebKit'te modalin otomatik kapanıp kapalı kalması, 150 dakika
  sonrası Check/Reveal ve açık daily sekmesinin gerçek ertesi gün puzzle'ına sıfır timer
  ile geçmesi doğrulandı. Mevcut paylaşım/auth/erişim testleri de geçti.
- Servisten salt-okuma SQL ile migration `applied=true` doğrulandı. Gerçek constraint
  tanımında artık 7200 üst sınırı yok; yalnız negatif olmama ve p75 >= median korunuyor.
- Yalnız Railway **test** ortamı değiştirildi; production ortamına dokunulmadı.
  Kaynak snapshot ile yayımlandı; commit/push yapılmadı. Yeni env veya paket gerekmiyor.
