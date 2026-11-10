# ScoreLogic Kanonik Ürün Kuralları

> Durum: Aktif ürün sözleşmesi  
> Son güncelleme: 9 Kasım 2026
> Kapsam: çözüm doğrulama, campaign erişimi, attempt/replay/reveal ve istatistik semantiği

Bu doküman ScoreLogic'in ürün davranışı için kanonik kaynaktır. Eski MVP ve teknik tasarım
dokümanlarındaki çelişkili ifadeler yerine bu kurallar uygulanır. Kod henüz bir kurala
uyarlanmamışsa bu durum kuralı değiştirmez; uygulama açığı olarak takip edilir.

## 1. Çözüm Semantiği: Solve-any

ScoreLogic çoklu çözümü destekler. Bir kullanıcının scoreline cevabı, puzzle'ın geçerli çözüm
kümesindeki çözümlerden herhangi biriyle tam eşleşiyorsa doğrudur.

- `solution`, kanonik/örnek çözüm olarak server-private tutulur.
- `allSolutions`, doğrulamada kullanılan geçerli çözüm kümesidir.
- Kullanıcı hiçbir zaman yalnızca `solution` ile eşleşmeye zorlanmaz.
- Public puzzle DTO'su `solution` veya `allSolutions` içermez.
- Answer reveal, başlangıçta verilen skorlarla uyumlu bir örnek cevap gösterir. Mevcut
  girdilerle uyumlu bir çözüm varsa bu girdiler korunur; yoksa verilen skorlar korunarak
  geçerli bir örnek gösterilir ve çelişki açıkça belirtilir.
- Toplam tablo çözümü, verilen skorlarla oynanabilir çözümler ve mevcut girdilerle uyumlu
  çözümlerin sayıları ayrı anlam taşır. Arayüzde mevcut girdilerle uyumlu sayı açıklanır;
  toplam tablo sayısı mevcut tahtanın kalan çözüm sayısı olarak sunulmaz.

### Hint kuralları

- Hint motoru kullanıcının mevcut girdileriyle uyumlu `allSolutions` alt kümesini hesaplar.
- Dolu ve kullanıcı tarafından girilmiş bir hücrenin üzerine yazılmaz.
- Hint sonrasında en az bir geçerli tamamlama kalmalıdır.
- Uyumlu çözümlerin ortak değer verdiği bir hücre varsa bu değer güvenle açılabilir.
- Ortak hücre yoksa hint belirli bir skoru zorlamak yerine bilgi kazancı sağlayan yönlendirme
  vermelidir.
- Mevcut girdilerle hiçbir çözüm kalmıyorsa önce çelişki bildirilir.

## 2. Beginner Oyun Modeli

`OUTCOME_ONLY` modeli kaldırılmıştır. Beginner dahil bütün campaign pack'lerinde oyuncu
scoreline girer ve aynı solve-any doğrulamasına tabi olur.

Beginner, cevap tipini değiştirmek yerine başlangıç verisini ve öğretici desteği kademeli
olarak azaltır:

| Seviyeler | Başlangıç desteği | Geri bildirim | Öğretici destek |
|---|---|---|---|
| 1–3 | 5 maçın skoru verilmiş | Yanlış hücreyi göster | Rehberli `Analyze Board` |
| 4–15 | 4 maçın skoru verilmiş | Yanlış hücreyi göster | İsteğe bağlı assisted `Analyze Board` |
| 16–30 | 3 maçın skoru verilmiş | En yakın geçerli çözüme göre yanlış hücre | Analyze yok; Easy'ye geçiş |

- Beginner scoreline girişi kullanır.
- Beginner farklı bir matematiksel doğruluk tanımı kullanmaz.
- Beginner zorluğu yalnızca daha fazla rehberlik ve daha fazla başlangıç verisiyle azaltılır.

### Final Table ve Analyze Board

- `Final Table` bütün modlarda değişmez kaynak veridir.
- Skor girişi final tablodaki değerleri çizmez, azaltmaz, renklendirmez veya yeniden
  hesaplamaz.
- Constraint ve doğruluk sinyali yalnız bilinçli `Check`, `Hint` veya `Analyze Board`
  eyleminden sonra gösterilir.
- `Analyze Board`, final tabloyu değiştirmez; ayrı bir snapshot paneli açar.
- Snapshot, tam scoreline'ların tablo katkısını gösterir; global tamamlanabilirlik kontrolü
  ise tek taraflı olanlar dahil bütün dolu skor hücrelerini değişmez constraint kabul eder.
- Yeni bir skor girişi mevcut snapshot'ı geçersiz kılar; kullanıcı analizi yeniden
  çalıştırmalıdır.
- Analiz yalnız açık kullanıcı eylemiyle server-side çalışır; skor yazımı sırasında otomatik
  istek veya anlık doğruluk sinyali üretmez.
- `SAT`, girilmiş her hücre korunarak en az bir tam çözüm kaldığını; exhaustive `UNSAT`,
  tahtanın global dead-end olduğunu gösterir. Budget dolan `UNKNOWN` yanlış cevap sayılmaz
  ve kullanıcıya belirsiz sonuç olarak açıklanır.
- Response çözüm, skor önerisi veya `allSolutions` gövdesi taşımaz. Campaign erişimi ile
  Guided/Assisted uygunluğu endpoint'te yeniden denetlenir.
- Analyze Board, Beginner 1–3'te rehberli; 4–15'te isteğe bağlı assisted araçtır.
- Beginner 16–30 ve diğer pack'lerde Analyze Board sunulmaz.
- Gelecekte ücretli erişim düşünülürse entitlement ve kullanım kaydı server-authoritative
  tasarlanacaktır; mevcut karar herhangi bir monetizasyon içermez.

## 2.1 Puzzle Yayınlama ve Domain Bütünlüğü

Yeni bir daily veya campaign puzzle ancak kanonik domain validator başarılıysa
yayınlanabilir. Publisher fail-closed çalışır; tek bir ihlal bile veritabanı yazımını
durdurur.

- Dört takımın id ve kodları benzersizdir.
- Altı fixture, her takım çiftini tam bir kez içeren tek devre round-robin oluşturur.
- Standings her takımı bir kez kapsar; `W + D + L = P`, `GD = GF - GA` ve
  `Pts = 3W + D` eşitlikleri hem takım hem global toplam düzeyinde tutarlıdır.
- `solution` ve her `allSolutions` üyesi public fixture kimliği ile home/away yönünü
  değiştirmeden final tabloyu tam olarak yeniden üretir.
- Kanonik `solution`, tekrarsız `allSolutions` kümesinin üyesidir.
- `solutionCount`, saklanan çözüm sayısına eşittir; saklanan küme engine'in ürettiği
  eksiksiz solve-any çözüm kümesiyle birebir aynıdır.
- Daily/campaign metadata birbirini dışlar. Campaign order pack ve level'dan
  deterministik türetilir.
- Geriye uyumlu `difficulty` alanı salt matematiksel `tableDifficultyScore` sınıfıdır.
- `presentationDifficultyScore`, prefill, feedback ve Analyze Board desteğinden;
  `effectiveDifficultyScore` ise tablo ve sunum skorlarının kanonik bileşiminden türetilir.
- Campaign puzzle hem ilgili pack/level tablo bandına hem efektif banda uymalıdır.
- Başlangıçta açılan maçlar pack/level prefill politikasından deterministik türetilir.

Domain doğrulamasından sonra ayrıca `scorelogic-content-qa-v1` otomatik içerik kalite
kapısı çalışır:

- Toplam çözüm sayısı `1–128` aralığında olmalı ve prefill sonrasında en az bir oynanabilir
  solve-any çözümü kalmalıdır.
- Kanonik skor seti maç başına `1,3–3,7` gol ortalaması, takım başına en çok `6`, maçta
  toplam en çok `9` gol, en az `3` farklı scoreline ve en az `2` outcome türü üretmelidir.
- En çok `2` adet `0-0` ve takımlar arasında en çok `12` goals-for farkı kabul edilir.
- Her prefill-uyumlu çözüm, bütün kısmi adımlarıyla partial validator ve final solve-any
  hakeminden otomatik playthrough ile geçmelidir.
- Her playthrough durumunda hint motoru denenir; açılan hücre geçerli çözüm kümesini boş
  bırakamaz. Ortak güvenli hücre bulunmaması hata değildir; yönlendirici hint sözleşmesidir.
- Final tablo şekli tekrar edemez. Takım seti, fixture sunumu, scoreline/outcome dağılımı,
  çözüm sayısı ve zorluk birlikte `0–1` benzerlik skoru üretir; `0,96+` içerik reddedilir.

Başarılı rapor `contentQaVersion` ve `contentQaReport` olarak revision ile saklanır ve
yayından sonra immutable'dır. `isTested`, yeni veya yeniden doğrulanan içerikte domain ile
otomatik content QA kapılarının ikisinin de başarıyla geçtiği anlamına gelir; insan
editorial onayı değildir. İnsan kararı ayrı `editorialStatus` yaşam döngüsü ve append-only
`PuzzleEditorialEvent` kayıtlarıyla kanıtlanır. Dalga 12 öncesi `legacy` kanıtı olan
satırlar publisher ile bir kez yükseltilmelidir. Normal oyun sorguları yalnız `isActive`,
`isTested` ve veritabanı constraint'i gereği editorial olarak `APPROVED` puzzle'ları servis
eder.

## 2.2 Puzzle Kimliği, Revision ve Aktivasyon

Puzzle'ın oyuncu açısından kalıcı kimliği `contentKey`, yayınlanan fiziksel snapshot'ı
ise `id + contentRevision` ikilisidir.

- Daily anahtarı `daily:YYYY-MM-DD`, campaign anahtarı
  `campaign:<pack>:<level>` biçimindedir.
- Aynı `contentKey` altında revision numarası 1'den başlayarak kesintisiz artar.
- Revision 2 ve sonrası `supersedesId` ile aynı mantıksal puzzle'ın bir önceki
  revision'ını gösterir.
- Yayınlanmış fiziksel revision immutable'dır. Düzeltme yerinde update değil, yeni
  revision olarak yazılır.
- Her yeni revision otomatik QA'yı geçtikten sonra pasif ve `PENDING_REVIEW` doğar; ilk
  revision da insan onayı olmadan aktif olmaz.
- Editorial kararları `APPROVED`, `CHANGES_REQUESTED` veya `REJECTED` olabilir. Değişiklik
  talebi ve red gerekçe ister; yalnız güncel ve başarılı otomatik QA kanıtı onaylanabilir.
- Onay, değişiklik talebi, red, aktivasyon planlama/iptal, aktivasyon, retirement ve
  rollback aktör, not ve zaman bilgisiyle append-only audit olayına dönüşür.
- Bir `contentKey`, daily date veya campaign order için aynı anda yalnız bir aktif
  revision bulunabilir.
- Aktivasyon yalnız güncel QA kanıtlı ve editorial `APPROVED` revision için yapılabilir.
  Gelecek bir an için planlanabilir; aynı `contentKey` altında yalnız bir revision planlı
  olabilir ve due worker vadesi gelenleri aktive eder.
- Aktivasyon, mevcut aktif revision'ı retire edip hedef revision'ı tek transaction içinde
  açar. Mevcut revision üzerinde `ACTIVE` attempt varsa işlem reddedilir.
- Rollback eski immutable revision'ı aynı atomik aktivasyon işlemiyle yeniden aktive eder; yeni
  bir içerik update'i yapmaz.
- Normal read/catalog/daily sorguları yalnız aktif ve domain doğrulamasından geçmiş
  revision'ı döndürür. Retired fiziksel id normal oyun endpoint'lerinden servis edilmez.
- Attempt, progress ve submission fiziksel `puzzleId` üzerinde tutulur; böylece hangi
  revision'ın oynandığı yeniden üretilebilir.
- Unique completion, unlock ve benzersiz-solve istatistikleri mantıksal `contentKey`
  üzerinde tekilleştirilir. Yeni revision eski bir çözümü ikinci kez “yeni puzzle”
  saydırmaz.

## 2.3 Solver Operasyon Sözleşmesi

Her solver çalışması finite bir profile bağlıdır. Sınırsız süre, node veya çözüm sayısı
ile arama yapılmaz. Generation, publication, difficulty, legacy runtime ve gelecekteki
interactive/hint/analyze çağrıları ayrı budget profilleri kullanır.

- `fixedCells`, tam scoreline'ın yanı sıra yalnız home veya away hücresini de aramanın
  başlangıç constraint'i olarak kabul eder.
- `SAT`, en az bir çözümün kanıtlandığı anlamına gelir. Arama limit nedeniyle durmuşsa
  sonuç `capped` olabilir ve tam çözüm sayısı iddiası taşımaz.
- `UNSAT`, ancak arama uzayı budget tükenmeden tamamen tüketildiğinde döner.
- Hiç çözüm bulunmadan node, süre veya iptal sınırı dolarsa sonuç `UNKNOWN` olur.
- `UNKNOWN` hiçbir ürün akışında “tahta geçersiz” veya “çözüm yok” şeklinde yorumlanmaz.
- Publication tam `allSolutions` kümesini kanıtlayamazsa fail-closed durur.
- Generator budget'a takılan adayı yayınlanabilir kabul etmez; yeni aday üretir.
- Legacy `solve`/`solveAll` girişleri finite compatibility budget kullanır. Tam küme
  gerektiği halde arama exhaustive değilse açık hata üretir.
- Solver telemetry yalnız profil, operasyon, sonuç durumu, bitiş nedeni, süre, node,
  candidate/prune sayıları, depth, bulunan çözüm adedi ve fixed-cell adedi taşır. Takım,
  maç, skor, standings veya çözüm gövdesi loglanmaz.
- Genel telemetry de aynı veri minimizasyonunu uygular: ham kullanıcı kimliği ortam-bazlı
  HMAC'e çevrilir; authorization/cookie/token/email, score/input/outcome/note ve solution
  alanları structured log, trace, Sentry context ve ürün analitiğinden çıkarılır.
- Sentry hata/issue; OpenTelemetry request→Prisma→engine trace; PostHog ise yalnız
  allowlist ürün funnel kanalıdır. Sağlayıcıların sorumlulukları birbirine karıştırılmaz.

Hint bugün yayın sırasında doğrulanıp saklanmış `allSolutions` kümesini filtreler ve yeni
solver araması başlatmaz. Analyze Board, Dalga 10 itibarıyla bütün dolu skor hücrelerini
`fixedCells` olarak `ANALYZE` profiline gönderir. Anlık Final Table geri bildirimi yasağı
değişmemiştir.

## 2.4 Mode-aware Zorluk Sözleşmesi

Yayınlanan tahmini zorluk üç ayrı kavramı birbirine karıştırmaz:

| Katman | Alan | Anlam |
|---|---|---|
| Table complexity | `tableDifficultyScore`, `difficulty` | Final tablonun ve çözüm uzayının salt matematiksel güçlüğü |
| Presentation complexity | `presentationDifficultyScore` | Oyuncunun çözmesi gereken maç sayısı ile feedback ve Analyze desteğinin net etkisi |
| Effective difficulty | `effectiveDifficultyScore`, `effectiveDifficulty` | Oyuncunun karşılaştığı tahmini birleşik zorluk |

Kanonik hesap:

```text
presentation = max(0, unresolvedMatches * 5 + feedbackWeight - analyzeRelief)
effective    = max(1, round((tableScore * 2 + presentation) / 3))
```

- Feedback ağırlıkları: exact cells `0`, exact outcomes `1`, constraint violations `2`,
  wrong match `3`, error count `6`, correctness-only `9`.
- Analyze indirimi: Guided `4`, Assisted `2`, destek yoksa `0`.
- Daily feedback modu efektif skordan değil tablo sınıfından türetilir; böylece hesapta
  döngü oluşmaz. Table `HARD` için error count, diğerleri için constraint violations
  kullanılır.
- `1–30 = EASY`, `31–42 = MEDIUM`, `43+ = HARD` eşikleri hem tablo hem efektif skorun
  kendi sınıfına ayrı ayrı uygulanır.
- Üretici campaign adayını hem tarihsel tablo aralığına hem ilgili efektif aralığa göre
  filtreler. Böylece aynı tablo farklı yardım politikalarında aynı deneyim zorluğu
  sayılmaz.
- Public DTO'daki `difficulty` geriye uyumlu tablo sınıfıdır; arayüz ve kullanıcı
  istatistikleri `effectiveDifficulty` kullanır. Pack adı (`BEGINNER`…`EXPERT`) ayrı bir
  progression kimliğidir ve üçlü zorluk sınıfıyla eş anlamlı değildir.
- Presentation ve effective skorlar hashed tablo skoru + mode metadata'sından deterministik
  türediği için mevcut revision hash'ine eklenmez. Publication validator yeniden hesaplar;
  veritabanı yayın sonrası değiştirilmelerini engeller.
- Observed difficulty, tahmini skorun yerine yazılmaz; ayrı ve revision-bazlı kalibrasyon
  snapshot'ıdır. Yalnız `STANDARD` attempt'ler kullanılır, `REPLAY` kapsam dışıdır.
- Varsayılan kohort önceki 90 tam UTC günüdür. 24 saatten uzun süredir etkinlik görmeyen
  açık attempt, yalnız analitik hesapta stale abandonment sayılır; attempt kaydı mutate
  edilmez. Yakın tarihli açık attempt'ler skor dışında tutulur ve confidence'ı düşürür.
- Gözlenen skorun sürümlü `scorelogic-observed-difficulty-v1` hesabı:

```text
retryPressure = clamp((averageSubmissions - 1) / 2, 0, 1)
timePressure  = clamp((medianSolveTimeSec - 60) / 540, 0, 1)
observed      = round(12
                + (1 - completionRate) * 18
                + revealRate * 4
                + abandonmentRate * 8
                + hintRate * 5
                + retryPressure * 5
                + timePressure * 12)
```

- Observed skor da `1–30 EASY`, `31–42 MEDIUM`, `43+ HARD` eşiklerini kullanır.
- Confidence, `min(distinctUsers / minimumSampleSize, 1)` ile terminal coverage oranının
  çarpımıdır. Varsayılan minimum 30 farklı kullanıcıdır; terminal attempt sayısı da en az
  30 ve confidence en az `0,8` olmadan sonuç `INSUFFICIENT_DATA` kalır.
- Güvenli örnekte observed–predicted farkı `+6` veya üstüyse `UNDER_ESTIMATED`, `-6` veya
  altındaysa `OVER_ESTIMATED`, aradaysa `ALIGNED` olur.
- Kalibrasyon PII saklamaz; revision başına yalnız aggregate count/rate, median/P75 süre,
  confidence ve fark saklanır. Snapshot hiçbir published puzzle alanını otomatik mutate
  etmez. Model/eşik değişikliği yeni algoritma sürümü ve editorial olarak yayınlanan yeni
  revision gerektirir.

## 3. Campaign Erişim ve İlerleme

- Her pack'in birinci seviyesi başlangıçta açıktır.
- Bir pack içindeki diğer seviyeler sıralı açılır.
- Seviye `N`, aynı pack içindeki `N-1` normal şekilde tamamlandığında açılır.
- Bir pack'i tamamlamak başka bir pack'in ilk seviyesini açmak için gerekli değildir.
- Erişim kuralı yalnızca UI'da değil; puzzle read, progress, submit, hint ve answer
  endpoint'lerinde aynı server-side policy ile uygulanır.
- Daha önce açılmış veya tamamlanmış bir seviye replay nedeniyle tekrar kilitlenmez.

### Completion

- Geçerli bir scoreline submit edildiğinde attempt başarıyla tamamlanır.
- İlk normal completion, `(userId, contentKey)` unique `PuzzleCompletion.completedAt`
  kaydını üretir ve sonraki seviyeyi açar.
- Retry, çift tıklama veya eşzamanlı aynı submit ikinci completion etkisi üretmez.

### Answer reveal

- Answer reveal, puzzle'ı `solved` veya normal `completed` saymaz.
- Answer reveal sonraki seviyeyi açmaz.
- `answerRevealedAt` ve assisted/revealed sonucu ayrı tutulur.
- Kullanıcı puzzle'ı daha sonra yeni bir attempt ile normal şekilde çözebilir.

### Replay

- Her replay yeni bir `PuzzleAttempt` oluşturur.
- İlk completion, unlock ve geçmiş attempt kayıtları korunur.
- Replay daha iyi bir süre veya yardım sonucu üretirse best attempt güncellenebilir.
- Replay `uniquePuzzlesSolved` değerini artırmaz.

## 4. Attempt ve İstatistikler

`PuzzleAttempt`, `PuzzleCompletion` ve puzzle metadata'sı birincil gerçek kaynaklardır.
`UserStats` ile `DailyStreak` yalnız hızlı okuma için tutulan, yeniden üretilebilir
aggregate tablolardır.

| Metrik | Tanım |
|---|---|
| `uniquePuzzlesSolved` | En az bir normal completion'ı olan benzersiz mantıksal `contentKey` sayısı |
| `successfulAttempts` | Doğru scoreline ile biten toplam attempt sayısı |
| `totalAttempts` | Başlatılan toplam attempt sayısı |
| `firstTrySolves` | İlk attempt'te normal tamamlanan benzersiz puzzle sayısı |
| `assistedSolves` | Hint kullanılan başarılı attempt sayısı |
| `answerReveals` | Tam cevabın gösterildiği attempt sayısı |
| `perfectSolves` | Hint ve answer reveal olmadan tamamlanan benzersiz puzzle sayısı |
| `bestDuration` | Tanımlı kapsam içindeki en hızlı başarılı attempt |
| `averageDuration` | Başarılı attempt sürelerinin ortalaması |

Ana arayüzdeki “Solved” metriği `uniquePuzzlesSolved` anlamına gelir.

- `successfulAttempts`, `totalAttempts`, `assistedSolves`, `answerReveals`,
  `totalTimeSec` ve `bestDuration` doğrudan `PuzzleAttempt` kayıtlarından hesaplanır.
- `uniquePuzzlesSolved`, zorluk dağılımı ve daily streak mantıksal `contentKey` ile benzersiz
  `PuzzleCompletion` kayıtları ile puzzle metadata'sından hesaplanır.
- `firstTrySolves`, bir puzzle'ın kronolojik ilk attempt'i `SOLVED` ise sayılır.
- `perfectSolves`, en az bir hintsiz başarılı attempt'i bulunan tamamlanmış benzersiz
  puzzle sayısıdır.
- `averageDuration`, başarılı attempt süreleri toplamının `successfulAttempts` sayısına
  bölünmesiyle hesaplanır; replay süreleri bu metriğe dahildir.
- Aynı `attemptId` ve idempotency key ile tekrarlanan submit bir kez işlenir.
- `PuzzleAttempt` attempt yaşam döngüsünün, `AttemptEvent` sıralı eylem geçmişinin birincil
  kaynağıdır.
- `PuzzleSubmission`, attempt'e bağlı idempotency receipt'ini ve response progress
  snapshot'ını; `PuzzleCompletion` ise ilk unique solve gerçeğini taşımaya devam eder.
- Süre `PuzzleAttempt.startedAt` ile sunucu saati arasından hesaplanır ve terminal durumda
  attempt üzerine sabitlenir. İstemcinin gönderdiği süre resmi metriği belirlemez.
- Hint sayısı/türleri ve answer reveal durumu yalnız sunucu eylemleriyle değiştirilir.
- `UserPuzzleProgress.currentAttempt`, `firstAttempt` ve `bestAttempt` referansları ekranlar
  için türetilmiş özettir; attempt/event geçmişinin yerine geçmez.
- Answer reveal başarılı attempt veya unique solve üretmez.
- Daily streak, completion'ların benzersiz daily business date'lerinden yeniden üretilir;
  campaign completion streak'e dahil edilmez.
- Difficulty dağılımı benzersiz tamamlanan puzzle'ların `effectiveDifficultyScore`
  sınıfından hesaplanır.
- Attempt başlatma, doğru submit ve answer reveal işlemleri aynı transaction içinde
  aggregate'leri canonical kayıtlardan yeniden üretir.
- Drift denetimi varsayılan olarak read-only çalışır; düzeltme yalnız açık `--repair`
  seçeneğiyle yapılır. Aynı canonical veri üzerinde tekrar çalıştırma idempotent olmalıdır.

## 5. Anonim Kullanıcıdan Hesaba Geçiş

Hesap bağlama, iki aggregate satırını toplamak değildir. Anonim ve gerçek kullanıcıya ait
canonical geçmiş tek kimlik altında birleştirilir.

- Merge, sign-in tamamlanmadan önce tek veritabanı transaction'ında çalışır.
- Merge başarısız olursa sign-in tamamlanmaz; anonim kullanıcı ve cookie yeniden deneme için
  korunur.
- İki kimliğin bütün `PuzzleAttempt`, `AttemptEvent` ve `PuzzleSubmission` kayıtları
  korunur ve gerçek kullanıcıya geçirilir.
- Aynı mantıksal puzzle aynı veya farklı revision'larda iki tarafta da tamamlanmışsa en
  erken `PuzzleCompletion` first completion olarak kalır; diğer completion satırı
  kaldırılır fakat iki fiziksel revision'ın attempt/submission geçmişi korunur.
- `firstAttempt` en erken completion attempt'ini, `bestAttempt` önce en düşük süreyi sonra
  en az hint'i, `currentAttempt` ise en güncel aktif draft'ı gösterir.
- Aynı puzzle için iki aktif draft varsa en güncel olan aktif kalır; diğeri neden bilgili
  bir `ABANDONED` event'iyle terminal duruma geçirilir.
- İki kullanıcıda aynı idempotency key varsa iki submission da korunur; taşınan anonim
  receipt'in anahtarı artık istemci tarafından kullanılmayacak merge namespace'ine alınır.
- Progress satırları elle seçilip kopyalanmaz; taşınan attempt/completion geçmişinden
  yeniden üretilir. Legacy attempt'i olmayan progress yalnız fallback olarak korunur.
- Stats ve streak toplanmaz; merge sonunda canonical rebuild ile yeniden hesaplanır.
- Kullanıcı kimlikleri sıralı PostgreSQL advisory lock ile korunur. Gameplay yazımları da
  aynı identity lock'u attempt/puzzle lock'undan önce alır.
- `AnonymousUserMerge` receipt'i aynı merge retry'ını idempotent yapar ve bir anonim
  kimliğin iki farklı hesaba bağlanmasını reddeder.
- Anonim kullanıcı yalnız bütün taşıma, progress rebuild ve receipt yazımı başarılı
  olduktan sonra silinir.
- Başarılı authenticated stats senkronizasyonu anonim cookie'yi `Max-Age=0` ile temizler.

## 6. Kaynak Önceliği ve Dokümantasyon

Ürün davranışı için kaynak önceliği:

1. Bu kanonik ürün kuralları
2. Güncel domain/API sözleşmeleri
3. Çalışan kod ve testler
4. Eski teknik tasarım ve MVP vizyon dokümanları

Eski dokümanlar tarihsel bağlam ve ürün vizyonu için korunabilir; güncel davranış iddiasında
bulunmamalıdır. Yeni bir ürün kararı alındığında bu doküman ve ilgili domain/API sözleşmeleri
aynı değişiklik içinde güncellenir.
