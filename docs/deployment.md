# Deployment Guide

Bu doküman ScoreLogic uygulamasını:

- lokalde geliştirme modunda çalıştırmak,
- lokalde production benzeri smoke test yapmak,
- Railway üzerinde deploy etmek

için gereken adımları kapsar.

## 1. Gerekli Environment Variables

Zorunlu:

- `DATABASE_URL`: PostgreSQL bağlantı dizesi.
- `AUTH_SECRET`: uzun ve rastgele bir secret.

Eklemeyin:

- `NODE_ENV`: Railway veya Next.js build/runtime bunu kendisi yönetmelidir. `staging`, `preview` gibi özel değerler Next.js build/prerender davranışını bozabilir.

Opsiyonel ama önerilen:

- `AUTH_URL`: uygulamanın dış URL'i.
- `AUTH_TRUST_HOST=true`: self-hosted ortamlarda host header güveni için.
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY`
- `AUTH_RESEND_FROM`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Not:

- Redis entegrasyonu şu anda Upstash REST tabanlıdır.
- Redis değişkenleri verilmezse uygulama çalışmaya devam eder; rate limiting memory fallback ile çalışır ve health endpoint Redis durumunu `disabled` döner.

## 2. Lokal Geliştirme Akışı

### 2.1 Önkoşullar

- Node.js 20+
- npm 10+
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
- veritabanını oluşturur,
- `db:setup` ile migration ve seed akışını çalıştırır,
- Next.js dev server'ı arka planda başlatır.

### 2.3 Uygulamayı çalıştır

- Tek komut açılış: `npm run local:up`
- Durdurma: `npm run local:down`
- Durum kontrolü: `npm run local:status`
- Manuel geliştirme: `npm run dev:local`
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
- pre-deploy command: `npm run db:deploy`
- start command: `npm run start:standalone`
- healthcheck path: `/api/healthz`

### 3.1 Railway üzerinde proje oluştur

1. Railway dashboard'da yeni bir project oluştur.
2. GitHub repository'yi bağla.
3. Web service olarak bu repo'yu seç.

### 3.2 PostgreSQL ekle

1. Aynı Railway project içine bir PostgreSQL service ekle.
2. Web service içindeki `DATABASE_URL` değişkenini PostgreSQL servisindeki `DATABASE_URL` referansına bağla.

Railway dökümantasyonuna göre PostgreSQL servisi `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` ve `DATABASE_URL` gibi değişkenleri sağlar; çoğu kütüphane doğrudan `DATABASE_URL` kullanır. Kaynak: Railway PostgreSQL docs.

### 3.3 Uygulama environment variables

Web service için en az şu değişkenleri ekle:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `AUTH_SECRET=<strong-random-secret>`
- `AUTH_TRUST_HOST=true`

`NODE_ENV` değişkenini Railway Variables içine ekleme. Repository'deki [railway.toml](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/railway.toml) build/start komutları production değerini açıkça set eder.

Custom domain veya Railway public domain kesinleştikten sonra eklenmesi önerilen:

- `AUTH_URL=https://<your-domain>`

Opsiyonel:

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY`
- `AUTH_RESEND_FROM`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Not:

- Eğer Upstash kullanmayacaksan Redis değişkenlerini boş bırak.
- Bu durumda uygulama işlevsel kalır, ancak rate limit state'i instance-local olur.

### 3.4 Domain ve healthcheck

1. Railway service settings içinden public domain üret.
2. Domain hazır olduktan sonra `AUTH_URL` değerini bu domain ile güncelle.
3. Deploy healthcheck endpoint'i olarak `/api/healthz` kullanılır.

Railway healthcheck mantığına göre yeni deployment ancak endpoint HTTP `200` döndürdüğünde aktif olur. Ayrıca Railway uygulamanın `PORT` değişkenini dinlemesini bekler. Kaynak: Railway Healthchecks docs.

`/api/healthz` yalnızca process'in ayakta olup olmadığını kontrol eden liveness endpoint'idir ve database sorgusu çalıştırmaz. Database/Redis durumunu görmek için detaylı readiness endpoint'i olan `/api/health` kullanılmalıdır.

### 3.5 İlk deploy sonrası doğrulama

Deploy tamamlandıktan sonra:

1. `/api/healthz` endpoint'ini aç ve HTTP `200` döndüğünü doğrula.
2. `/api/health` endpoint'ini aç ve database durumunun `up` olduğunu doğrula.
3. `/daily` ve `/stats` sayfalarını kontrol et.
4. anonim kullanıcı ilerlemesi kaydı alınıyor mu doğrula.
5. giriş akışını test et.
6. dashboard ve API loglarını Railway Metrics/Logs üzerinden kontrol et.

## 4. Production Checklist

- `AUTH_SECRET` güçlü ve benzersiz.
- `DATABASE_URL` production veritabanını gösteriyor.
- `AUTH_URL` gerçek public domain ile set edilmiş.
- `/api/healthz` 200 dönüyor.
- `npm run build` localde temiz geçiyor.
- lint ve unit testler temiz.
- OAuth callback URL'leri production domain ile eşleşiyor.
- Resend kullanılıyorsa sender domain doğrulanmış.
- Upstash kullanılıyorsa Redis secret'ları production ortamına eklenmiş.

## 5. Operasyonel Notlar

- Railway config as code yalnızca deploy anındaki ayarları override eder; dashboard ayarlarını kalıcı olarak değiştirmez. Bu yüzden `railway.toml` repository içinde canonical deploy manifest olarak tutulmalıdır.
- Next.js standalone output etkin olduğu için Railway start command doğrudan minimal standalone server'ı başlatır.
- Prisma baseline migration repo içinde tutuluyor ve deploy sırasında `prisma migrate deploy` çalıştırılıyor.

## 6. Referanslar

- Railway Next.js Guide: `https://docs.railway.com/guides/nextjs`
- Railway Healthchecks: `https://docs.railway.com/deployments/healthchecks`
- Railway Config as Code: `https://docs.railway.com/config-as-code/reference`
- Railway Variables: `https://docs.railway.com/variables`
- Railway PostgreSQL: `https://docs.railway.com/databases/postgresql`
- Next.js standalone output: `https://nextjs.org/docs/app/api-reference/config/next-config-js/output`
