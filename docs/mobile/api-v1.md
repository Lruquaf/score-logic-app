# ScoreLogic mobil API v1

> 14 Kasım 2026 · Uygulanan kaynak sözleşmesi. Canlıya alındığı veya mağaza/native cihaz kabulünün tamamlandığı anlamına gelmez.

Kanonik runtime şemaları [@scorelogic/contracts](../../packages/contracts/src/index.ts) paketindedir. Paket yalnız Zod ve kendi public dosyalarını import eder; Prisma/Next/engine veya `@/` alias'ına bağımlı değildir. Zod sürümü kök ve native projede aynı güvenli sürüme sabitlenmelidir; mevcut paket `4.6.6` kullanır. Mevcut web `/api/*` yolları korunur; native `/api/v1/*` ortak gameplay servislerine bağlanır.

## Envelope ve saat

Her v1 başarı `{ data, meta }`, hata `{ error: { code, message, details? }, meta }` döndürür. `meta`:

```json
{
  "apiVersion": "1",
  "serverTime": "2026-11-13T11:00:00.000Z",
  "businessDate": "2026-11-13",
  "timeZone": "Europe/Istanbul",
  "nextDailyAt": "2026-11-13T21:00:00.000Z"
}
```

Bu örnek bir sunucu ölçümü değildir. Daily kimliği cihaz tarihinden türetilmez. İstemci gelen veriyi uygun `*ResponseSchema` ile doğrular; başarı statüsü tek başına geçerli payload kanıtı değildir. Bilinmeyen hata kodu güvenli genel mesaj ve gerektiğinde retry/back ile sunulur. Public puzzle okumalarında `solution`/`allSolutions` kabul edilmez; yalnız başlangıç givens ve açık yetkili Reveal yanıtı skor taşır.

## Kimlik ve session

Native, `Authorization: Bearer <accessToken>` kullanır. Kullanıcı id'si, installation id veya header eklemek tek başına sahiplik değildir. Credential'lar güvenli native credential deposunda tutulur; URL, genel log, analytics, draft veya public env'e yazılmaz.

| POST yolu | JSON body | Başarı `data` |
|---|---|---|
| `/api/v1/auth/guest` | `{commandId, installationSecret, installationId?}` | `{user, session}` |
| `/api/v1/auth/login` | `{commandId,email,password,guestRefreshToken?,guestBarrier?}` | `{user,session,merge?}` |
| `/api/v1/auth/register` | Login ile aynı; şifre 8–128 karakter | `{user,session,merge?}` |
| `/api/v1/auth/refresh` | `{commandId,refreshToken}` | `{user,session}` |
| `/api/v1/auth/logout` | Geçerli Bearer ile `{}` veya mevcut/önceden tüketilmiş refresh capability ile `{refreshToken}` | `{revoked:true}` |
| `/api/v1/auth/revoke` | Logout ile aynı | `{revoked:true}` |

`commandId` UUID'dir; eylem gönderilmeden önce kalıcılaştırılır. `installationSecret`, kriptografik rastgele 32 baytın base64url biçimidir (43 karakter). `installationId` opsiyonel UUID metadata'sıdır, credential değildir. Secret tahmin edilemez üretilir; schema'nın uzunluk kontrolü entropi kanıtı değildir.

`user = {id,email:null|string,isAnonymous}`. `session = {id,accessToken,refreshToken,accessTokenExpiresAt,refreshTokenExpiresAt}`. Session kimliği UUID, zamanlar ISO-8601'dir. Access token kısa ömürlüdür; refresh rotate edilir. Eşzamanlı 401'ler tek refresh işlemini bekler. Kayıp refresh/login/guest yanıtında **aynı commandId ve aynı özgün payload** kullanılır; farklı commandId üretmek tekrar değildir. Sunucu erişim/refresh süreleri auth servisinin politikasıdır; public schema belirli bir dakikayı dayatmaz.

Guest'i hesaba merge etmek login/register içindeki atomik akıştır; ayrı açık bir `merge` route'u şu anda yoktur. `guestRefreshToken` varsa `{commandsSettled:true,draftsSynced:true}` biçiminde `guestBarrier` zorunludur. İstemci bu bayrakları gerçekten bekleyen işlemleri çözmeden ve draft sync bitmeden üretmez. Başarısız merge'de guest credential'ı silinmez. Web cookie guest'i native'e otomatik aktarılmaz. Native guest kalıcı `nativeGuest` işareti taşır; public id'sini web guest cookie'sine yazmak session veya merge yetkisi vermez.

Opsiyonel `merge` özeti: `status: merged|already_merged|skipped`, `sourceUserId`, `targetUserId`, `affectedPuzzleCount`, `movedAttemptCount`, `movedSubmissionCount`. Bunlar aggregate toplaması değildir; canonical geçmiş transaction içinde birleştirilir.

## Public okumalar

Aşağıdaki native yollar geçerli guest veya account Bearer session ister:

| GET yolu | `data` | Runtime şeması |
|---|---|---|
| `/api/v1/puzzles/daily` | `{puzzle,progress:null|canonicalProgress}` | `puzzleResponseSchema` |
| `/api/v1/puzzles/{id}` | Aynı; erişim kilidi kontrol edilir | `puzzleResponseSchema` |
| `/api/v1/puzzles/campaign` | `{puzzles,progress}` | `campaignResponseSchema` |
| `/api/v1/user/stats` | `{user,stats}` | `userStatsResponseSchema` |
| `/api/v1/user/progress?limit=6&cursor=...` | `{user,progress}` | `userProgressResponseSchema` |

Progress `revision` içerir; legacy DTO/fixture'da eksikse runtime şeması `0` verir. Bu fallback, mevcut daha yeni server revision'ını `0` kabul ederek yazma izni vermez. Native public DTO yalnız doğrulanmış ve sunucunun izin verdiği aktif içeriktir. Eksik, kilitli veya retired fiziksel id'de kontrollü hata beklenir.

`POST /api/v1/puzzles/{id}/analyze`, `{inputs}` kabul eder ve `analyzeBoardResponseSchema` biçiminde guided/assisted snapshot döndürür. `SAT`, `UNSAT`, `UNKNOWN` birbirinden ayrıdır; UNKNOWN yanlış cevap olarak yorumlanmaz. Analiz input değişiminde eskir, otomatik canlı skor kontrolü değildir.

## Kalıcı puzzle command ve CAS

`POST /api/v1/puzzles/{id}/commands`:

```json
{
  "type": "attempt",
  "commandId": "00000000-0000-4000-8000-000000000001",
  "baseRevision": 0,
  "payload": { "kind": "STANDARD", "forceNew": false }
}
```

`type`: `attempt|progress|hint|submit|reveal`. `puzzleCommandSchema` işlem tipine göre payload'ı doğrular. Payload'lar mevcut web request sözleşmesine karşılık gelir:

- `attempt`: `{kind:STANDARD|REPLAY,forceNew?}`.
- `progress`: `{attemptId,progress}`; progress puzzle kimliği, skor/not snapshot'ı ve süre alanlarını taşır.
- `hint`: `{attemptId,hintType:reveal,expectedHintCount,currentInputs,...}`. `requestId` verilirse commandId ile aynı olmalıdır; route aynı kimliği hint motoruna bağlar.
- `submit`: `{attemptId,inputs,timeTakenSec,...}`. Idempotency anahtarı commandId'dir.
- `reveal`: `{attemptId,currentInputs?,elapsedTimeSec?,...}`.

Tam alanlar ve varsayılanlar [commands.ts](../../packages/contracts/src/commands.ts) içinde tanımlıdır. Wire skor aralığı legacy uyumu için 0–20, mevcut oyuncu editörü 0–19'dur. Boş skor `null` ile taşınır; sıfırla aynı değildir. Maç notu en çok 180, home/away notu en çok 120 karakterdir. Sürede 120 dakika sınırı yoktur; kapasite üst sınırı 2.147.483.647 saniyedir, resmi süre sunucuda hesaplanır.

Başarı `data = {commandId,revision,result}`. Her `result` **canonical `progress`** içerir; işlemine göre `attempt`, `hint`, `progressPatch`, `feedback`, `isCorrect`, `answer` gibi alanlar eklenir. Yalnız hint patch'i outbox işlemini tamamlamaya yetmez. Ayrı final çözüm veya completion istemci hesabıyla yaratılmaz.

Sunucu aynı owner+puzzle+command için aynı request hash'ini tekrar oynatır. Aynı commandId ile farklı payload/baseRevision kullanımı conflict'tir. Retry için immutable command'ın tamamı saklanır; sonraki kullanıcı girdisi farklı draft revision'ıdır. Receipt yeni bir eylemin kimliği olarak tekrar kullanılmaz.

`GET /api/v1/puzzles/{id}/commands/{commandId}` mevcut owner'ın commit edilmiş receipt'ini aynı command result biçiminde verir. `404 COMMAND_NOT_FOUND`, işlemin başarısız olduğunun kesin kanıtı değildir: bilinmeyen/henüz commit olmamış bir işlem olabilir. Client receipt okuyup gerekirse aynı command'ı tekrar göndererek reconcile eder; yeni UUID üretmez.

## Web ile çok cihaz çakışması

Web mutation client'ı da `x-scorelogic-base-revision` gönderir ve başarılı `x-scorelogic-revision` header'ını okur. Revision, isteğin owner/puzzle/attempt taslağından yakalanır; sonradan değişen global revision'a bakılarak eski body gönderilmez. Native command aynı kontrolü JSON `baseRevision` ile taşır.

CAS çakışması `409`, `details.reason = REVISION_CONFLICT|REVISION_REQUIRED`, `expectedRevision`, `actualRevision`, `progress` alanlarını kullanır. Eski web istemcisinin revision'sız yazısı yalnız henüz revision gerektirmeyen legacy progress için kabul edilebilir; native command bu korumayı etkinleştirdiğinde header'sız eski istemci yazamaz.

İstemci 409 üzerine son revision'ı alıp aynı eski board'u sessiz yeniden göndermez. Web, draft'ın `baseRevision` bilgisini owner bazlı kalıcı saklar; reload'da da uyuşmazlığı gösterir. `Keep my entries` veya `Use server board` açık seçiminden sonra base ilerler. Verilen skorlar ve server hint'leri her zaman korunur. Terminal solve/reveal, eski draft'ı rebase ederek yeniden aktif yapılamaz; Replay ayrı eylemdir.

Kayıp web hint yanıtında özgün requestId/body/base tutulur. Background read daha yeni revision gösterirse bilinen hint receipt'i aynı istekle çözülür; başka cihazın daha sonraki değişikliği varsa yine açık conflict seçimi gerekir. Eski bir receipt mevcut base'i geriye götürmez. Onayı bilinmeyen Hint çözülene kadar yalnız ilgili owner/puzzle/attempt'in autosave'i bekler; sonraki daily bloke edilmez.

## Hesap / guest verisi silme

`POST /api/v1/account/delete` body: `{confirmation:"DELETE",password?,commandId?,deletionSecret?}`. `commandId` UUID ve `deletionSecret` 32 rastgele baytın base64url karşılığı (43 karakter) birlikte verilir veya ikisi de verilmez; legacy web body geçerlidir. Native Bearer veya webde mevcut account/guest cookie kullanılır. Account için mevcut şifre yeniden doğrulanır; guest için açık confirmation gerekir. Body'deki başka bir user id kabul edilmez.

Cookie kullanan web isteğinde aynı origin/Fetch Metadata kontrolü zorunludur; native'i çalıştırmak için web CSRF kontrolü kaldırılmaz. Başarı `{data:{deleted:true},meta}`. Web cookie/session chunk'ları temizlenir; native credential/session iptal edilir. Server deletion sonucu doğrulanmadan cihazda başarı gösterilmez.

Public web kaynağı [/delete-account](../../app/(legal)/delete-account/page.tsx). Form gerçek endpoint'e JSON POST yapar, account'ta şifre/guest'te confirmation ister. Aktif hizmetteki kişisel oyun verisi kaldırılır; paylaşılan puzzle içeriği ve başka uygulamalara gönderilmiş davetler silinmiş sayılmaz. Yedek/operasyonel saklama ayrı politikaya tabidir; bu sözleşme doğrulanmamış bir silme SLA'sı veya anlık bütün-yedek-erasure garantisi vermez. Restore işlemi tamamlanmış silmeleri tekrar uygulamalıdır.


### Silme onayının kayıp yanıt sonrası kurtarılması

Native istemci eylemden **önce** silme body’sini, owner’ı ve aynı komutun recovery proof’unu SecureStore’a yazar. İlk silme yine geçerli principal/confirmation ve hesap için doğru şifre ister. Hesabın silinmesiyle aynı transaction’da `NativeDeletionReceipt` yazılır; UUID, capability SHA-256 hash’i ve created/expires timestamp dışında kullanıcı/email/şifre/raw secret tutulmaz. Receipt 90 gün geçerlidir; bounded cleanup süresi dolanları kaldırır.

Aynı UUID + secret ile aynı endpoint’e yeniden POST, session artık iptal olsa bile yalnız `{deleted:true}` sonucunu doğrular. Receipt varsa Bearer/cookie ve tekrar şifre doğrulamasından önce incelenir; bu capability yalnız o tamamlanmış silmenin onayıdır, başka hesabı silme yetkisi değildir. UUID aynı fakat secret farklıysa `409 COMMAND_ID_REUSE`, hâlâ tutulan ama süresi dolmuş receipt için `410 RECOVERY_EXPIRED` döner. Cleanup sonrası receipt bulunmaması hesabın var olduğu veya silinmediği anlamına gelmez. Secret tahmin edilemez olmalıdır ve loglanmaz.

Belirsiz yanıt yeni UUID ile tekrar edilmez veya otomatik guest yaratılarak gizlenmez. Başarıdan sonra cihazda owner ve birleşmiş eski guest owner’larının cache/draft/outbox/archive verisi temizlenir; ilgisiz hesaplar korunur. Local cleanup yarıda kalırsa SecureStore’daki onay ve owner listesiyle yeniden başlatılır. “Start a new guest” ayrı, açık bir kullanıcı eylemidir.

Backend rollout: `20261114000000_native_deletion_receipts` dahil 22 migration uygulanmalıdır. Public contract paket sürümü 1.3.0, API wire sürümü v1’dir. Bu rapordaki migration yalnız yerel test veritabanlarına uygulandı.


## İleri uyumluluk ve sürüm

- **Response ve request:** Response şemaları (`z.object`) bilinmeyen alanları düşürür; request şemaları `z.strictObject` kalır. `meta.apiVersion` response’ta açık string’dir.
- **Açık enum'lar (`openEnum`):** Sunucunun ürettiği enum değerlerinde bilinmeyen değer korunur; istemci bunu güvenli şekilde işler. Attempt status bilinmiyorsa terminal/read-only kabul edilir ve bilgi notu gösterilir; bilinmeyen mode etiketi "Update required" olur. Request içinde echo edilen `hintTypes` bilinmeyen değerleri kabul eder.
- **Kapalı yapısal enum'lar:** `side` ve match outcome kapalıdır. İstemcinin seçtiği request alanları (`hintType`, attempt `kind`, silme `confirmation`) da kapalı kalır.
- **Hâlâ kırıcı değişiklikler:** Alan kaldırma, alan yeniden adlandırma ve yapısal enum değişikliği kırıcıdır; yeni alan/enum değeri eklemek kırıcı değildir.
- **İstemci header’ı:** `X-ScoreLogic-Client: <ios|android|web>/<appVersion>/<contractsVersion>`. Mobil istemci her istekte gönderir; mevcut contracts sürümü `1.3.0`.
- **Sürüm kapısı:** `NATIVE_MIN_APP_VERSION` (semver `x.y.z`; boş = kapalı) ayarlıysa, minimumun altındaki veya bozuk biçimli header `426` döner:
  `{ error: { code: 'UPGRADE_REQUIRED', message, details: { minAppVersion } }, meta }`. Header’sız istekler her zaman kabul edilir. Değer `prebuild`/`prestart` sırasında `scripts/validate-env.ts` ile doğrulanır.
- **Mobil 426 davranışı:** İstemci `'upgrade'` blocked durumuna geçer ve güncelleme ekranı gösterir. Outbox komutu ve `auth-pending` korunur; kullanıcı güncelledikten sonra aynı `requestId` ile devam edilir.
- **SQLite downgrade notu:** Bu build bilinmeyen enum değerlerini önbelleğe alabilir; üzerine eski (1.3.0 öncesi) bir preview build yeniden kurulursa önbellekteki satırlar okunamayan yerel veri (`INVALID_LOCAL_DATA`) olarak raporlanabilir, hiçbir şey silinmez. Store sürümleri hiçbir zaman downgrade olmadığından yalnız dahili preview build'leri etkilenir.

## Sınırlar ve doğrulama

- Şema geçerliliği sahiplik, campaign erişimi, canonical matematik veya CAS kabulü kanıtı değildir; servis katmanı bunları tekrar kontrol eder.
- Strict public puzzle/session/command DTO'larında yeni alan eklemek desteklenen client sözleşmesiyle birlikte değerlendirilir. Outer envelope/meta ek alanları düşürür; yanlış API sürümü kabul edilmez.
- Client'a private engine/Prisma/secret import edilmez. Açık yetkili Reveal'ın cevap içermesi public puzzle okumalarının çözüm sızdırmasından ayrıdır.
- Unit kontrat/form/web-CAS testleri: [mobile contracts](../../tests/unit/contracts/mobile-contracts.test.ts), [deletion](../../tests/unit/components/account-deletion.test.ts), [revision store](../../tests/unit/store/revision-conflict.test.ts), [web headers](../../tests/unit/api/web-revision-client.test.ts), [lifecycle](../../tests/unit/hooks/puzzle-lifecycle.test.ts).
- Gerçek PostgreSQL transaction, erişim/merge/rotation/revoke/deletion/CAS, native build ve fiziksel cihaz sonuçları ilgili integration/native kabul raporlarıyla ayrıca kapatılır.
