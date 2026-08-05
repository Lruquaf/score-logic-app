# ScoreLogic incident response

Bu runbook Dalga 19 dashboard ve alarm sözleşmesinin operasyon karşılığıdır. Alert sağlayıcısındaki isimler `ops/observability/alerts.json` ile bire bir tutulur. İlk hedef kullanıcı etkisini durdurmak, ikinci hedef servisi geri getirmek, kök neden analizi ise olay sonrasında yapmaktır.

## Ortak akış

1. Alarmı sahiplen; başlangıç zamanını, release değerini ve etkilenen route'u kaydet.
2. `/api/health` ve yetkili `/api/internal/synthetic` sonucunu karşılaştır.
3. Son deploy, migration, Redis/DB sağlayıcı durumu ve `x-request-id` → OTel trace → Sentry issue zincirini kontrol et.
4. Yeni release ile korelasyon varsa son sağlıklı release'e rollback yap. Veri migration'ını otomatik geri alma; önce uyumluluğunu doğrula.
5. Servis iki alarm penceresi boyunca sağlıklı kalınca olayı kapat ve 48 saat içinde postmortem aç.

## synthetic-core-down

- `/api/health`, `/api/puzzles/daily` ve `/api/internal/synthetic` kontrollerinden hangisinin düştüğünü ayır.
- Daily yoksa `npm run db:daily-buffer` dry-run/normal işini ve yayın durumunu kontrol et.
- Domain/engine düşmüşse ilgili puzzle'ı pasifleştir, bilinen iyi revision'ı editorial rollback akışıyla aktive et.

## api-error-budget-burn

- En yüksek hata oranına sahip `http.route`, Sentry issue ve release'i bul.
- DB/Redis genel olarak sağlıklıysa route'a özel son değişikliği rollback et; değilse bağımlılık runbook'una geç.

## redis-unavailable

- Upstash durumunu, secret/URL değişikliğini ve ağ erişimini kontrol et.
- Limiter production'da bilinçli olarak fail-closed çalışır; Redis düzelmeden memory fallback açma.

## daily-buffer-gap

- Istanbul business date ve gelecek 14 günlük pencereyi `npm run db:daily-buffer -- --check` ile doğrula.
- QA/editorial gate'i geçemeyen içeriği zorla yayınlama; onaylı revision üret veya bilinen iyi revision'a dön.

## route-latency-high

- Trace içindeki route → Prisma → engine sürelerini ayır; p95 ile tekil outlier'ı karıştırma.
- Yavaş DB sorgusunda plan/index incelemesi, solver'da budget/UNKNOWN oranı, dış çağrıda timeout ve sağlayıcı durumunu kontrol et.

## solver-unknown-high

- `profile`, `operation`, `terminationReason`, `nodesVisited` ve release kırılımını incele.
- UNKNOWN sonucunu UNSAT veya yanlış cevap olarak yeniden sınıflandırma. İçerik türünü karantinaya al veya güvenli budget ayarıyla yeniden yayınla.

## content-quality-failed

- QA kodu, editorial durum ve calibration snapshot'ını ayır.
- Aktif kritik revision varsa pasifleştirip son iyi revision'ı aktive et; örneklem eşiğini geçmeyen calibration verisini otomatik yayın kararı olarak kullanma.

## Gizlilik ve saklama

- Log/trace: 30 gün; Sentry issue/event: 90 gün; ürün analitiği ham olay: 90 gün, aggregate rapor: 13 ay.
- Ham kullanıcı kimliği, e-posta, cookie/token, skor girdileri, çözüm, not ve stack içeren istemci payload'ı ürün analitiğine taşınmaz.
- Erişim on-call ve ilgili sistem sahibiyle sınırlıdır. Silme/export taleplerinde sağlayıcı tarafındaki hash'li actor kaydı da politika kapsamında ele alınır.
