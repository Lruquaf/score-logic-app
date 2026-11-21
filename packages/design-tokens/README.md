# Public mobil tasarım tokenları

`index.mjs` yalnız public, platformdan bağımsız değerler içerir; web/backend veya
DOM bağımlılığı yoktur. Bu aşamada npm workspace ya da Expo bağımlılığı eklenmedi.
Mobil UX prototipi bu dosyayı yerel preview server'ın açık allowlist'iyle tüketir.

- Renkler mevcut açık temadan türetilir; `muted` ve kontrol border'ı okunabilirlik
  için koyulaştırılmıştır. Native gerçek cihaz kontrast kabulü ayrıca yapılır.
- Boyut ve spacing sayıları mantıksal birimlerdir. Native adaptör dp/pt; tarayıcı
  adaptörü hit area için px, tipografi için ölçeklenen rem üretir.
- `size.touch = 48`, iki platform için ortak proje hedefidir.
- Font dosyası dağıtılmaz. Prototip body için sistem sans, başlık için sistem serif,
  süre/sayı için tabular/monospace fallback kullanır. Native adaptör sistem font
  ölçeklemesini kapatamaz.
- Motion değerleri isteğe bağlıdır; Reduce Motion altında hareket zorlanmaz.

Tokenların burada bulunması native ekranların uygulanmış olduğunu göstermez.
Paketleme/export ve sürüm uyumu Faz 2'de Expo monorepo kararıyla sabitlenir.
