# K1 — İleri uyumlu `/api/v1` kontratı (tasarım)

> Tarih: 21 Kasım 2026 · Kaynak bulgu: [denetim raporu K1](../../denetim-2026-11-21.md)
> Durum: Onay bekliyor · Branch: `worktree-k1-tolerant-contracts`

## Amaç ve neden

Mağazadaki uygulamalar sunucuyla aynı anda güncellenemez (K10). Bugün response şemaları
`.strict()`, enum'lar kapalı ve sürüm sinyali yok. Bu yüzden sunucuya eklenen tek bir opsiyonel
alan ya da yeni bir enum değeri kurulu uygulamada `INVALID_RESPONSE` üretiyor. Bu hata refresh dahil
her çağrıda oluşur. İlk mağaza build'i çıkmadan önce kontrat ileri uyumlu olmalı ve sunucu eski
bir sürüme açıkça "güncelle" diyebilmeli.

## Hedefler

- **K1a:** Kurulu istemci, bilmediği response alanlarını sessizce atar (strip).
- **K1a:** Bilmediği enum değerlerini, yalnız o öğeyi etkileyen güvenli bir durumda tutar ("güncelleme gerekli").
- **K1b:** İstemci sürümünü bildirir. Sunucu ayarlanmış bir minimum sürümün altındaki istemciye
  `426 UPGRADE_REQUIRED` döner. İstemci bunu ayrı bir "güncelleme gerekli" durumu olarak gösterir.
- Sunucu istekleri bugünkü gibi kesin doğrulamaya devam eder.

## Hedef olmayanlar

- `/api/v2` açmak, alan yeniden adlandırmak veya kaldırmak (bunlar yine kırıcıdır).
- Web istemcisinin parse davranışı (web, sunucuyla birlikte deploy edilir).
- Yeni tasarımın "güncelleme gerekli" ekranının görseli (mevcut `StatusView` kullanılır).

## Anti-hedefler

- Request doğrulamasının gevşemesi: sunucu bilinmeyen request alanlarını kabul etmeye başlarsa başarısızdır.
- Bilinmeyen bir değerin varsayılan bir bilinen değere çevrilmesi. Örneğin bilinmeyen attempt
  durumunun `ACTIVE` sayılması, oynanmaması gereken bir attempt'e yazmaya yol açar.
- `passthrough`: bilinmeyen alanların taslağa girip sonra strict progress isteğinde geri gönderilmesi 400 üretir.

## Kısıtlar

- `packages/contracts` yalnız Zod import eder. Zod `4.6.6`.
- Aynı şemalar request ve response'ta ortak kullanılıyor. Örneğin `puzzleProgressStateSchema` hem
  progress komutunun payload'unda hem progress yanıtında var. `scoreInput`, `notes`, `revealedCells`
  ve `hintTypes` da öyle.
- Mobil, sunucudan aldığı `currentState`'i taslak yapar ve progress komutuyla geri gönderir.
  Bu yüzden sunucunun yayabileceği bir enum değeri, istemci tarafından geri yankılandığında request
  tarafında da kabul edilmeli. Sunucu bu değerleri zaten kendi state'iyle ezer (`progress.ts`).
- Sunucu kendi receipt'ini `puzzleCommandResultSchema.parse` ile, session'ı
  `nativeSessionDataSchema.parse` ile doğruluyor (`lib/services/mobile-api.ts`).
- Bağlı mobil yeniden tasarım oturumu `apps/mobile/src/ui` üzerinde çalışabilir. K1 UI'ya yalnız
  `StatusView`'a bir başlık/mesaj ekleyerek dokunur.

## Yaklaşımlar

1. **Request ve response şemalarını ayır (seçilen).** Shape'ler bir kez tanımlanır. Request
   varyantları `z.strictObject`, response varyantları `z.object` (strip) ile kurulur. Server-originated
   enum'lar response'ta `openEnum(values)` yardımcısıyla açık tutulur.
   - Artısı: kesin request doğrulaması korunur, tipler net, değişiklik tek pakette.
   - Eksisi: şema sayısı artar ve ortak parçalar iki kez türetilir.
2. **Hepsini gevşet, request'i parse noktasında sıkılaştır.** Zod'da `.strict()` sığdır; iç içe
   nesneler gevşek kalır ve sunucu fark etmeden bilinmeyen request alanı kabul eder. Anti-hedefi ihlal ettiği için elendi.
3. **Mobilde runtime'da derin "strip" dönüştürücü.** Şemaları çalışma anında yeniden yazmak
   Zod 4'ün iç API'sine bağımlıdır. Kırılgan ve tiplerden kopuk olduğu için elendi.
4. **Bilinmeyen enum için `.catch(varsayılan)` (elendi).** Anti-hedef: bilinmeyen değer yanlış bir bilinen değere döner.

Kullanıcı seçimi: bilinmeyen enum → yalnız o öğe "güncelleme gerekli" (seçenek 1). Bölme K1a/K1b ve
ayrı worktree önerisi kabul edildi.

## Tasarım

### K1a — tolerant response parse

- **Yardımcılar** (`common.ts`):
  - `openEnum(values)` = `z.union([z.enum(values), z.string().min(1).max(64)])`.
  - Tip `Known | (string & {})`.
  - `isKnown(values, v)` guard'ı.
- **Açık tutulacak response enum'ları:**
  - Oyun ve ilerleme: difficulty, campaign pack, puzzle mode, hint type (`hintTypes` dizisi dahil),
    progress status, attempt kind ve status, `userProgressItem.status`.
  - Geri bildirim: feedback `mode`, constraint violation `type` ve `severity`.
  - Analyze: analyze `mode`, issue `code` ve `severity`, satisfiability `status` ve `terminationReason`.
  - Auth: merge `status`.
- **Kapalı kalacak (yapısal) enum'lar:** `side` (`home`/`away`) ve match outcome. Bunlar oyunun
  matematiğidir; değişirse zaten v2 gerekir.
- **Response'ta gevşetilecek içerik sınırları:** `campaignLevel` `max(30)` ve `campaignOrder`
  `max(150)` kaldırılır. 4 takım / 6 maç / 4 standing uzunlukları yapısal oldukları için korunur.
- **`meta.apiVersion`:** response'ta `z.string()`. Bilinmeyen sürüm parse'ı kırmaz; uyumluluk K1b header'ıyla yönetilir.
- **Request şemaları:**
  - Dış nesneler ve iç içe nesneler `strictObject` kalır.
  - İstemcinin geri yankıladığı server state alanları (progress state içindeki `hintTypes`,
    attempt/progress değerleri) request'te de `openEnum` kabul eder.
  - Bu değerler sunucuda yok sayılır veya ezilir; davranış değişmez.
  - İstemcinin seçtiği alanlar (`hintType` isteği, attempt `kind` isteği) kapalı kalır.
- **Adlandırma:**
  - Mevcut export adları response anlamını korur, böylece mobil ve sunucu çağrı yerleri az değişir.
  - Request'te ayrılması gereken ortak parçalar `...RequestSchema` adını alır.
  - Örnek: `progressPayloadSchema`, strict `puzzleProgressStateRequestSchema` kullanır.
- **Sunucu:**
  - `nativeSessionDataSchema.parse` ve `puzzleCommandResultSchema.parse` artık strip eder.
    Saklı receipt'e eklenmiş bir anahtar 500 değil temiz yanıt üretir.
  - Request parse'ları (`puzzleCommandSchema`, auth istekleri) strict kalır.
- **Mobil:**
  - Tip daralması gereken yerlerde (`terminal()`, attempt status karşılaştırmaları, puzzle mode
    yönlendirmesi, difficulty/pack etiketleri) `isKnown` kullanılır.
  - Bilinmeyen attempt durumu terminal sayılır: tahta salt-okunur olur ve "Bu durumu görmek için
    uygulamayı güncelleyin" notu gösterilir.
  - Bilinmeyen puzzle mode veya pack: o öğe listede "Update required" etiketiyle görünür ve açılmaz.
  - Bilinmeyen feedback/analyze değeri: sunucunun `message` metni gösterilir, sınıflandırma yapılmaz.

### K1b — sürüm sinyali ve `426`

- **İstemci:** her `/api/v1` isteğine `X-ScoreLogic-Client: <ios|android|web>/<appVersion>/<contractsVersion>`
  header'ı eklenir. `appVersion` mevcut `app.version` kaynağından gelir.
- **Sunucu:**
  - `lib/api/v1.ts` içinde, auth dahil bütün v1 girişlerinde ortak bir kontrol çalışır.
  - Kontrol, opsiyonel `NATIVE_MIN_APP_VERSION` env'ini okur. Değer semver'dir; boşsa kontrol kapalıdır.
  - Header eksikse istek kabul edilir (bugünkü preview build'leri kilitlenmesin).
  - Header geçersiz veya sürüm minimumun altındaysa `426` döner:
    `{ code: 'UPGRADE_REQUIRED', details: { minAppVersion } }`.
  - Değişken `.env.example`'a ve `docs/deployment.md`'ye eklenir.
- **İstemci davranışı:**
  - `failureKind` yeni `'upgrade'` türünü döner.
  - Runtime `blocked` fazına geçer.
  - `StatusView`'a "Update ScoreLogic to continue" başlığı eklenir; retry butonu kalır.
  - Yerel taslak ve outbox korunur (outbox komutu silinmez; `failed()` 426'yı bilinen ret saymaz).

### Doğrulama

- **Kontrat unit testleri:**
  - Bilinmeyen üst seviye ve iç içe alanlar içeren session, puzzle, progress, command ve campaign
    yanıtları parse edilir ve alanlar atılır.
  - Bilinmeyen enum değerleri korunur.
  - Request şemaları bilinmeyen alanı hâlâ reddeder.
- **Sunucu unit testleri:**
  - min-version kapalıyken, header yokken, eşit sürümde, düşük sürümde ve bozuk header'da beklenen davranış.
  - Ekstra anahtarlı receipt temiz yanıt üretir.
- **Mobil testleri:**
  - Ekstra alanlı refresh yanıtı `refresh-pending`'i temizler.
  - Bilinmeyen attempt status terminal sayılır.
  - 426 → `'upgrade'` ve outbox korunur.
  - Header her istekte gönderilir.
- **Çalıştırılacak komutlar:** `/verify` ile root type-check/lint/unit, `tests/unit/contracts`,
  mobil type-check/test ve `check:export`. Native API dokunuşları nedeniyle integration testleri
  taze `_test` DB üzerinde koşulur.

## Builder'a kalanlar

- `openEnum` tipinin mobilde en az değişiklikle nasıl daraltılacağı.
- Semver karşılaştırması için küçük bir yerel yardımcı. Yeni bağımlılık eklenmez.
- `docs/mobile/api-v1.md`'ye "İleri uyumluluk ve sürüm" bölümü (Türkçe).

## Benim kararlarım (kontrol için)

1. `side` ve match outcome kapalı kalır.
2. Header eksik istekler kabul edilir; zorunluluk ileride min-version ile sağlanır.
3. Min-version varsayılan olarak kapalıdır; açmak ayrı bir operasyon kararıdır.
4. K1a ve K1b aynı branch'te, iki ayrı commit olarak gelir.
