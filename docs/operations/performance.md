# Performans ve bounded load test sözleşmesi

Dalga 21 public/private query ayrımını, Dalga 22 ise tekrar üretilebilir performans
kapılarını tanımlar. Kestirimsel limitler `ops/performance/budgets.json` dosyasında
sürümlenir; production SLO yerine regression guard görevi görür.

## Query sınırları

- Public daily, puzzle ve campaign içerik okumaları `solution`, `allSolutions` ve içerik
  yayın metadata'sını SQL projection'a dahil etmez. Yalnız önceden hesaplanıp ayrı JSON
  kolonda saklanan `initialRevealedMatches` public'tir.
- Engine/hint/submit/analyze ve yayın doğrulaması private projection kullanabilir.
- Campaign katalog sorgusu yalnız katalog alanlarını okur; kullanıcı ilerlemesi ayrıca
  campaign'e filtreli ve en fazla 150 kayıtla bounded okunur.
- `/api/user/progress` varsayılan 20, en fazla 50 kayıt döndürür. `updatedAt DESC, id DESC`
  keyset düzeni opaque `nextCursor` ile sürdürülür. Toplam status sayıları page içinden
  türetilmez; ayrı aggregate sorgusudur.

Migration `(userId, updatedAt DESC, id DESC)` index'ini ve public initial reveal
projection'ını ekler. Migration sonrası aktif içerik audit'i deterministic prefill ile
persist edilen public alanın aynı olduğunu doğrulamalıdır.

## Otomatik bütçeler

Engine guard:

```bash
npm run perf:check
```

Deterministik örnekte warm-up sonrası 100 solver çalışması ölçülür; varsayılan p95 bütçesi
50 ms'dir. İhlal CI'ı durdurur.

Uygulama yük testi:

```bash
npm run perf:load:local
```

Yerel Next server açılır; liveness, daily ve campaign endpoint'leri 15 saniye ve 12
worker ile sınanır. Varsayılan kapılar toplam p95 `<= 1500 ms`, hata oranı `<= %1` ve
throughput `>= 8 rps` değerleridir. Sonuç toplam ve route-bazlı JSON özet üretir.

Var olan bir local hedefe doğrudan:

```bash
LOAD_TEST_BASE_URL=http://127.0.0.1:3007 npm run perf:load
```

Remote hedefler yanlışlıkla trafik yüklenmesini önlemek için varsayılan olarak reddedilir.
Yalnız yazılı kapsam/kapasite onayından sonra `LOAD_TEST_ALLOW_REMOTE=true` verilebilir.
Production'a karşı geniş concurrency veya süre kullanılmaz; test en fazla 600 saniye,
200 worker ve 100.000 saklanan sample ile kod seviyesinde de bounded'dır.

## Sonuç yorumlama

- Önce error rate; sonra route p95 ve trace içinde Prisma/engine süreleri incelenir.
- Cold compile içeren dev-server ilk istekleri warm-up'a alınır, ölçüm sample'ına katılmaz.
- CI sonucu donanımlar arasında mikro-benchmark değildir; eşik aşımı değişikliğin query
  planı, response boyutu ve solver node sayısı açısından incelenmesini zorunlu kılar.
- Yeni route yük setine eklenirken salt-okuma/idempotent olmalı ve test datasını tüketip
  state büyütmemelidir.
- Production SLO ve gerçek trafik yüzdelikleri observability dashboard'unda ayrıca izlenir;
  bu kısa test onların yerine geçmez.
