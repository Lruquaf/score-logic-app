# Build Sequence

## Amaç

Bu dosya, Faz 0 kararlarini kod seviyesine cevirirken izlenecek uygulama sirasini belirler. Amaç, "hangi dosyayi once acacagiz" sorusunu karara baglamaktir.

## Dikey Dilim Stratejisi

Ilk hedef, seeded bir gunluk bulmacanin anonim kullanici tarafindan acilip cozulup submit edilebildigi tek bir dikey dilimdir.

Bu hedefe giderken su siraya sadik kalinacaktir:

1. app bootstrap
2. domain types
3. engine
4. prisma schema
5. query ve mapper katmani
6. anonymous auth helper
7. puzzle API
8. zustand state
9. puzzle UI
10. tests

## Faz 1 Dosya Sirasi

### A. Repo Bootstrap

Olusturulacak temel dosyalar:

- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `app/layout.tsx`
- `app/globals.css`
- `tailwind.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `.env.example`

Beklenen sonuc:

- uygulama derlenebilir iskelete sahip olur
- global design tokens uygulanir
- test komutlari bos da olsa kosabilir

### B. Domain Iskeleti

Olusturulacak temel dosyalar:

- `lib/engine/types.ts`
- `lib/contracts/puzzle.ts`
- `lib/contracts/progress.ts`
- `lib/validations.ts`

Beklenen sonuc:

- DTO, entity ve progress tipleri ayri tanimlanir
- Zod ile runtime parse siniri cizilir

### C. Engine

Olusturulacak temel dosyalar:

- `lib/engine/solver.ts`
- `lib/engine/validator.ts`
- `lib/engine/difficulty.ts`
- `tests/unit/engine/*.test.ts`

Beklenen sonuc:

- solver tek cozum kontrolu yapar
- validator partial ve submit senaryolarini ayirir
- bilinen puzzle fixture'lari testten gecer

### D. Veri Katmani

Olusturulacak temel dosyalar:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `lib/db/prisma.ts`
- `lib/db/mappers/puzzle.ts`
- `lib/db/queries/puzzles.ts`

Beklenen sonuc:

- seeded bulmaca DB'ye yazilabilir
- private ve public puzzle map'leri ayrilir

### E. Auth ve Progress

Olusturulacak temel dosyalar:

- `lib/auth/anonymous.ts`
- `lib/db/queries/progress.ts`
- `app/api/puzzles/[id]/progress/route.ts`

Beklenen sonuc:

- anonymous user kimligi cookie ile olusur
- progress remote kaydedilebilir

### F. Puzzle API

Olusturulacak temel dosyalar:

- `app/api/puzzles/daily/route.ts`
- `app/api/puzzles/[id]/route.ts`
- `app/api/puzzles/[id]/submit/route.ts`
- `app/api/puzzles/[id]/hint/route.ts`

Beklenen sonuc:

- public puzzle DTO response'ta kullanilir
- submit exact solution match yapar
- hint akisi canonical progress ile uyumlu calisir

### G. State ve UI

Olusturulacak temel dosyalar:

- `store/puzzleStore.ts`
- `hooks/usePuzzle.ts`
- `components/puzzle/StandingsTable.tsx`
- `components/puzzle/FixtureGrid.tsx`
- `components/puzzle/ScoreCell.tsx`
- `components/puzzle/NumPad.tsx`
- `app/(game)/daily/page.tsx` veya `app/(game)/puzzle/[id]/page.tsx`

Beklenen sonuc:

- local runtime state ile remote progress ayrimi korunur
- hydrate ve autosave calisir
- puzzle cozulup submit edilebilir

## Fazlar Arasi Bagimliliklar

### Engine -> API

API yazimi engine dogrulugu olmadan baslamayacak. Aksi halde submit mantigi iki kez yazilir.

### Data Mapping -> UI

UI, Prisma modelini dogrudan tuketmeyecek. Public DTO map'i tamamlanmadan puzzle sayfasi acilmayacak.

### Progress API -> Zustand Persist

Store persist mantigi remote canonical state ile birlikte tasarlanacak. Sadece local storage persist yapilip sonra degistirilmeyecek.

## Ilk Seed Stratejisi

Ilk tohum veri seti su yapida olacak:

- 4 takim
- 1 daily puzzle
- 1 campaign puzzle
- 1 tamamlanmis olmayan anonymous progress fixture

Amac:

- hem `dailyDate` hem `campaignOrder` kod yolunu test etmek
- progress restore akisini dogrulamak

## Faz 1 Tamamlanma Kriteri

Su akisin tamami calisiyorsa Faz 1 ve erken Faz 4-7 baglaminda dogru yoldayiz:

1. seeded daily puzzle fetch edilir
2. puzzle DTO client'a gelir
3. kullanici score girer
4. local validator ihlal gosterir
5. progress autosave olur
6. submit exact match ile dogrulanir
7. solve basariliysa progress `COMPLETED` olur
8. sayfa yenilenirse durum tutarli restore edilir

## Bilincli Olarak Sonraya Birakilanlar

- redis cache
- upstash rate limit
- nextauth provider config
- campaign map UI
- stats page UI
- cron tabanli puzzle generation
- posthog ve sentry entegrasyonu

Bu kararlar teknik borc degil, siralama tercihidir. Ilk dilimde urun cekirdegi olan puzzle dogrulugu ve state butunlugu onde gelir.
