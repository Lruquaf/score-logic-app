# PostgreSQL backup, restore ve tatbikat runbook'u

Bu runbook Dalga 20'nin kanonik operasyon sözleşmesidir. Hedefler en fazla 24 saatlik
veri kaybı (`RPO <= 24 saat`) ve olay ilanından sonra en fazla 30 dakikada doğrulanmış
geri dönüş (`RTO <= 30 dakika`) olarak belirlenmiştir.

## Koruma katmanları

Tek bir yedek katmanı yeterli kabul edilmez:

1. PostgreSQL sağlayıcısının point-in-time/provider backup özelliği açılır.
2. `/railway.database-backup.toml` ile her gün `23:15 UTC` şifreli logical dump üretilir.
3. `.dump.enc` ve eş manifest birlikte, veritabanından ve Railway project'inden bağımsız
   S3-compatible versioned object storage'a yüklenir. Railway volume tek başına off-site
   yedek değildir; production cron off-site yükleme başarısızsa non-zero kapanır.
4. Günlük yedekler en az 30 gün, aylık doğrulanmış yedekler 12 ay saklanır. Lifecycle
   temizliği ancak off-site kopya ve checksum doğrulandıktan sonra yapılır.

`BACKUP_ENCRYPTION_KEY` 32 random byte'ın 64 karakter hex veya base64 karşılığıdır.
Veritabanı credential'ından ayrı secret manager'da tutulur ve en az iki yetkili kurtarma
sorumlusunun erişebileceği biçimde escrow edilir. Anahtar, manifest veya log içine yazılmaz.

## Railway backup service

Aynı repository'den ayrı bir cron service oluşturup config path olarak
`/railway.database-backup.toml` seç:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `BACKUP_ENCRYPTION_KEY=<production-secret>`
- `BACKUP_DIRECTORY=/data/backups`
- `RAILPACK_CONFIG_FILE=railpack.database-backup.json`
- `AWS_ACCESS_KEY_ID=<off-site-access-key>`
- `AWS_SECRET_ACCESS_KEY=<off-site-secret-key>`
- `AWS_S3_BUCKET_NAME=<off-site-bucket>`
- `AWS_DEFAULT_REGION=<region-or-auto>`
- `AWS_ENDPOINT_URL=<https-s3-compatible-endpoint>` (AWS S3'te opsiyonel)
- `AWS_S3_URL_STYLE=virtual`
- `BACKUP_S3_PREFIX=scorelogic/database-backups`

Service'e `/data` mount noktasında persistent volume bağla. Her başarılı cron'dan sonra
encrypted dump ve manifest çifti uygulama tarafından S3-compatible hedefe yüklenir.
`database_backup_completed` olayı içindeki `offsite` anahtarları, cron exit code'u, dosya
boyutu ve son başarılı backup yaşı alarm/dashboards'a bağlanmalıdır. Bir günlük planlı
koşu kaçırılırsa RPO alarmı açılır.

Manuel yedek:

```bash
BACKUP_ENCRYPTION_KEY=<secret> BACKUP_DIRECTORY=.backups npm run ops:backup
```

İşlem PostgreSQL custom-format dump'ı geçici alana yazar, AES-256-GCM ile stream ederek
şifreler ve encrypted payload için SHA-256, byte boyutu, kaynak DB, zaman ve `pg_dump`
sürümünü içeren `0600` manifest üretir. Geçici açık dump başarıda ve hatada silinir.

## Geri yükleme

Geri yükleme hiçbir zaman mevcut production database adına çalıştırılmaz. CLI yalnız adı
`_restore` veya `_test` ile biten izole hedefleri kabul eder; yine de hedefin doğru cluster
ve boş/geçici database olduğu iki kişi tarafından doğrulanır.

1. Olay zamanından önceki en yeni başarılı manifest/dump çiftini seç.
2. Off-site kaynaktan ikisini aynı yerel dizine al.
3. Kullanılacak anahtarın seçilen backup kuşağıyla eşleştiğini doğrula.
4. İzole database oluştur.
5. Aşağıdaki komutu çalıştır:

```bash
BACKUP_ENCRYPTION_KEY=<secret> npm run ops:restore -- \
  --manifest /secure/scorelogic-2026-08-04.manifest.json \
  --target-url postgresql://user:password@host:5432/scorelogic_restore
```

Restore başlamadan encrypted dosyanın boyutu ve SHA-256 değeri manifestle karşılaştırılır,
sonra GCM authentication doğrulanır. `pg_restore` herhangi bir SQL hatasında durur. Son
kontrol; tamamlanmış migration sayısının ve aktif/testli puzzle sayısının pozitif, orphan
progress ve birden fazla aktif content revision sayısının sıfır olmasını zorunlu kılar.

Doğrulama geçmeden production trafiği hedefe yönlendirilmez. Uygulama smoke/synthetic,
login, daily read ve örnek progress okuması ayrıca çalıştırılır. Switch sonrası eski DB
salt-okuma tutulur; olay kapanmadan silinmez.

## Ölçümlü restore tatbikatı

En az ayda bir ve schema/backup altyapısı değiştiğinde çalıştır:

```bash
BACKUP_ENCRYPTION_KEY=<secret> \
BACKUP_DIRECTORY=.backups/drills \
BACKUP_MAX_RPO_HOURS=24 \
RESTORE_MAX_RTO_MINUTES=30 \
npm run ops:restore-drill
```

Tatbikat kaynak DB'nin yeni encrypted backup'ını üretir, random `_restore_<suffix>` DB
oluşturur, restore ve invariant doğrulamasını yapar, RPO/RTO'yu structured JSON olarak
raporlar ve geçici DB'yi `finally` bloğunda kaldırır. Eşik aşımı exit `2`, operasyon hatası
exit `1` üretir. Sonuç; tarih, backup kimliği, restore süresi, veri kontrolleri, sorumlu ve
takip aksiyonuyla değişmez operasyon kaydına eklenir.

Gerçek olayda `dropdb`, eski production verisini silme, DNS/service switch ve anahtar
rotasyonu ayrıca olay komutanı onayı gerektirir; bu runbook bunları otomatikleştirmez.
