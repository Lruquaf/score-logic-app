# ScoreLogic — Web Uygulaması Teknik Dokümanı
### Uçtan Uca Mimari, Tasarım Sistemi ve İmplementasyon Rehberi
**Sürüm 1.0 — Haziran 2026**

---

## İçindekiler

1. Tech Stack ve Mimari Kararlar
2. Tasarım Sistemi ("Night Match" Teması)
3. Proje Dosya Yapısı
4. Veritabanı Şeması (Prisma)
5. Bulmaca Motoru (Core Algorithm)
6. Backend — API Katmanı
7. State Yönetimi (Zustand)
8. Component Kütüphanesi
9. Sayfalar ve Routing
10. Animasyon Sistemi
11. Kimlik Doğrulama (Auth)
12. Deployment ve DevOps
13. Test Stratejisi
14. Performans ve Güvenlik

---

## 1. Tech Stack ve Mimari Kararlar

### 1.1 Teknoloji Yığını (Full Stack)

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                             │
│  Next.js 15 (App Router)   TypeScript 5                │
│  Tailwind CSS 4            Framer Motion 11             │
│  Zustand 5                 React Query 5                │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js API Routes)         │
│  Prisma 5 ORM              NextAuth.js v5               │
│  Zod (validation)          Jose (JWT)                   │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    ALTYAPI                              │
│  PostgreSQL 16             Upstash Redis                │
│  Vercel (hosting)          Vercel Blob (assets)         │
│  Sentry (monitoring)       PostHog (analytics)          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Karar Gerekçeleri

| Karar | Seçilen | Reddedilen | Gerekçe |
|-------|---------|-----------|---------|
| Framework | Next.js 15 App Router | Vite + React SPA | SSR, SEO, API routes tek repoda; App Router RSC ile sunucu yükü azalır |
| Stil | Tailwind 4 | Styled Components | Tailwind v4 ile CSS variables native; daha az bundle |
| State | Zustand | Redux Toolkit | Puzzle state için Zustand yeterli; Redux overkill |
| ORM | Prisma | Drizzle | Daha olgun ekosistem; auto-generated types bulmaca modeli için kritik |
| Cache | Upstash Redis | Railway Redis | Serverless'a uygun; Vercel Edge ile yakın |
| Auth | NextAuth v5 | Clerk | Açık kaynak, veri sahipliği; anonim session desteği |

### 1.3 Mimari Prensipler

**Server Components First:** Puan tablosu verisi, bulmaca meta verisi → RSC. Etkileşimli puzzle grid → Client Component. Bu ayrım ilk sayfa yükünü ~40% hızlandırır.

**Optimistic Updates:** Skor girişleri anında UI'da güncellenir, validasyon asenkron çalışır. Constraint ihlali gelirse animasyonla geri alınır.

**Puzzle State Machine:** Bulmaca durumu saf bir state machine olarak modellenir. İmkansız geçişler tip sistemiyle engellenir.

```
IDLE → LOADING → ACTIVE → CHECKING → SOLVED
                        ↘             ↗
                          HINT_SHOWN
                        ↘
                          FAILED (max hata aşımı)
```

---

## 2. Tasarım Sistemi — "Night Match" Teması

### 2.1 Konsept ve İlham

**Tema:** Gece maçı stadyumu. Sahayı aydınlatan floodlight lambaları, elektronik skor panosu, rafineri kanalındaki taktik not defteri.

**İmza Element — Split-Flap Animasyonu:** Skor hücresi doğru olarak tamamlandığında rakamlar "flip" eder — havalimanı kalkış panolarındaki gibi. Bu hem tematiktir (gerçek skor panoları böyle çalışırdı) hem de kullanıcıya net bir "doğru!" sinyali verir. Bulmacada en yüksek tatmin momenti görsel olarak vurgulanır.

**Üç default'tan nasıl uzaklaşıldı:**
- ❌ Krem arkaplan + terracotta: tam tersi — koyu, gece modu
- ❌ Near-black + acid yeşil: altın/amber kullanıyoruz, yeşil yalnızca başarı durumu
- ❌ Broadsheet: dijital skor panosu estetiği — mono font, grid-first

### 2.2 Renk Sistemi

```css
/* globals.css — Design Tokens */
:root {
  /* === Arkaplanlar (Derinlik Hiyerarşisi) === */
  --night:    #0A0F1E;  /* en derin - sayfa zemin */
  --pitch:    #111827;  /* section arkaplanı */
  --dugout:   #1A2438;  /* kart / panel */
  --bench:    #1E2D45;  /* elevated card, modal */
  --rail:     #243352;  /* border, divider, grid çizgisi */

  /* === Birincil Aksanlar === */
  --light:    #F7C948;  /* Floodlight altını — PRIMARY */
  --light-dim:#C49A2E;  /* Hover durumunda hafif kararmış */
  --light-glow: rgba(247, 201, 72, 0.15); /* Glow efekti için */

  /* === Semantik Renkler === */
  --turf:     #22C55E;  /* BAŞARI — gol, doğru skor */
  --turf-dim: rgba(34, 197, 94, 0.15);
  --red-card: #EF4444;  /* HATA — kısıt ihlali */
  --red-dim:  rgba(239, 68, 68, 0.12);
  --yellow:   #F59E0B;  /* UYARI — kısmi doğru */
  --signal:   #60A5FA;  /* INFO / nötr vurgu */

  /* === Metin === */
  --snow:     #F0F4FF;  /* birincil metin */
  --mist:     #8B9AB5;  /* ikincil metin */
  --fog:      #4A5568;  /* disabled / placeholder */

  /* === Özel === */
  --mono: 'JetBrains Mono', 'Courier New', monospace;
  --sans: 'Inter', system-ui, sans-serif;
  --display: 'Syne', 'Inter', sans-serif;

  /* === Spacing Scale === */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;

  /* === Border Radius === */
  --r-sm:  4px;
  --r-md:  8px;
  --r-lg:  12px;
  --r-xl:  16px;
  --r-2xl: 24px;

  /* === Gölge === */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.6);
  --shadow-glow: 0 0 20px var(--light-glow);
}
```

### 2.3 Tipografi Sistemi

```css
/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

/* Tip Ölçeği */
.text-xs    { font: 400 11px/1.5 var(--sans); }
.text-sm    { font: 400 13px/1.5 var(--sans); }
.text-base  { font: 400 15px/1.6 var(--sans); }
.text-lg    { font: 500 17px/1.5 var(--sans); }

/* Mono — sadece sayısal veriler için */
.text-score  { font: 700 20px/1 var(--mono); letter-spacing: 0.02em; }
.text-stat   { font: 500 13px/1 var(--mono); }
.text-timer  { font: 700 28px/1 var(--mono); letter-spacing: 0.1em; }

/* Display — başlıklar */
.text-h1     { font: 800 42px/1.1 var(--display); letter-spacing: -0.03em; }
.text-h2     { font: 800 28px/1.2 var(--display); letter-spacing: -0.02em; }
.text-h3     { font: 700 20px/1.3 var(--display); }
.text-label  { font: 600 11px/1 var(--sans); letter-spacing: 0.08em; text-transform: uppercase; }
```

### 2.4 Component Design Tokens

```css
/* Tablo Tokenları */
.standings-table {
  --cell-h: 48px;
  --cell-pad: 0 16px;
  --header-bg: var(--rail);
  --row-bg: var(--dugout);
  --row-alt-bg: #16202F;  /* zebra stripe */
  --row-hover: #1F2E45;
  --border: 1px solid var(--rail);
}

/* Fixture Grid Tokenları */
.fixture-grid {
  --match-h: 56px;
  --score-cell-w: 52px;
  --score-cell-h: 52px;
  --score-cell-bg: var(--rail);
  --score-cell-focus: var(--light);
  --score-cell-correct: var(--turf);
  --score-cell-error: var(--red-card);
}

/* Buton Tokenları */
.btn-primary {
  background: var(--light);
  color: #0A0F1E;
  font: 600 14px/1 var(--sans);
  padding: 12px 24px;
  border-radius: var(--r-lg);
  transition: transform 0.1s, box-shadow 0.2s;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}
```

### 2.5 Ekran Düzeni Prensipleri

```
MASAÜSTÜ (>1024px):
┌────────────────────────────────────────────────────────────────┐
│  HEADER: logo + streak + timer + hint button          ← 64px  │
├──────────────────────────────────┬─────────────────────────────┤
│                                  │                             │
│   PUAN TABLOSU                   │   YARDIM PANELİ             │
│   (tam genişlik alt kısımda)     │   (sağ kenar, sticky)       │
│                                  │                             │
│   FİKSTÜR GRID                   │                             │
│   (merkez, ana etkileşim)        │                             │
│                                  │                             │
├──────────────────────────────────┴─────────────────────────────┤
│  NUMPAD (mobil'de altta, masaüstünde yok)              ← 80px  │
└────────────────────────────────────────────────────────────────┘

MOBİL (<768px):
┌─────────────────────────┐
│ HEADER (kompakt)  44px  │
├─────────────────────────┤
│ PUAN TABLOSU            │
│ (scroll edilebilir)     │
├─────────────────────────┤
│ FİKSTÜR GRID            │
│ (ana etkileşim)         │
├─────────────────────────┤
│ NUMPAD                  │
│ (sticky bottom)  ←80px │
└─────────────────────────┘
```

---

## 3. Proje Dosya Yapısı

```
scorelogic/
├── app/                            # Next.js App Router
│   ├── (auth)/                     # Auth route grubu
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (game)/                     # Oyun route grubu
│   │   ├── layout.tsx              # Oyun layout (header, streak)
│   │   ├── page.tsx                # Ana sayfa (Home)
│   │   ├── daily/
│   │   │   └── page.tsx            # Günlük bulmaca
│   │   ├── campaign/
│   │   │   ├── page.tsx            # Kampanya haritası
│   │   │   └── [puzzleId]/
│   │   │       └── page.tsx        # Kampanya bulmacası
│   │   ├── puzzle/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Genel bulmaca sayfası
│   │   └── stats/
│   │       └── page.tsx            # Kişisel istatistikler
│   ├── api/                        # API Routes
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   ├── puzzles/
│   │   │   ├── daily/
│   │   │   │   └── route.ts        # GET /api/puzzles/daily
│   │   │   ├── campaign/
│   │   │   │   └── route.ts        # GET /api/puzzles/campaign
│   │   │   └── [id]/
│   │   │       ├── route.ts        # GET /api/puzzles/:id
│   │   │       ├── submit/
│   │   │       │   └── route.ts    # POST /api/puzzles/:id/submit
│   │   │       └── hint/
│   │   │           └── route.ts    # POST /api/puzzles/:id/hint
│   │   └── user/
│   │       ├── stats/
│   │       │   └── route.ts        # GET /api/user/stats
│   │       └── progress/
│   │           └── route.ts        # GET /api/user/progress
│   ├── layout.tsx                  # Root layout
│   └── globals.css                 # Design tokens + base styles
│
├── components/                     # Paylaşılan bileşenler
│   ├── ui/                         # Atomik UI bileşenleri
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Tooltip.tsx
│   │   └── ProgressBar.tsx
│   ├── puzzle/                     # Bulmaca bileşenleri
│   │   ├── StandingsTable.tsx      # Puan tablosu (RSC)
│   │   ├── FixtureGrid.tsx         # Ana fikstür gridi (Client)
│   │   ├── ScoreCell.tsx           # Tek skor hücresi + split-flap
│   │   ├── NumPad.tsx              # Sayı klavyesi
│   │   ├── ConstraintBar.tsx       # Kısıt durum çubuğu
│   │   ├── HintModal.tsx           # İpucu modal
│   │   ├── VictoryScreen.tsx       # Zafer ekranı
│   │   └── PuzzleHeader.tsx        # Zamanlayıcı, ipucu, streak
│   ├── game/                       # Oyun akışı bileşenleri
│   │   ├── DailyCard.tsx           # Ana sayfadaki günlük kart
│   │   ├── CampaignMap.tsx         # Kampanya haritası
│   │   ├── StatsPanel.tsx          # İstatistik paneli
│   │   └── ShareCard.tsx           # Paylaşım kartı
│   └── layout/                     # Layout bileşenleri
│       ├── Header.tsx
│       ├── StreakDisplay.tsx
│       └── Footer.tsx
│
├── lib/                            # Çekirdek kütüphaneler
│   ├── engine/                     # Bulmaca motoru
│   │   ├── types.ts                # Tüm tipler
│   │   ├── generator.ts            # Bulmaca üreteci
│   │   ├── solver.ts               # Backtracking çözücü
│   │   ├── validator.ts            # Kısıt doğrulayıcı
│   │   ├── hint.ts                 # İpucu üreteci
│   │   └── difficulty.ts           # Zorluk sınıflandırıcı
│   ├── db/
│   │   ├── prisma.ts               # Prisma client singleton
│   │   └── queries/
│   │       ├── puzzles.ts
│   │       └── users.ts
│   ├── cache/
│   │   └── redis.ts                # Upstash Redis client
│   ├── auth/
│   │   └── config.ts               # NextAuth config
│   └── utils/
│       ├── share.ts                # Paylaşım metni üretici
│       ├── streak.ts               # Streak hesaplama
│       └── format.ts               # Sayı/süre formatlama
│
├── store/                          # Zustand stores
│   ├── puzzleStore.ts              # Aktif bulmaca state
│   ├── userStore.ts                # Kullanıcı bilgileri
│   └── settingsStore.ts            # Tercihler (ses, animasyon)
│
├── hooks/                          # Custom React hooks
│   ├── usePuzzle.ts                # Bulmaca mantığı hook
│   ├── useTimer.ts                 # Zamanlayıcı hook
│   ├── useStreak.ts                # Streak takibi
│   └── useConstraints.ts           # Gerçek zamanlı kısıt kontrolü
│
├── prisma/
│   ├── schema.prisma               # Veritabanı şeması
│   └── migrations/                 # Migration dosyaları
│
├── scripts/
│   └── generate-puzzles.ts         # Bulmaca üretim scripti
│
├── public/
│   ├── fonts/
│   └── icons/
│
├── tests/
│   ├── unit/
│   │   ├── engine/
│   │   │   ├── solver.test.ts
│   │   │   └── validator.test.ts
│   │   └── utils/
│   ├── integration/
│   │   └── api/
│   └── e2e/
│       └── puzzle.spec.ts
│
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Veritabanı Şeması (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// TEMEL MODELler
// ============================================

model Team {
  id          String  @id @default(cuid())
  code        String  @unique @db.VarChar(5)   // "ARJ", "ENG"
  nameEn      String                            // "Argentina"
  nameTr      String?                           // "Arjantin"
  flagEmoji   String? @db.VarChar(10)           // "🇦🇷"
  continent   String?                           // "SOUTH_AMERICA"
  createdAt   DateTime @default(now())

  @@index([code])
  @@map("teams")
}

model Puzzle {
  id             String       @id @default(cuid())
  difficulty     Difficulty
  inferenceSteps Int                              // çözücünün adım sayısı
  teamsConfig    Json                             // Team[] + pozisyon bilgisi
  standings      Json                             // Standing[] (gizli olmayan)
  matchIds       Json                             // Match[] (sadece takım ID'leri, skor gizli)
  solution       Json                             // Match[] (tam skorlar — SADECE BACKEND)
  dailyDate      DateTime?    @unique @db.Date    // null = kampanya bulmacası
  campaignOrder  Int?         @unique             // null = günlük bulmaca
  isActive       Boolean      @default(true)
  isTested       Boolean      @default(false)    // Manuel QA onayı
  createdAt      DateTime     @default(now())

  progress       UserPuzzleProgress[]

  @@index([dailyDate])
  @@index([campaignOrder])
  @@index([difficulty])
  @@map("puzzles")
}

model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  emailVerified DateTime?
  name          String?
  image         String?
  isAnonymous   Boolean   @default(false)
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @default(now())

  accounts   Account[]
  sessions   Session[]
  progress   UserPuzzleProgress[]
  streak     DailyStreak?
  stats      UserStats?

  @@map("users")
}

model UserPuzzleProgress {
  id            String        @id @default(cuid())
  userId        String
  puzzleId      String
  status        PuzzleStatus  @default(IN_PROGRESS)
  attempts      Int           @default(0)
  hintsUsed     Int           @default(0)
  hintTypes     String[]      @default([])        // ["soft","medium","hard"]
  timeTakenSec  Int?
  currentState  Json?                             // Kayıtlı ara durum
  completedAt   DateTime?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  puzzle Puzzle @relation(fields: [puzzleId], references: [id])

  @@unique([userId, puzzleId])
  @@index([userId, status])
  @@map("user_puzzle_progress")
}

model DailyStreak {
  userId         String  @id
  currentStreak  Int     @default(0)
  bestStreak     Int     @default(0)
  lastPlayedDate String?                // "2026-06-16" formatı

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("daily_streaks")
}

model UserStats {
  userId          String @id
  totalSolved     Int    @default(0)
  perfectSolves   Int    @default(0)    // ipuçsuz çözüm
  totalTimeSec    Int    @default(0)
  solvedEasy      Int    @default(0)
  solvedMedium    Int    @default(0)
  solvedHard      Int    @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_stats")
}

// NextAuth gerekli modeller
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

// ============================================
// ENUM'lar
// ============================================

enum Difficulty {
  EASY
  MEDIUM
  HARD
}

enum PuzzleStatus {
  IN_PROGRESS
  COMPLETED
  ABANDONED
}
```

---

## 5. Bulmaca Motoru (Core Algorithm)

### 5.1 Tip Tanımları

```typescript
// lib/engine/types.ts

export interface Team {
  id: string
  code: string      // "ARJ"
  nameEn: string    // "Argentina"
  flagEmoji?: string
}

export interface Standing {
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

export interface Match {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeScore?: number   // undefined = gizli
  awayScore?: number
}

export interface Puzzle {
  id: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  teams: Team[]
  standings: Standing[]
  matches: Match[]           // Oyuncuya gösterilen (skorlar yok)
  inferenceSteps?: number
}

export interface PuzzleSolution {
  matches: Required<Match>[] // Tüm skorlar dolu
}

// Kısıt doğrulama için
export interface ConstraintViolation {
  type: 'POINTS' | 'GOALS_FOR' | 'GOALS_AGAINST' | 'GOAL_DIFF' | 'WIN_LOSS'
  teamId: string
  message: string
  severity: 'error' | 'warning'
}

// Bulmaca generator çıktısı
export interface GeneratedPuzzle {
  standings: Standing[]
  matches: Required<Match>[]
  isValid: boolean
  solutionCount: number
  inferenceSteps: number
}
```

### 5.2 Backtracking Çözücü

```typescript
// lib/engine/solver.ts

import type { Standing, Match } from './types'

type ScoreMap = Map<string, { home: number; away: number }>

/**
 * Verilen puan tablosu için tüm geçerli skor kombinasyonlarını bulur.
 * Erken çıkış: 2+ çözüm bulunduğunda durar (teklik testi için yeterli)
 */
export function solve(
  standings: Standing[],
  matches: Match[],
  maxSolutions = 2
): ScoreMap[] {
  const solutions: ScoreMap[] = []
  const current: ScoreMap = new Map()

  // İstatistik lookup map'i
  const statsMap = new Map(standings.map(s => [s.teamId, s]))

  function backtrack(matchIndex: number): void {
    if (solutions.length >= maxSolutions) return // Erken çıkış

    if (matchIndex === matches.length) {
      // Tüm maçlar atandı — son doğrulama
      if (validateAll(standings, current)) {
        solutions.push(new Map(current))
      }
      return
    }

    const match = matches[matchIndex]

    // Gerçekçi skor aralığı: 0-5 arası (futbolda nadir 6+ gol)
    for (let home = 0; home <= 5; home++) {
      for (let away = 0; away <= 5; away++) {
        current.set(match.id, { home, away })

        // Kısmi atama ile tutarlılık kontrolü
        if (isPartiallyConsistent(standings, matches, current, matchIndex)) {
          backtrack(matchIndex + 1)
        }

        if (solutions.length >= maxSolutions) return
      }
    }

    current.delete(match.id)
  }

  backtrack(0)
  return solutions
}

/**
 * Mevcut kısmi atama tutarlı mı kontrol eder.
 * Kesin ihlaller varken daha derin gitmeyi önler.
 */
function isPartiallyConsistent(
  standings: Standing[],
  matches: Match[],
  current: ScoreMap,
  upToIndex: number
): boolean {
  const statsMap = new Map(standings.map(s => [s.teamId, { ...s }]))

  // Atanmış maçlar için istatistikleri hesapla
  const computed = new Map<string, {
    played: number; won: number; drawn: number; lost: number
    goalsFor: number; goalsAgainst: number
  }>()

  for (const s of standings) {
    computed.set(s.teamId, {
      played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0
    })
  }

  for (const [matchId, score] of current) {
    const match = matches.find(m => m.id === matchId)!
    const home = computed.get(match.homeTeamId)!
    const away = computed.get(match.awayTeamId)!

    home.played++; away.played++
    home.goalsFor += score.home; home.goalsAgainst += score.away
    away.goalsFor += score.away; away.goalsAgainst += score.home

    if (score.home > score.away) {
      home.won++; away.lost++
    } else if (score.home < score.away) {
      away.won++; home.lost++
    } else {
      home.drawn++; away.drawn++
    }
  }

  // Hesaplanan değerler hedef istatistikleri aşmamalı
  for (const [teamId, computed_stats] of computed) {
    const target = statsMap.get(teamId)!

    if (computed_stats.won > target.won) return false
    if (computed_stats.drawn > target.drawn) return false
    if (computed_stats.lost > target.lost) return false
    if (computed_stats.goalsFor > target.goalsFor) return false
    if (computed_stats.goalsAgainst > target.goalsAgainst) return false
  }

  return true
}

/**
 * Tüm atama tamamlandığında tam doğrulama
 */
function validateAll(standings: Standing[], current: ScoreMap): boolean {
  const computed = computeStats(standings, current)

  for (const [teamId, stats] of computed) {
    const target = standings.find(s => s.teamId === teamId)!

    if (stats.won !== target.won) return false
    if (stats.drawn !== target.drawn) return false
    if (stats.lost !== target.lost) return false
    if (stats.goalsFor !== target.goalsFor) return false
    if (stats.goalsAgainst !== target.goalsAgainst) return false
  }

  return true
}

export function computeStats(standings: Standing[], current: ScoreMap) {
  const result = new Map<string, {
    played: number; won: number; drawn: number; lost: number
    goalsFor: number; goalsAgainst: number; points: number
  }>()

  for (const s of standings) {
    result.set(s.teamId, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }

  // ... (isPartiallyConsistent ile aynı mantık, points dahil)
  return result
}

/** Bulmacının tek çözümü var mı? */
export function isUniqueSolution(standings: Standing[], matches: Match[]): boolean {
  const solutions = solve(standings, matches, 2)
  return solutions.length === 1
}
```

### 5.3 Bulmaca Üreteci

```typescript
// lib/engine/generator.ts

import type { Standing, Match, Team, GeneratedPuzzle } from './types'
import { solve, isUniqueSolution } from './solver'
import { classifyDifficulty } from './difficulty'

const MAX_GOALS_PER_MATCH = 6
const TYPICAL_GOAL_AVG = 2.5 // maç başı ortalama gol

/**
 * 4 takımlı bir grup için rastgele geçerli bulmaca üretir.
 * Teklik doğrulanana kadar yeniden dener.
 */
export async function generatePuzzle(
  teams: Team[],
  maxAttempts = 500
): Promise<GeneratedPuzzle | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const matches = generateRandomMatches(teams)
    const standings = computeStandings(teams, matches)

    // Teklik kontrolü
    const solutions = solve(standings, matches.map(m => ({
      id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId
    })), 2)

    if (solutions.length === 1) {
      // İnferans adımlarını say (zorluk için)
      const steps = countInferenceSteps(standings, matches)

      return {
        standings,
        matches,
        isValid: true,
        solutionCount: 1,
        inferenceSteps: steps
      }
    }
  }

  return null // maxAttempts sonra başarısız
}

function generateRandomMatches(teams: Team[]): Required<Match>[] {
  const matches: Required<Match>[] = []
  let matchId = 0

  // 4 takım, 6 kombinasyon
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const homeScore = weightedGoalSample()
      const awayScore = weightedGoalSample()

      matches.push({
        id: `m${++matchId}`,
        homeTeamId: teams[i].id,
        awayTeamId: teams[j].id,
        homeScore,
        awayScore
      })
    }
  }

  return matches
}

/**
 * Gerçekçi futbol skorları için ağırlıklı örnekleme.
 * 0-1 arası daha olası, 5+ nadir.
 */
function weightedGoalSample(): number {
  const weights = [20, 30, 22, 15, 8, 4, 1] // 0,1,2,3,4,5 için ağırlıklar
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total

  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return 0
}

function computeStandings(teams: Team[], matches: Required<Match>[]): Standing[] {
  const stats = new Map<string, Standing>()

  for (const team of teams) {
    stats.set(team.id, {
      teamId: team.id, position: 0, played: 0,
      won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0
    })
  }

  for (const match of matches) {
    const home = stats.get(match.homeTeamId)!
    const away = stats.get(match.awayTeamId)!

    home.played++; away.played++
    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore

    if (match.homeScore > match.awayScore) {
      home.won++; home.points += 3; away.lost++
    } else if (match.homeScore < match.awayScore) {
      away.won++; away.points += 3; home.lost++
    } else {
      home.drawn++; home.points++; away.drawn++; away.points++
    }
  }

  // GoalDiff hesapla ve sırala
  const sorted = [...stats.values()]
    .map(s => ({ ...s, goalDiff: s.goalsFor - s.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
    .map((s, i) => ({ ...s, position: i + 1 }))

  return sorted
}
```

### 5.4 Kısıt Doğrulayıcı (Gerçek Zamanlı)

```typescript
// lib/engine/validator.ts

import type { Standing, Match, ConstraintViolation } from './types'

/**
 * Kullanıcının mevcut girişlerini gerçek zamanlı olarak doğrular.
 * Ihlalleri döner (varsa).
 */
export function validatePartialSolution(
  standings: Standing[],
  matches: Match[],
  userInputs: Map<string, { home: number; away: number }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const statsMap = new Map(standings.map(s => [s.teamId, s]))

  // Girilen maçlardan istatistikleri hesapla
  const computed = new Map<string, {
    played: number; won: number; drawn: number; lost: number
    goalsFor: number; goalsAgainst: number
  }>()

  for (const s of standings) {
    computed.set(s.teamId, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 })
  }

  for (const match of matches) {
    const input = userInputs.get(match.id)
    if (!input) continue

    const home = computed.get(match.homeTeamId)!
    const away = computed.get(match.awayTeamId)!

    home.played++; away.played++
    home.goalsFor += input.home; home.goalsAgainst += input.away
    away.goalsFor += input.away; away.goalsAgainst += input.home

    if (input.home > input.away) { home.won++; away.lost++ }
    else if (input.home < input.away) { away.won++; home.lost++ }
    else { home.drawn++; away.drawn++ }
  }

  // Hedef değerleri aşma kontrolü
  for (const [teamId, calc] of computed) {
    const target = statsMap.get(teamId)!

    if (calc.won > target.won) {
      violations.push({
        type: 'POINTS', teamId,
        message: `${target.teamId} fazla galibiyet`,
        severity: 'error'
      })
    }

    if (calc.goalsFor > target.goalsFor) {
      violations.push({
        type: 'GOALS_FOR', teamId,
        message: `${target.teamId} attığı gol limitini aştı`,
        severity: 'error'
      })
    }

    if (calc.goalsAgainst > target.goalsAgainst) {
      violations.push({
        type: 'GOALS_AGAINST', teamId,
        message: `${target.teamId} yediği gol limitini aştı`,
        severity: 'error'
      })
    }
  }

  return violations
}

/**
 * Girilen tüm skorların toplu doğrulaması (submit anında)
 */
export function validateCompleteSolution(
  standings: Standing[],
  matches: Match[],
  userInputs: Map<string, { home: number; away: number }>
): { isCorrect: boolean; violations: ConstraintViolation[] } {
  // Tüm maçlar girilmeli
  if (userInputs.size !== matches.length) {
    return { isCorrect: false, violations: [] }
  }

  const violations = validatePartialSolution(standings, matches, userInputs)
  return { isCorrect: violations.length === 0, violations }
}
```

### 5.5 İpucu Üreteci

```typescript
// lib/engine/hint.ts

import type { Standing, Match } from './types'
import { solve } from './solver'

export type HintType = 'direction' | 'team_focus' | 'reveal'

export interface Hint {
  type: HintType
  message: string
  targetMatchId?: string
  targetTeamId?: string
  revealedScore?: { home: number; away: number }
}

/**
 * Kullanıcının mevcut durumuna göre en faydalı ipucunu üretir.
 */
export function generateHint(
  standings: Standing[],
  matches: Match[],
  userInputs: Map<string, { home: number; away: number }>,
  hintType: HintType,
  solution: Map<string, { home: number; away: number }>
): Hint {
  const emptyMatches = matches.filter(m => !userInputs.has(m.id))

  switch (hintType) {
    case 'direction': {
      // En kısıtlı takımı bul (en az olası skor kombinasyonu)
      const targetTeam = findMostConstrainedTeam(standings, matches, userInputs)
      return {
        type: 'direction',
        message: `${targetTeam} takımının maçlarına odaklan — bu takım en belirleyici kısıtlara sahip.`,
        targetTeamId: targetTeam
      }
    }

    case 'team_focus': {
      // Çözüme en yakın maçı bul
      const easiestMatch = emptyMatches[0] // Gerçekte en kısıtlıyı seç
      if (!easiestMatch) return { type: 'team_focus', message: 'Tüm maçlar girilmiş.' }

      const sol = solution.get(easiestMatch.id)!
      const homeTeam = standings.find(s => s.teamId === easiestMatch.homeTeamId)

      return {
        type: 'team_focus',
        message: `Bu maçta ev sahibi takım ${sol.home > sol.away ? 'kazandı' : sol.home < sol.away ? 'kaybetti' : 'berabere kaldı'}.`,
        targetMatchId: easiestMatch.id
      }
    }

    case 'reveal': {
      // Henüz girilmemiş bir maçın skorunu doğrudan göster
      const targetMatch = emptyMatches[Math.floor(Math.random() * emptyMatches.length)]
      if (!targetMatch) return { type: 'reveal', message: 'Gösterilecek boş maç kalmadı.' }

      const sol = solution.get(targetMatch.id)!
      return {
        type: 'reveal',
        message: `Bu maçın skoru: ${sol.home} - ${sol.away}`,
        targetMatchId: targetMatch.id,
        revealedScore: sol
      }
    }
  }
}

function findMostConstrainedTeam(
  standings: Standing[],
  matches: Match[],
  userInputs: Map<string, { home: number; away: number }>
): string {
  // Her takım için kalan "serbestlik derecesini" hesapla
  let minFreedom = Infinity
  let targetTeamId = standings[0].teamId

  for (const standing of standings) {
    const remainingMatches = matches.filter(
      m => !userInputs.has(m.id) &&
      (m.homeTeamId === standing.teamId || m.awayTeamId === standing.teamId)
    ).length

    if (remainingMatches < minFreedom && remainingMatches > 0) {
      minFreedom = remainingMatches
      targetTeamId = standing.teamId
    }
  }

  return targetTeamId
}
```

---

## 6. Backend — API Katmanı

### 6.1 Günlük Bulmaca Endpoint'i

```typescript
// app/api/puzzles/daily/route.ts

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { redis } from '@/lib/cache/redis'

export const runtime = 'nodejs'
export const revalidate = 60 // 1 dakikada bir revalidate

export async function GET() {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const dateKey = today.toISOString().split('T')[0] // "2026-06-16"

    // Cache kontrolü
    const cacheKey = `daily:${dateKey}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json(JSON.parse(cached as string))
    }

    // Veritabanından çek
    const puzzle = await prisma.puzzle.findFirst({
      where: {
        dailyDate: today,
        isActive: true
      }
    })

    if (!puzzle) {
      return NextResponse.json({ error: 'Günlük bulmaca bulunamadı' }, { status: 404 })
    }

    // solution alanını ÇIKAR — frontend'e gönderilmez
    const { solution: _solution, ...safePuzzle } = puzzle

    // Kullanıcı ilerleme bilgisini ekle
    const session = await getServerSession(authConfig)
    let userProgress = null

    if (session?.user?.id) {
      userProgress = await prisma.userPuzzleProgress.findUnique({
        where: { userId_puzzleId: { userId: session.user.id, puzzleId: puzzle.id } }
      })
    }

    const response = {
      puzzle: safePuzzle,
      userProgress: userProgress ? {
        status: userProgress.status,
        currentState: userProgress.currentState,
        hintsUsed: userProgress.hintsUsed
      } : null
    }

    // 5 dakika cache
    await redis.setex(cacheKey, 300, JSON.stringify(response))

    return NextResponse.json(response)
  } catch (error) {
    console.error('Daily puzzle error:', error)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
```

### 6.2 Çözüm Gönderimi Endpoint'i

```typescript
// app/api/puzzles/[id]/submit/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { validateCompleteSolution } from '@/lib/engine/validator'

const submitSchema = z.object({
  inputs: z.record(z.object({
    home: z.number().int().min(0).max(20),
    away: z.number().int().min(0).max(20)
  })),
  timeTakenSec: z.number().int().min(0).max(7200)
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    const body = await request.json()
    const { inputs, timeTakenSec } = submitSchema.parse(body)

    // Bulmacayı çek (solution dahil — sadece backend'de)
    const puzzle = await prisma.puzzle.findUnique({
      where: { id: params.id }
    })

    if (!puzzle) {
      return NextResponse.json({ error: 'Bulmaca bulunamadı' }, { status: 404 })
    }

    // Solution'ı parse et
    const solution = puzzle.solution as Record<string, { home: number; away: number }>
    const solutionMap = new Map(Object.entries(solution))

    // Doğrulama
    const standings = puzzle.standings as any[]
    const matches = puzzle.matchIds as any[]
    const inputMap = new Map(Object.entries(inputs).map(([k, v]) => [k, v]))

    const { isCorrect, violations } = validateCompleteSolution(
      standings, matches, inputMap
    )

    // İlerleme güncelle
    if (session?.user?.id) {
      const existing = await prisma.userPuzzleProgress.upsert({
        where: { userId_puzzleId: { userId: session.user.id, puzzleId: puzzle.id } },
        create: {
          userId: session.user.id,
          puzzleId: puzzle.id,
          status: isCorrect ? 'COMPLETED' : 'IN_PROGRESS',
          attempts: 1,
          timeTakenSec: isCorrect ? timeTakenSec : undefined,
          completedAt: isCorrect ? new Date() : undefined
        },
        update: {
          attempts: { increment: 1 },
          status: isCorrect ? 'COMPLETED' : 'IN_PROGRESS',
          timeTakenSec: isCorrect ? timeTakenSec : undefined,
          completedAt: isCorrect ? new Date() : undefined
        }
      })

      // Başarılı çözümde stats güncelle
      if (isCorrect) {
        await updateUserStats(session.user.id, puzzle.difficulty, timeTakenSec, existing.hintsUsed)
        await updateStreak(session.user.id, puzzle.dailyDate)
      }
    }

    return NextResponse.json({
      isCorrect,
      violations: isCorrect ? [] : violations,
      // Doğruysa çözümü göster
      solution: isCorrect ? solution : undefined
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

async function updateUserStats(
  userId: string,
  difficulty: string,
  timeSec: number,
  hintsUsed: number
) {
  const difficultyField = {
    EASY: 'solvedEasy', MEDIUM: 'solvedMedium', HARD: 'solvedHard'
  }[difficulty] ?? 'solvedEasy'

  await prisma.userStats.upsert({
    where: { userId },
    create: {
      userId,
      totalSolved: 1,
      perfectSolves: hintsUsed === 0 ? 1 : 0,
      totalTimeSec: timeSec,
      [difficultyField]: 1
    },
    update: {
      totalSolved: { increment: 1 },
      perfectSolves: hintsUsed === 0 ? { increment: 1 } : undefined,
      totalTimeSec: { increment: timeSec },
      [difficultyField]: { increment: 1 }
    }
  })
}

async function updateStreak(userId: string, dailyDate: Date | null) {
  if (!dailyDate) return // Kampanya bulmacaları streak saymaz

  const today = new Date().toISOString().split('T')[0]
  const streakRecord = await prisma.dailyStreak.findUnique({ where: { userId } })

  if (!streakRecord) {
    await prisma.dailyStreak.create({
      data: { userId, currentStreak: 1, bestStreak: 1, lastPlayedDate: today }
    })
    return
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const isConsecutive = streakRecord.lastPlayedDate === yesterdayStr
  const newStreak = isConsecutive ? streakRecord.currentStreak + 1 : 1

  await prisma.dailyStreak.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      bestStreak: Math.max(newStreak, streakRecord.bestStreak),
      lastPlayedDate: today
    }
  })
}
```

### 6.3 Zod Validation Şemaları

```typescript
// lib/validations.ts

import { z } from 'zod'

export const puzzleIdSchema = z.string().cuid()

export const hintRequestSchema = z.object({
  hintType: z.enum(['direction', 'team_focus', 'reveal']),
  currentInputs: z.record(z.object({
    home: z.number().int().min(0).max(20),
    away: z.number().int().min(0).max(20)
  }))
})

export const progressSaveSchema = z.object({
  currentState: z.record(z.object({
    home: z.number().int().min(0).max(20),
    away: z.number().int().min(0).max(20)
  }))
})
```

---

## 7. State Yönetimi (Zustand)

### 7.1 Ana Bulmaca Store'u

```typescript
// store/puzzleStore.ts

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { Puzzle, ConstraintViolation } from '@/lib/engine/types'
import { validatePartialSolution } from '@/lib/engine/validator'

type PuzzlePhase =
  | 'IDLE'
  | 'LOADING'
  | 'ACTIVE'
  | 'CHECKING'
  | 'HINT_SHOWN'
  | 'SOLVED'
  | 'FAILED'

interface ScoreInput {
  home: number | null
  away: number | null
}

interface CellState {
  matchId: string
  side: 'home' | 'away'
}

interface PuzzleStore {
  // Bulmaca verisi
  puzzle: Puzzle | null
  phase: PuzzlePhase

  // Kullanıcı girişleri
  inputs: Record<string, ScoreInput>    // matchId → skor
  violations: ConstraintViolation[]

  // UI State
  selectedCell: CellState | null
  completedMatchIds: Set<string>       // Doğrulanmış maçlar
  revealedMatchIds: Set<string>        // İpucu ile açılan maçlar
  hintsUsed: number
  startedAt: number | null             // timestamp

  // Eylemler
  loadPuzzle: (puzzle: Puzzle) => void
  selectCell: (cell: CellState | null) => void
  inputDigit: (digit: number) => void
  deleteDigit: () => void
  confirmScore: (matchId: string) => void
  revealMatch: (matchId: string, score: { home: number; away: number }) => void
  useHint: () => void
  reset: () => void
  markSolved: () => void
}

export const usePuzzleStore = create<PuzzleStore>()(
  persist(
    immer((set, get) => ({
      puzzle: null,
      phase: 'IDLE',
      inputs: {},
      violations: [],
      selectedCell: null,
      completedMatchIds: new Set(),
      revealedMatchIds: new Set(),
      hintsUsed: 0,
      startedAt: null,

      loadPuzzle: (puzzle) => set(state => {
        state.puzzle = puzzle
        state.phase = 'ACTIVE'
        state.inputs = {}
        state.violations = []
        state.selectedCell = null
        state.completedMatchIds = new Set()
        state.revealedMatchIds = new Set()
        state.hintsUsed = 0
        state.startedAt = Date.now()
      }),

      selectCell: (cell) => set(state => {
        state.selectedCell = cell
      }),

      inputDigit: (digit) => set(state => {
        const { selectedCell, inputs, puzzle } = state
        if (!selectedCell || !puzzle) return

        const { matchId, side } = selectedCell
        if (!inputs[matchId]) {
          inputs[matchId] = { home: null, away: null }
        }

        const current = inputs[matchId][side]
        // Maksimum 2 haneli (00-19), futbolda yeterli
        if (current === null || current === undefined) {
          inputs[matchId][side] = digit
        } else if (current < 10) {
          inputs[matchId][side] = current * 10 + digit > 19
            ? digit  // Gerçekçi limit
            : current * 10 + digit
        }

        // Gerçek zamanlı kısıt kontrolü
        const completedInputs = new Map(
          Object.entries(inputs)
            .filter(([, v]) => v.home !== null && v.away !== null)
            .map(([k, v]) => [k, { home: v.home!, away: v.away! }])
        )

        state.violations = validatePartialSolution(
          puzzle.standings,
          puzzle.matches,
          completedInputs
        )
      }),

      deleteDigit: () => set(state => {
        const { selectedCell, inputs } = state
        if (!selectedCell) return

        const { matchId, side } = selectedCell
        if (!inputs[matchId]) return

        const current = inputs[matchId][side]
        if (current === null) return

        inputs[matchId][side] = current < 10 ? null : Math.floor(current / 10)
      }),

      confirmScore: (matchId) => set(state => {
        const input = state.inputs[matchId]
        if (!input || input.home === null || input.away === null) return

        state.completedMatchIds.add(matchId)
        // Sonraki boş hücreye otomatik geç
        const nextMatch = state.puzzle?.matches.find(
          m => !state.completedMatchIds.has(m.id) && m.id !== matchId
        )
        if (nextMatch) {
          state.selectedCell = { matchId: nextMatch.id, side: 'home' }
        }
      }),

      revealMatch: (matchId, score) => set(state => {
        state.inputs[matchId] = score
        state.revealedMatchIds.add(matchId)
        state.completedMatchIds.add(matchId)
        state.hintsUsed++
      }),

      useHint: () => set(state => {
        state.hintsUsed++
        state.phase = 'HINT_SHOWN'
      }),

      markSolved: () => set(state => {
        state.phase = 'SOLVED'
      }),

      reset: () => set(state => {
        state.puzzle = null
        state.phase = 'IDLE'
        state.inputs = {}
        state.violations = []
        state.selectedCell = null
        state.completedMatchIds = new Set()
        state.revealedMatchIds = new Set()
        state.hintsUsed = 0
        state.startedAt = null
      })
    })),
    {
      name: 'puzzle-state',
      partialize: (state) => ({
        inputs: state.inputs,
        hintsUsed: state.hintsUsed,
        revealedMatchIds: Array.from(state.revealedMatchIds),
        completedMatchIds: Array.from(state.completedMatchIds),
        startedAt: state.startedAt
      })
    }
  )
)
```

### 7.2 Kullanıcı Store'u

```typescript
// store/userStore.ts

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserStats {
  totalSolved: number
  currentStreak: number
  bestStreak: number
  perfectSolves: number
  avgTimeSec: number | null
}

interface UserStore {
  userId: string | null
  isAnonymous: boolean
  stats: UserStats | null
  setUser: (id: string, isAnonymous: boolean) => void
  setStats: (stats: UserStats) => void
  clearUser: () => void
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      userId: null,
      isAnonymous: false,
      stats: null,

      setUser: (id, isAnonymous) => set({ userId: id, isAnonymous }),
      setStats: (stats) => set({ stats }),
      clearUser: () => set({ userId: null, isAnonymous: false, stats: null })
    }),
    { name: 'user-state' }
  )
)
```

---

## 8. Component Kütüphanesi

### 8.1 ScoreCell — Split-Flap Animasyonlu Skor Hücresi

```tsx
// components/puzzle/ScoreCell.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePuzzleStore } from '@/store/puzzleStore'

interface ScoreCellProps {
  matchId: string
  side: 'home' | 'away'
  isRevealed?: boolean
  isCompleted?: boolean
  hasError?: boolean
}

export function ScoreCell({ matchId, side, isRevealed, isCompleted, hasError }: ScoreCellProps) {
  const { inputs, selectedCell, selectCell, violations } = usePuzzleStore()
  const value = inputs[matchId]?.[side] ?? null
  const isSelected = selectedCell?.matchId === matchId && selectedCell?.side === side
  const [isFlipping, setIsFlipping] = useState(false)
  const prevValue = useRef<number | null>(null)

  // Split-flap animasyonu: değer değiştiğinde tetikle
  useEffect(() => {
    if (isRevealed && prevValue.current !== value) {
      setIsFlipping(true)
      const timer = setTimeout(() => setIsFlipping(false), 600)
      prevValue.current = value
      return () => clearTimeout(timer)
    }
    prevValue.current = value
  }, [value, isRevealed])

  const cellStatus = hasError
    ? 'error'
    : isCompleted
    ? 'correct'
    : isSelected
    ? 'selected'
    : 'default'

  const statusStyles = {
    default:  'bg-[var(--rail)] border-[var(--rail)] text-[var(--mist)]',
    selected: 'bg-[var(--bench)] border-[var(--light)] text-[var(--snow)] shadow-[0_0_0_2px_var(--light)]',
    correct:  'bg-[var(--turf-dim)] border-[var(--turf)] text-[var(--turf)]',
    error:    'bg-[var(--red-dim)] border-[var(--red-card)] text-[var(--red-card)]',
  }

  return (
    <motion.button
      className={`
        relative w-[52px] h-[52px] rounded-[var(--r-md)]
        border-2 font-mono text-xl font-bold
        flex items-center justify-center
        cursor-pointer transition-all duration-150
        ${statusStyles[cellStatus]}
      `}
      onClick={() => selectCell({ matchId, side })}
      whileTap={{ scale: 0.95 }}
      aria-label={`${side === 'home' ? 'Ev sahibi' : 'Deplasman'} skor, şu an: ${value ?? 'boş'}`}
    >
      <AnimatePresence mode="wait">
        {isFlipping ? (
          // Split-flap flip animasyonu
          <motion.div
            key="flipping"
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
          >
            {/* Üst yarı */}
            <motion.div
              className="absolute inset-x-0 top-0 h-1/2 flex items-end justify-center
                         bg-[var(--bench)] overflow-hidden pb-0.5"
              initial={{ rotateX: 0 }}
              animate={{ rotateX: -90 }}
              transition={{ duration: 0.15, ease: 'easeIn' }}
              style={{ transformOrigin: 'bottom', transformStyle: 'preserve-3d' }}
            >
              <span className="font-mono text-xl font-bold text-[var(--mist)]">
                {Array.from({ length: 6 }, (_, i) => i)[
                  Math.floor(Math.random() * 6)
                ]}
              </span>
            </motion.div>
            {/* Alt yarı */}
            <motion.div
              className="absolute inset-x-0 bottom-0 h-1/2 flex items-start justify-center
                         bg-[var(--dugout)] overflow-hidden pt-0.5"
              initial={{ rotateX: 90 }}
              animate={{ rotateX: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut', delay: 0.15 }}
              style={{ transformOrigin: 'top', transformStyle: 'preserve-3d' }}
            >
              <span className="font-mono text-xl font-bold text-[var(--turf)]">
                {value}
              </span>
            </motion.div>
            {/* Orta çizgi */}
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[var(--night)]" />
          </motion.div>
        ) : (
          <motion.span
            key={`val-${value}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.1 }}
          >
            {value !== null ? value : (
              <span className="text-[var(--fog)] text-sm">—</span>
            )}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Seçili hücre pulsing glow */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-[var(--r-md)]"
          style={{ boxShadow: '0 0 12px var(--light-glow)' }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}
    </motion.button>
  )
}
```

### 8.2 StandingsTable — Puan Tablosu

```tsx
// components/puzzle/StandingsTable.tsx

import type { Standing, Team } from '@/lib/engine/types'

interface StandingsTableProps {
  standings: Standing[]
  teams: Team[]
  highlightTeamId?: string
  violationTeamIds?: string[]
}

export function StandingsTable({
  standings,
  teams,
  highlightTeamId,
  violationTeamIds = []
}: StandingsTableProps) {
  const teamMap = new Map(teams.map(t => [t.id, t]))

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse" role="grid" aria-label="Grup puan tablosu">
        <thead>
          <tr className="text-[var(--fog)] text-[11px] uppercase tracking-widest">
            <th className="py-2 pl-4 text-left font-medium w-8">#</th>
            <th className="py-2 text-left font-medium">Takım</th>
            {['O', 'G', 'B', 'M', 'AG', 'YG', 'AV', 'P'].map(col => (
              <th key={col} className="py-2 text-center font-medium w-10 font-mono">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const team = teamMap.get(standing.teamId)!
            const isHighlighted = standing.teamId === highlightTeamId
            const hasViolation = violationTeamIds.includes(standing.teamId)

            return (
              <tr
                key={standing.teamId}
                className={`
                  border-t border-[var(--rail)] transition-colors duration-200
                  ${index % 2 === 0 ? 'bg-[var(--dugout)]' : 'bg-[#16202F]'}
                  ${isHighlighted ? 'ring-1 ring-[var(--light)] ring-inset' : ''}
                  ${hasViolation ? 'bg-[var(--red-dim)]' : ''}
                `}
                aria-selected={isHighlighted}
              >
                <td className="py-3 pl-4">
                  <span className="text-[var(--fog)] font-mono text-xs">
                    {standing.position}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base" aria-hidden="true">{team.flagEmoji}</span>
                    <span className={`font-medium ${hasViolation ? 'text-[var(--red-card)]' : 'text-[var(--snow)]'}`}>
                      {team.code}
                    </span>
                  </div>
                </td>
                {[
                  standing.played, standing.won, standing.drawn, standing.lost,
                  standing.goalsFor, standing.goalsAgainst,
                  standing.goalDiff > 0 ? `+${standing.goalDiff}` : standing.goalDiff,
                  standing.points
                ].map((val, i) => (
                  <td key={i} className={`py-3 text-center font-mono text-sm ${
                    i === 7
                      ? 'font-bold text-[var(--light)]'   // Puan sütunu
                      : 'text-[var(--mist)]'
                  }`}>
                    {val}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

### 8.3 FixtureGrid — Ana Oyun Gridi

```tsx
// components/puzzle/FixtureGrid.tsx
'use client'

import { usePuzzleStore } from '@/store/puzzleStore'
import { ScoreCell } from './ScoreCell'
import { motion, AnimatePresence } from 'framer-motion'
import type { Match, Team } from '@/lib/engine/types'

interface FixtureGridProps {
  matches: Match[]
  teams: Team[]
}

export function FixtureGrid({ matches, teams }: FixtureGridProps) {
  const { violations, completedMatchIds, revealedMatchIds } = usePuzzleStore()
  const teamMap = new Map(teams.map(t => [t.id, t]))

  const errorMatchIds = new Set(
    violations
      .filter(v => v.severity === 'error')
      .flatMap(v =>
        matches
          .filter(m => m.homeTeamId === v.teamId || m.awayTeamId === v.teamId)
          .map(m => m.id)
      )
  )

  return (
    <div className="flex flex-col gap-2" role="list" aria-label="Maç fikstürü">
      {matches.map((match, index) => {
        const homeTeam = teamMap.get(match.homeTeamId)!
        const awayTeam = teamMap.get(match.awayTeamId)!
        const isCompleted = completedMatchIds.has(match.id)
        const isRevealed = revealedMatchIds.has(match.id)
        const hasError = errorMatchIds.has(match.id)

        return (
          <motion.div
            key={match.id}
            role="listitem"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06, duration: 0.25 }}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-[var(--r-lg)]
              border transition-all duration-200
              ${isCompleted && !hasError
                ? 'bg-[var(--turf-dim)] border-[var(--turf)]/40'
                : hasError
                ? 'bg-[var(--red-dim)] border-[var(--red-card)]/40'
                : 'bg-[var(--dugout)] border-[var(--rail)]'
              }
            `}
          >
            {/* Ev sahibi takım */}
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              <span className="text-sm font-semibold text-[var(--snow)] truncate">
                {homeTeam.nameEn}
              </span>
              <span className="text-lg flex-shrink-0" aria-hidden="true">
                {homeTeam.flagEmoji}
              </span>
            </div>

            {/* Skor hücreleri */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ScoreCell
                matchId={match.id}
                side="home"
                isRevealed={isRevealed}
                isCompleted={isCompleted}
                hasError={hasError}
              />
              <span className="text-[var(--fog)] font-mono text-xs select-none">–</span>
              <ScoreCell
                matchId={match.id}
                side="away"
                isRevealed={isRevealed}
                isCompleted={isCompleted}
                hasError={hasError}
              />
            </div>

            {/* Deplasman takımı */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0" aria-hidden="true">
                {awayTeam.flagEmoji}
              </span>
              <span className="text-sm font-semibold text-[var(--snow)] truncate">
                {awayTeam.nameEn}
              </span>
            </div>

            {/* Durum göstergesi */}
            <div className="flex-shrink-0 w-5">
              <AnimatePresence>
                {isCompleted && !hasError && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[var(--turf)] text-sm"
                    aria-label="Doğru"
                  >
                    ✓
                  </motion.span>
                )}
                {hasError && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[var(--red-card)] text-sm"
                    aria-label="Hata"
                  >
                    ✗
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
```

### 8.4 NumPad — Sayı Klavyesi

```tsx
// components/puzzle/NumPad.tsx
'use client'

import { usePuzzleStore } from '@/store/puzzleStore'
import { motion } from 'framer-motion'

export function NumPad() {
  const { inputDigit, deleteDigit, selectedCell, confirmScore, inputs } = usePuzzleStore()

  const canConfirm = selectedCell
    ? inputs[selectedCell.matchId]?.home !== null &&
      inputs[selectedCell.matchId]?.away !== null
    : false

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

  return (
    <div className="grid grid-cols-5 gap-2 p-4 bg-[var(--pitch)] border-t border-[var(--rail)]">
      {digits.map(digit => (
        <motion.button
          key={digit}
          className="h-12 rounded-[var(--r-md)] bg-[var(--dugout)] border border-[var(--rail)]
                     text-[var(--snow)] font-mono text-lg font-bold
                     active:bg-[var(--bench)] transition-colors"
          onClick={() => inputDigit(digit)}
          whileTap={{ scale: 0.92 }}
          aria-label={`${digit} gir`}
        >
          {digit}
        </motion.button>
      ))}

      {/* Sil butonu */}
      <motion.button
        className="h-12 rounded-[var(--r-md)] bg-[var(--dugout)] border border-[var(--rail)]
                   text-[var(--mist)] text-sm
                   active:bg-[var(--bench)] transition-colors col-span-2"
        onClick={() => deleteDigit()}
        whileTap={{ scale: 0.92 }}
        aria-label="Son rakamı sil"
      >
        ⌫ Sil
      </motion.button>

      {/* Onayla butonu */}
      <motion.button
        className={`
          h-12 rounded-[var(--r-md)] text-sm font-semibold col-span-3
          transition-all duration-200
          ${canConfirm
            ? 'bg-[var(--light)] text-[var(--night)] shadow-[var(--shadow-glow)]'
            : 'bg-[var(--rail)] text-[var(--fog)] cursor-not-allowed'
          }
        `}
        onClick={() => selectedCell && canConfirm && confirmScore(selectedCell.matchId)}
        disabled={!canConfirm}
        whileTap={canConfirm ? { scale: 0.96 } : {}}
        aria-label="Skoru onayla"
      >
        Onayla ✓
      </motion.button>
    </div>
  )
}
```

### 8.5 VictoryScreen — Zafer Ekranı

```tsx
// components/puzzle/VictoryScreen.tsx
'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { usePuzzleStore } from '@/store/puzzleStore'
import { generateShareText } from '@/lib/utils/share'
import { formatDuration } from '@/lib/utils/format'

interface VictoryScreenProps {
  puzzleNumber?: number
  onNext?: () => void
}

export function VictoryScreen({ puzzleNumber, onNext }: VictoryScreenProps) {
  const { puzzle, hintsUsed, startedAt, inputs, revealedMatchIds } = usePuzzleStore()

  const timeTaken = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const isPerfect = hintsUsed === 0
  const shareText = generateShareText({ puzzleNumber, inputs, revealedMatchIds, hintsUsed })

  const stats = [
    { label: 'Süre', value: formatDuration(timeTaken), icon: '⏱' },
    { label: 'İpucu', value: isPerfect ? 'Mükemmel! 🌟' : `${hintsUsed}`, icon: '💡' },
    { label: 'Maçlar', value: `${puzzle?.matches.length}/6`, icon: '⚽' }
  ]

  return (
    <motion.div
      className="fixed inset-0 bg-[var(--night)]/90 backdrop-blur-sm z-50
                 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="bg-[var(--dugout)] border border-[var(--rail)] rounded-[var(--r-2xl)]
                   p-8 max-w-sm w-full shadow-[var(--shadow-lg)]"
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {/* Başlık */}
        <div className="text-center mb-6">
          <motion.div
            className="text-5xl mb-3"
            animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {isPerfect ? '🏆' : '⚽'}
          </motion.div>
          <h2 className="text-2xl font-black text-[var(--snow)] mb-1" style={{ fontFamily: 'var(--display)' }}>
            {isPerfect ? 'Mükemmel Çözüm!' : 'Tebrikler!'}
          </h2>
          <p className="text-[var(--mist)] text-sm">
            Tüm maç skorlarını buldun
          </p>
        </div>

        {/* İstatistikler */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {stats.map(stat => (
            <div
              key={stat.label}
              className="bg-[var(--bench)] rounded-[var(--r-lg)] p-3 text-center"
            >
              <div className="text-xl mb-1">{stat.icon}</div>
              <div className="font-mono text-sm font-bold text-[var(--snow)]">{stat.value}</div>
              <div className="text-[10px] text-[var(--fog)] uppercase tracking-wide mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Eylem butonları */}
        <div className="flex flex-col gap-3">
          <button
            className="w-full py-3 rounded-[var(--r-lg)] bg-[var(--light)] text-[var(--night)]
                       font-bold text-sm transition-all hover:shadow-[var(--shadow-glow)]"
            onClick={() => navigator.share?.({ text: shareText }) ?? navigator.clipboard.writeText(shareText)}
          >
            📤 Sonucu Paylaş
          </button>

          {onNext && (
            <button
              className="w-full py-3 rounded-[var(--r-lg)] bg-[var(--rail)] text-[var(--snow)]
                         font-medium text-sm hover:bg-[var(--bench)] transition-colors"
              onClick={onNext}
            >
              Sonraki Bulmaca →
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
```

---

## 9. Sayfalar ve Routing

### 9.1 Root Layout

```tsx
// app/layout.tsx

import type { Metadata } from 'next'
import { Analytics } from '@/components/Analytics'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: { default: 'ScoreLogic', template: '%s | ScoreLogic' },
  description: 'Futbol puan tablolarından dedüksiyon bulmacaları. Sudoku benzeri mantık — futbolun diliyle.',
  keywords: ['futbol', 'bulmaca', 'mantık', 'puzzle', 'skor'],
  openGraph: {
    title: 'ScoreLogic',
    description: 'Futbol puan tablolarından dedüksiyon bulmacaları',
    type: 'website',
    siteName: 'ScoreLogic'
  },
  themeColor: '#0A0F1E'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[var(--night)] text-[var(--snow)] min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### 9.2 Ana Sayfa

```tsx
// app/(game)/page.tsx

import { Suspense } from 'react'
import { DailyCard } from '@/components/game/DailyCard'
import { CampaignProgress } from '@/components/game/CampaignProgress'
import { StreakDisplay } from '@/components/layout/StreakDisplay'
import { Header } from '@/components/layout/Header'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--night)]">
      <Header />

      <div className="max-w-md mx-auto px-4 pt-6 pb-24 space-y-4">

        {/* Streak */}
        <Suspense fallback={<StreakSkeleton />}>
          <StreakDisplay />
        </Suspense>

        {/* Günlük Bulmaca Kartı */}
        <Suspense fallback={<CardSkeleton />}>
          <DailyCard />
        </Suspense>

        {/* Kampanya İlerlemesi */}
        <Suspense fallback={<CardSkeleton />}>
          <CampaignProgress />
        </Suspense>

        {/* İstatistik linki */}
        <a
          href="/stats"
          className="block w-full py-3 rounded-[var(--r-xl)] border border-[var(--rail)]
                     text-center text-sm text-[var(--mist)] hover:text-[var(--snow)]
                     hover:border-[var(--light)]/50 transition-all"
        >
          📊 İstatistiklerim
        </a>
      </div>
    </main>
  )
}

function StreakSkeleton() {
  return <div className="h-12 rounded-[var(--r-xl)] bg-[var(--dugout)] animate-pulse" />
}

function CardSkeleton() {
  return <div className="h-48 rounded-[var(--r-xl)] bg-[var(--dugout)] animate-pulse" />
}
```

### 9.3 Bulmaca Sayfası

```tsx
// app/(game)/puzzle/[id]/page.tsx

import { notFound } from 'next/navigation'
import { getPuzzle } from '@/lib/db/queries/puzzles'
import { PuzzleClient } from './PuzzleClient'

interface Props {
  params: { id: string }
}

// Bulmaca meta verisi statik olarak oluşturulabilir
export async function generateMetadata({ params }: Props) {
  const puzzle = await getPuzzle(params.id)
  if (!puzzle) return {}

  return {
    title: puzzle.dailyDate
      ? `Günlük Bulmaca — ${new Date(puzzle.dailyDate).toLocaleDateString('tr-TR')}`
      : `Bulmaca #${puzzle.campaignOrder}`,
  }
}

export default async function PuzzlePage({ params }: Props) {
  const puzzle = await getPuzzle(params.id)
  if (!puzzle) notFound()

  // solution alanı burada filtrelenir — client'a gönderilmez
  const { solution: _s, ...safePuzzle } = puzzle

  return <PuzzleClient puzzle={safePuzzle} />
}
```

```tsx
// app/(game)/puzzle/[id]/PuzzleClient.tsx
'use client'

import { useEffect } from 'react'
import { usePuzzleStore } from '@/store/puzzleStore'
import { StandingsTable } from '@/components/puzzle/StandingsTable'
import { FixtureGrid } from '@/components/puzzle/FixtureGrid'
import { NumPad } from '@/components/puzzle/NumPad'
import { PuzzleHeader } from '@/components/puzzle/PuzzleHeader'
import { HintModal } from '@/components/puzzle/HintModal'
import { VictoryScreen } from '@/components/puzzle/VictoryScreen'
import type { Puzzle } from '@/lib/engine/types'

interface PuzzleClientProps {
  puzzle: Omit<Puzzle, 'solution'>
}

export function PuzzleClient({ puzzle }: PuzzleClientProps) {
  const { loadPuzzle, phase, violations } = usePuzzleStore()

  useEffect(() => {
    loadPuzzle(puzzle as Puzzle)
  }, [puzzle.id])

  const violationTeamIds = violations.map(v => v.teamId)

  return (
    <div className="min-h-screen bg-[var(--night)] flex flex-col">
      {/* Başlık: Zamanlayıcı + İpucu + Streak */}
      <PuzzleHeader puzzle={puzzle} />

      {/* Ana içerik */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4 max-w-md mx-auto w-full">

        {/* Puan tablosu (sunucu bileşeni gibi render) */}
        <section aria-label="Puan tablosu">
          <div className="text-[var(--fog)] text-xs uppercase tracking-widest mb-2 px-1">
            Grup Puan Tablosu
          </div>
          <div className="bg-[var(--dugout)] rounded-[var(--r-xl)] border border-[var(--rail)] overflow-hidden">
            <StandingsTable
              standings={puzzle.standings}
              teams={puzzle.teams}
              violationTeamIds={violationTeamIds}
            />
          </div>
        </section>

        {/* Fikstür gridi */}
        <section aria-label="Maç fikstürü">
          <div className="text-[var(--fog)] text-xs uppercase tracking-widest mb-2 px-1">
            Maç Sonuçlarını Bul
          </div>
          <FixtureGrid
            matches={puzzle.matches}
            teams={puzzle.teams}
          />
        </section>
      </div>

      {/* Numpad (sticky bottom) */}
      <div className="sticky bottom-0 z-40">
        <NumPad />
      </div>

      {/* Modallar */}
      {phase === 'HINT_SHOWN' && <HintModal puzzleId={puzzle.id} />}
      {phase === 'SOLVED' && <VictoryScreen />}
    </div>
  )
}
```

---

## 10. Animasyon Sistemi

### 10.1 Framer Motion Varyantları

```typescript
// lib/animations.ts

import { Variants } from 'framer-motion'

// Sayfa geçişi
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } }
}

// Kart girişi (staggered)
export const cardContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
}

export const cardVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } }
}

// Kısıt ihlali — shake
export const shakeVariants: Variants = {
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: { duration: 0.4, ease: 'easeInOut' }
  }
}

// Zafer confetti benzeri parçacık
export const particleVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: [0, 1.2, 1],
    opacity: [0, 1, 0],
    y: [-20, -60 - Math.random() * 40],
    x: (Math.random() - 0.5) * 80,
    rotate: Math.random() * 360,
    transition: { duration: 0.8, delay: i * 0.05 }
  })
}

// Split-flap sayı flip
export const flipTopVariants: Variants = {
  initial: { rotateX: 0 },
  flip: { rotateX: -90, transition: { duration: 0.15, ease: 'easeIn' } }
}

export const flipBottomVariants: Variants = {
  initial: { rotateX: 90 },
  flip: { rotateX: 0, transition: { duration: 0.15, ease: 'easeOut', delay: 0.15 } }
}
```

### 10.2 Özel Kısıt İhlali Animasyonu

```tsx
// hooks/useConstraintShake.ts

import { useEffect, useRef } from 'react'
import { useAnimate } from 'framer-motion'

export function useConstraintShake(hasViolation: boolean) {
  const [scope, animate] = useAnimate()
  const prevViolation = useRef(false)

  useEffect(() => {
    if (hasViolation && !prevViolation.current) {
      animate(scope.current, {
        x: [0, -5, 5, -3, 3, 0],
        borderColor: ['var(--rail)', 'var(--red-card)', 'var(--red-card)', 'var(--rail)']
      }, {
        duration: 0.4,
        ease: 'easeInOut'
      })
    }
    prevViolation.current = hasViolation
  }, [hasViolation])

  return scope
}
```

---

## 11. Kimlik Doğrulama (Auth)

### 11.1 NextAuth Konfigürasyonu

```typescript
// lib/auth/config.ts

import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/prisma'

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: 'ScoreLogic <noreply@scorelogic.app>',
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id
      return token
    },
    session({ session, token }) {
      session.user.id = token.userId as string
      return session
    }
  },

  pages: {
    signIn: '/login',
    error: '/login'
  }
}
```

### 11.2 Anonim Kullanıcı Akışı

```typescript
// lib/auth/anonymous.ts

import { prisma } from '@/lib/db/prisma'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

const ANON_COOKIE = 'sl-anon-id'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 yıl

/**
 * Mevcut anonim kullanıcıyı döner veya yeni oluşturur.
 * Login akışında gerçek hesaba merge edilir.
 */
export async function getOrCreateAnonymousUser(): Promise<string> {
  const cookieStore = cookies()
  const existingId = cookieStore.get(ANON_COOKIE)?.value

  if (existingId) {
    const user = await prisma.user.findUnique({ where: { id: existingId } })
    if (user?.isAnonymous) return existingId
  }

  // Yeni anonim kullanıcı oluştur
  const user = await prisma.user.create({
    data: { isAnonymous: true }
  })

  cookieStore.set(ANON_COOKIE, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax'
  })

  return user.id
}

/**
 * Anonim kullanıcının ilerlemesini gerçek hesaba taşır
 */
export async function mergeAnonymousProgress(
  anonymousUserId: string,
  realUserId: string
): Promise<void> {
  // Çakışmayan ilerlemeleri taşı
  await prisma.$transaction([
    prisma.userPuzzleProgress.updateMany({
      where: {
        userId: anonymousUserId,
        puzzle: {
          id: { notIn: await getExistingPuzzleIds(realUserId) }
        }
      },
      data: { userId: realUserId }
    }),
    prisma.dailyStreak.upsert({
      where: { userId: realUserId },
      create: { userId: realUserId },
      update: {}  // Gerçek hesabın streaki korunur
    }),
    prisma.user.delete({ where: { id: anonymousUserId } })
  ])
}

async function getExistingPuzzleIds(userId: string): Promise<string[]> {
  const progress = await prisma.userPuzzleProgress.findMany({
    where: { userId },
    select: { puzzleId: true }
  })
  return progress.map(p => p.puzzleId)
}
```

---

## 12. Deployment ve DevOps

### 12.1 Mimari Diyagramı

```
┌─────────────────────────────────────────────────────────────┐
│                     PRODUCTION                              │
│                                                             │
│  Vercel Edge Network                                        │
│  ┌───────────────┐    ┌──────────────────────────────────┐ │
│  │  Static       │    │  Next.js Functions               │ │
│  │  Assets       │    │  (Node.js Runtime)               │ │
│  │  (CDN)        │    │  - API Routes                    │ │
│  │               │    │  - Auth                          │ │
│  └───────────────┘    └───────────────┬──────────────────┘ │
│                                       │                     │
└───────────────────────────────────────┼─────────────────────┘
                                        │
              ┌─────────────────────────┴────────────────────┐
              │                                               │
   ┌──────────▼──────────┐              ┌────────────────────▼──┐
   │   Neon PostgreSQL   │              │   Upstash Redis        │
   │   (Serverless)      │              │   (Serverless)         │
   │   - ana veri        │              │   - daily puzzle cache │
   │   - kullanıcılar    │              │   - session cache      │
   │   - ilerlemeler     │              │   - rate limiting      │
   └─────────────────────┘              └───────────────────────┘
```

### 12.2 Ortam Değişkenleri

```bash
# .env.local — geliştirme ortamı

# Veritabanı
DATABASE_URL="postgresql://user:pass@localhost:5432/scorelogic"

# Auth
NEXTAUTH_SECRET="uzun-rastgele-secret-string"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
RESEND_API_KEY="re_..."

# Cache
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Monitoring
NEXT_PUBLIC_POSTHOG_KEY="phc_..."
SENTRY_DSN="https://...@sentry.io/..."

# Bulmaca Üretimi
PUZZLE_GENERATION_SECRET="admin-only-secret"
```

### 12.3 Vercel Konfigürasyonu

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1", "fra1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

### 12.4 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml

name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: scorelogic_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run test:unit
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/scorelogic_test

  e2e:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

  deploy:
    needs: [test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### 12.5 Bulmaca Üretim Scripti (Cron Job)

```typescript
// scripts/generate-puzzles.ts
// Her pazartesi sabahı çalışacak şekilde Vercel Cron ile tetiklenir

import { prisma } from '@/lib/db/prisma'
import { generatePuzzle } from '@/lib/engine/generator'
import { classifyDifficulty } from '@/lib/engine/difficulty'

const WEEKLY_TARGET = 14  // 2 hafta stoğu

async function main() {
  console.log('Bulmaca üretimi başlıyor...')

  // Stok kontrolü
  const existingCount = await prisma.puzzle.count({
    where: {
      isActive: true,
      dailyDate: { gte: new Date() }
    }
  })

  const needed = Math.max(0, WEEKLY_TARGET - existingCount)
  console.log(`Mevcut stok: ${existingCount}, üretilecek: ${needed}`)

  const defaultTeams = await prisma.team.findMany({ take: 20 })

  let generated = 0
  let attempts = 0

  while (generated < needed && attempts < needed * 10) {
    attempts++

    // Rastgele 4 takım seç
    const shuffled = defaultTeams.sort(() => Math.random() - 0.5).slice(0, 4)

    try {
      const result = await generatePuzzle(shuffled)

      if (result && result.isValid) {
        const difficulty = classifyDifficulty(result.inferenceSteps)

        await prisma.puzzle.create({
          data: {
            difficulty,
            inferenceSteps: result.inferenceSteps,
            teamsConfig: shuffled,
            standings: result.standings,
            matchIds: result.matches.map(m => ({
              id: m.id,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId
            })),
            solution: Object.fromEntries(
              result.matches.map(m => [m.id, { home: m.homeScore, away: m.awayScore }])
            ),
            isActive: false,  // Manuel QA onayına kadar pasif
            isTested: false
          }
        })

        generated++
        console.log(`  [${generated}/${needed}] Zorluk: ${difficulty}, Adım: ${result.inferenceSteps}`)
      }
    } catch (error) {
      console.error('Üretim hatası:', error)
    }
  }

  console.log(`Tamamlandı: ${generated} bulmaca üretildi.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

---

## 13. Test Stratejisi

### 13.1 Unit Testler — Bulmaca Motoru

```typescript
// tests/unit/engine/solver.test.ts

import { describe, it, expect } from 'vitest'
import { solve, isUniqueSolution } from '@/lib/engine/solver'
import type { Standing, Match } from '@/lib/engine/types'

// Bilinen çözüme sahip örnek bulmaca
const SAMPLE_STANDINGS: Standing[] = [
  { teamId: 'ARJ', position: 1, played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 7, goalsAgainst: 1, goalDiff: 6, points: 9 },
  { teamId: 'POL', position: 2, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDiff: -1, points: 4 },
  { teamId: 'MEK', position: 3, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDiff: -1, points: 4 },
  { teamId: 'SUU', position: 4, played: 3, won: 0, drawn: 0, lost: 3, goalsFor: 3, goalsAgainst: 7, goalDiff: -4, points: 0 },
]

const SAMPLE_MATCHES: Match[] = [
  { id: 'm1', homeTeamId: 'ARJ', awayTeamId: 'SUU' },
  { id: 'm2', homeTeamId: 'POL', awayTeamId: 'MEK' },
  { id: 'm3', homeTeamId: 'ARJ', awayTeamId: 'MEK' },
  { id: 'm4', homeTeamId: 'POL', awayTeamId: 'SUU' },
  { id: 'm5', homeTeamId: 'POL', awayTeamId: 'ARJ' },
  { id: 'm6', homeTeamId: 'SUU', awayTeamId: 'MEK' },
]

describe('Backtracking Solver', () => {
  it('bilinen bulmacayı tek çözüme bulur', () => {
    const solutions = solve(SAMPLE_STANDINGS, SAMPLE_MATCHES)
    expect(solutions).toHaveLength(1)
  })

  it('isUniqueSolution doğru çalışır', () => {
    const isUnique = isUniqueSolution(SAMPLE_STANDINGS, SAMPLE_MATCHES)
    expect(isUnique).toBe(true)
  })

  it('birden fazla çözümü olan bulmacayı tanır', () => {
    // Belirsiz tablo — beklenen: >1 çözüm
    const ambiguousStandings: Standing[] = [
      { teamId: 'A', position: 1, played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 2, goalsAgainst: 1, goalDiff: 1, points: 4 },
      { teamId: 'B', position: 2, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 2, goalDiff: -1, points: 1 },
    ]
    const ambiguousMatches: Match[] = [
      { id: 'm1', homeTeamId: 'A', awayTeamId: 'B' },
      { id: 'm2', homeTeamId: 'A', awayTeamId: 'B' },
    ]

    const solutions = solve(ambiguousStandings, ambiguousMatches)
    expect(solutions.length).toBeGreaterThan(1)
  })

  it('çözüm 1000ms içinde tamamlanır', async () => {
    const start = Date.now()
    solve(SAMPLE_STANDINGS, SAMPLE_MATCHES)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
```

### 13.2 Integration Testler — API

```typescript
// tests/integration/api/puzzles.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import { testClient } from '@/tests/helpers/testClient'

describe('POST /api/puzzles/:id/submit', () => {
  it('doğru çözüm için 200 döner', async () => {
    const res = await testClient.post('/api/puzzles/test-puzzle-1/submit').json({
      inputs: {
        m1: { home: 1, away: 0 },
        m2: { home: 0, away: 0 },
        m3: { home: 2, away: 0 },
        m4: { home: 2, away: 0 },
        m5: { home: 0, away: 2 },
        m6: { home: 1, away: 1 },
      },
      timeTakenSec: 180
    })

    expect(res.status).toBe(200)
    expect(res.body.isCorrect).toBe(true)
    expect(res.body.solution).toBeDefined()
  })

  it('yanlış çözüm için isCorrect: false döner', async () => {
    const res = await testClient.post('/api/puzzles/test-puzzle-1/submit').json({
      inputs: {
        m1: { home: 3, away: 0 }, // Yanlış skor
        m2: { home: 0, away: 0 },
        m3: { home: 2, away: 0 },
        m4: { home: 2, away: 0 },
        m5: { home: 0, away: 2 },
        m6: { home: 1, away: 1 },
      },
      timeTakenSec: 200
    })

    expect(res.status).toBe(200)
    expect(res.body.isCorrect).toBe(false)
    expect(res.body.violations.length).toBeGreaterThan(0)
  })
})
```

### 13.3 E2E Testler (Playwright)

```typescript
// tests/e2e/puzzle.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Bulmaca çözme akışı', () => {
  test('günlük bulmaca tamamen çözülebilir', async ({ page }) => {
    await page.goto('/daily')
    await page.waitForSelector('[aria-label="Maç fikstürü"]')

    // İlk skor hücresine tıkla
    await page.click('[aria-label="Ev sahibi skor, şu an: boş"]')
    await page.click('[aria-label="1 gir"]')
    await page.click('[aria-label="0 gir"]')
    await page.click('[aria-label="Deplasman skor, şu an: boş"]')
    await page.click('[aria-label="0 gir"]')
    await page.click('[aria-label="Skoru onayla"]')

    // Kısıt ihlali yok
    const violations = await page.$$('[data-testid="constraint-violation"]')
    expect(violations.length).toBe(0)
  })

  test('yanlış skor kısıt ihlali gösterir', async ({ page }) => {
    await page.goto('/daily')
    await page.waitForSelector('[aria-label="Maç fikstürü"]')

    await page.click('[aria-label="Ev sahibi skor, şu an: boş"]')
    await page.click('[aria-label="9 gir"]') // Gerçekçi olmayan skor
    await page.click('[aria-label="Deplasman skor, şu an: boş"]')
    await page.click('[aria-label="0 gir"]')
    await page.click('[aria-label="Skoru onayla"]')

    await expect(page.locator('[data-testid="constraint-error"]')).toBeVisible()
  })
})
```

---

## 14. Performans ve Güvenlik

### 14.1 Performans Hedefleri

| Metrik | Hedef | Ölçüm Aracı |
|--------|-------|-------------|
| Lighthouse Performance | ≥ 90 | Vercel Analytics |
| First Contentful Paint | < 1.2s | Core Web Vitals |
| Time to Interactive | < 2.5s | Core Web Vitals |
| API P95 Latency | < 200ms | Sentry |
| Puzzle validation (client) | < 5ms | Performance.now() |

### 14.2 Önbellek Stratejisi

```typescript
// Tier 1: Vercel Edge Cache — statik sayfa parçaları
// app/(game)/page.tsx
export const revalidate = 300  // 5 dakika

// Tier 2: Redis — günlük bulmaca (değişmez, günde 1 kez)
// Upstash Redis'te UTC gece yarısına kadar tutulur

// Tier 3: React Query — client-side state
const { data: puzzle } = useQuery({
  queryKey: ['puzzle', puzzleId],
  queryFn: () => fetchPuzzle(puzzleId),
  staleTime: Infinity,    // Bulmacalar değişmez
  gcTime: 24 * 60 * 60 * 1000  // 24 saat önbellekte tut
})
```

### 14.3 Güvenlik Kontrol Listesi

```
✅ Rate Limiting
   - /api/puzzles/:id/submit → 10 istek/dakika/IP
   - /api/puzzles/:id/hint → 30 istek/saat/kullanıcı
   - /api/auth → 5 istek/dakika/IP

✅ Veri Koruması
   - solution alanı ASLA frontend'e gönderilmez
   - Tüm bulmaca doğrulaması sunucu tarafında

✅ Input Validasyonu
   - Zod şemaları tüm API endpoint'lerinde
   - Skor aralığı: 0-20 (int)
   - Kullanıcı girişi sanitizasyonu

✅ Auth Güvenliği
   - JWT secret rotation
   - CSRF koruması (NextAuth built-in)
   - Secure + HttpOnly cookie'ler

✅ Veritabanı
   - Parameterized queries (Prisma built-in)
   - Minimum privilege veritabanı kullanıcısı
   - Bağlantı havuzu (PgBouncer via Neon)

✅ Genel
   - Content Security Policy başlıkları
   - X-Frame-Options: DENY
   - Rate limiting (Upstash Ratelimit)
```

### 14.4 Erişilebilirlik Kontrol Listesi

```
✅ ARIA Labels
   - Tüm etkileşimli hücreler aria-label içerir
   - Tablolar role="grid" ile işaretlenmiş
   - Hata mesajları role="alert"

✅ Klavye Navigasyonu
   - Tab sırası mantıklı
   - Enter/Space = hücre seç
   - Oklar = hücreler arası geçiş
   - Esc = seçimi iptal

✅ Renk Körlüğü
   - Durum bilgisi renkle birlikte şekille de verilir
   - ✓ / ✗ / — sembolleri

✅ Azaltılmış Hareket
   @media (prefers-reduced-motion: reduce) {
     .split-flap { animation: none; }
     .page-transition { transition: opacity 0.1s; }
   }

✅ Font Boyutu
   - Skor hücreleri: minimum 20px
   - Mobilde minimum 44x44px dokunma alanı
```

---

## Ekler

### Ek A: package.json

```json
{
  "name": "scorelogic",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "lint": "next lint",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx scripts/seed.ts",
    "puzzles:generate": "tsx scripts/generate-puzzles.ts"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.5.0",
    "@prisma/client": "^5.16.0",
    "next-auth": "^5.0.0-beta.19",
    "@auth/prisma-adapter": "^2.4.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.51.0",
    "framer-motion": "^11.3.0",
    "zod": "^3.23.0",
    "@upstash/redis": "^1.31.0",
    "@upstash/ratelimit": "^2.0.0"
  },
  "devDependencies": {
    "prisma": "^5.16.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "tailwindcss": "^4.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "tsx": "^4.16.0"
  }
}
```

### Ek B: Zorluk Sınıflandırma Matrisi

```typescript
// lib/engine/difficulty.ts

export function classifyDifficulty(
  inferenceSteps: number
): 'EASY' | 'MEDIUM' | 'HARD' {
  if (inferenceSteps <= 5) return 'EASY'
  if (inferenceSteps <= 12) return 'MEDIUM'
  return 'HARD'
}

// İnferans adımı sayma mantığı:
// Her "kesin çıkarım" (tek olası değer bulunması) 1 adım sayılır.
// Backtracking gerektiren durum → zor bulmacalar.
// Kolay: 3G/0B/0M gibi belirleyici istatistikler.
// Zor: İki takımın aynı istatistiklere sahip olması + yüksek gol sayısı.
```

### Ek C: Paylaşım Metni Üretici

```typescript
// lib/utils/share.ts

interface ShareParams {
  puzzleNumber?: number
  inputs: Record<string, { home: number | null; away: number | null }>
  revealedMatchIds: Set<string>
  hintsUsed: number
}

export function generateShareText({
  puzzleNumber,
  inputs,
  revealedMatchIds,
  hintsUsed
}: ShareParams): string {
  const matchIds = Object.keys(inputs)

  const grid = matchIds.map(id => {
    const input = inputs[id]
    if (revealedMatchIds.has(id)) return '⬜'  // İpucu ile açıldı
    if (!input || input.home === null) return '⬛'  // Girilmedi
    return '🟩'  // Doğru
  }).join('')

  const header = puzzleNumber
    ? `ScoreLogic #${puzzleNumber} ⚽`
    : `ScoreLogic ⚽`

  const lines = [
    header,
    grid,
    hintsUsed === 0 ? '✨ İpuçsuz çözüldü!' : `💡 ${hintsUsed} ipucu kullanıldı`,
    'scorelogic.app'
  ]

  return lines.join('\n')
}
```

---

*Bu doküman, geliştirme süreci boyunca yaşayan bir referans kaynağıdır.*
*Her önemli mimari kararla birlikte güncellenmelidir.*
*Sürüm: 1.0 | Haziran 2026*
