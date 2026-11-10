# Deployment Guide

Bu doküman ScoreLogic uygulamasını:

- lokalde geliştirme modunda çalıştırmak,
- lokalde production benzeri smoke test yapmak,
- Railway üzerinde deploy etmek

için gereken adımları kapsar.

## Boş veritabanıyla test ortamını ilk kez açma (10 Kasım düzeltmesi)

`db:deploy` yalnız migration uygular; puzzle üretmez. Boş `puzzles` tablosu, başarılı
PostgreSQL bağlantısına rağmen oynanabilir bir site sağlamaz. Canonical pre-deploy
komutu artık `NODE_ENV=production npm run db:release`: migration'dan sonra içerik
hazırlığı/doğrulaması çalışır. `db:seed` yalnız takım referanslarını yazar; sorunu tek
başına çözmez.

Paylaşılan **test** ortamının web servisinde:

```dotenv
PUZZLE_CONTENT_MODE=test
```

Bu ayarla yeni kodu deploy et. Release, 150 campaign seviyesi ve bugün dahil 15 günlük
(`DAILY_BUFFER_DAYS_AHEAD=14`) daily pencereyi üretir; domain/content QA'dan geçirir,
yalnız kendi test fixture'larını onaylayıp aktive eder. İşlemler normal editorial audit
olaylarıyla `system:test-content-bootstrap` aktörüne kaydedilir. Tekrar çalıştırma
mevcut içerikleri/kullanıcı geçmişini silmez, revision'ları yerinde değiştirmez.
Yarım kalan kendi fixture'larını tamamlar; başka aktörün pending/rejected içeriklerini
otomatik onaylamaz.

Railway mevcut service settings içinde pre-deploy override varsa yeni manifestle
`db:release` kullanıldığını doğrula. Yeni script mevcut deployment'ta yoksa yalnız
redeploy/restart yetmez: yeni kaynak kodu build edilmelidir.

Normal editorial production için varsayılan `PUZZLE_CONTENT_MODE=reviewed` kalır.
Bu mod otomatik üretim/onay yapmaz; mevcut yayınlanmış campaign ve bugünün daily'sini
denetler. Eksik içerikte release anlaşılır hata ile durur; normal publisher/review/
activation iş akışı kullanılır. Test modunu insan onayı gereken production içerikleri
üzerinde etkinleştirme.

Kontrol:

- `/api/health`: `database: up`, `content: up`, Redis kapalıysa `redis: disabled`.
- `/api/puzzles/campaign`: 150 seviye; her pack'in birinci seviyesi guest için açık.
- `/api/puzzles/daily`: güncel business date ve 6 maç; 200 yanıt.
- Tarayıcıda guest olarak Daily ve Beginner 1 oynanabilir.

Günlük yenileme için test ortamında aynı repo'dan ayrı cron servisine
`/railway.test-content.toml` manifestini, aynı `DATABASE_URL` ve
`PUZZLE_CONTENT_MODE=test` değerini bağla. Bu servis İstanbul 00:15'te pencereyi
ilerletir. Cron kurulmayan test ortamının son hazırlanmış 15 günlük penceresi bittiğinde
yeni release veya `npm run db:ensure-content` gerekir. Normal editorial daily/activation
cron'ları mevcut ayrı review sürecini kullanmaya devam eder.

Yerel snapshot upload'ında `.railwayignore`, gerçek `.env*`, `.next*`, yerel DB ve test
çıktılarını dışlar. Railway değişkenleri runtime'da sağlanır; local env dosyası image'a
konmaz.

## 1. Gerekli Environment Variables

Production'da zorunlu:

- `DATABASE_URL`: PostgreSQL bağlantı dizesi.
- `AUTH_SECRET`: en az 32 karakterlik, güçlü ve benzersiz bir secret.
- `AUTH_URL`: uygulamanın `https://` public URL'i.
- `AUTH_TRUST_HOST=true`: production host/proxy güveni açıkça etkinleştirilmelidir.

Minimum web deploy için bu dört değişken yeterlidir. Node.js 22 / npm 10,
PostgreSQL ve migration'ların uygulanması gerekir. `railway.toml` build, migration,
standalone start ve `/api/health` kontrolünü zaten tanımlar.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
AUTH_SECRET=<en-az-32-karakter-rastgele-secret>
AUTH_URL=https://uygulamaniz.example.com
AUTH_TRUST_HOST=true
```

Secret üretmek için: `openssl rand -base64 32`. Railway üzerinde ayrıca
`RATE_LIMIT_TRUSTED_PROXY_HOPS=1` kullanın; varsayılan `0` forwarded IP'ye güvenmez,
cookie'siz istekleri ortak bir limit kovasında toplar.

Opsiyonel servisler:

- `REDIS_ENABLED=true` + `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`:
  Redis yalnız açıkça etkinleştirilirse kullanılır. Varsayılan `REDIS_ENABLED=false`;
  eski `.env` değerleri tek başına Redis bağlantısı başlatmaz. URL/token birlikte verilir.
  Yoksa süreli bellek içi rate limiter çalışır. Limitler instance bazlıdır ve restart'ta
  sıfırlanır; çok instance için Redis kullanın. Yapılandırılmış Redis production'da
  kesilirse korunan istekler `503` döndürmeye devam eder.
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`: sunucu ve tarayıcı hata takibi.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: yoksa OTel exporter başlatılmaz.
  `OTEL_TRACES_SAMPLER_ARG` varsayılanı `0.1`.
- `POSTHOG_API_KEY` + `POSTHOG_HOST`: ürün analitiği; key verilirse host gerekir.
- `OBSERVABILITY_HASH_SALT`: en az 32 karakter; yoksa production log/analitiğinde
  kullanıcı korelasyonu gönderilmez.
- `SYNTHETIC_MONITOR_TOKEN` ve `SYNTHETIC_BASE_URL`: yalnız synthetic worker için.
- Backup/S3 değişkenleri: yalnız ayrı backup worker çalıştırılacaksa gerekir.
- Daily buffer, editorial activation, calibration, synthetic ve backup cron servisleri
  ilk web deploy için gerekmez. Günlük içeriğin devamlılığı için daily buffer ve
  editorial yayın süreci daha sonra kurulmalıdır.

Boş veritabanında migration yalnız şemayı hazırlar. Oynanabilir içerik için
`npm run db:seed`, `npm run db:publish` ve aşağıda açıklanan editorial onay/aktivasyon
adımları gerekir. Web deploy otomatik puzzle üretmez veya inceleme onayını atlamaz.
Opsiyonel değişkenler tanımlanırsa geçerlilik kontrolleri uygulanmaya devam eder.

Eklemeyin:

- `NODE_ENV`: Railway veya Next.js build/runtime bunu kendisi yönetmelidir. `staging`, `preview` gibi özel değerler Next.js build/prerender davranışını bozabilir.

Opsiyonel ama önerilen:
- `DAILY_TIME_ZONE`: daily puzzle gün sınırı. Varsayılan `Europe/Istanbul`.
- `DAILY_BUFFER_DAYS_AHEAD`: bugün sonrasındaki hazır daily gün sayısı. Varsayılan `14`,
  production config aralığı `7–30`; pencere bugünü de içerdiği için varsayılan kayıt
  sayısı 15'tir. Manuel `--days-ahead` denetimleri `0–30` aralığını kabul eder.

Not:

- `build`, `start` ve `start:standalone` öncesinde merkezi environment doğrulaması
  çalışır. Eksik/geçersiz production değişkeni veya örnek geliştirme secret'ı
  deployment'ı fail-fast durdurur.
- Redis yoksa `/api/health`, PostgreSQL erişilebilir olduğunda `200` ve
  `redis: disabled` döndürür. Redis yapılandırılmışsa erişilebilir olması gerekir.

## 2. Lokal Geliştirme Akışı

### 2.1 Önkoşullar

- Node.js 22.x
- npm 10.x
- PostgreSQL 15+

Varsayılan local workflow bu repo içinde yönetilen PostgreSQL'i `127.0.0.1:55432` üzerinde çalıştırır. Bu, makinedeki mevcut `5432` servisleriyle çakışmamak içindir.

### 2.2 Kurulum

1. `npm ci`
2. `.env.example` dosyasını `.env` olarak kopyala.
3. Aynı değerleri `.env.local` dosyasına da kopyala veya `.env` ile devam et.
4. `DATABASE_URL` ve `AUTH_SECRET` değerlerini ayarla.
5. `npm run local:up`

`local:up` şu işlemleri tek komutta yapar:

- gerekli klasörleri oluşturur,
- yerel PostgreSQL cluster'ı yoksa initialize eder,
- PostgreSQL'i başlatır,
- geliştirme veritabanını ve sonu `_test` ile biten izole test veritabanını oluşturur,
- `db:setup` ile migration, referans seed ve kontrollü puzzle publish akışını çalıştırır,
- test veritabanına yalnız migration'ları uygular,
- Next.js dev server'ı arka planda başlatır.

### 2.3 Uygulamayı çalıştır

- Tek komut açılış: `npm run local:up`
- Durdurma: `npm run local:down`
- Durum kontrolü: `npm run local:status`
- Manuel geliştirme: `npm run dev:local`
- Gerçek PostgreSQL integration testi: `npm run test:integration:local`
- Stats drift dry-run: `npm run stats:reconcile`
- Stats drift repair: `npm run stats:reconcile -- --repair`
- Daily buffer doldurma: `npm run db:daily-buffer`
- Daily buffer salt-okuma kontrolü: `npm run db:daily-buffer -- --check`
- Editorial işlem: `npm run db:editorial -- <işlem> --actor <kimlik>`
- Observed difficulty kalibrasyonu: `npm run difficulty:calibrate`
- Şifreli DB yedeği: `npm run ops:backup`
- İzole restore tatbikatı: `npm run ops:restore-drill`
- Engine performans kapısı: `npm run perf:check`
- Yerel bounded yük testi: `npm run perf:load:local`
- Production server simülasyonu:
  1. `npm run build`
  2. `npm run start:local`

Varsayılan adres: `http://127.0.0.1:3007`

### 2.4 Standalone smoke test

Railway ile aynı üretim başlangıç akışını denemek için:

1. `npm run build`
2. `npm run start:standalone`

Bu akış `.next/standalone/server.js` üzerinden çalışır.

## 3. Railway Deployment

Repository içinde bulunan [railway.toml](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/railway.toml) dosyası şu davranışları tanımlar:

- build command: `npm run build`
- pre-deploy command: `npm run db:release`
- start command: `npm run start:standalone`
- readiness/promotion healthcheck path: `/api/health`

`db:deploy`, Railway PostgreSQL'in henüz startup/recovery aşamasında olduğu geçici
durumlarda Prisma migration'ını bounded exponential backoff ile en fazla sekiz kez
tekrarlar. Yalnız bağlantı hazırlığına ait `P1001`/`P1002`, startup/recovery ve bağlantı
kesilmesi hataları tekrar denenir; gerçek migration/schema hataları ilk denemede deploy'u
durdurur.

### 3.1 Railway üzerinde proje oluştur

1. Railway dashboard'da yeni bir project oluştur.
2. GitHub repository'yi bağla.
3. Web service olarak bu repo'yu seç.

### 3.2 PostgreSQL ekle

1. Aynı Railway project içine bir PostgreSQL service ekle.
2. Web service içindeki `DATABASE_URL` değişkenini PostgreSQL servisindeki `DATABASE_URL` referansına bağla.

Railway dökümantasyonuna göre PostgreSQL servisi `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` ve `DATABASE_URL` gibi değişkenleri sağlar; çoğu kütüphane doğrudan `DATABASE_URL` kullanır. Kaynak: Railway PostgreSQL docs.

#### Bilinen Wave 14 production migration'ını otomatik kurtarma

`db:deploy`, Prisma `P3009` sonucunda yalnız
`20260803140000_wave_14_editorial_workflow` migration'ını başarısız görürse bu
tek kaydı otomatik olarak `migrate resolve --rolled-back` ile yeniden uygulanabilir
duruma getirir ve migration deploy'unu aynı pre-deploy içinde tekrarlar. Wave 14 SQL'i
kısmi ilk denemeden kalabilecek nesneleri idempotent olarak ele alır ve düzeltmeyi
transaction içinde tamamlar. Bu nedenle düzeltilmiş commit'in ilk GitHub/Railway
deployment'ı dışarıdan SSH veya manuel veritabanı müdahalesi istemez.

Otomatik recovery kesin bir allowlist kullanır. Farklı isimde bir migration hatası,
Wave 14 için `P3009` dışında yeni bir hata veya başarısız resolve işlemi fail-closed
olarak deploy'u durdurur; migration ledger'ına genel ya da tahmine dayalı müdahale
edilmez. Veri silen `migrate reset` hiçbir production recovery akışında kullanılmaz.

### 3.3 Uygulama environment variables

Web service için en az şu değişkenleri ekle:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `AUTH_SECRET=<strong-random-secret>`
- `AUTH_URL=https://<your-domain>`
- `AUTH_TRUST_HOST=true`
- `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` (Railway proxy ayarı)

Aşağıdakileri yalnız ilgili servisi kullanacaksan ekle:

- `DAILY_TIME_ZONE=Europe/Istanbul`
- `DAILY_BUFFER_DAYS_AHEAD=14`
- `REDIS_ENABLED=true` (yalnız Redis kullanılacaksa)
- `UPSTASH_REDIS_REST_URL=<https-upstash-rest-url>`
- `UPSTASH_REDIS_REST_TOKEN=<upstash-rest-token>`
- `OBSERVABILITY_HASH_SALT=<strong-random-environment-salt>`
- `SENTRY_DSN=<sentry-dsn>` ve `NEXT_PUBLIC_SENTRY_DSN=<same-sentry-dsn>`
- `OTEL_EXPORTER_OTLP_ENDPOINT=<https-otlp-endpoint>`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
- `OTEL_TRACES_SAMPLER=parentbased_traceidratio`
- `OTEL_TRACES_SAMPLER_ARG=0.10`
- `POSTHOG_API_KEY=<project-api-key>` ve `POSTHOG_HOST=<https-posthog-ingest-host>`
- `SYNTHETIC_MONITOR_TOKEN=<strong-random-monitor-token>`

`NODE_ENV` değişkenini Railway Variables içine ekleme. Repository'deki [railway.toml](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/railway.toml) build/start komutları production değerini açıkça set eder.

### 3.4 Domain ve healthcheck

1. Railway service settings içinden public domain üret.
2. Domain hazır olduktan sonra `AUTH_URL` değerini bu domain ile güncelle.
3. Deploy healthcheck endpoint'i olarak `/api/health` kullanılır.

Railway healthcheck mantığına göre yeni deployment ancak endpoint HTTP `200` döndürdüğünde aktif olur. Ayrıca Railway uygulamanın `PORT` değişkenini dinlemesini bekler. Kaynak: Railway Healthchecks docs.

`/api/healthz` yalnız process liveness'ını kontrol eder ve dış bağımlılık sorgulamaz.
Canonical Railway promotion gate'i `/api/health` endpoint'idir: PostgreSQL veya yapılandırılmış
Redis erişilemiyorsa ya da 150 campaign + bugünün daily içeriği hazır değilse `503` döner ve deployment promote edilmez.

### 3.5 Rate-limit ve CSP güvenlik sözleşmesi

- Auth/register, attempt, submit, progress, hint, answer, Analyze Board ve telemetry aynı
  merkezi rate-limit politika tablosunu kullanır.
- İstemci anahtarı önce hash'lenmiş session/anonim cookie'den, cookie yoksa yalnız
  yapılandırılmış trusted proxy zincirinden çözülen IP'den türetilir. Ham cookie/IP Redis
  key'ine yazılmaz.
- Limit aşımı `429`, `Retry-After`, `RateLimit`, `RateLimit-Policy` ve geriye uyumlu
  `X-RateLimit-*` başlıklarını döndürür.
- Telemetry JSON gövdeleri 16 KiB ile, string alanları schema üst sınırlarıyla korunur.
- Root layout `connection()` ile HTML sayfalarını istek zamanında render eder; böylece
  script nonce'ı response CSP'siyle eşleşir. Sayfaları tekrar static prerender/ISR'a
  çevirmek production'da hydration'ı engeller. Metadata dosyaları ayrı kalabilir.
- Middleware her document isteği için kriptografik nonce üretip CSP'yi hem request'e hem
  response'a taşır. Production `script-src`, nonce + `strict-dynamic` kullanır;
  `unsafe-inline` ve `unsafe-eval` script izni yoktur. `unsafe-eval` yalnız Next.js local
  development runtime'ında eklenir. Mevcut dinamik React style attribute'ları nedeniyle
  style policy'sindeki `unsafe-inline` şimdilik bilinçli bir residual kısıttır.

### 3.5.1 Observability ve synthetic smoke

- Root `instrumentation.ts`, Next.js request trace'lerini `@vercel/otel` ile OTLP'ye
  yollar. `x-request-id` caller'dan kabul edilmez; middleware üretir, request/response ve
  trace attribute'una aynı değeri taşır. Prisma child span'leri model ve operasyon adını
  içerir; SQL, parametre ve sonuç gövdesini içermez.
- Sentry error/issue kanalıdır; OTel ile ikinci bir tracing provider kurmamak için server
  tracing'i kapalıdır. Default PII, local variable, request/user context ve hassas extra
  alanlar gönderilmez. Source map upload için CI ortamına ayrıca `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG` ve `SENTRY_PROJECT` verilebilir.
- Product analytics yalnız allowlist olay/property taşır. Browser PostHog'a doğrudan
  bağlanmaz; `/api/telemetry/product-event` üzerinden server capture'a gider. Ham user id
  HMAC hash'e çevrilir; skor/çözüm/input/not/email/token alanları reddedilir.
- Dashboard ve alarm sağlayıcısında uygulanacak canonical sözleşmeler
  `ops/observability/dashboard.json` ve `ops/observability/alerts.json` dosyalarındadır.
  `npm run ops:validate` dangling/duplicate alarm bağlantılarını CI'da reddeder.
- Ayrı Railway cron service için `/railway.synthetic-smoke.toml` seçilir;
  `SYNTHETIC_BASE_URL` public HTTPS uygulama URL'i ve token web service ile aynı secret
  olmalıdır. Beş dakikada bir readiness, public daily ve yetkili domain/engine kontrolü
  çalışır. Yetkili endpoint çözüm veya skor gövdesi döndürmez.
- Alarm müdahale ve retention sözleşmesi `docs/operations/incident-response.md` içindedir.

### 3.5.2 Backup/restore ve performans doğrulaması

- Ayrı Railway cron service için `/railway.database-backup.toml` seçilir; service'e
  `/data` persistent volume bağlanır ve `BACKUP_DIRECTORY=/data/backups` verilir.
- Service variable olarak `RAILPACK_CONFIG_FILE=railpack.database-backup.json` verilir;
  bu config runtime image'a `pg_dump`, `pg_restore` ve `psql` sağlayan
  `postgresql-client` paketini kurar.
- `DATABASE_URL` ile `BACKUP_ENCRYPTION_KEY` zorunludur. Production koşusu ayrıca
  S3-compatible credential/bucket değişkenlerini zorunlu tutar ve encrypted dump +
  manifest çiftini off-site hedefe yükleyemediğinde non-zero kapanır.
- Hedefler `RPO <= 24 saat`, `RTO <= 30 dakika`dır. Aylık ölçümlü tatbikat ve güvenli
  restore akışı `docs/operations/backup-restore.md` içindedir.
- Public query projection, progress cursor'ı ve CI/load budget sözleşmesi
  `docs/operations/performance.md` içindedir. Remote load hedefi açık opt-in olmadan
  reddedilir.

### 3.6 Daily future buffer cron service

Web service'e ek olarak aynı repository'yi kullanan ayrı bir Railway service oluştur ve
Config File yolunu `/railway.daily-buffer.toml` yap. Bu manifest:

- yalnız Prisma client üretir;
- `npm run db:daily-buffer` komutunu çalıştırıp process'i kapatır;
- `15 21,3 * * *` UTC takvimiyle İstanbul saatiyle 00:15 ve 06:15'te çalışır;
- cron process'i için restart uygulamaz.

Cron service'te `DATABASE_URL`, `DAILY_TIME_ZONE` ve `DAILY_BUFFER_DAYS_AHEAD`
değerlerini tanımla. Worker kendi dar environment sözleşmesini doğrular; Redis, auth,
Sentry, OTel ve PostHog değişkenlerini bu servise taşımaya gerek yoktur.
Railway cron job bitiş kodunu deployment sonucu olarak izlediği için `daily_buffer_failed`
ve non-zero exit service alarmına bağlanmalıdır. Ek bir salt-okuma synthetic kontrol için:

```bash
npm run db:daily-buffer -- --check
```

Bu kontrol bütün pencere hazırsa `READY` ve exit `0` üretir. Gün tamamen yoksa
`missingDates`, QA/editorial olarak reddedilmiş veya geçersiz revision varsa
`blockedDates` ile `GAP` üretir. QA'dan geçmiş yeni revision insan incelemesi bekliyorsa
`pendingReviewDates`, onaylanmış fakat aktivasyon bekliyorsa `activationPendingDates` ile
`REVIEW_REQUIRED` üretir. `GAP` ve `REVIEW_REQUIRED` check sonucunun exit kodu `2`'dir.
Manuel tarih ve pencere doğrulaması için `--start YYYY-MM-DD --days-ahead N` kullanılabilir.

Worker adayları deterministik üretir, staging öncesi sürümlü content QA'yı yeniden
çalıştırır ve PostgreSQL advisory transaction lock ile eşzamanlı cron/manual koşularını
tek yayıncıya indirger. Yeni kaydı sessizce aktive etmez; `PENDING_REVIEW` olarak bırakır.
Cron fill işlemi `REVIEW_REQUIRED` durumunda başarılı kapanır, fakat ayrı `--check`
synthetic kontrolü insan kuyruğu temizlenene kadar alarm üretir.

### 3.6.1 Zamanlanmış editorial aktivasyon service'i

Aynı repository'den ikinci bir Railway cron service oluştur ve Config File yolunu
`/railway.editorial-activation.toml` yap. Bu manifest:

- `npm run db:editorial -- --activate-due --actor system:editorial-activation-worker`
  komutunu çalıştırır;
- her beş dakikada vadesi geçmiş, QA kanıtlı ve editorial onaylı revision'ları işler;
- her `contentKey` aktivasyonunu serializable transaction ve advisory lock altında yapar;
- kısmi başarısızlıkta structured `PARTIAL` rapor ve exit `2` üretir.

Service yalnız `DATABASE_URL` değerine ihtiyaç duyar. `editorial_workflow_failed`,
`PARTIAL` veya non-zero exit gözlemlenmelidir. Retry güvenlidir: aktif revision yeniden
aktive edilmez ve başarılı aktivasyonda plan zamanı temizlenir.

### 3.6.2 Difficulty calibration cron service'i

Aynı repository'den ayrı bir Railway cron service oluştur ve Config File yolunu
`/railway.difficulty-calibration.toml` yap. Manifest her pazartesi `02:30 UTC`'de:

```bash
npm run difficulty:calibrate -- --fail-on-drift
```

çalıştırır. Varsayılan olarak önceki 90 tam UTC günü, minimum 30 farklı kullanıcı ve 24
saatlik stale-attempt eşiği kullanılır. Aynı algoritma/pencere/politika kombinasyonu
PostgreSQL advisory lock ve unique key ile idempotenttir. Çıktı `difficulty_calibration_completed`
structured JSON olayıdır; güvenli örnekte en az bir `UNDER_ESTIMATED` veya
`OVER_ESTIMATED` revision varsa `--fail-on-drift` exit `2` üretir. Veri azlığı cron'u
başarısız yapmaz; ilgili revision'lar `INSUFFICIENT_DATA` olarak görünür.

Manuel, yeniden üretilebilir denetim örneği:

```bash
npm run difficulty:calibrate -- \
  --at 2026-08-04T00:00:00.000Z \
  --window-days 90 \
  --minimum-sample-size 30 \
  --stale-attempt-hours 24
```

Snapshot yalnız aggregate metrik saklar ve published puzzle difficulty alanlarını
değiştirmez. Drift bir otomatik update talimatı değildir; ürün/editorial incelemesi,
gerekirse yeni algoritma sürümü ve yeni immutable revision için kanıttır.

### 3.7 İlk deploy sonrası doğrulama

İlk production kurulumu veya yeni içerik sürümü yayınlanmadan önce, kontrollü bir
operasyon adımı olarak `npm run db:seed` ve ardından `npm run db:publish` çalıştırılır.
Bu komut deploy pre-hook'unun parçası değildir:

- `db:seed` yalnız takım gibi değişebilir referans verisini hazırlar.
- `db:publish` bugünün daily puzzle'ı ile campaign setini üretir.
- Publisher JSON şemasını, round-robin/topoloji ve standings matematiğini, her çözümün
  tabloyu üretmesini, eksiksiz `allSolutions` kümesini, campaign/daily metadata,
  tablo difficulty bandı, prefill/feedback/analyze kaynaklı presentation skoru, effective
  difficulty bandı ve deterministik prefill'i yazımdan önce doğrular. Ardından çözüm
  sayısı, skor gerçekçiliği/çeşitliliği, prefill sonrası oynanabilirlik, hint
  satisfiability, otomatik playthrough ve havuz benzerliği kapılarını çalıştırır.
- Bir domain veya content QA ihlalinde komut fail-closed durur; ilgili puzzle yazılmaz veya
  `isTested` yapılmaz.
- Başarılı QA raporu `contentQaVersion/contentQaReport` alanlarında revision ile saklanır;
  publisher konsola temel QA metriklerini yazar.
- Aynı mantıksal kimlik/revision ve aynı checksum'da içerik varsa işlem no-op olur.
- Aynı mantıksal kimlik/revision farklı immutable içerikle zaten varsa publish fail eder.
- Her yeni revision, ilk revision dahil, `PENDING_REVIEW` ve pasif doğar. Otomatik QA ile
  insan onayı ayrı kanıtlardır; açık editorial onay ve aktivasyon gerekir.

### 3.7.1 Editorial review, publish ve rollback

Önce yeni revision'ı doğrulanmış fakat pasif olarak yaz:

```bash
npm run db:publish -- --content-key campaign:beginner:1 --revision 2
```

İnsan incelemesi tamamlandığında aktör kimliği ve anlamlı bir notla onayla:

```bash
npm run db:editorial -- --content-key campaign:beginner:1 --revision 2 \
  --approve --actor editor:yavuz --note "Scorelines and presentation reviewed."
```

Hemen aktive etmek için:

```bash
npm run db:editorial -- --content-key campaign:beginner:1 --revision 2 \
  --activate --actor editor:yavuz --note "Approved release window."
```

Gelecek bir an için planlamak için ISO-8601 instant kullan:

```bash
npm run db:editorial -- --content-key daily:2026-08-10 --revision 1 \
  --schedule 2026-08-09T21:00:00.000Z --actor editor:yavuz
```

İnceleme başarısızsa revision'ı değiştirmek yerine gerekçeli karar kaydet ve düzeltmeyi
yeni immutable revision olarak stage et:

```bash
npm run db:editorial -- --content-key campaign:beginner:1 --revision 2 \
  --request-changes --actor editor:yavuz --note "Hint path needs revision."
```

`--reject` de not gerektirir. `--cancel-schedule` planı append-only iptal olayıyla kaldırır.
Aktivasyon sırasında mevcut revision üzerinde aktif attempt varsa işlem fail-closed durur;
attempt'ler terminal olduktan sonra güvenle yeniden denenebilir. Rollback önceki,
halen QA kanıtlı ve onaylı immutable revision'ı tekrar aktive eder:

```bash
npm run db:editorial -- --content-key campaign:beginner:1 --rollback 1 \
  --actor editor:yavuz --note "Regression in revision 2."
```

- Revision numaraları kesintisizdir; revision 3, revision 2 yayınlanmadan oluşturulamaz.
- Review, planlama, aktivasyon ve rollback `contentKey` bazlı PostgreSQL advisory lock ve serializable
  transaction kullanır.
- Aktivasyon bir key için mevcut aktif revision'ı `retiredAt` ile kapatır ve hedefi
  `activatedAt` ile açar.
- Her karar ve lifecycle geçişi `PuzzleEditorialEvent` içinde aktör, not, zaman ve önceki
  revision referansıyla append-only saklanır.
- Kontrollü local/CI bootstrap için `system:local-bootstrap` aktörlü
  `--approve-pending --activate` batch modu vardır. Komut production ortamında ve başka
  aktörle fail-closed reddedilir.
- `db:publish` yalnız çalıştırıldığı business date'in daily içeriğini bootstrap eder;
  ileri pencereyi `db:daily-buffer` yönetir.
- Daily API ve home preview salt-okumadır; kayıt yoksa üretim başlatmaz. API
  `503 SERVICE_UNAVAILABLE`, `Retry-After: 300` ve business date döndürür.

Deploy tamamlandıktan sonra:

1. `/api/healthz` endpoint'ini aç ve process liveness için HTTP `200` döndüğünü doğrula.
2. `/api/health` endpoint'ini aç; database durumunun `up`, Redis durumunun `up` veya `disabled` olduğunu doğrula.
3. `/daily` ve `/stats` sayfalarını kontrol et.
4. anonim kullanıcı ilerlemesi kaydı alınıyor mu doğrula.
5. giriş akışını test et.
6. dashboard ve API loglarını Railway Metrics/Logs üzerinden kontrol et.

## 4. Tam operasyon kurulumu için ek kontroller

- `AUTH_SECRET` güçlü ve benzersiz.
- `DATABASE_URL` production veritabanını gösteriyor.
- `AUTH_URL` gerçek public domain ile set edilmiş.
- Redis kullanılacaksa URL/token birlikte set edilmiş.
- `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` Railway proxy topolojisiyle eşleşiyor.
- `DAILY_TIME_ZONE` beklenen IANA timezone değerini taşıyor.
- `DAILY_BUFFER_DAYS_AHEAD=14` ve cron service `/railway.daily-buffer.toml` kullanıyor.
- Due activation cron service `/railway.editorial-activation.toml` kullanıyor.
- Weekly calibration cron service `/railway.difficulty-calibration.toml` kullanıyor.
- Synthetic cron service `/railway.synthetic-smoke.toml` kullanıyor ve son koşu başarılı.
- Backup cron `/railway.database-backup.toml` kullanıyor; volume, off-site kopya ve son
  24 saat içinde başarılı manifest doğrulandı.
- Backup cron `RAILPACK_CONFIG_FILE=railpack.database-backup.json` kullanıyor ve son
  başarılı olayda `offsite.encryptedKey` ile `offsite.manifestKey` bulunuyor.
- Son restore drill `PASS`; ölçülen RPO/RTO hedef içinde ve verification sayaçları temiz.
- OTel trace export, Sentry test issue ve server-proxy PostHog test olayı doğrulandı.
- `npm run ops:validate` temiz geçiyor; dashboard/alert tanımları provider'da aktif.
- CI içindeki `npm run audit:prod` kapısı geçti ve production dependency bulgusu sıfır.
  Auth.js en az beta.32/core 0.41.3, Next.js en az 16.3.0 olmalı;
  major sürümler `npm audit fix --force` ile kontrolsüz değiştirilmez.
- `npm run db:daily-buffer -- --check` `READY`/exit `0` döndürüyor.
- `/api/healthz` ve dependency-aware `/api/health` 200 dönüyor.
- `npm run build` localde temiz geçiyor.
- lint, unit, gerçek PostgreSQL integration ve E2E testleri temiz.
- `npm run perf:check` ve bounded application load testi bütçe içinde.
- Production HTML yanıtının CSP `script-src` direktifi nonce içeriyor ve
  `unsafe-inline`/`unsafe-eval` içermiyor.

## 5. Operasyonel Notlar

- Railway config as code yalnızca deploy anındaki ayarları override eder; dashboard ayarlarını kalıcı olarak değiştirmez. Bu yüzden `railway.toml` repository içinde canonical deploy manifest olarak tutulmalıdır.
- Next.js standalone output etkin olduğu için Railway start command doğrudan minimal standalone server'ı başlatır.
- Prisma migration'ları release içinde `db:deploy` ile uygulanır; geçici database
  startup yarışları yaklaşık 62 saniyelik sınırlı retry penceresinde karşılanır. Deploy
  reviewed modunda puzzle üretmez; test modunda eksik test fixture'ları hazırlanır.
- `20260730170000_wave_4_attempts` migration'ı `PuzzleAttempt`, `AttemptEvent` ve
  first/best/current progress referanslarını ekler. Uygulama kodu yayınlanmadan önce
  pre-deploy migration'ın başarıyla tamamlanması zorunludur.
- `20260730190000_wave_5_stats_reconciliation` migration'ı attempt bazlı aggregate
  kolonlarını ekler. Migration sonrasında önce
  `npm run stats:reconcile -- --fail-on-drift` ile read-only denetim, sonra gerekiyorsa
  `npm run stats:reconcile -- --repair` ile kontrollü düzeltme çalıştırılır.
- Reconciliation bütün kullanıcılar için cursor/batch ile ilerler. `--batch-size <1-1000>`
  batch boyutunu, `--user <id>` tek kullanıcıyı seçer. `--repair` verilmedikçe hiçbir
  aggregate yazılmaz; dry-run drift bulduğunda CI/operasyon adımını başarısız kılmak için
  `--fail-on-drift` exit code `2` üretir.
- Reconciliation sırasında kullanıcı bazlı PostgreSQL advisory transaction lock alınır.
  Canlı attempt/submit/reveal yazımları da aynı lock sırasını kullandığı için aynı
  kullanıcının aggregate'i yarım canonical snapshot ile yazılmaz.
- `20260730210000_wave_6_anonymous_merge` migration'ı kalıcı
  `anonymous_user_merges` receipt tablosunu ekler. Uygulama ve migration birlikte
  yayınlanmalıdır; yeni kod receipt tablosu olmadan sign-in merge'ini tamamlayamaz.
- Anonymous merge fail-closed'dur. Merge sırasında bir hata gözlenirse sign-in
  tamamlanmaz ve kaynak anonim kullanıcı silinmez. Sorun giderildikten sonra aynı
  sign-in güvenle yeniden denenebilir.
- `db:setup` yalnız local/CI bootstrap kolaylığıdır: migration, referans seed, açık
  `db:publish`, `system:local-bootstrap` kimliğiyle batch editorial onay/aktivasyon ve daily
  future buffer fill adımlarını sırayla çalıştırır. Production editorial süreci değildir.
- Dalga 13 daily read path'inden generation/yazımı çıkarmıştır. Worker bugün +
  `DAILY_BUFFER_DAYS_AHEAD` penceresini güncel content QA kanıtı üzerinden ölçer;
  structured JSON log, `GAP` check exit'i ve cron failure exit'i gözlemleme sınırıdır.
- `20260803140000_wave_14_editorial_workflow` migration'ı otomatik QA'dan ayrı review
  durumunu, reviewer metadata'sını, tek planlı revision constraint'ini ve append-only audit
  olaylarını ekler. Mevcut test edilmiş revision'lar kesintisiz geçiş için
  `system:wave-14-backfill` kararıyla onaylanır; yeni revision'lar daima inceleme bekler.
- `20260803180000_wave_15_difficulty_calibration` migration'ı idempotent kalibrasyon
  koşularını ve revision-bazlı aggregate observation snapshot'larını ekler. Migration
  kullanıcı geçmişini dönüştürmez; ilk `difficulty:calibrate` koşusu mevcut attempt
  ledger'ından ölçüm üretir.
- `20260804110000_wave_21_public_projection_pagination` migration'ı yalnız bilinçli public
  başlangıç skorlarını ayrı immutable JSON kolona backfill eder ve user progress keyset
  index'ini ekler. Public puzzle sorguları bu migration sonrasında private solution
  kolonlarını okumaz; deploy sonrası `db:audit-content` çalıştırılır.
- Yayınlanan puzzle `contentVersion`, `generatorVersion`, `rulesVersion`,
  `contentHash` ve `publishedAt` taşır. Veritabanı trigger'ı içerik alanlarının yerinde
  güncellenmesini reddeder; yalnız operasyonel alanlar değiştirilebilir.
- `20260730230000_wave_7_puzzle_domain_validation` migration'ı temel JSON boyutları,
  publication metrikleri, mode metadata ve `isActive => isTested` kurallarını DB
  sınırında da uygular. Dalga 12 itibarıyla `isTested`, yeni veya yeniden doğrulanan
  revision için domain ile sürümlü otomatik content QA'nın ortak kapısıdır; insan
  editorial onayı değildir.
- `20260731090000_wave_8_content_versioning` migration'ı mantıksal `contentKey` ile
  fiziksel revision kimliğini ayırır; revision/supersession/lifecycle zincirini,
  her key/date/order için tek aktif revision'ı ve `(userId, contentKey)` unique
  completion'ı DB sınırında korur. Migration eski revision-1 satırlarını yerinde
  backfill eder; yayınlanmış içerik geçmişini yeniden yazmaz.
- Dalga 8 publisher eski `legacy-unverified` satırlarda yalnız eksik türetilmiş publication
  alanlarını, aynı immutable çekirdek içerik checksum doğrulamasından geçerse bir kez
  tamamlayabilir.
- `20260731170000_wave_12_automated_content_qa` migration'ı sürümlü QA kanıtını ekler ve
  ilk legacy yükseltmeden sonra raporu immutable yapar. Migration sonrası kontrollü
  `npm run db:publish` ile legacy satırlar yeniden doğrulanmalı, ardından
  `npm run db:audit-content` çalıştırılmalıdır. Audit aktif/test edilmiş havuz boşsa,
  kalite kapısı başarısızsa veya QA kanıtı eksik/eskiyse non-zero exit code üretir.
- `20260731171000_wave_12_legacy_qa_upgrade`, `legacy-unverified` satırın ilk tam kanıtı
  sırasında eski sınıf-temelli difficulty/inference tahminini kanonik analyzer sonucuna
  bir kez yükseltmeye izin verir. Aynı transaction gerçek content hash'i yazdığı anda bu
  istisna kapanır; sonraki değişiklikler yine yeni revision gerektirir.

## 6. Referanslar

- Railway Next.js Guide: `https://docs.railway.com/guides/nextjs`
- Railway Healthchecks: `https://docs.railway.com/deployments/healthchecks`
- Railway Config as Code: `https://docs.railway.com/config-as-code/reference`
- Railway Cron Jobs: `https://docs.railway.com/cron-jobs`
- Railway Variables: `https://docs.railway.com/variables`
- Railway PostgreSQL: `https://docs.railway.com/databases/postgresql`
- Next.js standalone output: `https://nextjs.org/docs/app/api-reference/config/next-config-js/output`
