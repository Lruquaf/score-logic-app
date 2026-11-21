# Faz 5 — Çekirdek oyun paritesi

> 14 Kasım 2026. Kod ve aşağıdaki yerel testler tamamlandı. iOS/Android imzalı build ve fiziksel cihaz kabulü açık kalır.

Kapsam [ana planın Faz 5 maddeleridir](../mobil-uygulama-donusum-plani-2026-11-12.md). Faz 4'ün veri/navigation temeli üzerinde oyun bileşenleri, server feedback, Analyze Board ve attempt ayrımları tamamlandı.

## Uygulanan değişiklikler

- Final Table, FixtureRow, ScoreInput ve MatchNoteSheet ayrı native bileşenlere taşındı. Skor 0–19 tam sayı veya boş olabilir; sıfır boşla aynı değildir. Given, Hint ve Reveal skorları sabittir. Bilinmeyen match id'si controller'da reddedilir.
- Numeric input için görünür Next score / Done eylemleri, platform klavye kapatma, büyüyen fonta göre skor kutusu ve sarmalanan fixture/action satırları eklendi. Final Table yatay kayar ve bütün metrikleri screen reader etiketiyle okur. İki panel yalnız yeterli genişlik/yükseklik ve uygun font ölçeğinde kullanılır.
- Maç notu 180 karakter sınırı ve açık Save eylemini korur. Match notunu düzenlemek mevcut home/away notlarını artık boşaltmaz. Kaydedilen not board'da görünür; skor değerlerini değiştirmez.
- Check, web gibi eksik board üzerinde de sunucuya gidebilir. Sunucunun verdiği feedback modu uygulanır; matematiksel doğruluk yazarken veya client solver ile hesaplanmaz. Skor düzenlenince önceki Check işaretleri temizlenir.
- Beginner/Easy hücre, Medium maç, Hard sayı, Expert yalnız doğruluk feedback'i gösterir. Daily constraint ihlalleri varsa ilgili takım/sunucu mesajları gösterilir. UI yanlış moda ait ek alanlardan daha ayrıntılı ipucu üretmez.
- Analyze Board, Beginner 1–3'te GUIDED, 4–15'te ASSISTED modunda kullanılabilir. Diğer pack/seviyelerde sunulmaz. Bu public politika [contracts paketinde](../../packages/contracts/src/policy.ts) paylaşılır ve backend kontrolünde de kullanılır; yetki yine sunucudadır. Paket sürümü 1.1.0, wire API sürümü 1 olarak kaldı.
- Analiz yalnız gönderilen input snapshot'ına bağlıdır. SAT/UNSAT/UNKNOWN ayrı açıklanır; UNKNOWN yanlış olarak işaretlenmez. Analiz Hint tüketmez, revision artırmaz, outbox veya canonical draft yaratmaz. Edit/refetch sonucu değişmiş board'a eski analiz uygulanmaz; replay/owner/puzzle değişimindeki geç yanıt yok sayılır.
- Check feedback'i owner/puzzle/attempt/input snapshot'ıyla eşlenir. Kayıp Check yanıtı aynı command receipt'inden kurtarıldığında işaretler geri gelir; yeni Check üretilmez.
- Replay, resmi sonuç, ilk attempt ve en iyi çözülmüş attempt ayrı gösterilir. Reset/replay açık onay ister; yeni attempt not/skor/yardım durumunu temizlerken server geçmişini korur. Reveal mevcut attempt'i assisted bitirir; yeni normal solve/unlock sayılmaz. Hint modalinin açık eylem, tek işlem, manuel/foreground recovery ve başarıda kapanma davranışları korunur.

Kaynaklar: [oyun ekranı](../../apps/mobile/src/ui/GameScreen.tsx), [board bileşenleri](../../apps/mobile/src/ui/game/BoardComponents.tsx), [feedback/analysis/attempt panelleri](../../apps/mobile/src/ui/game/FeedbackPanel.tsx), [controller](../../apps/mobile/src/core/controller.ts), [snapshot ve disclosure kuralları](../../apps/mobile/src/core/game-view.ts).

## Gerçek testte bulunan replay erişim hatası

Önceden çözülmüş bir campaign seviyesinin replay'inde Reveal, progress'in son yardım flag'ini değiştiriyordu. Erişim kontrolü `COMPLETED && !answerRevealed` kullandığından henüz başlanmamış sonraki seviye yeniden kilitlenebiliyordu. Hem catalog hem doğrudan puzzle API'si etkileniyordu.

[Campaign erişim kontrolü](../../lib/puzzles/campaignAccess.ts), canonical kazanım olan `COMPLETED` durumunu koruyacak şekilde düzeltildi. İlk defa Reveal kullanmak hâlâ normal completion üretmez; önceki solve sonradan geri alınmaz. Unit regresyonu ve gerçek HTTP testinde solve → sonraki seviye açık → replay → Reveal → aynı seviye hâlâ açık akışı doğrulandı. Backend yayını bu düzeltmeyi web ve native için birlikte taşır.

## Pack ve gerçek HTTP kanıtı

Yeni [smoke:gameplay script'i](../../apps/mobile/scripts/smoke-gameplay.ts) yalnız localhost fixture backend'ini kabul eder. Geçici disk SQLite ve bellek SecureStore portu kullanır; kendi guest'ini oluşturur ve sonunda siler. Production standalone API üzerinde şu matris geçti:

| Pack / level 1 | Given fixture | Check feedback | Reveal / replay sonucu |
|---|---:|---|---|
| Beginner | 5 | EXACT_WRONG_CELLS | İki boş skora iki Hint → normal solve; lost replay receipt kurtarıldı; replay Reveal resmi sonuç/best/unlock'u korudu |
| Easy | 3 | EXACT_WRONG_CELLS | İlk Reveal sonraki seviyeyi açmadı; lost replay recovery yeni işlem üretmedi |
| Medium | 2 | WRONG_MATCH | Aynı |
| Hard | 1 | ERROR_COUNT | Aynı |
| Expert | 0 | CORRECTNESS_ONLY | Aynı |

Script, yanlışlığı hedef tablonun goal toplamıyla garanti edilen girişler kullanır. İlk Check ve Reveal yanıtları deliberately kaybedilir; receipt retry'sinde POST sayısının artmadığı kontrol edilir. Replay yanıtı da kaybedilir; yeni controller aynı disk outbox'ı okuyarak onayı kurtarır. Resmi/best sonuçlar ve unlock kontrolü sunucudan okunur.

## Test ve build sonuçları

| Kontrol | Sonuç |
|---|---|
| Native core/protokol/disk | 65/65 başarılı; önceki 45 senaryo dahil |
| Native component/oyun/navigation | 24/24 başarılı; gerçek navigator + Jest Expo native mock'ları |
| Root unit | 348/348 başarılı |
| Gerçek PostgreSQL integration | 51 başarılı; ayrı bootstrap kurulumunu isteyen 2 test bu koşuda skip |
| Gerçek HTTP + disk SQLite | Beş pack matrisi başarılı; oluşturulan guest silindi |
| TypeScript | Native ve root başarılı |
| ESLint / diff kontrolü | Başarılı, lint uyarısı yok |
| Production backend/standalone | Derleme ve static asset hazırlığı başarılı |
| Native Hermes export | iOS ve Android başarılı; her biri yaklaşık 3 MB bytecode |

Yeni integration kanıtları: birincil çözümden farklı geçerli çözümün kabul edilmesi; 121 dakikalık attempt'te Check; replay komutunun tekrar güvenli onayı; Reveal sonrasında resmi/best geçmiş ve tek completion kaydı; İstanbul gece yarısında yeni daily/attempt ve eski attempt'in korunması. Gece yarısı testinde gerçek v1 route servisleri ve PostgreSQL kullanılır, yalnız Date kontrol edilir.

Native testler ayrıca feedback modunun izin vermediği hücre/maç ayrıntısını göstermemeyi, eski Check/analysis snapshot'ını, gecikmiş analizin replay'i ezmemesini, UNKNOWN mesajını, expired token ile Hint öncesi tek refresh'i, not/score ayrımını ve responsive layout kararını kapsar. UI akışları yalnız snapshot testi değildir; skor düzenleme, Check, Analyze, not kaydetme ve modal kapanışı etkileşimle sınanır.

## Çalıştırma ve CI

```sh
cd apps/mobile
npm ci
npm test
npm run test:components
npm run type-check
npm run export:native
MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:gameplay
```

HTTP script'i reviewed seed içeriği ve Faz 3+ backend ister. Uygulamanın kendisinde private solver/solution veya DB credential bulunmaz; test script'i de public API'den oynar.

Yeni [Maestro gameplay akışı](../../apps/mobile/.maestro/gameplay.yaml), seed Beginner level 1 üzerinde replay → analysis → iki Hint → Check → replay → Reveal ve korunmuş resmi sonuç senaryosunu tanımlar. [Manuel cihaz workflow'u](../../.github/workflows/native-device-e2e.yml) artık smoke/gameplay seçimi ve public puzzle URL alır. Ana CI native core/component/export testlerini zaten çalıştıracak yapıdadır. Cihaz workflow'u hazır özel runner ve kurulu doğru build gerektirir; bu ortamda çalıştırılmadı.

```sh
maestro test --env APP_ID=dev.scorelogic.localpoc \
  --env PUZZLE_URL=scorelogic-dev://puzzles/ckscorepuzzlecamp000000001 \
  .maestro/gameplay.yaml
```

Uygulama dili mevcut İngilizce ürünle korundu. Input/ref, font scaling ve accessibility özellikleri kurulu RN 0.88 tiplerine ve [TextInput](https://reactnative.dev/docs/textinput), [accessibility](https://reactnative.dev/docs/accessibility) belgelerine göre kullanıldı. Deprecated InputAccessoryView yerine görünür uygulama eylemleri kullanılır.

## Açık kabul kapıları

Kod/yerel test teslimi tamamlandı. İki platformun imzalı artifact'leri, gerçek klavye/VoiceOver/TalkBack, küçük ekran/tablet/font scaling, OS network/background/kill ve Maestro gameplay kabulü için önceki fazlardan kalan native toolchain/signing/cihaz erişimi gereklidir. Bu çalışma Hermes export veya mocked native testleri gerçek cihaz kabulü olarak işaretlemez. Geçerli OS/toolchain matrisi için [native README](../../apps/mobile/README.md) ve [Faz 4 raporu](faz-4-uygulama-raporu-2026-11-13.md) geçerlidir.

Railway deploy veya DB migration yapılmadı. Mevcut mobil bağımlılık/lockfile içindeki local contract güncellendi; yeni server schema gerekmedi. Faz 6 tam oyuncu ekranları/parite çalışması ayrı kapsamdır.
