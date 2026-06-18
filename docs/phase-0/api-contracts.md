# API Contracts

## Ilk Oynanabilir Dilim

Bu dosya, ilk oynanabilir web MVP icin zorunlu endpointleri tanimlar.

## Genel Kurallar

### Base Path

Teknik dokumanla hizali olarak Next.js route handlers kullanilacak:

- `/api/puzzles/daily`
- `/api/puzzles/[id]`
- `/api/puzzles/[id]/submit`
- `/api/puzzles/[id]/hint`
- `/api/puzzles/[id]/progress`

### Auth Semantigi

- request bir session user ile gelebilir
- session yoksa cookie-backed anonymous user kimligi uretilebilir
- progress yazan endpointler kullanici kimligi gerektirir; session user yoksa anonymous user otomatik olusturulur

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

## PUT `/api/puzzles/[id]/progress`

Bulmacanin canonical ilerleme durumunu kaydeder.

### Request

```ts
interface SaveProgressRequest {
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
- solved bulmaca icin gelen daha eski bir state yazilamaz
- yazma davranisi `last-write-wins` degil, `updatedAt` kontrollu olur
- route canonical alanlari normalize ederek kaydeder
- response normalize edilmis `PuzzleProgressEnvelope` dondurur

## POST `/api/puzzles/[id]/submit`

Kullanicinin cozumunu dogrular, progress'i gunceller, gerekiyorsa streak ve stats yazar.

### Request

```ts
interface SubmitPuzzleRequest {
  inputs: Record<string, { home: number; away: number }>
  timeTakenSec: number
}
```

### Response 200

```ts
interface SubmitPuzzleResponse {
  isCorrect: boolean
  violations: Array<{
    type: "POINTS" | "GOALS_FOR" | "GOALS_AGAINST" | "GOAL_DIFF" | "WIN_LOSS"
    teamId: string
    message: string
    severity: "error" | "warning"
  }>
}
```

### Kurallar

- basarili cevapta bile `solution` public response'a eklenmez
- exact solution eslesmesi yoksa `isCorrect: false`
- solve basariliysa:
  - progress `COMPLETED`
  - `completedAt` yazilir
  - daily ise streak guncellenir
  - stats aggregate guncellenir

### Neden `solution` Donmuyor?

Teknik dokumandaki "dogruysa cozum goster" yaklasimi bilincli olarak uygulanmayacak.
Dogru submit zaten tum skorlari kullanicinin ekraninda mevcut hale getirir. Public API'de cozum dondurmek gereksiz risk yaratir.

## POST `/api/puzzles/[id]/hint`

Istenen hint turune gore ipucu dondurur ve progress'i gunceller.

### Request

```ts
interface HintRequest {
  hintType: "direction" | "team_focus" | "reveal"
  currentInputs: Record<string, { home: number; away: number }>
}
```

### Response 200

```ts
interface HintResponse {
  hint: {
    type: "direction" | "team_focus" | "reveal"
    message: string
    targetMatchId?: string
    targetTeamId?: string
    revealedScore?: { home: number; away: number }
  }
  progressPatch: {
    hintsUsed: number
    hintTypes: Array<"direction" | "team_focus" | "reveal">
    revealedMatchIds?: string[]
    revealedInputs?: Record<string, { home: number; away: number }>
  }
}
```

### Kurallar

- session user yoksa anonymous user olusturulur
- `direction` ve `team_focus` cozum acmaz
- `reveal` bir match skorunu acar ve progress kaydini degistirir
- ayni match ikinci kez reveal edilmez

## Sonraki Faz Endpointleri

Bu endpointler veri modeli icinde korunur ancak ilk oynanabilir slice icin zorunlu degildir:

- `GET /api/puzzles/campaign`
- `GET /api/user/stats`
- `GET /api/user/progress`
- NextAuth route'lari

## HTTP Status Kurallari

- `200`: basarili okuma veya islem
- `400`: schema validation hatasi
- `401`: zorunlu auth ama kimlik yok
- `403`: kaynaga erisim yasak
- `404`: puzzle veya kaynak bulunamadi
- `409`: stale progress save veya durum cakismasi
- `429`: rate limit
- `500`: beklenmeyen sunucu hatasi

## Rate Limit Taslagi

- `POST /api/puzzles/[id]/submit`: `10/minute/IP`
- `POST /api/puzzles/[id]/hint`: `30/hour/user`
- `PUT /api/puzzles/[id]/progress`: `120/hour/user`

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
