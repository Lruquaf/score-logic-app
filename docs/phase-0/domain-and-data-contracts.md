# Domain And Data Contracts

## Tasarim Prensibi

Domain modeli, veritabanindaki kayit formatindan ve client'a acilan response formatindan ayridir. Bu proje icin en kritik sinir `solution` verisinin yalnizca server-private kalmasidir.

## Katmanlar

### 1. Database Record

Prisma'nin dondugu ham veri. JSON alanlari henuz parse edilmemis olabilir.

```ts
interface PuzzleRecord {
  id: string
  difficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
  teamsConfig: unknown
  standings: unknown
  matchIds: unknown
  solution: unknown
  dailyDate: Date | null
  campaignOrder: number | null
  isActive: boolean
  isTested: boolean
  createdAt: Date
}
```

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
  difficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
  teams: TeamEntity[]
  standings: StandingEntity[]
  matches: MatchPublicEntity[]
  solution: MatchSolutionEntity[]
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
  difficulty: "EASY" | "MEDIUM" | "HARD"
  inferenceSteps: number
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
  hintTypes: Array<"direction" | "team_focus" | "reveal">
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
  hintTypes: Array<"direction" | "team_focus" | "reveal">
  timeTakenSec: number | null
  completedAt: string | null
  currentState: PuzzleProgressState | null
}
```

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
- `hintsUsed` ve `hintTypes` envelope seviyesinde tutulur
- `timeTakenSec` yalnizca submit sonrasi yazilir
- `completedAt`, sadece `status === "COMPLETED"` ise dolu olur

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

## Submit Dogrulama Kontrati

Submit dogrulamasi iki asamali calisacak:

1. Semantik dogrulama
   `inputs` tam mi, skor araliklari gecerli mi, her match icin iki taraf da dolu mu
2. Oyun dogrulamasi
   `inputs`, puzzle `solution` ile birebir ayni mi

Ek olarak derive edilmis kontrol amacli kisit dogrulamasi calisacak:

- puan tutarliligi
- gol for/against tutarliligi
- averaj tutarliligi
- kazanma/beraberlik/maglubiyet tutarliligi

Ancak son hakem exact solution eslesmesidir.

## Hint Kontrati

Hintler tek tip degildir. Canonical tipler:

```ts
type HintType = "direction" | "team_focus" | "reveal"
```

Davranis:

- `direction`: cozumun bir parcasini acmaz, yalnizca odak takimi verir
- `team_focus`: belirli bir mac hakkinda sonuc yonu verir
- `reveal`: belirli bir macin skorunu aciklar

`reveal` haricindeki hintler canonical progress'e skor yazmaz.
`reveal` kullanildiginda hem `currentState.revealedMatchIds` hem de ilgili `inputs` guncellenir.

## Streak ve Stats Kontrati

### Streak

- yalnizca `daily` puzzle tamamlandiginda artar
- ayni gun ayni veya farkli daily puzzle icin ikinci kez artmaz
- campaign solve streak sayilmaz

### Stats

`UserStats` alanlari:

```ts
interface UserStatsAggregate {
  userId: string
  totalSolved: number
  perfectSolves: number
  totalTimeSec: number
  solvedEasy: number
  solvedMedium: number
  solvedHard: number
}
```

Hesap kurallari:

- `perfectSolves`: solve aninda `hintsUsed === 0`
- `avgTimeSec`: tabloda fiziksel kolon olarak degil, query sirasinda derive edilir

## Veritabaninda Kalacak Ama Ilk Dikey Dilimde Kritik Olmayan Alanlar

- `campaignOrder`
- `isTested`
- `hintTypes`
- `email`, `accounts`, `sessions`

Bu alanlar schema'da korunur ancak ilk oynanabilir teslimin kritik yolunda yer almayabilir.
