# K1 İleri Uyumlu `/api/v1` Kontratı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurulu native istemciler bilinmeyen response alanlarını ve enum değerlerini kırılmadan
işlesin. Sunucu, minimum sürümün altındaki istemciye `426 UPGRADE_REQUIRED` dönebilsin.

**Architecture:**
- `packages/contracts` içinde shape'ler bir kez tanımlanır. Response şemaları `z.object` (strip),
  request şemaları `z.strictObject` ile kurulur.
- Server-originated enum'lar response'ta `openEnum` ile açık tutulur.
- Sürüm kontrolü `proxy.ts` içinde `/api/v1/*` için tek noktada yapılır.
- Mobil istemci `X-ScoreLogic-Client` header'ını transport sarmalayıcısıyla ekler. 426 ayrı bir `'upgrade'` failure türüdür.

**Tech Stack:** Zod 4.6.6, Next.js 16 (`proxy.ts`), Vitest (root), `node:test` + tsx (mobil), Expo SDK 58.

**Spec:** `docs/superpowers/specs/2026-11-21-k1-ileri-uyumlu-kontrat-design.md`

## Global Constraints

- `packages/contracts` yalnız `zod` import eder. Prisma, Next, engine, `@/` alias yasak.
- Yeni bağımlılık eklenmez. Semver karşılaştırması yerel bir yardımcıdır.
- Response'ta kapalı kalan enum'lar: `side` (`home`/`away`) ve match outcome (`HOME_WIN`/`DRAW`/`AWAY_WIN`).
- Request'te istemcinin seçtiği alanlar kapalı kalır: hint isteği `hintType` (`'reveal'`), attempt
  isteği `kind`, delete `confirmation`.
- `passthrough` kullanılmaz. Bilinmeyen alanlar atılır.
- Bilinmeyen enum değeri hiçbir zaman bilinen bir değere çevrilmez (`.catch` yasak).
- Header adı tam olarak `X-ScoreLogic-Client`, değer biçimi `<ios|android|web>/<appVersion>/<contractsVersion>`.
- Env adı `NATIVE_MIN_APP_VERSION` (semver `x.y.z`). Boş veya yoksa kontrol kapalıdır.
- 426 gövdesi v1 hata zarfıdır: `{ error: { code: 'UPGRADE_REQUIRED', message, details: { minAppVersion } }, meta }`.
- Header'ı olmayan istek her zaman kabul edilir. Web sitesindeki cookie ile silme formu da bu sayede çalışır.
- `.env*` okunmaz. Yalnız `.env.example` düzenlenir. `docs/` Türkçe kalır; kod ve commit mesajları İngilizce.
- Contracts paket sürümü `1.2.0` → `1.3.0`. `CONTRACTS_VERSION = '1.3.0'` export edilir.

## Review Focus

1. **Echo:** İstemci, sunucudan gelen `currentState` içindeki bilinmeyen bir `hintTypes` değerini progress
   komutunda geri gönderir. Request kabul edilmeli (400 değil). Test Task 1'de.
2. **Bekleyen komut:** Bir komut 426 alırsa outbox kaydı silinmemeli, retry aynı UUID ile yapılmalı. Test Task 4'te.
3. **Bekleyen auth:** `auth-pending` sırasında gelen 426 vault kaydını silmemeli. Test Task 4'te.
4. **Header eksik:** Min-version açıkken header'sız `/api/v1/account/delete` isteği engellenmemeli. Test Task 3'te.
5. **Default'lar:** Strip moduna geçen response şemalarında `.default()` değerleri (`revision`,
   `outcomes`, `notes`) eskisi gibi uygulanmalı. Test Task 1'de.

---

### Task 1: Contracts — açık enum'lar, request/response ayrımı

**Files:**
- Modify: `packages/contracts/src/common.ts`, `packages/contracts/src/game.ts`,
  `packages/contracts/src/commands.ts`, `packages/contracts/src/auth.ts`, `packages/contracts/package.json`
- Modify: `packages/contracts/README.md` (kısa "forward compatibility" notu)
- Test: `tests/unit/contracts/forward-compat.test.ts` (yeni)
- Modify: `tests/unit/contracts/mobile-contracts.test.ts` (`apiVersion: '2'` beklentisi)

**Interfaces:**
- Produces (`common.ts`):
  - `openEnum<const T extends readonly [string, ...string[]]>(values: T)` → Zod schema.
    Çıkış tipi `T[number] | (string & {})`.
  - `isKnown<const T extends readonly string[]>(values: T, value: string): value is T[number]`
  - `CONTRACTS_VERSION: '1.3.0'`
  - Değer sabitleri `HINT_TYPE_VALUES`, `ATTEMPT_STATUS_VALUES`, `PUZZLE_MODE_VALUES`,
    `PROGRESS_STATUS_VALUES` (`game.ts`'ten export).
- Produces (`game.ts`/`commands.ts`, yeni request varyantları):
  - `scoreInputRequestSchema`, `matchNoteRequestSchema`, `revealedScoreCellRequestSchema`
  - `inputsRequestSchema`, `notesRequestSchema`, `puzzleProgressStateRequestSchema`
- Mevcut export adları response anlamını korur (`puzzleProgressStateSchema` artık strip).
- Request şemaları (`progressPayloadSchema`, `hintPayloadSchema`, `submitPayloadSchema`,
  `revealPayloadSchema`, `analyzeBoardRequestSchema`, `puzzleCommandSchema`) yalnız `*RequestSchema` parçalarını kullanır.

- [ ] **Step 1: Write the failing tests** — `tests/unit/contracts/forward-compat.test.ts`, `describe('forward-compatible responses')`:
  - `it('strips unknown top-level and nested fields from session data')`
    - Girdi: `nativeSessionDataSchema.parse({...session, extra: 1, user: {...user, displayName: 'x'}})`.
    - Beklenen: sonuçta `extra` ve `user.displayName` yok; `user.id` korunur.
  - `it('keeps unknown enum values in puzzle and progress reads')`
    - Girdi: `puzzleResponseSchema.parse(...)`. Puzzle `mode: 'tournament'`, `difficulty: 'LEGENDARY'`,
      `campaignPack: 'MASTER'`, `campaignLevel: 45`. Progress `currentAttempt.status: 'PAUSED'`,
      `hintTypes: ['reveal', 'explain']`.
    - Beklenen: değerler aynen döner.
  - `it('accepts a newer apiVersion in meta')` — `apiMetaSchema.parse({...meta, apiVersion: '2'}).apiVersion === '2'`.
  - `it('strips unknown keys from a stored command receipt')`
    - Girdi: `puzzleCommandResultSchema.parse({...receipt, result: {...result, futureField: true}})` başarılı.
  - `it('applies response defaults after stripping')`
    - Girdi: `revision` alanı olmayan progress envelope.
    - Beklenen: `revision === 0`; `currentState.outcomes` ve `notes` `{}`.
  - `it('keeps structural enums closed')` — `revealedScoreCellSchema.safeParse({matchId:'m', side:'middle'}).success === false`.
  - `describe('strict requests')`:
    - `it('rejects unknown fields in commands and nested inputs')`
      - Girdi: `puzzleCommandSchema.safeParse(...)`; progress payload `progress.inputs.m1.extra = 1`, ayrıca üst seviye `extra`.
      - Beklenen: ikisi de `false`.
    - `it('accepts echoed unknown hint types in progress state')`
      - Girdi: `progress.hintTypes: ['explain']` içeren progress komutu.
      - Beklenen: `success === true`.
    - `it('keeps client-chosen hint type closed')` — hint komutunda `hintType: 'explain'` → `false`.
- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/contracts`. Beklenen: yeni testler FAIL (strict hataları, apiVersion literal).
- [ ] **Step 3: Implement**
  - `openEnum` = `z.union([z.enum(values), z.string().min(1).max(64)])`.
  - Response nesneleri `z.object`, request nesneleri `z.strictObject` (aynı shape sabitinden).
  - Response'ta açılacak enum'lar spec "K1a" listesindeki gibi (difficulty, pack, mode, hint type,
    progress/attempt status/kind, feedback mode, violation type/severity, analyze mode/issue
    code/severity/satisfiability status/terminationReason, merge status).
  - `campaignLevel.max(30)`, `campaignOrder.max(150)` response'tan kaldırılır.
  - `apiMetaSchema.apiVersion` → `z.string().min(1).max(16)`.
  - Request'te `hintTypes` (progress state + `assistanceSnapshot`) `z.array(openEnum(HINT_TYPE_VALUES))`.
  - Sürüm 1.3.0'a çıkar.
- [ ] **Step 4: Update the old assertions in `mobile-contracts.test.ts`**
  - `apiVersion: '2'` beklentisi `.success).toBe(true)` olur.
  - "fails closed on private solutions" testini şu beklentilerle yeniden yaz:
    - `puzzlePublicSchema.parse(sampleDailyPuzzlePrivate)` sonucunda `solution` ve `allSolutions`
      anahtarları yok.
    - `matches` içine skorlu nesneler verilince sonuçtaki her `match`'te `homeScore`/`awayScore` yok.
    - `stripPuzzleSolution(sampleDailyPuzzlePrivate)` (`lib/db/mappers/puzzle.ts`) çıktısında
      `solution`/`allSolutions` anahtarı yok.
  - Gerekçe: sunucu DTO'yu kendi `lib/validations.ts` şemasıyla üretir ve bu değişmez. İstemci
    şeması artık sızıntıyı reddetmez, atar; sızıntı koruması sunucudadır.
- [ ] **Step 5: Verify** — `npx vitest run tests/unit/contracts && npm run type-check`. Beklenen: PASS.
  Type-check sunucudaki import'ları (`lib/services/mobile-api.ts`, analyze route) de kapsar.
- [ ] **Step 6: Commit** — `git add packages/contracts tests/unit/contracts && git commit -m "feat(contracts): split strict requests from tolerant v1 responses"`

### Task 2: Mobil — açık enum'larla güvenli davranış

**Files:**
- Modify: `apps/mobile/src/core/types.ts` (`Puzzle.mode: string`, `Attempt.status: string`, `Attempt.kind: string`)
- Modify: `apps/mobile/src/core/puzzle.ts` (`puzzleLabel`)
- Modify: `apps/mobile/src/core/controller.ts` (`load` içindeki notice)
- Modify: `apps/mobile/src/ui/player/PlayerScreens.tsx` (campaign ekranı uyarısı)
- Test: `apps/mobile/tests/forward-compat.test.ts` (yeni)

**Interfaces:**
- Consumes: `isKnown`, `ATTEMPT_STATUS_VALUES`, `PUZZLE_MODE_VALUES`, `CAMPAIGN_PACK_VALUES` (Task 1).
- Produces:
  - `UPDATE_REQUIRED_NOTICE = 'Update ScoreLogic to see everything in this puzzle.'` (`puzzle.ts` export).
  - `hasUnknownCatalogItems(puzzles: { campaignPack: string }[]): boolean` (`puzzle.ts`).

- [ ] **Step 1: Write the failing tests** (`node:test`, `helpers.ts` kalıbıyla):
  - `test('refresh response with extra fields settles refresh-pending')`
    - Refresh yanıtına `user.displayName` ve `session.extra` eklenir.
    - Beklenen: `vault.values.has('refresh-pending') === false`; çağrı başarılı.
  - `test('unknown attempt status is terminal and read-only with an update notice')`
    - Girdi: controller `load` sonrası `currentAttempt.status: 'PAUSED'`.
    - Beklenen: `terminal(...) === true`; `setScore(...) === false`; `state.notice === UPDATE_REQUIRED_NOTICE`.
  - `test('echoed unknown hint type is sent unchanged in a progress command')`
    - Girdi: server state `hintTypes: ['explain']`.
    - Beklenen: gönderilen progress gövdesi `puzzleCommandSchema.safeParse` ile `success === true`.
  - `test('puzzle label for an unknown mode asks for an update')` — `puzzleLabel({...puzzle, mode: 'tournament'}) === 'Update required'`.
  - `test('catalog with an unknown pack is detected')` — `hasUnknownCatalogItems([{campaignPack: 'MASTER'}]) === true`.
- [ ] **Step 2: Run to verify failure** — `cd apps/mobile && npm test`. Beklenen: yeni testler FAIL.
- [ ] **Step 3: Implement**
  - Tip genişletme.
  - `puzzleLabel`: bilinmeyen mode için `'Update required'`.
  - `load`: attempt status bilinmiyorsa notice `UPDATE_REQUIRED_NOTICE`. `terminal()` zaten
    `status !== 'ACTIVE'` olduğu için değişmez.
  - Campaign ekranında `hasUnknownCatalogItems` true ise mevcut `styles.secondary` ile tek satır
    gösterilir: "Some levels need a newer version of ScoreLogic." Bilinmeyen pack'ler mevcut pack
    filtrelerine girmediği için listede görünmez.
  - Not: spec "etiketle göster" diyordu. UI yeniden tasarımla çakışmamak için bu tek satırlık uyarı
    seçildi (builder kararı). Görsel sunum yeniden tasarım oturumuna kalır.
- [ ] **Step 4: Verify** — `cd apps/mobile && npm run type-check && npm test && npm run test:components`. Beklenen: PASS.
- [ ] **Step 5: Commit** — `git add apps/mobile && git commit -m "feat(mobile): handle unknown v1 fields and enum values safely"`

### Task 3: Sunucu — `NATIVE_MIN_APP_VERSION` ve `426`

**Files:**
- Create: `lib/api/client-version.ts`
- Create: `lib/api/v1-meta.ts` (`apiMeta` buraya taşınır; `lib/api/v1.ts` re-export eder ve kullanır)
- Modify: `proxy.ts`, `lib/env/server.ts`, `.env.example`, `docs/deployment.md`
- Test: `tests/unit/api/client-version.test.ts` (yeni), `tests/unit/env/server-env.test.ts`

**Interfaces:**
- Produces (`lib/api/client-version.ts`, saf; yalnız `next/server` tipleri):
  - `CLIENT_HEADER = 'x-scorelogic-client'`
  - `parseClientHeader(value: string | null): { platform: 'ios' | 'android' | 'web'; appVersion: string; contractsVersion: string } | null | 'invalid'`
    - `null` header yoksa, `'invalid'` biçim bozuksa.
  - `compareSemver(a: string, b: string): -1 | 0 | 1` (yalnız `x.y.z`).
  - `upgradeRequired(header: string | null, minAppVersion: string | undefined): string | null`
    - Gereken minimum sürümü veya `null` döner.
    - Kurallar: min boşsa `null`. Header yoksa `null`. `'invalid'` ise min. Sürüm < min ise min.
- `proxy.ts`:
  - `pathname.startsWith('/api/v1/')` ve `upgradeRequired(...)` değer döndürürse 426 v1 zarfı döner.
  - Gövde `apiMeta()` + `X-ScoreLogic-API-Version: 1` + `Cache-Control: private, no-store` içerir.
  - Aksi halde mevcut CSP akışı aynen sürer.

- [ ] **Step 1: Write the failing tests** — `client-version.test.ts`:
  - `parseClientHeader`:
    - `'android/0.2.0/1.3.0'` → nesne.
    - `null` → `null`.
    - `'android/0.2'` ve `'desktop/1.0.0/1.3.0'` → `'invalid'`.
  - `compareSemver`:
    - `('0.10.0','0.9.9') === 1`
    - `('1.0.0','1.0.0') === 0`
  - `upgradeRequired`:
    - `('android/0.1.0/1.2.0', undefined) === null`
    - `('android/0.1.0/1.2.0', '0.2.0') === '0.2.0'`
    - `('android/0.2.0/1.3.0', '0.2.0') === null`
    - `(null, '0.2.0') === null`
    - `('garbage', '0.2.0') === '0.2.0'`
  - `describe('proxy')`:
    - `it('returns 426 envelope for an old client on /api/v1')`
      - Girdi: `process.env.NATIVE_MIN_APP_VERSION='0.2.0'`, `new NextRequest('http://localhost/api/v1/puzzles/daily', {headers: {'x-scorelogic-client': 'android/0.1.0/1.2.0'}})`.
      - Beklenen: `status === 426`; `body.error.code === 'UPGRADE_REQUIRED'`;
        `body.error.details.minAppVersion === '0.2.0'`; `body.meta.apiVersion === '1'`.
    - `it('allows header-less account deletion from the website')` — `/api/v1/account/delete`, header yok → status 426 değil.
    - `it('ignores non-v1 paths')` — `/api/puzzles/daily` aynı eski header ile → 426 değil.
  - `server-env.test.ts`: `NATIVE_MIN_APP_VERSION='1.2'` doğrulama hatası üretir; `'1.2.0'` ve yokluğu geçerlidir.
- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/api/client-version.test.ts tests/unit/env/server-env.test.ts`. Beklenen: FAIL.
- [ ] **Step 3: Implement** — yukarıdaki imzalarla. `lib/env/server.ts`'e opsiyonel semver doğrulaması.
  `.env.example`'a boş `NATIVE_MIN_APP_VERSION=` ve açıklama. `docs/deployment.md`'ye Türkçe kısa
  bölüm: ne zaman açılır, varsayılanı kapalıdır, header'sız istekler kabul edilir.
- [ ] **Step 4: Verify** — `npx vitest run tests/unit/api tests/unit/env && npm run type-check && npm run lint`. Beklenen: PASS.
- [ ] **Step 5: Commit** — `git add lib/api proxy.ts lib/env/server.ts .env.example docs/deployment.md tests/unit && git commit -m "feat(api): gate v1 clients below NATIVE_MIN_APP_VERSION with 426"`

### Task 4: Mobil — sürüm header'ı ve `'upgrade'` durumu

**Files:**
- Modify: `apps/mobile/src/core/http.ts`, `apps/mobile/src/core/runtime.ts`,
  `apps/mobile/src/core/controller.ts:291`, `apps/mobile/src/core/session.ts:115`
- Modify: `apps/mobile/src/App.tsx:27`, `apps/mobile/src/design/fixtures.ts:61` (aynı sarmalayıcı), `apps/mobile/src/ui/StatusView.tsx:6`
- Test: `apps/mobile/tests/forward-compat.test.ts` (Task 2 dosyasına eklenir)

**Interfaces:**
- Consumes: `CONTRACTS_VERSION` (Task 1); 426 zarfı (Task 3).
- Produces (`http.ts`):
  - `clientIdentity(platform: 'ios' | 'android' | 'web', appVersion: string, contractsVersion: string): string`
  - `withClientHeader(transport: Transport, value: string): Transport`
    - Var olan header'ları korur, `X-ScoreLogic-Client` ekler.
- `FailureKind` → `'offline' | 'session' | 'maintenance' | 'storage' | 'request' | 'upgrade'`.
  `failureKind`, `status === 426 || code === 'UPGRADE_REQUIRED'` için diğer kontrollerden önce `'upgrade'` döner.
  `report()` `'upgrade'` için `phase: 'blocked'` yapar.
- `StatusView` başlığı `upgrade: 'Update ScoreLogic to continue'`.
- `App.tsx`, `Platform.OS` ve `apps/mobile/package.json` `version` ile `SessionClient` transport'unu sarar.

- [ ] **Step 1: Write the failing tests**:
  - `test('every request carries the client identity header')`
    - Girdi: `withClientHeader(spy, clientIdentity('android', '0.1.0', CONTRACTS_VERSION))` ile `SessionClient.call`.
    - Beklenen: her çağrıda `headers['X-ScoreLogic-Client'] === 'android/0.1.0/1.3.0'` ve `Authorization` korunur.
  - `test('426 maps to upgrade and blocks the runtime')`
    - Beklenen: `failureKind(new ApiError(426, 'UPGRADE_REQUIRED', 'x')) === 'upgrade'`;
      `runtime.report(...)` sonrası `phase === 'blocked'`.
  - `test('426 keeps the pending command for the same UUID')`
    - Komut POST'u 426 döner.
    - Beklenen: `store.commands(owner)` hâlâ aynı `commandId`'yi içerir; ikinci deneme aynı `commandId`'yi gönderir.
  - `test('426 keeps auth-pending')`
    - Login 426 döner.
    - Beklenen: `vault.values.has('auth-pending') === true`.
- [ ] **Step 2: Run to verify failure** — `cd apps/mobile && npm test`. Beklenen: FAIL.
- [ ] **Step 3: Implement** — imzalarla. `controller.failed` istisna listesi `[401, 408, 426, 429]`,
  `session.finishAuthentication` istisna listesi `[408, 426, 429]`.
- [ ] **Step 4: Verify** — `cd apps/mobile && npm run type-check && npm test && npm run test:components && npm run check:a11y && npm run check:export`. Beklenen: PASS, `privateEngineAbsent: true`.
- [ ] **Step 5: Commit** — `git add apps/mobile && git commit -m "feat(mobile): send client version and show upgrade-required state"`

### Task 5: Doküman ve tam doğrulama

**Files:**
- Modify: `docs/mobile/api-v1.md` (Türkçe "İleri uyumluluk ve sürüm" bölümü)
  - Strip ve açık enum kuralları.
  - Kapalı yapısal enum'lar.
  - `X-ScoreLogic-Client` header'ı.
  - `426 UPGRADE_REQUIRED` ve `NATIVE_MIN_APP_VERSION`.
  - "Alan kaldırma/yeniden adlandırma hâlâ kırıcıdır" notu.

- [ ] **Step 1: Write the doc section** — yukarıdaki maddeler, spec'teki değerlerle.
- [ ] **Step 2: Verify everything**
  - `npm run type-check && npm run lint && npm run test:unit`
  - `cd apps/mobile && npm run type-check && npm test`
  - Integration: yalnız loopback, taze `_test` DB.
    `DATABASE_URL=postgresql://<local>@127.0.0.1:<port>/scorelogic_k1_test npm run test:integration:local`
    - Yerel kullanıcı/port `npm run local:status` çıktısından alınır; `.env*` okunmaz.
  - Beklenen: hepsi PASS.
  - Koşulamayan bir şey varsa raporda açıkça yazılır.
- [ ] **Step 3: Commit** — `git add docs/mobile/api-v1.md docs/superpowers && git commit -m "docs(mobile): document v1 forward compatibility and version gate"`
