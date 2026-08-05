# Domain And Data Contracts

> Güncel ürün semantiği için kanonik kaynak [`docs/product-rules.md`](../product-rules.md)
> dosyasıdır. Bu sözleşmeler solve-any, attempt ve campaign kurallarıyla birlikte okunur.

## Tasarim Prensibi

Domain modeli, veritabanindaki kayit formatindan ve client'a acilan response formatindan ayridir. Bu proje icin en kritik sinir `solution` verisinin yalnizca server-private kalmasidir.

## Katmanlar

### 1. Database Record

Prisma'nin dondugu ham veri. JSON alanlari henuz parse edilmemis olabilir.

```ts
interface PuzzleRecord {
  id: string
  contentKey: string
  contentRevision: number
  supersedesId: string | null
  difficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
  teamsConfig: unknown
  standings: unknown
  matchIds: unknown
  solution: unknown
  allSolutions: unknown
  dailyDate: Date | null
  campaignOrder: number | null
  tableDifficultyScore: number | null
  presentationDifficultyScore: number
  effectiveDifficultyScore: number
  contentVersion: string
  generatorVersion: string
  rulesVersion: string
  contentHash: string
  publishedAt: Date
  activatedAt: Date | null
  retiredAt: Date | null
  isActive: boolean
  isTested: boolean
  createdAt: Date
}
```

Yayınlanmış puzzle içerik alanları immutable'dır. `contentKey` mantıksal daily/campaign
slotunu, `id + contentRevision` fiziksel snapshot'ı temsil eder. Aynı revision üzerinde
`standings`, maçlar, çözüm veya zorluk verisi güncellenmez; değişen içerik aynı
`contentKey` altında artan revision ve `supersedesId` zinciriyle publish edilir.
`isActive`, `isTested`, `activatedAt` ve `retiredAt` operasyonel yaşam döngüsü alanlarıdır.
Bir mantıksal key için yalnız bir revision aktif olabilir.

### 2. Internal Domain Entity

Server icinde engine, query mapper ve route handler tarafindan kullanilan guvenli tipler.

```ts
interface TeamEntity {
  id: string
  code: string
  nameEn: string
  nameTr?: string | null
  flagEmoji?: string | null
}

interface StandingEntity {
  teamId: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

interface MatchPublicEntity {
  id: string
  homeTeamId: string
  awayTeamId: string
}

interface MatchSolutionEntity extends MatchPublicEntity {
  homeScore: number
  awayScore: number
}

interface PuzzleEntity {
  id: string
  /** Salt tablo sınıfı. */
  difficulty: "EASY" | "MEDIUM" | "HARD"
  effectiveDifficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
  tableDifficultyScore: number | null
  presentationDifficultyScore: number | null
  effectiveDifficultyScore: number | null
  teams: TeamEntity[]
  standings: StandingEntity[]
  matches: MatchPublicEntity[]
  solution: MatchSolutionEntity[]
  allSolutions: MatchSolutionEntity[][]
  dailyDate: string | null
  campaignOrder: number | null
  isActive: boolean
  isTested: boolean
}
```

### 3. Public API DTO

Client'a ve edge cache'e acilan format.

```ts
interface PuzzlePublicDTO {
  id: string
  mode: "daily" | "campaign"
  /** Salt tablo sınıfı; geriye uyumluluk alanı. */
  difficulty: "EASY" | "MEDIUM" | "HARD"
  effectiveDifficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
  tableDifficultyScore: number | null
  presentationDifficultyScore: number | null
  effectiveDifficultyScore: number | null
  teams: TeamEntity[]
  standings: StandingEntity[]
  matches: MatchPublicEntity[]
  dailyDate: string | null
  campaignOrder: number | null
}
```

### 4. Private API DTO

Route handler icinde kullanilan ve asla client'a cikmayan format.

```ts
interface PuzzlePrivateDTO extends PuzzlePublicDTO {
  solution: MatchSolutionEntity[]
  allSolutions: MatchSolutionEntity[][]
}
```

## Progress Modeli

`currentState` tek bir serbest JSON alan olarak birakilmayacak. Bunun yerine semasi belli bir canonical yapi kullanilacak.

```ts
interface ScoreInput {
  home: number | null
  away: number | null
}

interface PuzzleProgressState {
  puzzleId: string
  inputs: Record<string, ScoreInput>
  completedMatchIds: string[]
  revealedMatchIds: string[]
  hintsUsed: number
  hintTypes: Array<"reveal">
  startedAt: string
  updatedAt: string
  lastSubmittedAt: string | null
}
```

`PuzzleProgressState`, `UserPuzzleProgress.currentState` icinde saklanan canonical oyun durumudur. Ancak progress kaydinin tamami bundan ibaret degildir.

```ts
type PuzzleProgressStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED"

interface PuzzleProgressEnvelope {
  puzzleId: string
  status: PuzzleProgressStatus
  attempts: number
  hintsUsed: number
  hintTypes: Array<"reveal">
  timeTakenSec: number | null
  completedAt: string | null
  currentState: PuzzleProgressState | null
  currentAttempt: PuzzleAttemptSummary | null
  firstAttempt: PuzzleAttemptSummary | null
  bestAttempt: PuzzleAttemptSummary | null
}
```

`PuzzleAttempt`, tek bir oynama oturumunun canonical kaydıdır:

```ts
interface PuzzleAttemptSummary {
  id: string
  kind: "STANDARD" | "REPLAY"
  status: "ACTIVE" | "SOLVED" | "REVEALED" | "ABANDONED"
  startedAt: string
  completedAt: string | null
  elapsedTimeSec: number
  hintsUsed: number
  hintTypes: Array<"reveal">
  answerRevealedAt: string | null
  submissionCount: number
}
```

Her attempt `STARTED`, `PROGRESS_SAVED`, `HINT_USED`, `ANSWER_REVEALED`,
`SUBMITTED`, `COMPLETED` ve `ABANDONED` tiplerinden sıralı `AttemptEvent` kayıtları
üretebilir. `(attemptId, sequence)` benzersizdir.

## UI Runtime State

Bu alanlar canonical progress state degildir.

```ts
interface PuzzleRuntimeUIState {
  selectedCell: { matchId: string; side: "home" | "away" } | null
  phase: "IDLE" | "LOADING" | "ACTIVE" | "CHECKING" | "HINT_SHOWN" | "SOLVED" | "FAILED"
  openModal: "hint" | "victory" | null
  transientViolationIds: string[]
}
```

## Mapping Kurallari

### `PuzzleRecord -> PuzzleEntity`

- `teamsConfig` parse edilip `teams` olarak normalize edilir
- `matchIds` parse edilip `matches` olarak normalize edilir
- `solution` parse edilip `MatchSolutionEntity[]` olur
- `dailyDate` `YYYY-MM-DD` string olarak tasinir

### `PuzzleEntity -> PuzzlePublicDTO`

- `solution` atilir
- `mode`, `dailyDate !== null ? "daily" : "campaign"` ile hesaplanir

### `UserPuzzleProgress.currentState -> PuzzleProgressState`

- JSON schema parse edilir
- eksik alan varsa güvenli default ile degil, validation error ile yakalanir
- deserialize sirasinda `completedMatchIds` ve `revealedMatchIds` array olarak kalir

### `UserPuzzleProgress record -> PuzzleProgressEnvelope`

- status degeri public enum ile ayni degerleri tasir
- `currentState` parse edilebiliyorsa `PuzzleProgressState`, degilse `null`
- `hintsUsed` ve `hintTypes` attempt'te canonical, envelope seviyesinde türetilmiş özettir
- `timeTakenSec` best başarılı attempt süresinin uyumluluk özetidir
- `completedAt`, sadece `status === "COMPLETED"` ise dolu olur
- `currentAttempt`, son/aktif oturumu; `firstAttempt`, unique completion'ı üreten ilk
  oturumu; `bestAttempt`, en iyi başarılı sonucu gösterir

## Invariant'lar

Su kurallar kod seviyesinde zorunludur:

1. `matches.length === 6` olur
2. `teams.length === 4` olur
3. her takim `played === 3` olur
4. her match tam olarak iki farkli takim icerir
5. `solution` ve `matches` ayni `id` setini paylasir
6. `standings` tum takimlari kapsar
7. `goalDiff === goalsFor - goalsAgainst`
8. `points === won * 3 + drawn`
9. public DTO icinde `homeScore` veya `awayScore` bulunmaz
10. `PuzzleProgressEnvelope.currentState?.puzzleId`, envelope `puzzleId` ile ayni olur
11. `allSolutions` bos degildir ve her cozum public match kimliklerinin tamamini kapsar
12. kanonik `solution`, `allSolutions` icinde yer alir
13. takim id ve kodlari benzersizdir; standings her takimi ve 1–4 pozisyonlarini bir kez kapsar
14. her standing icin `won + drawn + lost === played`; global win/loss, draw ve gol
    toplamlari dengededir
15. alti match, dört takimin her ikilisini tam bir kez iceren eksiksiz round-robin'dir
16. solution fixture'lari public match home/away yonunu degistiremez
17. `solution` ve her `allSolutions` uyesi final standings'i birebir yeniden uretir
18. `allSolutions` tekrarsiz ve engine tarafindan bulunan eksiksiz solve-any kumesidir;
    `solutionCount === allSolutions.length`
19. daily ve campaign metadata birbirini dislar; campaign order pack/level ile uyumludur
20. publish sirasinda tablo skoru/sinifi/bandi ve deterministik prefill politikasi dogrulanir
21. presentation ve effective difficulty değerleri mode/prefill/feedback/analyze
    politikasından yeniden türetilir; campaign effective bandı ayrıca doğrulanır

Bu kurallar `lib/puzzles/domainValidation.ts` icindeki ortak validator ile uygulanir.
Runtime mapper temel domain profilini, publisher ise eksiksiz cozum kumesi dahil daha kati
publication profilini kullanir. Veritabani CHECK constraint'leri JSON array boyutlari,
publication metrikleri ve daily/campaign metadata icin son savunma katmanidir. Normal
okuma sorgulari yalniz `isActive = true AND isTested = true` kayitlari gorur.

## Submit Dogrulama Kontrati

Submit dogrulamasi iki asamali calisacak:

1. Semantik dogrulama
   `inputs` tam mi, skor araliklari gecerli mi, her match icin iki taraf da dolu mu
2. Oyun dogrulamasi
   `inputs`, puzzle `allSolutions` kumesindeki cozumlerden herhangi biriyle birebir ayni mi

Ek olarak derive edilmis kontrol amacli kisit dogrulamasi calisacak:

- puan tutarliligi
- gol for/against tutarliligi
- averaj tutarliligi
- kazanma/beraberlik/maglubiyet tutarliligi

Son hakem solve-any eslesmesidir. `solution` yalnizca kanonik/örnek cevaptir; matematiksel
olarak gecerli alternatif bir cozum reddedilmez.

## Hint Kontrati

Mevcut canonical hint tipi:

```ts
type HintType = "reveal"
```

Davranis:

- Scoreline modunda `reveal`, güvenli bir skor hücresini açar.
- Açılacak hücre mevcut girdilerle uyumlu `allSolutions` alt kümesinden seçilir.
- Kullanıcının dolu hücresinin üzerine yazılmaz.
- Reveal sonrasında en az bir geçerli tamamlama kalır.
- Açılan hücre `currentState.revealedCells` ve ilgili `inputs` içinde saklanır.
- Tam answer reveal, hint endpoint'inden ayrıdır ve normal completion üretmez.

## Solver Kontrati

```ts
interface SolverResult {
  status: 'SAT' | 'UNSAT' | 'UNKNOWN'
  terminationReason:
    | 'EXHAUSTED'
    | 'MAX_SOLUTIONS'
    | 'MAX_NODES'
    | 'TIMEOUT'
    | 'ABORTED'
  solutions: ScoreMap[]
  exhaustive: boolean
  capped: boolean
  metrics: SolverMetrics
}
```

- Her çağrı pozitif ve finite `maxSolutions`, `maxNodes`, `maxDurationMs` taşır.
- `fixedCells` bir maçın iki skorunu veya yalnız home/away tarafını sabitleyebilir.
- `UNSAT` yalnız `terminationReason === 'EXHAUSTED'` iken çözüm bulunmadığında geçerlidir.
- Limit dolup çözüm bulunamazsa `UNKNOWN`; en az bir çözüm bulunmuşsa capped `SAT` döner.
- Complete solution set isteyen caller `exhaustive === true` koşulunu zorunlu tutar.
- Telemetry çözüm veya skor gövdesi değil yalnız aggregate arama metrikleri taşır.

### Global partial satisfiability

- Analyze Board tam ve tek taraflı bütün dolu score hücrelerini `fixedCells` olarak solver'a
  verir; yalnız tamamlanmış maçları kontrol etmek yeterli değildir.
- Yerel gerekli-koşul taşmaları `LOCAL_OVERFLOW`, exhaustive global çözümsüzlük
  `GLOBAL_DEAD_END`, eksik tahta `INCOMPLETE`, bilinmeyen fixture ise `UNKNOWN_MATCH`
  olarak ayrılır.
- Solver limit nedeniyle kanıt üretemezse sonuç `UNKNOWN` kalır; UI bunu hata veya dead-end
  olarak yorumlamaz.
- İşlem explicit Analyze Board eylemidir, state değiştirmez ve public response içinde çözüm
  veya skor önerisi taşımaz.

## Streak ve Stats Kontrati

### Streak

- yalnizca `daily` puzzle tamamlandiginda artar
- ayni gun ayni veya farkli daily puzzle icin ikinci kez artmaz
- campaign solve streak sayilmaz

### Stats

Kanonik istatistik alanlari:

```ts
interface UserStatsAggregate {
  userId: string
  uniquePuzzlesSolved: number
  successfulAttempts: number
  totalAttempts: number
  firstTrySolves: number
  assistedSolves: number
  answerReveals: number
  perfectSolves: number
  totalTimeSec: number
  solvedEasy: number
  solvedMedium: number
  solvedHard: number
}
```

Hesap kurallari:

- Ana `Solved` metrigi `uniquePuzzlesSolved` anlamina gelir.
- Replay yeni attempt olabilir fakat `uniquePuzzlesSolved` degerini artirmaz.
- `perfectSolves`, hint ve answer reveal olmadan tamamlanan benzersiz puzzle sayisidir.
- Answer reveal solve, perfect solve veya campaign unlock uretmez.
- Aggregate degerler `PuzzleAttempt` ve event kayitlarindan yeniden hesaplanabilir.
- `avgTimeSec`, basarili attempt'lerden derive edilir.

## Anonymous Merge Kontrati

`AnonymousUserMerge`, silinen anonim kimlik için kalıcı ve idempotent merge receipt'idir:

```ts
interface AnonymousUserMerge {
  sourceUserId: string
  targetUserId: string
  affectedPuzzleCount: number
  movedAttemptCount: number
  movedSubmissionCount: number
  mergedAt: Date
}
```

- `sourceUserId` benzersizdir ve silinen kullanıcıya foreign key taşımaz.
- Aynı source/target retry'ı receipt sonucunu döndürür.
- Aynı source için farklı target veri bütünlüğü çatışmasıdır.
- Receipt aggregate gerçek kaynağı değildir; operasyonel audit ve idempotency kaydıdır.
- Merge edilen progress için first, best ve current attempt seçimleri canonical
  attempt/completion geçmişinden yeniden türetilir.

## Campaign Erisim Kontrati

- Her pack'in ilk seviyesi bastan aciktir.
- Ayni pack icindeki seviye `N`, seviye `N-1` normal tamamlandiginda acilir.
- Pack'ler birbirini kilitlemez.
- Answer reveal sonraki seviyeyi acmaz.
- Replay daha once acilmis bir seviyeyi kilitlemez.
- Read, progress, submit, hint ve answer endpoint'leri ayni server-side access policy'yi
  uygular.

## Veritabaninda Kalacak Ama Ilk Dikey Dilimde Kritik Olmayan Alanlar

- `campaignOrder`
- `hintTypes`
- `email`, `accounts`, `sessions`

Bu alanlar schema'da korunur ancak ilk oynanabilir teslimin kritik yolunda yer almayabilir.

`isTested` yeni veya yeniden doğrulanan içerikte publication domain validator ile sürümlü
otomatik content QA raporunun ortak servis kapısıdır; editorial review anlamı taşımaz.
Dalga 14 ile insan kararı `editorialStatus`, onaylayan kişi/zaman/not alanları ve append-only
`PuzzleEditorialEvent` geçmişinde ayrı tutulur. Yeni revision `PENDING_REVIEW` doğar;
yalnız güncel otomatik QA kanıtlı `APPROVED` revision manuel veya zamanlanmış olarak aktif
edilebilir. Dalga 12 öncesi `legacy` QA kanıtı publisher ile yükseltilir.

## Observed Difficulty Kalibrasyon Kontrati

Dalga 15, published tahmini zorluğu değiştirmeden iki ayrı snapshot modeli kullanır:

- `DifficultyCalibrationRun`: algoritma sürümü, kapalı UTC penceresi, minimum örnek ve stale
  politikasını; toplam puzzle/attempt, drift ve segment özetini taşır.
- `PuzzleDifficultyObservation`: fiziksel revision için aggregate completion, reveal,
  abandonment/stale, hint, submit, median/P75 süre, confidence, observed skor ve tahmini
  skor farkını taşır.

Yalnız `STANDARD` attempt'ler değerlendirilir; replay hariçtir. Varsayılan 90 günlük
pencerede 24 saatten eski açık attempt analitik stale abandonment kabul edilir. En az 30
farklı kullanıcı, 30 terminal attempt ve `0,8` confidence yoksa observation
`INSUFFICIENT_DATA` kalır. Snapshot kullanıcı id veya PII saklamaz ve puzzle'ın immutable
`tableDifficultyScore`, `presentationDifficultyScore` veya `effectiveDifficultyScore`
alanlarını update etmez. Güvenli `±6` observed/predicted farkı yeni algoritma/revision için
editorial inceleme sinyalidir.
