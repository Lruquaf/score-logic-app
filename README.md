# ScoreLogic Web

ScoreLogic, günlük futbol skor/puan durumu mantık bulmacaları için geliştirilen Next.js uygulamasıdır.

## Quickstart

1. `npm ci`
2. `.env.example` dosyasını `.env` olarak kopyala ve değişkenleri doldur.
3. Aynı içeriği gerekiyorsa `.env.local` içine de kopyala.
4. `npm run local:up`
5. `http://127.0.0.1:3007` adresini aç.

## Local Commands

- `npm run local:up`
- `npm run local:down`
- `npm run local:status`

## Useful Commands

- `npm run dev:local`
- `npm run build`
- `npm run start:local`
- `npm run start:standalone`
- `npm run test:unit`
- `npm run test:integration:local`
- `npm run test:e2e`
- `npm run db:publish`
- `npm run db:editorial -- --content-key <key> --revision <n> --approve --actor <identity>`
- `npm run db:audit-content`
- `npm run db:daily-buffer`
- `npm run db:daily-buffer -- --check`
- `npm run difficulty:calibrate`
- `npm run stats:reconcile`
- `npm run stats:reconcile -- --repair`
- `npm run ops:backup`
- `npm run ops:restore-drill`
- `npm run perf:check`
- `npm run perf:load:local`

`local:up`, ana geliştirme veritabanının yanında sonu `_test` ile biten izole test
veritabanını da oluşturur ve migration'ları uygular. Entegrasyon testleri güvenlik
gereği başka adlı bir veritabanında çalışmayı reddeder.

`db:publish`, puzzle üretimini deploy ve referans seed akışından ayıran kontrollü içerik
staging komutudur. Var olan yayınlanmış içeriği yerinde değiştirmez; JSON/domain,
round-robin, standings, solve-any çözüm kümesi, metadata, difficulty, prefill ve otomatik
content QA doğrulamalarından geçmeyen içeriği veritabanına yazmaz. Başarılı yeni revision
`PENDING_REVIEW` ve pasif doğar. `db:editorial` insan onayı, değişiklik talebi/red,
planlama, aktivasyon ve rollback'i aktörlü append-only audit iziyle yönetir.
`db:audit-content`, aktif/test edilmiş havuzu yeniden değerlendirir; eksik/eski QA
kanıtında veya kalite ihlalinde non-zero exit code üretir.

`db:daily-buffer`, varsayılan olarak İstanbul business date'inden başlayıp bugün dahil
15 günlük (`DAILY_BUFFER_DAYS_AHEAD=14`) QA-onaylı daily içerik penceresini idempotent
biçimde doldurur. Yeni günler editorial incelemeye staged edilir; onaylı gelecek günler
zamanlandığında pencere hazır sayılır. `--check`, `GAP` veya `REVIEW_REQUIRED` durumunda
exit code `2` döndüren salt-okuma denetimidir. API eksik kaydı istek sırasında üretmez.

Zorluk modeli matematiksel tablo skorunu, sunum/yardım etkisini ve kullanıcıya gösterilen
efektif zorluğu ayrı tutar. Publisher campaign içeriğini hem tablo hem efektif banda göre
doğrular; arayüz ve istatistikler efektif sınıfı kullanır. `difficulty:calibrate`, kapalı
90 günlük standart-attempt kohortunda completion, reveal, abandon/stale, hint, submit ve
çözüm süresi sinyallerinden revision bazlı observed difficulty snapshot'ı üretir. En az
30 farklı kullanıcı ve yeterli terminal coverage olmadan sonuç yalnız bilgi amaçlıdır;
published difficulty otomatik değiştirilmez.

`stats:reconcile` varsayılan olarak tüm kullanıcı aggregate'lerini canonical
attempt/completion kayıtlarıyla karşılaştıran dry-run'dır. Değişiklik yapmak için
`--repair`; tek kullanıcı için `--user <id>` açıkça verilmelidir.

Minimum production web deploy için yalnız `DATABASE_URL`, güçlü `AUTH_SECRET`, HTTPS
`AUTH_URL` ve `AUTH_TRUST_HOST=true` gerekir. Redis yoksa instance bazlı memory rate
limiter kullanılır; Sentry, OTel, PostHog, synthetic ve backup servisleri opsiyoneldir.
Railway için `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` ayarlanmalıdır. Migration'lar deploy'da
uygulanır; oynanabilir puzzle içeriği ayrıca yayınlanıp onaylanmalıdır.
Ayrıntılar ve minimum env örneği `docs/deployment.md` içindedir.

Production gözlemlenebilirliği request-id ile korele OTel request/Prisma trace'leri,
PII-kapalı Sentry error capture ve yalnız allowlist olayları taşıyan server-proxy ürün
analitiğinden oluşur. `ops:validate` dashboard/alarm sözleşmesini doğrular; ayrı synthetic
cron readiness + daily + domain/engine zincirini beş dakikada bir salt-okuma kontrol eder.

Public puzzle okumaları private çözüm kolonlarını çekmez; kullanıcı geçmişi cursor ile
bounded sayfalanır. Şifreli PostgreSQL yedek/restore tatbikatı ve yük testi komutlarının
güvenlik sınırları `docs/operations/backup-restore.md` ve
`docs/operations/performance.md` içinde tanımlıdır.

## Deployment

Lokal geliştirme, production smoke test ve Railway deployment akışı için `docs/deployment.md` dosyasına bak.

## Product Rules

Çözüm doğrulama, campaign erişimi, replay/reveal ve istatistik davranışlarının kanonik
tanımı için `docs/product-rules.md` dosyasına bak.

## Design System

Arayüz standardı ve yeniden tasarım kararları için `docs/design-system.md` dosyasına bak.
