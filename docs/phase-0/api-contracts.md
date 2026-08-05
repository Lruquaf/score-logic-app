# API Contracts

> Güncel ürün semantiği için kanonik kaynak [`docs/product-rules.md`](../product-rules.md)
> dosyasıdır. Bu dosyadaki submit, hint ve campaign davranışları kanonik kurallarla birlikte
> uygulanır.

## Ilk Oynanabilir Dilim

Bu dosya, ilk oynanabilir web MVP icin zorunlu endpointleri tanimlar.

## Genel Kurallar

### Base Path

Teknik dokumanla hizali olarak Next.js route handlers kullanilacak:

- `/api/puzzles/daily`
- `/api/puzzles/[id]`
- `/api/puzzles/[id]/attempt`
- `/api/puzzles/[id]/submit`
- `/api/puzzles/[id]/analyze`
- `/api/puzzles/[id]/hint`
- `/api/puzzles/[id]/answer`
- `/api/puzzles/[id]/progress`

### Auth Semantigi

- request bir session user ile gelebilir
- session yoksa cookie-backed anonymous user kimligi uretilebilir
- progress yazan endpointler kullanici kimligi gerektirir; session user yoksa anonymous user otomatik olusturulur
- sign-in request'i anonymous cookie tasiyorsa session olusmadan once canonical merge
  transaction'i tamamlanir
- merge hatasi sign-in'i fail-closed durdurur; veri tasinmadan anonymous cookie temizlenmez
- basarili sign-in sonrasi ilk authenticated stats response'u anonymous cookie'yi expire eder

### Anonymous Merge Semantiği

- Kaynak kullanici `isAnonymous: true`, hedef kullanici gercek hesap olmalidir.
- Attempt/event/submission gecmisi hedef kullaniciya tasinir.
- Completion cakismasinda en erken completion korunur; unique solved iki kez sayilmaz.
- First/best/current progress referanslari tasinan canonical kayitlardan yeniden uretilir.
- Stats ve streak sayisal olarak toplanmaz; canonical rebuild calisir.
- Ayni kaynak/hedef retry'i `AnonymousUserMerge` receipt'i nedeniyle no-op basaridir.
- Ayni anonymous source'u farkli hedef hesaba baglama girisimi reddedilir.
- Merge transaction'i tamamlanmadan anonymous kullanici silinmez.

### Error Envelope

Tum endpointler asagidaki formati kullanir:

```ts
interface ApiErrorResponse {
  error: {
    code:
      | "BAD_REQUEST"
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR"
    message: string
    details?: Record<string, unknown>
  }
}
```

## GET `/api/puzzles/daily`

Bugunun aktif gunluk bulmacasini ve varsa kullanici progress'ini dondurur.

### Response 200

```ts
interface DailyPuzzleResponse {
  puzzle: PuzzlePublicDTO
  progress: PuzzleProgressEnvelope | null
}
```

### Davranis

- public response icinde `solution` yoktur
- aktif puzzle yoksa `404 NOT_FOUND`
- anonymous user olusturmak bu endpointte zorunlu degildir; progress yoksa `null` donulebilir

## GET `/api/puzzles/[id]`

Belirli bir bulmaca detayini ve varsa kayitli progress'i dondurur.

### Response 200

```ts
interface PuzzleDetailResponse {
  puzzle: PuzzlePublicDTO
  progress: PuzzleProgressEnvelope | null
}
```

### Davranis

- `daily` veya `campaign` fark etmeksizin ayni DTO kullanilir
- inactive puzzle public olarak acilmaz
- campaign seviyesi kilitliyse `403 FORBIDDEN` döner; response `requiredPuzzleId` ve
  `requiredCampaignLevel` ayrıntılarını içerir

## GET `/api/puzzles/campaign`

Campaign ekranı için içerik taşımayan seviye kataloğunu döndürür.

### Response 200

```ts
interface CampaignPuzzleCatalogItem {
  id: string
  contentKey: string
  /** Matematiksel tablo sınıfı; geriye uyumluluk alanı. */
  difficulty: "EASY" | "MEDIUM" | "HARD"
  /** Prefill ve yardım politikası dahil kullanıcıya dönük sınıf. */
  effectiveDifficulty: "EASY" | "MEDIUM" | "HARD"
  campaignOrder: number
  campaignPack: "BEGINNER" | "EASY" | "MEDIUM" | "HARD" | "EXPERT"
  campaignLevel: number
  isUnlocked: boolean
}

interface CampaignPuzzleCatalogResponse {
  puzzles: CampaignPuzzleCatalogItem[]
  /** Yalnız campaign puzzle'larına ait, en fazla 150 bounded kayıt. */
  progress: UserProgressSummaryItem[]
}
```

### Davranış

- Her pack'in ilk seviyesi `isUnlocked: true` döner.
- Sonraki seviye yalnız önceki seviye normal tamamlandıysa açılır.
- Daha önce açılmış seviyeler replay veya answer reveal nedeniyle yeniden kilitlenmez.
- Katalog `standings`, `matches`, başlangıç skorları veya başka puzzle içeriği taşımaz.

## POST `/api/puzzles/[id]/attempt`

Server-authoritative bir oyun oturumu başlatır veya aktif oturumu sürdürür.

```ts
interface StartAttemptRequest {
  kind: "STANDARD" | "REPLAY"
  forceNew?: boolean
}

interface StartAttemptResponse {
  attempt: PuzzleAttemptSummary
}
```

- `forceNew: false`, aynı türde aktif attempt varsa onu döndürür.
- `forceNew: true`, aktif attempt'i `ABANDONED` yapar ve yeni attempt/event üretir.
- Tamamlanmış puzzle için `STANDARD` başlatılmaz; replay yeni `REPLAY` attempt'idir.
- `startedAt` ve başlangıç olayı sunucu tarafından yazılır.

## PUT `/api/puzzles/[id]/progress`

Bulmacanin canonical ilerleme durumunu kaydeder.

### Request

```ts
interface SaveProgressRequest {
  attemptId: string
  progress: PuzzleProgressState
}
```

### Response 200

```ts
interface SaveProgressResponse {
  progress: PuzzleProgressEnvelope
}
```

### Kurallar

- session user yoksa anonymous user olusturulur
- `progress.puzzleId` path param ile eslesmelidir
- attempt kullanıcıya ve path'teki puzzle'a ait ve `ACTIVE` olmalıdır
- yazma davranisi `last-write-wins` degil, attempt'in canonical `updatedAt` degeriyle kontrollu olur
- route `hintsUsed`, `hintTypes`, reveal alanları, `startedAt` ve `elapsedTimeSec`
  değerlerini attempt'ten yeniden üretir; istemci bu alanları değiştiremez
- response normalize edilmis `PuzzleProgressEnvelope` dondurur
- kilitli campaign seviyesi için yazma yapılmadan `403 FORBIDDEN` döner

## POST `/api/puzzles/[id]/submit`

Kullanicinin cozumunu dogrular, progress'i gunceller ve canonical aggregate'leri
attempt/completion kayitlarindan yeniden uretir.

### Header

```http
Idempotency-Key: <16-128 karakterlik istemci üretimli benzersiz anahtar>
```

İstemci aynı submit'i ağ hatası nedeniyle tekrar gönderirse aynı anahtarı yeniden kullanır.
Aynı anahtar farklı bir payload ile kullanılırsa `409 CONFLICT` döner.

### Request

```ts
interface SubmitPuzzleRequest {
  attemptId: string
  inputs: Record<string, { home: number; away: number }>
  // UX amaçlı gönderilebilir; resmi süreyi belirlemez.
  timeTakenSec: number
  completedMatchIds?: string[]
  revealedMatchIds?: string[]
  revealedCells?: Array<{ matchId: string; side: "home" | "away" }>
  hintsUsed?: number
  hintTypes?: Array<"reveal">
  isReplay?: boolean
}
```

### Response 200

```ts
interface SubmitPuzzleResponse {
  isCorrect: boolean
  isFirstCompletion: boolean
  idempotencyReplayed: boolean
  violations: ConstraintViolation[]
  feedback: SubmitFeedback
  progress: PuzzleProgressEnvelope
}
```

### Kurallar

- basarili cevapta bile `solution` public response'a eklenmez
- `allSolutions` icindeki herhangi bir cozumle tam eslesme yoksa `isCorrect: false`
- solve basariliysa:
  - progress `COMPLETED`
  - `completedAt` yazilir
  - `(userId, contentKey)` için ilk normal completion ise unique completion kaydı oluşur;
    attempt/submission fiziksel `puzzleId` revision'ını korur
  - replay dahil basarili attempt metrigi guncellenir
  - unique solved, difficulty ve streak yalnız benzersiz completion verisinden türetilir
- aynı idempotency key ile retry, ilk response progress snapshot'ını döndürür ve ikinci
  progress/attempt/aggregate etkisi üretmez
- aynı puzzle'a farklı key'lerle eşzamanlı doğru submit gelse bile unique completion
  constraint'i stats/streak etkisini bire indirir
- submit aktif attempt'e bağlıdır; terminal veya başka kullanıcıya ait attempt `409` döndürür
- resmi süre sunucudaki attempt başlangıcından hesaplanır
- hint/reveal sayaçları request'ten değil attempt kaydından okunur
- replay sonucu da attempt/event olarak kalıcıdır; `successfulAttempts`, süre ve yardım
  metriklerine dahil olur, `totalSolved` değerini artırmaz ve daha iyi replay
  `bestAttempt` özetini güncelleyebilir

### Neden `solution` Donmuyor?

Teknik dokumandaki "dogruysa cozum goster" yaklasimi bilincli olarak uygulanmayacak.
Dogru submit zaten tum skorlari kullanicinin ekraninda mevcut hale getirir. Public API'de cozum dondurmek gereksiz risk yaratir.

## POST `/api/puzzles/[id]/analyze`

Kullanıcının açık Analyze Board eylemi üzerine, girilmiş bütün skor hücreleri korunarak en
az bir global completion kalıp kalmadığını bounded solver ile denetler. Progress veya attempt
state'i değiştirmez.

### Request

```ts
interface AnalyzeBoardRequest {
  inputs: Record<string, { home: number | null; away: number | null }>
}
```

### Response 200

```ts
interface AnalyzeBoardResponse {
  mode: "GUIDED" | "ASSISTED"
  analysis: {
    completedMatchCount: number
    partialMatchCount: number
    remainingMatchCount: number
    fixedCellCount: number
    satisfiability: {
      status: "SAT" | "UNSAT" | "UNKNOWN"
      terminationReason:
        | "EXHAUSTED"
        | "MAX_SOLUTIONS"
        | "MAX_NODES"
        | "TIMEOUT"
        | "ABORTED"
      exhaustive: boolean
      completionExists: boolean | null
    }
    violations: ConstraintViolation[]
    issues: Array<{
      code:
        | "LOCAL_OVERFLOW"
        | "GLOBAL_DEAD_END"
        | "INCOMPLETE"
        | "ANALYSIS_INDETERMINATE"
    }>
  }
}
```

### Kurallar

- Yalnız Beginner 1–3 `GUIDED`, Beginner 4–15 `ASSISTED` olarak erişebilir; uygunluk ve
  campaign gate server-side denetlenir.
- Tam veya tek taraflı her dolu skor hücresi solver `fixedCells` constraint'ine dönüşür.
- `SAT` en az bir completion kanıtıdır; `UNSAT` yalnız exhaustive arama sonunda global
  dead-end anlamına gelir; `UNKNOWN` hiçbir zaman yanlış cevap sayılmaz.
- Bilinmeyen match id `400 BAD_REQUEST` ve `reason: "UNKNOWN_MATCH"` üretir.
- Response `solution`, `allSolutions`, önerilen skor veya solver solution map'i içermez.
- Analiz yalnız explicit kullanıcı eylemidir; skor girişinde otomatik çağrılmaz ve Final
  Table'ı değiştirmez.

## POST `/api/puzzles/[id]/hint`

Istenen hint turune gore ipucu dondurur ve progress'i gunceller.

### Request

```ts
interface HintRequest {
  attemptId: string
  hintType: "reveal"
  currentInputs: Record<string, { home: number; away: number }>
}
```

### Response 200

```ts
interface HintResponse {
  attempt: PuzzleAttemptSummary
  hint: {
    type: "reveal"
    message: string
    targetMatchId?: string
    revealedCell?: { matchId: string; side: "home" | "away" }
    revealedScore?: number
  }
  progressPatch: {
    hintsUsed: number
    hintTypes: Array<"reveal">
    revealedMatchIds?: string[]
    revealedCells?: Array<{ matchId: string; side: "home" | "away" }>
    revealedInputs?: Record<string, Partial<{ home: number; away: number }>>
  }
}
```

### Kurallar

- session user yoksa anonymous user olusturulur
- hint sayısı ve türü sunucuda attempt üzerinde artırılır; request içindeki sayaçlar
  canonical kabul edilmez
- scoreline `reveal` güvenli bir skor hücresini açar ve progress kaydini degistirir
- kullanicinin dolu hücresinin üzerine yazılmaz
- secim, mevcut girdilerle uyumlu `allSolutions` alt kumesine gore yapilir
- ayni hücre ikinci kez reveal edilmez
- tam answer reveal ayri endpoint'tir, normal completion ve campaign unlock uretmez
- güvenli ortak hücre yoksa veya mevcut girdiler çelişkiliyse skor açmadan açıklayıcı
  mesaj döner

## POST `/api/puzzles/[id]/answer`

```ts
interface AnswerRevealRequest {
  attemptId: string
  currentInputs?: Record<string, { home: number | null; away: number | null }>
}
```

- Answer reveal attempt'i `REVEALED` terminal durumuna geçirir ve
  `ANSWER_REVEALED` event'i üretir.
- Reveal zamanı ve resmi elapsed süre sunucu tarafından yazılır.
- Reveal unique completion, başarılı attempt veya campaign unlock üretmez; yalnız
  `answerReveals` attempt metriğine dahil olur.
- Yeniden çözmek için yeni attempt gerekir.

## Campaign Erisim Kurallari

- her pack'in ilk seviyesi aciktir
- ayni pack'te seviye `N`, `N-1` normal tamamlandiginda acilir
- read, progress, submit, analyze, hint ve answer route'lari ayni server-side policy'yi uygular
- kilitli route'lar `403 FORBIDDEN` ile gerekli önceki puzzle/seviye bilgisini döndürür
- kilitli bir seviye icin `403` doner
- answer reveal bir sonraki seviyeyi acmaz
- ayni attempt/idempotency key ile tekrarlanan submit ikinci stats veya unlock etkisi uretmez

## Kullanıcı Endpointleri

- `GET /api/puzzles/campaign`
- `GET /api/user/stats`
- `GET /api/user/progress`
- NextAuth route'lari

### GET `/api/user/stats`

Kimlik yoksa `{ user: null, stats: null }` döner. Kimlik varsa `stats` hızlı okuma
aggregate'inden aşağıdaki özeti döndürür:

```ts
interface UserStatsSummary {
  totalSolved: number
  successfulAttempts: number
  totalAttempts: number
  firstTrySolves: number
  assistedSolves: number
  answerReveals: number
  perfectSolves: number
  totalTimeSec: number
  bestDurationSec: number | null
  solvedEasy: number
  solvedMedium: number
  solvedHard: number
  currentStreak: number
  bestStreak: number
  avgTimeSec: number | null
}
```

`avgTimeSec`, toplam başarılı attempt süresinin `successfulAttempts` sayısına
bölünmüş yuvarlanmış değeridir. Aggregate canonical gerçek değildir; attempt başlatma,
başarılı submit ve answer reveal sırasında yeniden üretilir, ayrıca operasyonel
reconciliation komutuyla doğrulanabilir.

### GET `/api/user/progress?limit=20&cursor=<opaque>`

Kimlik yoksa `{ user: null, progress: null }` döner. Kimlik varsa en yeni ilerlemeler
`updatedAt DESC, id DESC` keyset düzeninde sayfalanır. `limit` varsayılan `20`, izin verilen
aralık `1–50`'dir; cursor istemci tarafından yorumlanmamalı veya üretilmemelidir.

```ts
interface UserProgressSummary {
  totalStarted: number
  totalCompleted: number
  byStatus: Record<"IN_PROGRESS" | "COMPLETED" | "ABANDONED", number>
  entries: UserProgressSummaryItem[]
  pageInfo: {
    limit: number
    hasMore: boolean
    nextCursor: string | null
  }
}
```

`totalStarted`, `totalCompleted` ve `byStatus` yalnız dönen sayfanın değil kullanıcının
tam geçmişinin aggregate'idir. Sonraki istek aynı `limit` ve `nextCursor` ile yapılır.
Bozuk cursor veya sınır dışı limit `400 BAD_REQUEST` döndürür.

## HTTP Status Kurallari

- `200`: basarili okuma veya islem
- `400`: schema validation hatasi
- `401`: zorunlu auth ama kimlik yok
- `403`: kaynaga erisim yasak
- `404`: puzzle veya kaynak bulunamadi
- `409`: stale progress save veya durum cakismasi
- `429`: rate limit
- `413`: izin verilen request body boyutu aşıldı
- `503`: zorunlu dependency veya request protection geçici olarak kullanılamıyor
- `500`: beklenmeyen sunucu hatasi

## Rate Limit Sözleşmesi

- auth/register: `20/minute/client`
- `POST /api/puzzles/[id]/attempt`: `60/minute/client`
- `POST /api/puzzles/[id]/submit`: `10/minute/client`
- `POST /api/puzzles/[id]/analyze`: `120/hour/client`
- `POST /api/puzzles/[id]/hint`: `30/hour/client`
- `POST /api/puzzles/[id]/answer`: `10/hour/client`
- `PUT /api/puzzles/[id]/progress`: `120/hour/client`
- telemetry: `60/minute/client`, en fazla 16 KiB JSON

`client`, hash'lenmiş session/anonim cookie veya yapılandırılmış trusted proxy zincirinden
çözülen IP'dir. Production limiter state'i zorunlu Redis'te ortaktır; limit aşımlarında
`429` + `Retry-After`, Redis kesintisinde fail-closed `503` + `Retry-After: 5` döner.

## Client Entegrasyon Beklentileri

Client katmani asagidaki sirayi izler:

1. puzzle fetch
2. progress hydrate
3. local runtime state initialize
4. input degisikliklerinde local validate
5. debounce ile progress save
6. explicit submit
7. solve basariliysa victory state

Bu nedenle API tasarimi local optimistic UI ve canonical remote save modelini desteklemelidir.
