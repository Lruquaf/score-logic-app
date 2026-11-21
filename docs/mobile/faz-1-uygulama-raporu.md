# Faz 1 — Mobil UX uygulama ve doğrulama raporu

Tarih: 12 Kasım 2026

**Durum: Faz 1'in teknik prototip, tasarım sistemi ve dokümantasyon çıktıları hazır.
Fazın insan katılımcılı kullanılabilirlik kabulü henüz kapanmadı.** Bu rapor bir
native uygulama veya mağaza yayını tamamlanma iddiası değildir.

## 1. Seçilen kararlar

Kullanıcının “önerilenleri uygula” yönlendirmesi [karar kaydına](karar-kaydi.md)
işlendi. Expo + React Native ayrı istemci; mevcut web/backend korunur. iOS/iPadOS
ve Android telefon/tablet/foldable hedeflenir. Dört tab, İngilizce açık tema,
public tokenlar, server-authoritative oyun, cache/draft ile sınırlı offline ve
sürümlü API yaklaşımı seçildi. Hesap silme mobil teslim gereğidir; push, sosyal
login, ödeme ve tam offline solver eklenmedi.

A inline tablo ilk aday; B tablo sheet'i karşılaştırma adayıdır. Sayısal sistem
klavyesi başlangıç tercihidir; custom pad incelenebilir. SDK/minimum OS, fiziksel
cihaz, signing ve gerçek mağaza/domain sahipliği kanıt gerektiren sonraki kapılardır.

## 2. Çalışan çıktı

```sh
npm run mobile:prototype
```

[Yerel önizleme](http://127.0.0.1:4173) — [kullanım yönergesi](../../prototypes/mobile/README.md).
İnceleme seçenekleri üstteki **Preview settings** içindedir.

| Çıktı | Uygulanan davranış |
|---|---|
| AppShell | Görünür Home/Campaign/Daily/Stats; Account/Help ve geri dönüş; sekmeler arasında puzzle taslağı korunur |
| Oyun A/B | Değişmez tablo, fixture odaklı alternatif sheet; yeterli genişlik/yükseklikte iki panel, büyük font/dar landscape tek panel |
| Skor | Altı maç/on iki alan; 0–19, blank/0 ayrımı, 10–19 sırasında seçim korunması, given/hint readonly |
| Not | 180 karakter, sayaç, kaydetme, değişiklik varsa discard/keep kararı |
| Hint | Ücretsiz aç/kapat; ayrı Use 1 hint; hızlı çift eylemde tek değişiklik/sayaç; pending yeniden açılmaz; başarıda kapanır; no-change ücretsiz |
| Yardımcı eylemler | Check feedback, ayrı Reveal/Reset onayı; bekleyen Hint ile çakışan eylemler kilitli; Analyze snapshot girişte eskir |
| Campaign | Beş pack, her pack'te otuz level; örnek açık/solved/locked durumlar, kilit açıklaması, komşu seviye kontrolleri |
| Diğer ekranlar | Mevcut stats metrikleri/son altı kayıt için örnek sunum; auth form/guest yolu; Help; privacy/support/deletion tasarımı |
| Sonuç | Scripted sonuç sheet'i ve kimlik/süre/hint/grid/meydan okuma içeren davet metni önizlemesi |
| Durumlar | Online/offline, loading, load error, no content ve retry taslağı korur |
| Erişilebilirlik | 48px bileşen hedefi, görünür focus, modal focus kapsamı/dönüşü, custom pad değer etiketi, immutable tablo semantiği, reduced motion, %100–200 metin |

[Public tokenlar](../../packages/design-tokens/index.mjs) DOM/server bağımlılığı
olmadan ayrıldı. Expo bağımlılığı/workspace ve yeni bir paket kurulmadı. Prototip
Next route'larına bağlanmaz; kendi allowlist'li loopback sunucusuyla çalışır.

## 3. Görsel inceleme

Görüntüler browser prototipinden alınmıştır; native/store screenshot'ı değildir.

| Telefon | Oyun ve destek |
|---|---|
| [Home](previews/home-phone.png) | [Hint onayı](previews/hint-phone.png) |
| [A — inline tablo](previews/daily-phone-a.png) | [B — fixture odaklı](previews/daily-phone-b.png) |
| [Tablet — iki panel](previews/daily-tablet.png) | %200 metin ve narrow-landscape geometri otomasyonu mevcut |

Görsel incelemede A'nın tabloyu sürekli gösterme avantajı ve daha çok scroll
istemesi; B'nin fixture'ı ilk görünümde öne çıkarması ve tablo için ek dokunuş
istemesi görülüyor. Bu gözlem hedef kullanıcı ölçümü değildir; A/B kararını
kanıtsız “kullanıcı tercihi” diye kapatmaz.

## 4. Çalıştırılan kontroller

| Kontrol | Sonuç | Kapsam / sınır |
|---|---|---|
| `npm run test:mobile:prototype` | **28 / 28 geçti** | 14 senaryo × Chromium/WebKit; gerçek native değil |
| `npm run test:unit` | **315 / 315 geçti**, 63 dosya | Mevcut web/domain regresyon baseline'ı |
| `npm run lint` | Geçti | Mevcut ve eklenen kaynaklar |
| `npm run type-check` | Geçti | Next route typegen + TypeScript |
| `AUTH_URL=https://score-logic-app-test.up.railway.app npm run build` | Geçti | Production derlemesi ve standalone asset hazırlığı; deployment değil |

İlk yalın build komutu yerel HTTP `AUTH_URL` nedeniyle production env guard'ına
takıldı. Doğrulama yalnız komuta verilen mevcut test ortamının HTTPS URL'siyle
tekrarlandı; `.env` dosyaları değiştirilmedi. CI production-build adımında da
HTTPS test origin'i açıkça tanımlandı; browser E2E yerel HTTP origin'ini korur.

Tarayıcı senaryoları şunları kapsar:

- Aç/kapatmanın hint tüketmemesi, hızlı iki tıklamada tek hint, boş hücre ve dolu
  çelişkili hücre örnekleri, no-change, pending sırasında yeniden açma/Reveal/Reset
  koruması, başarı sonrası focus ve otomatik yeniden açılmama.
- 0/9/10/19/blank, aralık sınırı, immutable tablo, input yöntemleri arasında draft,
  not ve sekme geçişi; özel pad silme/clear/next/harici tuşlar.
- Not discard/keep, Help/Account geri dönüşü, campaign tab stack'i, pack/lock,
  Analyze snapshot, farklı destructive onaylar, davet içeriği, offline/retry.
- Modal Tab/Escape/focus dönüşü, formların credential göndermemesi/saklamaması;
  **320×568, 390×844, 768×1024, 1024×768, 844×390**, %200 metin ve reduced motion.

CI'ya DB gerektirmeyen `mobile-ux` job'ı ve hata trace artifact'i eklendi. Mevcut
web E2E browser kurulumuna WebKit eklendi. **GitHub CI çalıştırılmadı**; push sonrası
uzak job sonucu ayrıca kaydedilmeli. Bu teslimde mevcut web integration/E2E,
production readiness ve backup kontrolleri tekrar koşulmadı.

## 5. Tamamlanmamış kabul kapıları

1. **Faz 1 insan denemesi:** [UX spesifikasyonundaki](faz-1-ux-spesifikasyonu.md)
   5–8 katılımcılı görevler ve boş ölçüm formu hazır; gerçek katılımcı testi yapılmadı.
   Nihai A/B ve keyboard tercihi için görev süresi, hata, hint CTA keşfi ve tabloya
   erişim ölçülmeli. Otomasyon kullanıcı denemesinin yerine yazılmadı.
2. **Native kabul:** Browser keyboard, CSS safe-area ve emüle viewport; iOS/Android
   klavye, VoiceOver/TalkBack, foldable hinge, AppState/process kill, SecureStore,
   SQLite, gerçek link/share davranışını kanıtlamaz. Bunlar Faz 2 ve sonraki fazlarda.
3. **Servisler:** Auth/merge/silme, canonical Check/Hint/Reveal, offline outbox ve
   gün devri/resmi süre prototipte implemente edilmedi. Örnek tarih sabittir;
   sonuçlar scripted, persistence yalnız açık sayfanın belleğidir. Reveal gerçek
   cevabı getirmez. `.example` daveti gönderilmez.
4. **Dış erişimler:** Store/signing/domain, minimum OS/toolchain ve fiziksel cihaz
   matrisi doğrulanmalı; bilinmeyen sahiplik veya üretim domain'i uydurulmadı.

Canlı web, Railway deployment'ı ve DB şeması bu teslimde değiştirilmedi. Faz 2'ye
girdi olarak UX prototipi, tokenlar, ekran/state sözleşmesi, karar kaydı ve otomasyon
hazırdır; iki platform signed PoC ayrı iş olarak izlenir.
