# ScoreLogic — Faz 1 Mobil UX Spesifikasyonu

> Tarih: 12 Kasım 2026
> Kapsam: Mobil ekranlar, etkileşimler, erişilebilirlik ve kullanılabilirlik denemesi.
> Tasarım temeli: [Mobil dönüşüm planı](../mobil-uygulama-donusum-plani-2026-11-12.md), [kanonik ürün kuralları](../product-rules.md).
> Durum: UX prototipi uygulandı; [teslim/otomasyon kaydı](faz-1-uygulama-raporu.md) hazır. İnsan katılımcılı deneme, native uygulama ve fiziksel cihaz kabulü tamamlanmış değildir.

## 1. Kararlar ve bu fazın sınırı

İlk tasarım adayı **A: final tablo oyun ekranında**, giriş yöntemi ise **sistem numeric klavyesini kullanan skor alanı**dır. Tarayıcıdaki tıklanabilir prototipte B tablo sheet'i ve özel score pad karşılaştırma kontrolleri bulunur. Bu kontroller ürün ayarı değildir; inceleme araçlarıdır. A kararı 5–8 kişilik görev denemesinden ve native klavye PoC'sinden sonra yeniden değerlendirilebilir.

Ürün metinleri mevcut uygulamayla tutarlı biçimde İngilizcedir. Bu Türkçe belge geliştirme ve değerlendirme içindir. Dört ana sekme Home, Campaign, Daily ve Stats; Account ve Help ayrı stack ekranlarıdır. Mevcut açık tema ve sıcak yüzey/saha yeşili kimliği korunur.

Faz 1 çıktıları:

- [Tıklanabilir tarayıcı prototipi](../../prototypes/mobile/index.html): tasarım, gezinme ve tanımlanmış örnek durumların incelenmesi.
- Bu ekran/state, bileşen ve kabul sözleşmesi.
- Henüz uygulanmamış insan denemesi senaryosu ve boş değerlendirme formu.
- Gerçek varlık/font envanteri; eksik native/store varlıkları listesi.

Prototip gerçek giriş, guest merge, sunucu doğrulaması, kalıcı command outbox, mağaza signing, Universal/App Links veya native OS lifecycle kanıtı değildir. Örnek skor/başarı/hata durumları **scripted tasarım verileridir**; canlı servise gameplay yazılmaz. Daily tarihi sabittir; gün devri bu prototipte uygulanmadı. P01–P20 kapsamının tamamı aşağıda tasarlanır, fakat gerçek servis ve cihaz kabulü ilgili sonraki fazlarda yapılır. Backend-only P20 için oyuncuya admin ekranı eklenmez.

Push, reklam/ödeme, sosyal giriş, leaderboard, multiplayer, dark mode, yeni dil ve tam offline solver bu fazın kapsamına alınmaz. Hesap/guest silme, privacy/support ve native session durumları mobil teslim gereksinimi olarak tasarlanır; bugün çalışan endpoint varmış gibi sunulmaz.

## 2. Kaynak kodla ilişki

| Mevcut kaynak | Korunacak karar / iyileştirilecek sunum |
|---|---|
| [DailyPuzzleExperience](../../components/puzzle/DailyPuzzleExperience.tsx) | Aynı daily/campaign oyun, hint başarıda kapanışı, feedback, best/official sonuç ve replay; ekran orkestrasyonu küçük native parçalara ayrılır |
| [PuzzleHeader](../../components/puzzle/PuzzleHeader.tsx) | Puzzle kimliği, süre/hint/streak ve campaign komşu seviyeleri korunur; yoğun başlık kompakt HUD'a dönüşür; görünür hata sayısına `Errors` denir |
| [FixtureGrid](../../components/puzzle/FixtureGrid.tsx), [ScoreCell](../../components/puzzle/ScoreCell.tsx) | Altı maç, on iki skor, 0–19/boş, verilen/hint/cevap kilidi ve 180 karakter not; dokunma/klavye/odak yeniden tasarlanır |
| [StandingsTable](../../components/puzzle/StandingsTable.tsx) | Değişmez P/W/D/L/GF/GA/Pts; küçük fonta sıkıştırmak yerine alternatif erişilebilir okuma |
| [HintModal](../../components/puzzle/HintModal.tsx) | Ayrı `Use 1 hint`, pending/retry, ücretsiz açma/kapatma ve başarılı istekte kapanma aynen korunur |
| [AnalyzeBoard](../../components/puzzle/AnalyzeBoard.tsx) | Bilinçli kullanıcı eylemi, guided/assisted ve SAT/UNSAT/UNKNOWN; 650px minimum tablo telefonda takım/metrik kartına dönüşür |
| [CampaignProgress](../../components/game/CampaignProgress.tsx), [campaignConfig](../../lib/puzzles/campaignConfig.ts) | Beş pack/otuz level; prefill, feedback, completion ve erişim politikaları |
| [StatsExperience](../../components/stats/StatsExperience.tsx) | Mevcut bütün gösterilen metrikler, zorluk dağılımı ve son altı attempt |
| [LoginForm](../../components/auth/LoginForm.tsx), [RegisterForm](../../components/auth/RegisterForm.tsx) | E-posta/şifre ve guest devam; owner izolasyonu, gerçek servis aşamasında korunur |
| [IntroPopup](../../components/game/IntroPopup.tsx), [Home](../../app/(game)/page.tsx) | Futbol bilgisi gerektirmeyen açıklama ve worked example; Help içinde tekrar erişilebilir |
| [VictoryScreen](../../components/puzzle/VictoryScreen.tsx), [share](../../lib/utils/share.ts) | Tamamlanan attempt süresi/hint'i, exact puzzle link, spoilersız davet ve iptalde yan etkisizlik |
| [puzzleStore](../../store/puzzleStore.ts), [usePuzzle](../../hooks/usePuzzle.ts) | Taslak, readonly assistance, timer ve response sahipliği; native storage/lifecycle sonraki fazlarda adaptör ister |

Kaynakta bulunan [NumPad](../../components/puzzle/NumPad.tsx) şu anda oyun ekranından kullanılmıyor. Prototipteki özel pad karşılaştırması mevcut kullanıcıya sunulan bir özelliğin taşındığı anlamına gelmez.

## 3. Ekran ve state matrisi

Her ekranın state'i yükleme, veri yok, hata ve gerçek içerik arasında açıkça ayrılır. Hata durumunda normal içeriğin yerinde uydurma sıfırlar veya başarı sunulmaz.

| Ekran | Ana içerik ve eylem | Gerekli durumlar | Sonraki ekran / toparlanma |
|---|---|---|---|
| Home | Bugünkü puzzle, `Play today` / `Continue`, campaign devam, `How to play` | İlk guest, kayıtlı draft, solved today, loading, daily unavailable, cache/offline | Daily, son açık campaign, Help; unavailable durumda `Try again` |
| Campaign | Beş pack, solved/revealed ilerleme, `Continue campaign` | Loading, ready, kısmi ilerleme, all cleared, empty/content unavailable, error | Pack detayı; yalnız açık seviye oyuna gider |
| Pack detayı | 1–30 level; Intro/Development/Finale; durum açıklaması | Locked, unlocked, in progress, clean, hints, many hints, answer shown | Puzzle; geri campaign; kilitli level açıklaması erişim sağlamaz |
| Daily / campaign oyun | Kimlik, süre/hint, değişmez tablo, altı maç, Check, Hint, More | Loading, active, saving/saved/unsynced, failed check, pending/unknown command, solved, revealed, replay, content error | Hint/Reveal/Reset/Analyze/Result; durum mesajı oyun bağlamında kalır |
| Table sheet — B | Aynı final tablo ve takım/metrik açıklaması | Open, large font, landscape | Kapatınca aynı fixture ve odak geri gelir |
| Match note | Takım/rakip, not alanı, sayaç, `Save note` | Empty, editing, 180 sınırı, dirty, save error | Save veya açık discard/keep kararı; aynı maça dönüş |
| Hint sheet | Ne değişeceği, kullanılan hint, `Use 1 hint` | Confirm, pending, error/retry, no-change/Check yönlendirmesi | Başarıda otomatik kapanır; değişen hücre ve tek sonuç mesajı görünür |
| Reveal confirmation | Cevabı göstermek normal solve/unlock sağlamaz | Confirm, pending, error/unknown | Cancel board'u korur; onaylı sonuç revealed board |
| Reset/replay confirmation | Yeni attempt ve korunacak resmi geçmiş açıklaması | Active reset, solved replay, revealed replay, pending, error/unknown | Cancel değişiklik yapmaz; başarı yeni attempt |
| Analyze | Guided/assisted snapshot; takımda hedef/girilen/kalan | Pending, SAT, UNSAT, UNKNOWN, error, stale | Kapat; girdiler değiştiyse yeniden çalıştır; çözüm önerisi gösterilmez |
| Result | Puzzle kimliği, bu attempt'in süresi/hint'i, `Share result`, devam | Normal solve, campaign best bilgisi, replay, share pending/fallback | Close board; campaign Next; native share sonraki faz |
| Stats | Dört ana metrik, ikincil metrikler, difficulty split, son altı kayıt | Loading, empty, ready, error, owner mismatch/session expired | Retry; daily/campaign; mevcut kapsam dışında tam geçmiş eklenmez |
| Login / Register | E-posta, şifre, açık submit, guest devam | Empty, invalid, pending, rejected, expired session, registered/login failed | Geldiği puzzle/link niyetine geri dön; merge hatasında guest kaybolmaz |
| Account | Guest/account durumu, giriş/çıkış, veri silme, privacy/support/build | Guest, authenticated, logout pending, deletion confirm/pending/done/error | Başka owner verisi gösterilmeden uygun ana ekran |
| Help | Temel kurallar, tablo terimleri, worked example, hint/check/reveal farkı | İlk rehber, tekrar açılan rehber, büyük font | Back bulunduğu sekme/puzzle'a döner |
| Ortak hata/erişim | Offline, bakım, içerik eksik, locked/missing/retired link, update required | Retry mümkün/mümkün değil, cache var/yok | Açık retry/back; yeni attempt veya sahte unlock oluşturmaz |

Bir state'in bu matriste bulunması prototipte bütün sunucu hatalarının birebir üretildiği anlamına gelmez. Uygulama ve servis testinde eksik kalan state, parity kontrol listesine açık iş olarak kaydedilir.

## 4. P01–P20 gezinme ve davranış paritesi

| ID | Kullanıcı yolu / UX sözleşmesi | Gerçek kabulün yeri |
|---|---|---|
| P01 | İlk açılış → guest → Home → Daily veya her pack'in level 1'i; hesap zorlaması yok | Prototipte yol; native guest credential ve servis erişimi Faz 3–6 |
| P02 | Home → Help → kurallar/örnek → Back; kullanıcı rehberi yeniden açabilir | Faz 1 içerik/gezinti; native erişilebilirlik Faz 5–8 |
| P03 | Daily tab → sunucunun Europe/Istanbul business-date puzzle'ı → devam | Faz 1 daily state tasarımı; gerçek server date Faz 3–5 |
| P04 | Campaign → pack → açık level → Previous/Next/Packs; pack sınırındaki komşu açık level korunur | Prototip görsel durumları; unlock/locked deep link Faz 3–6 |
| P05 | Beginner 1–3: 5 given maç; 4–15: 4; 16–30: 3. Easy 3, Medium 2, Hard 1, Expert 0 | Tasarımda bütün varyantlar; config/fixture regresyonu Faz 5 |
| P06 | Table → skor düzenleme → Table; P/W/D/L/GF/GA/Pts ve sıra/skor hedefleri değişmez | Prototip + native a11y; canonical DTO Faz 3–5 |
| P07 | Maç → home/away → 0/9/10/19 veya boş → not düzenle → Save note | Prototip; native keyboard ve persistence Faz 2/4/5 |
| P08 | Skor/not → saved/unsynced → app restart → aynı owner draft | Faz 1 state dili; kalıcı storage/outbox Faz 4–7 |
| P09 | Hint → ücretsiz açıklama → `Use 1 hint` → tek pending → sheet kapanır → tek hücre/mesaj | Prototip etkileşimi; requestId/receipt/lost-reply Faz 3–7 |
| P10 | Tam board → Check → pack feedback veya herhangi bir geçerli çözüme başarı | Prototip örnekleri; gerçek solve-any sunucu ve entegrasyon Faz 3–5 |
| P11 | More → Reveal answer → açık confirmation → revealed board; solve/unlock yok | Prototip ayrım; terminal state ve canonical stats Faz 3–5 |
| P12 | Beginner 1–3 guided / 4–15 assisted → Analyze; kalan seviyelerde eylem yok | Prototip varyant; server gate ve SAT/UNSAT/UNKNOWN Faz 3–5 |
| P13 | More → Reset/Replay → confirmation → yeni attempt; history/best/first korunur | Prototip niyet; retry-safe attempt ve unique solve Faz 3–5 |
| P14 | Uzun süre / background → resume / ertesi gün → doğru puzzle saati | Prototip örnek state; server wall time, >120 dk ve lifecycle Faz 2–7 |
| P15 | Stats → solved/streak/perfect/avg + successful/total/first-try/reveal + difficulty | Prototip bütün mevcut gösterimler; canonical eşitlik Faz 3–6 |
| P16 | Stats → son altı attempt kimlik/durum/hint/attempt/süre; boşken empty state | Faz 1 sunum; doğru account/progress kaynağı Faz 3–6 |
| P17 | Guest → Login/Register → merge → önceki niyet; Account → logout → guest → başka hesap | Prototip gezinme; güvenli auth/merge/owner isolation Faz 3–7 |
| P18 | Result → Share → exact puzzle HTTPS link; cancel board'u/clipboard'u değiştirmez | Prototip metin/davet; native sheet + Universal/App Links Faz 2/7 |
| P19 | Loading/error/empty/offline → açık retry/back; Help her an erişilebilir | Faz 1 tasarım; gerçek retry/reconnect ve a11y Faz 4–8 |
| P20 | Oyuncu içerik yoksa açıklama görür; QA/editorial/buffer/backup ekranı consumer app'e eklenmez | Sunucu operasyonları mevcut backend'de; readiness Faz 0/3/9 |

### 4.1 Navigation kuralları

- Her ana sekme kendi ekran ve scroll bağlamını korur. Tab değiştirmek reset, logout veya yeni attempt değildir.
- Campaign oyunu Campaign stack'inde; Daily oyunu Daily stack'inde açılır. Paylaşılan link'in modu public puzzle metadata'sından belirlenir.
- Profile/Help açma, aktif puzzle'ı silmez; Back orijinal ekran ve hücreye döner.
- Keyboard açıksa geri önce keyboard'u; sonra açık sheet'i; sonra stack ekranını kapatır. Aynı event iki katmanı birden kapatmaz.
- Locked Previous/Next atlanarak istemcide unlock üretilmez. Sunucunun izin verdiği komşu açık puzzle ve pack adı gösterilir.
- Başarı sonrası Next eylemi yalnız erişime açık campaign hedefi için görünür. Reveal sonrası otomatik Next/unlock yoktur.
- Çözüm verilmiş puzzle'da Result'ı kapatmak otomatik Replay başlatmaz. Replay ayrı bilinçli eylemdir.

## 5. Görsel ve bileşen sözleşmesi

### 5.1 Ölçüler ve tokenlar

Tıklanabilir prototipte bütün interaktif hedefler **en az 48×48 CSS px** olur. Native karşılıkta iki platformda da en az 48dp/pt proje hedefi kullanılır; görünür ikon 20–24 olabilir. Erişim alanları birbirinin üstüne binmez. Level hücreleri, profil/yardım, modal kapatma ve Previous/Next bu kuraldan muaf değildir.

| Token / kullanım | Başlangıç ölçüsü | Davranış |
|---|---|---|
| Body | 16, satır yüksekliği 1,5 | Sistem metin ölçeğine açık |
| Yardımcı metin | 14, satır yüksekliği ≥1,4 | Hedef veri/eylem için 9–11px etiket kullanılmaz |
| Ekran başlığı | 24–28, satır yüksekliği ≥1,15 | Mobilde uzun hero yerine kompakt başlık |
| Section | 18–20 | Başlık sayısı ve görsel hiyerarşi sınırlı |
| Skor | 24; tabular numeric | En az 48 kare hit alanı; iki basamak sığar |
| Timer/metrik | 16–18; tabular numeric | Süre büyüyünce kırpılmaz; 120+ dk ve saat gösterimi denenir |
| Kenar boşluğu | Telefon 16; büyük ekran 24 | Safe-area alanına ilave uygulanır |
| Spacing | 4/8/12/16/24/32 | Metrikler, listeler ve aksiyonlar ortak ritim kullanır |
| Yüzey/radius | Sıcak açık zemin; beyaz/soft yüzey; 12/16 | Renk tek durum taşıyıcısı değildir |

Başlangıç paleti mevcut `globals.css` tokenlarından gelir: ink `#17211b`, muted `#66746b`, field `#2f6f45`, blue `#315f8d`, answer `#9a3412`, danger `#b7433f`, paper `#f7f5ef`. Her foreground/background kombinasyonu ve disabled/focus state ayrıca ölçülür; kaynak rengin bulunması kontrastı doğrulamaz. Proje kabul hedefi normal metinde 4,5:1, büyük metin ve bilgi taşıyan non-text kontrollerde 3:1'dir. Ölçülmemiş kombinasyon geçti diye işaretlenmez.

### 5.2 Bileşenler

| Bileşen | İçerik / eylem | Kabul |
|---|---|---|
| AppShell / TabBar | Dört tab, profil/yardım, güvenli alan, online/sync bağlamı | Aktif tab isim ve durumla okunur; ekran/keyboard arkasında kalmaz |
| ScreenHeader / PuzzleHUD | Back/Packs, kısa puzzle kimliği, süre ve hint; gerekirse streak | Tek primary görev; büyük fontta wrap; timer her saniye announce edilmez |
| StandingsSummary / TeamRow | Final Table ve sıra, takım, P/W/D/L/GF/GA/Pts | Immutable; takım+metrik+değer birlikte okunabilir; statik tabloya sahte editable grid semantiği verilmez |
| FixtureRow | İki takım/kod, skorlar, not özeti, durum işareti | Uzun takım adı erişilebilir etikette tamdır; renksiz kullanımda Given/Hint/Answer/Error anlaşılır |
| ScoreInput | 0–19 / null, home/away, fixed/entry/error state | Düzeltilebilir alanlar arasında sıra; 1 yazınca otomatik ilerleme yok; 10/19 tamamlanabilir |
| ScorePad — karşılaştırma | 0–9, Delete, previous/next, Done | Bir input yöntemi açık; keyboard/screen reader alternatifi; kullanıcı girişini çözüm diye onaylamaz |
| MatchNoteSheet | Maç kimliği, çok satır not, 0–180 sayaç, Save/Cancel | 181'inci karakter alınmaz; uzun notta imleç görünür; cancel dirty notu sessiz kaybetmez |
| PuzzleActionBar | Check primary, Hint secondary, More içinde Reveal/Reset | Açık etiket; pending tek işlem; metin büyüyünce dikey düzen |
| HintSheet | Açıklama, kullanılan sayı, Use 1 hint / Retry 1 hint | Açma ücretsiz; tek onay; başarıda kapanış; no-change isteği ücret sayılmaz |
| ConfirmSheet | Reveal ve Reset/Replay için farklı başlık/sonuç/CTA | Destructive işlemin adı CTA'da; Cancel varsayılan güvenli çıkış |
| FeedbackNotice | Check, hint, offline/sync ve hata | Olay başına bir duyuru; pack kuralından fazla hücre/çözüm bilgisi yok |
| AnalyzeScreen | Takım kartları; hedef/girilen/kalan; genel sonuç | UNKNOWN yanlış diye etiketlenmez; input değişiminde stale; otomatik solver çağrısı yok |
| ResultSheet | Bu attempt süresi/hint/puzzle, Share, Close/Next | Eski best süre yeni attempt süresi gibi gösterilmez; paylaşım spoiler içermez |
| AccountField | Kalıcı label, input, açıklama/alan hatası | Autofill, email keyboard, password; hata alanla ilişkilendirilir ve tek kez duyurulur |
| Loading/Empty/Error | Açıklama + gerekliyse Retry/Back | Hata state'i sıfır metriklerle normal ekran gibi gösterilmez |

## 6. Tablo A/B ve klavye kararı

| Seçenek | Kazanım | Bedel / kontrol | Başlangıç kararı |
|---|---|---|---|
| A: inline tablo | Kaynak hedef ekranda; ilk öğretimde tablo–skor ilişkisi görünür; sheet açma gerektirmez | Kısa ekranda dikey alan tüketir; keyboard açılınca seçili fixture görünürlüğü korunmalı; tablo tüm viewport'u kilitlememeli | Varsayılan; 5–8 kişilik deneme bekleniyor |
| B: table sheet | Fixture ve aksiyonlara daha çok alan; küçük ekranda kolay giriş | Tekrarlı aç/kapa ve hafızada metrik tutma; sheet'i kapatınca odak/scroll dönüşü; her metrik için fazla dokunma riski | İnceleme kontrolü; insan görev verisiyle karşılaştır |
| Sistem numeric input | Autofill/erişilebilir odak, platform alışkanlığı; az özel davranış | Keyboard yüksekliği ve Done/Next farkları; gerçek iOS/Android testi şart | Varsayılan; tarayıcı keyboard'u native PoC kanıtı değildir |
| Özel score pad | Alan ve geçiş kontrolü, 0–19 için tutarlı affordance | Screen reader, harici keyboard, iki basamak ve silme yükü; native input ile çifte keyboard riski | İnceleme karşılaştırması; varsayılan yapılmadı |

Final Table **her zaman kaynak hedef**tir: skor girerken değerleri azalmaz, yeşil/kırmızı doğruluk tablosuna dönüşmez. A'da pinleme yalnız içerik için yeterli alan kaldığında etkin olabilir; büyük font/landscape keyboard durumunda normal scroll'a dönebilir. B'de açıkça `Final table` yazan tek dokunuşlu kontrol kullanılır; yalnız küçük simgeyle gizlenmez.

Tablet ve landscape, otomatik iki panel demek değildir. İki panel ancak font ölçeği, açık keyboard, kullanılabilir en/boy ve menteşe sonrası her bölüm okunabilir kaldığında seçilir. Dar landscape ve iPad split view tek panele dönebilir. Tablo ve fixture panellerinde odak sırası anlamlıdır; panel resize seçimi/notu silmez.

## 7. Kritik etkileşimler ve İngilizce metin sözleşmesi

### 7.1 Hint: bir onay, bir sonuç

1. Oyuncu `Hint` açar. Açmak/kapatmak ağ isteği veya hint sayımı değildir.
2. Sheet metni: `Reveal one empty score or correct one conflicting score. Given scores and earlier hints stay unchanged.` Ayrı primary CTA: `Use 1 hint`.
3. Bir kez basınca CTA `Getting your hint…` olur ve tekrar etkinleşmez; açıklama metni buton gibi davranmaz.
4. Başarıda sheet otomatik kapanır; değişen hücre görünür alana getirilir, hint işareti ve kilit görünür. Sonuç mesajı takımı/rakibi/home–away tarafını açıklar. Bir hücre değişir ve gerçek hint sayısı bir artar.
5. Bütün girdiler zaten geçerliyse `Your scores already fit. Use Check to finish.`; hint tüketilmez. Bu no-change sonucu başarısızlık gibi sunulmaz.
6. Hata olursa sheet açık kalır, okunur hata ve `Retry 1 hint` gösterilir. Aynı isteğin kimliği servis katmanında korunmalıdır; yeni kimlik üretmek UX retry davranışı değildir.
7. App resume, günlük refetch, restore veya bu sonuç mesajının render edilmesi sheet'i tekrar açamaz. Yalnız yeni açık Hint eylemi açabilir.

Başarı sonrası odak kapanan butona gönderilip kaybolmaz: değişen skorun okunabilir durumuna veya board sonuç mesajına taşınır. Readonly verilen/hint hücreleri erişilebilir okunur fakat edit döngüsünde düzenlenebilir gibi sunulmaz.

### 7.2 Check, Reveal ve Reset birbirinden ayrı

| Eylem | Öncesi / metin | Sonuç |
|---|---|---|
| Check | Primary `Check`; eksik skor varsa neden tamamlanamadığı açıklanır | Başarılı submit → Result; yanlış → pack'e uygun feedback, board korunur |
| Reveal | More → `Reveal answer`; başlık `Reveal the answer?`; açıklama `This shows an answer. It will not count as a solve or unlock the next level.`; CTA `Reveal answer` | Onaylı örnek cevap; normal completion yok; Cancel değişiklik yapmaz |
| Reset | More → `Reset board`; başlık `Reset this attempt?`; skor/not etkisi açıkça gösterilir; CTA `Reset board` | Yeni attempt; önceki resmi completion/best/history/unlock korunur |
| Replay | Solved/revealed board → `Replay puzzle`; açıklama `Start a new attempt. Your saved history stays.` | Yeni attempt; unique solved artmaz; normal başarı uygunsa best güncellenebilir |

Skor girişinde canlı correctness veya constraint rengi üretilmez. Check feedback: Beginner/Easy yanlış hücre; Medium yanlış maç; Hard yalnız error count; Expert yalnız correct/wrong. Daily geri bildirimi mevcut sunucu sözleşmesinden gelir. `Errors`, görünen hata sayısıdır; gerçek submission sayısı olmayan değere `Checks` denmez.

Reset her board'da açık menüden bulunur; önce hint almak veya yanlış check yapmak gerekmez. Onay beklerken klavye kapanabilir ama draft sessiz sıfırlanmaz.

### 7.3 Süre, sync ve sonuç

- `Elapsed time`, sunucudaki attempt wall-time semantiğini temsil eder. Background süresini UI tarafında düşürerek resmi sonucu değiştirme kararı verilmez.
- 120 dakikada sayaç/CTA sonlanmaz; örneğin `2:30:00` görünümü taşmadan desteklenir.
- Yeni daily önceki günün not/skor/süresini **eski puzzle kimliğinin taslağında** korur. Yeni puzzle'ın kendi geçmişi yoksa kendi timer'ı sıfırdan başlar; eski hint sheet'i kapalıdır.
- `Saving…`, `Saved`, `Saved on this device — waiting to sync`, `We couldn't confirm that action. Reconnecting…` durumları ayrıdır. Sonuncusu yeni hint/submit yapma teşviki değildir.
- Result bu attempt'in süre/hint'ini gösterir; best ve official sonuç gerekiyorsa ayrı etiketlenir. Davette puzzle pack/level veya daily date, süre, hint, spoilersız grid, challenge metni ve HTTPS `/puzzles/<id>` bulunur.
- Native share başarısı gerçekten bir mesaj gönderildiği anlamına gelmez. Cancel clipboard veya board'u değiştirmez; erişilemeyen share için seçilebilir davet/kopyalama fallback'i tasarlanır.

## 8. Erişilebilirlik, güvenli alan ve uyarlanabilirlik

- Üst status bar/notch, alt home indicator/Android navigation, landscape yan inset ve keyboard alanı AppShell'de tek kaynaktan yönetilir; aynı inset iki kez eklenmez.
- Primary action sabitse içerik alt padding'i action bar + tab bar + safe area'yı karşılar. Keyboard açılınca yalnız gereken bar görünür tutulur; boşluklar ve input'un üstü/altı gerçek cihazda denenir.
- En az %200 fontscale'de bütün görevler yapılır. Tek satırlı kontrol sığmıyorsa wrap/stack; truncation tam anlam için tek çözüm olamaz. Tablo okunamazsa takım bazlı metrik detayı sunulur; bilgi silinmez.
- VoiceOver/TalkBack skor etiketi takım + rakip + home/away + değer + editable/given/hint/answer durumunu içerir. Boş skor `0` diye okunmaz.
- Readonly tablo satırı takım kimliğiyle ilişkilidir. Kullanıcı bir hücrenin ne olduğunu anlamak için sütun başlığını hafızada tutmak zorunda bırakılmaz. Tablo metrik açıklamaları Help'ten erişilebilir.
- Modal/sheet açılınca başlık/uygun ilk kontrol odak alır; arka ekran okuyucu odağından çıkarılır. Odak modal kapsamında kalır; Escape/Android back/Close tutarlı kapanış sağlar ve odak mantıklı kaynağa döner.
- Hint/Check/bağlantı sonucu olay başına bir kez duyurulur; timer her saniye canlı duyuru yapmaz. State restore ve refetch eski sonucu yeni olay gibi duyurmaz.
- Harici keyboard ile tab sırası, skorlar, not, Hint/Check/More, dialog confirm/cancel ve ana gezinme çalışır; keyboard odak göstergesi görünürdür.
- Reduce Motion açılınca slide/scale/shake kaldırılır veya minimuma iner; hata yalnız sallantı/renkle anlatılmaz.
- Fold/unfold, pencere resize, portrait/landscape ve iPad split view taslak/not/odak bağlamını korur. Menteşe üstüne interaktif hedef yerleştirilmez.

Tarayıcı prototipinde viewport/CSS ve DOM erişilebilirliği incelenebilir. Native safe area, TalkBack/VoiceOver focus API'si, OS numeric keyboard, resize ve sistem geri davranışının kabulü Faz 2–8 fiziksel cihaz doğrulaması gerektirir.

## 9. 5–8 kişilik kullanılabilirlik denemesi

### 9.1 Katılımcı ve düzen

Bu deneme **planlanmıştır, yapılmamıştır**. 5–8 katılımcı: hem mevcut/benzer puzzle deneyimi olan hem ilk kez gören kullanıcılar; iOS/Android dağılımı; en az iki küçük ekran; erişilebilirlik deneyimi olan kullanıcı mümkünse dahil edilir. VoiceOver/TalkBack teknik kabulü yalnız gönüllü sayısına bağlı bırakılmaz, ayrıca uzman görev testi yapılır.

Her oturum 30–40 dakika. Katılımcıya gerçek hesap/şifre veya kişisel not girdirilmez; test kimliği ve örnek metin kullanılır. Kayıt ancak açık rızayla alınır. Moderatör tasarımı açıklamadan görev hedefini okur; ilk denemede butonun yerini söylemez. Yardım verilirse türü ve zamanı kaydedilir.

Katılımcıların yarısı A→B, yarısı B→A sırası kullanır. Numeric keyboard/score pad karşılaştırması da dengelenir. Aynı cevabı ezberleme etkisini azaltmak için eşdeğer prefill/zorluklu iki test board'u önceden hazırlanır; yalnız bir fixture varsa bu sınırlama sonuç raporuna yazılır. Küçük örneklem istatistiksel A/B üstünlüğü kanıtı değildir; görev başarısı ve tekrar eden engelleri bulmak içindir.

### 9.2 Görev senaryosu

| No | Katılımcıya okunacak görev | Ölçü / gözlem |
|---|---|---|
| U01 | “Hesap açmadan bugünkü oyuna başlayın. Oyunun ne yapmanızı istediğini anlatın.” | Başlangıca süre, yanlış nav, guest giriş yardımı, final tabloyu hedef olarak anlama |
| U02 | “Campaign'de Beginner ilk seviyeyi bulun. Kilitli bir seviyenin neden açılmadığını öğrenin.” | Pack/level bulma, lock anlama, geri dönüş; oyun bilgisi gerektirmez |
| U03 | “Bu test hücresine önce 0, sonra 10, sonra 19 yazın; sonra boşaltın. Diğer düzenlenebilir hücreye geçin.” | 0/boş ayrımı, iki basamak, erken advance, keyboard görünürlüğü ve mis-tap |
| U04 | “Bu maç için bir not kaydedin, başka sekmeye gidin ve nota geri dönün.” | Note keşfi, save/cancel anlama, context korunması; 180 sınırı ayrıca teknik test |
| U05 | “Yalnız bir ipucu alın. Ne değiştiğini ve kaç ipucu harcandığını söyleyin.” | İlk doğru CTA'ya süre, yardım, tekrar dokunma, sheet kapanışı, doğru hücreyi bulma |
| U06 | “Şu yanlış dolu skor olan board'da bir ipucu alın.” | Bir hücre düzeltildiğini, kalan hataların olabileceğini anlama; bütün cevabın açıldığını sanmama |
| U07 | “Cevabı göstermeden skorlarınızı kontrol edin. Cevabı göster seçeneğinin sonucunu inceleyin ama iptal edin.” | Check/Reveal karışıklığı, yanlış destructive işlem, cancel sonrası board |
| U08 | “Tablodaki bu takımın GF/GA değerlerine bakarak seçili maça geri dönün.” | A/B başına tablo erişim dokunuşu, görev süresi, yanlış metrik, scroll/odak kaybı |
| U09 | “Tahtayı sıfırlamak isterseniz hangi bilgi kaybolur, hangisi kalır? Onayı açıp iptal edin.” | Reset/replay/history açıklamasını anlama; cancel etkisi |
| U10 | “Sonuç davetini hazırlayın. Hangi puzzle, süre ve hint bilgisi paylaşılacağını söyleyin.” | Paylaşım keşfi, kimlik doğruluğu, spoilersız içerik; prototip native gönderim değildir |
| U11 | “Büyük yazı/landscape ile tablodan bir sayı okuyup skor ve not girin.” | Taşma, görünmeyen CTA, keyboard etkisi; en az bir küçük ekran |
| U12 | “Bağlantı yok ve bir işlem doğrulanamadı. Ne kayıtlı, neyi beklemelisiniz?” | Yerel draft vs resmi sonuç ayrımı; ikinci hint/submit başlatma eğilimi |

Analyze uygunluğu, account/logout ve stats keşfi zaman kalırsa görev ekidir; bu akışların otomatik/teknik kabulü örneklem süresinden bağımsız zorunludur. Uçtan uca screen reader oturumunda Final Table → skor → not → Hint → Check → modal kapat → tab değişimi ayrıca tamamlanır.

### 9.3 Ölçüt ve karar eşiği

| Ölçüt | Deneme hedefi / karar |
|---|---|
| Guest başlama / pack bulma | En az %80 yardımsız başarı; n ve ham başarı sayısı beraber raporlanır |
| Hint keşfi | En az %80, Hint açıldıktan sonra 10 sn içinde doğru `Use 1 hint` eylemini yardımsız bulur |
| Hint güveni | Tüm başarılı isteklerde tek hücre/sayaç; otomatik yeniden açılış ve duplicate sıfır; teknik blocker olarak değerlendirilir |
| Check/Reveal/Reset ayrımı | Yanlışlıkla irreversible Reveal/Reset onayı sıfır; en az %80 sonucu kendi cümlesiyle doğru açıklar |
| Skor girişi | 0/10/19/blank görevi yardımsız tamamlanır; erken advance veya görünmez input/Done blocker |
| A/B tablo yükü | Tamamlama, medyan süre, tabloya erişim sayısı, yanlış metrik ve yardım sayısı birlikte değerlendirilir; yalnız beğeniyle seçim yapılmaz |
| Görev kolaylığı | Görev sonrası 1–7 kolaylık puanı, hedef medyan ≥5; düşük puanın gerekçesi not edilir |
| Erişilebilirlik | Kritik görev engeli sıfır; contrast/48px/fontscale/focus teknik kontrolleri geçmeli |
| Veri/state | Sekme/back/resize sonrası edit kaybı sıfır; sunucu güvenilirliği bu insan denemesiyle doğrulanmış sayılmaz |

%80 eşiği beş kişide en az 4/5, sekiz kişide en az 7/8 demektir. Katılımcı sayısı, yardım ve başarısızlık gizlenmeden raporlanır. Başarısız kritik akış yeniden tasarlanır ve ilgili görev tekrar denenir; “5–8 kişi gördü” tek başına kabul değildir.

### 9.4 Boş oturum ve kabul formu

Oturum ID: ___ · Tarih: ___ · Cihaz/OS: ___ · Ekran: ___ · Fontscale: ___ · Yardımcı teknoloji: ___
Sıra: A→B / B→A · Input sırası: sistem→pad / pad→sistem · Test board'ları: ___

| Görev | Başarı (yardımsız/yardımlı/başarısız) | Süre sn | Dokunuş / yanlış eylem | Yardım | Kolaylık 1–7 | Gözlem / sorun ID |
|---|---|---|---|---|---|---|
| U01–U12, her görev için satır açılır | — | — | — | — | — | Henüz ölçülmedi |

| Karar alanı | Sonuç | Kanıt | Takip |
|---|---|---|---|
| A veya B | Bekliyor; başlangıç A | İnsan denemesi yok | Görev U08, U11 |
| Sistem input veya pad | Bekliyor; başlangıç sistem input | Native keyboard denemesi yok | U03 + Faz 2 iOS/Android |
| Hint anlaşılabilirliği | Bekliyor | U05/U06 uygulanmadı | Tek hint/close + açıklık |
| Critical navigation / destructive action | Bekliyor | U01/U02/U07/U09 uygulanmadı | Blocker varsa tasarım tekrar |
| Erişilebilirlik | Bekliyor | Native fiziksel kabul yok | Teknik a11y ve kullanıcı görevi |

## 10. Varlık, font ve hak envanteri

Bu envanter 12 Kasım kaynak taramasına dayanır. Hak sahipliği dosyanın repoda bulunmasından türetilemez; mağaza varlıkları ayrıca ürün sahibince doğrulanır.

| Varlık | Mevcut kanıt | Faz 1 kullanımı / eksik iş |
|---|---|---|
| [app/icon.svg](../../app/icon.svg) | 64×64 viewBox; yeşil rounded kare, açık renk geometri, altın daire; yerel SVG | Marka referansı. Native app icon/adaptive icon/splash için export, safe zone, farklı platform maskesi ve sahiplik kontrolü henüz yapılmadı |
| Header `SL` işareti | [Header](../../components/layout/Header.tsx) içinde metin + CSS | UI örneği; ayrı lisanslı raster/logo paketi varmış gibi sayılmaz |
| Oyun/action ikonları | [PuzzleHeader](../../components/puzzle/PuzzleHeader.tsx) ve [AnalyzeBoard](../../components/puzzle/AnalyzeBoard.tsx) içinde inline SVG | Görsel niyet yeniden kullanılabilir; platform ikon seti seçilirse paketin lisansı/attribution envantere eklenir |
| Fraunces | `globals.css` içinde aile ismi; font dosyası, `@font-face` veya `next/font` yüklemesi taramada bulunmadı | Mevcut cihazda varlığı garanti değil; Faz 1 sistem serif fallback. Sonraki gerçek font seçimi için lisans dosyası ve weight dosyaları doğrulanır |
| IBM Plex Sans / Mono | Aynı şekilde yalnız CSS aile tanımı | Body için `system-ui`, sayılar için `ui-monospace`/platform monospace fallback; font dosyası dağıtılmıyor |
| Fotoğraf/illüstrasyon/ses | Uygulama kaynaklarında bu iş için görsel/ses asset paketi bulunmadı; `public/` yok | Yeni stok/AI görsel/ses gerekmiyor. Sonradan eklenirse kaynak/lisans ve boyut ayrı kayda girer |
| Takım adı/kodları | Puzzle DTO ve [teamPools](../../lib/fixtures/teamPools.ts): milli takım, kulüp ve hayali takım havuzları | Prototipte örnek metin adları/kodları; gerçek kulüp logosu/forma veya lisanslı görsel eklenmedi. Yeni bir hak/lisans onayı verilmiş sayılmaz |
| OS emoji / share grid | [share format](../../lib/utils/share.ts) içinde metin karakterleri | Metin olarak platform render eder; emoji bitmap/sistem font dosyası çıkarılıp paketlenmez |
| Store screenshot / splash / adaptive icon | Native paket ve hazır store asset seti bulunmadı | Faz 2/9 teslimi; prototip screenshot'ı tamamlanmış native mağaza görseli diye kullanılmaz |

Repo taramasında kök uygulama için ayrıca bir LICENSE dosyası görülmedi. Bu durum üçüncü taraf bağımlılık lisanslarının yok olduğu veya mevcut varlıkların serbest lisanslı olduğu anlamına gelmez. Font/ikon/native SDK seçilirken paket sürümü, lisans metni, attribution gereği ve ürün sahibinin hak teyidi asset kaydına eklenir.

## 11. Faz 1 kabul kontrol listesi

- [ ] Dört tab, account/help stack, pack/level/oyun ve geri dönüş bağlamları prototipte incelendi.
- [ ] A inline tablo varsayılan; B ve özel pad yalnız inceleme kontrolünde karşılaştırılabilir.
- [ ] Bütün eylemlerde en az 48×48 hit alanı; küçük ekran/large font/landscape kesilmesi incelendi.
- [ ] 0/10/19/blank ve 180 karakter not sözleşmesi açık; given/hint/reveal değiştirilemez.
- [ ] Hint ayrı CTA, tek pending, başarıda close, no-change tüketmeme ve no reopen kuralını karşılıyor.
- [ ] Check/Reveal/Reset farklı; hata sayısı etiketi doğru; yanlış destructive eylem önleniyor.
- [ ] Given/hint/error/locked durumları renk dışında anlaşılabilir; Final Table immutable.
- [ ] Loading/empty/error/offline/unknown/expiry ekran/state'leri açık; simülasyonlar gerçek servis gibi sunulmuyor.
- [ ] P01–P20 için ekran veya backend kabul sahibi belli; hiçbir mevcut özellik sessiz çıkarılmadı.
- [ ] 5–8 kişilik görev denemesi yapıldı, ham ölçümler/engeller/karar kaydedildi. **Henüz tamamlanmadı.**
- [ ] Native keyboard/safe area/lifecycle/link/share için Faz 2 doğrulama girdileri hazır; bunlar Faz 1 geçti diye işaretlenmedi.

Bu liste bir completion raporu değildir. Teknik prototip kontrolü, insan denemesi ve gerçek native doğrulama ayrı kanıtlarla kapatılır.
