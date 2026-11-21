# ScoreLogic mobil UX prototipi — Faz 1

> Tarihsel Phase 1 HTML prototipi. Güncel native tasarım incelemesi için proje
> kökünde `npm run design:studio` çalıştırıp http://localhost:8082 adresini aç.
> [Yeşil skor defteri tasarım sistemi](../../docs/mobile/ui-ux-tasarim-sistemi-2026-11-20.md)
> gerçek React Native bileşenleriyle aktif çalışma akışıdır.

Bu, mobil dönüşüm planındaki **Faz 1: mobil UX ve tasarım sistemi** çıktısıdır.
Expo/React Native uygulaması ve imzalı cihaz build'i Faz 2'de başlar. Prototip ayrı
bir tarayıcı uygulamasıdır; mevcut Next.js route'larına eklenmez.

Repo kökünde:

```sh
npm run mobile:prototype
```

[Yerel önizlemeyi aç](http://127.0.0.1:4173). HTML dosyasını doğrudan `file://`
ile açmayın; ES module ve token dosyaları yerel sunucudan yüklenir. Gerekirse portu
`MOBILE_PREVIEW_PORT=4174 npm run mobile:prototype` ile değiştirebilirsiniz.
Sunucu yalnız bu makinenin loopback adresini ve izin verilen prototip dosyalarını
sunar; repo kökünü veya `.env` dosyalarını sunmaz.

## İncelenecek akışlar

- Home → Daily; Campaign → beş pack → 30 level → açık puzzle; dört görünür tab.
- Final Table ve 12 skor; sıfır/boş ayrımı, 10–19, readonly given/hint değerleri.
- Maç notu, 180 karakter, kaydetme ve kaydedilmemiş değişikliği koruma/iptal.
- Hint açıklaması → ayrı **Use 1 hint** → tek pending → başarıda kapanış ve tek mesaj.
- Check geri bildirimi, Reveal ve Reset için farklı onaylar; sonuç ve davet önizlemesi.
- Stats, Login/Register, Account, Help; oyuna geri dönüş ve tablar arasında taslak koruma.
- Yükleniyor, içerik yok, hata/yeniden dene ve offline görünümü.

**Preview settings** içinden A/B tablo düzeni, sayısal alan/özel pad, %100–200
metin boyutu, bağlantı/içerik durumu ve örnek Check sonucu seçilebilir. Bunlar
tasarım inceleme kontrolleridir; nihai ürün ayarları değildir. Geniş ve yeterince
yüksek pencerede iki panel, dar/yatay pencerede tek panel kullanılır; büyütülmüş
metinde tek panel korunur.

## Örnek veri sınırı

Üstteki “UX preview · Sample data” ibaresi her zaman görünürdür. Fixture, ilerleme,
istatistik, tarih ve yanıtlar tasarım örneğidir. Check gerçek skor doğrulamaz;
seçilen scripted yanıtı gösterir. Hint tek örnek hücreyi değiştirir; gerçek solver
ve faydalı hint seçimi backend'in görevidir. Reveal yalnız terminal durumun UX'ini
gösterir; gerçek cevap payload'ı içermez. Davetin `.example` adresi gerçek link
değildir; paylaşım gönderilmez.

Auth formları sunucuya veri göndermez, demo parolaları saklamaz. Veri yalnız açık
sayfanın belleğindedir; reload veya sunucuyu yeniden açma kalıcılık kanıtı değildir.
Gerçek guest/account silme, session, SQLite/outbox, günlük devir, >120 dakika resmi
süre, native keyboard/share/deep link, OS kill ve ekran okuyucu kabulü burada
uygulanmış sayılmaz. Üretim private DTO/solver/Prisma/secret import edilmez.

## Dosyalar ve doğrulama

- `app.mjs`: ekranlar, sheet/odak ve etkileşimler.
- `model.mjs`: ayrı tasarım fixture'ı ve bellekteki UI taslakları.
- `prototype.css`: uyarlanabilir layout ve durumlar.
- [Public tokenlar](../../packages/design-tokens/index.mjs): platformdan bağımsız
  renk, ölçek, radius, hit alanı ve motion değerleri; yeni bağımlılık yok.
- [UX spesifikasyonu](../../docs/mobile/faz-1-ux-spesifikasyonu.md) ve
  [karar kaydı](../../docs/mobile/karar-kaydi.md).

```sh
npm run test:mobile:prototype
```

Ayrı Playwright config, yalnız prototip sunucusunu açar; DB/Next/seed gerekmez.
Chromium ve WebKit browser binary'leri yerelde bulunmalıdır. Bu tarayıcı testleri
native iOS/Android kabulünün yerine geçmez. İnsanlarla 5–8 kişilik görev denemesi
spesifikasyonda hazırlanmıştır; henüz yapılmış değildir.
