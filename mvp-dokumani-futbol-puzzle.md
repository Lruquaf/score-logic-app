# MVP Dokümanı: Futbol Puan Tablosu Dedüksiyon Oyunu
### Sürüm 1.0 — Haziran 2026

---

## İçindekiler

1. Yönetici Özeti
2. Ürün Vizyonu ve Stratejik Hedefler
3. Hedef Kitle
4. MVP Kapsam Sınırı
5. Temel Oyun Mekaniği (Detaylı)
6. Bulmaca Üretim Algoritması
7. Kullanıcı Hikayeleri
8. Ekranlar ve Kullanıcı Akışları
9. UI/UX Prensipleri
10. Teknik Mimari
11. Veri Modelleri
12. Monetizasyon Modeli (MVP)
13. Başarı Metrikleri ve KPI'lar
14. Geliştirme Yol Haritası
15. Risk Analizi ve Azaltma Stratejileri
16. Post-MVP Yol Haritası

---

## 1. Yönetici Özeti

**Ürün Adı (Çalışma Adı):** ScoreLogic
**Platform:** iOS & Android (React Native)
**Tür:** Mobil Mantık/Bulmaca Oyunu
**Hedef Lansman:** MVP'den itibaren 14 hafta

### Problem Tanımı
Dünyada 4 milyarı aşkın futbol taraftarı var, ancak futbol bağlamında oynanan dedüksiyon bulmaca oyunları neredeyse hiç yok. Mevcut futbol mobil oyunları ya simülasyon ya da tahmin/trivia formatına dayanıyor. Saf mantık yürütmeyi gerektiren, "tek çözümlü" ve yüksek tatmin düzeyinde bir deneyim sunmak için ciddi bir pazar boşluğu mevcut.

### Çözüm
ScoreLogic, tamamlanmış bir futbol grup tablosunu ve fikstürünü girdi olarak alır; tüm maç skorlarını gizleyerek oyuncudan bunları yalnızca mantık yoluyla çözmesini ister. Her bulmaca, matematiksel olarak doğrulanmış tek çözüme sahiptir. Tahmin yoktur — yalnızca dedüksiyon vardır.

### MVP Hedefi
- Temel bulmaca mekanik döngüsünü çalışır hale getirmek
- Günlük bulmaca formatıyla organik büyüme kanalı açmak
- 30 bulmacalık bir kampanya moduyla ilk hafta retansiyonunu ölçmek
- İlk kullanıcı kohortundan metrik toplamak ve ürün-pazar uyumunu test etmek

---

## 2. Ürün Vizyonu ve Stratejik Hedefler

### Vizyon Cümlesi
> "Futbolun tanıdık dili ile Sudoku'nun tatmin edici mantığını birleştiren, her gün yeni bir bulmaca sunan küresel dedüksiyon deneyimi."

### Kuzey Yıldızı Metriği (North Star Metric)
**Günlük Aktif Oyuncu (DAU) × Ortalama Çözüm Süresi**
→ Oyunun hem çektiğini hem de tuttuğunu tek bir göstergede birleştiren metrik.

### Stratejik Hedefler (MVP Dönemi — İlk 3 Ay)

| Hedef | Gösterge | Hedef Değer |
|-------|----------|-------------|
| Kullanıcı edinimi | Organik indirme | 10,000+ |
| Günlük katılım | DAU/MAU oranı | ≥ 25% |
| Erken retansiyon | D7 retansiyon | ≥ 35% |
| Viral döngü | Paylaşım oranı (günlük bulmaca) | ≥ 15% |
| Mekanik doğrulama | Ortalama bulmaca tamamlama oranı | ≥ 60% |

---

## 3. Hedef Kitle

### Birincil Segment: "Düşünen Taraftar"
- **Yaş:** 22–40
- **Profil:** Futbolu yakından takip eder, lig istatistiklerini okur, Fantasy Football veya benzeri platform kullanıcısı
- **Motivasyon:** Bilgiyi kullanan, skor tahminine değil anlayışa dayanan bir deneyim arıyor
- **Örnek davranış:** Puan tablosunu yorumlamayı, averaj hesabını, tiebreaker kurallarını zaten biliyor

### İkincil Segment: "Bulmaca Meraklısı"
- **Yaş:** 18–55
- **Profil:** Sudoku, Nonogram, Wordle gibi günlük bulmaca oyunlarının aktif kullanıcısı
- **Motivasyon:** Yeni bir mekanik arıyor; futbolu detaylı bilmese de mantık yapısı onu çekiyor
- **Örnek davranış:** Sabah rutininde 1-2 bulmaca çözüyor, streak koruma motivasyonuyla geliyor

### Negatif Persona (MVP'de hedeflenmiyor)
- Derinlemesine futbol simülasyonu isteyen kullanıcı (Football Manager kitlesi)
- Sadece eğlence/vakit geçirme arayan casual oyuncu
- 13 yaş altı kullanıcı

### Kullanıcı İhtiyaç Hiyerarşisi

```
1. Çözülebilirlik       → Her bulmaca mutlaka çözülmeli, tıkandığında çıkış yolu olmalı
2. Adalet duygusu       → "Bunu çözmem mümkündü" hissi (aha moment)
3. İlerleme hissi       → Gün gün, bulmaca bulmaca büyüme
4. Sosyal kimlik        → "Ben bu tür oyunları çözerim" self-expression
5. Futbol bağlamı       → Tanıdık istatistik dili, yabancı değil
```

---

## 4. MVP Kapsam Sınırı

### MVP'ye Dahil Olan

| Alan | Özellik |
|------|---------|
| Oyun Modu | Günlük Bulmaca (Daily Puzzle) |
| Oyun Modu | Kampanya Modu (30 bulmaca) |
| Bulmaca Türü | 4 takımlı grup, tüm skorlar gizli |
| Onboarding | 3 adımlı interaktif tutorial |
| Yardım | 3 ipucu hakkı (bulmaca başına) |
| Sosyal | Sonuç paylaşımı (emoji grid) |
| İstatistik | Kişisel istatistik ekranı |
| Monetizasyon | Rewarded reklam (ipucu için) |
| Platform | iOS 15+ ve Android 9+ |

### MVP'ye Dahil Olmayan (Post-MVP)

| Özellik | Neden Ertelendi |
|---------|----------------|
| 5-6 takımlı lig grupları | Algoritma karmaşıklığı, UI zorluğu |
| Gerçek tarihsel bulmacalar | Lisans/veri maliyeti |
| Çok oyunculu mod | Teknik borç, odak dağıtır |
| Kullanıcı üretimi bulmacalar | Moderasyon gerektirir |
| Premium abonelik | Değer önerisi önce kanıtlanmalı |
| Skor gizleme seçenekleri | Zorluk ayarı sonraki versiyona |

---

## 5. Temel Oyun Mekaniği (Detaylı)

### 5.1 Bulmaca Yapısı

**Grup Formatı:** 4 takım, tek devre lig (her takım diğerleriyle 1 kez oynuyor)
**Toplam Maç:** 6 (4 takım × 3 tur / 2 = 6)
**Verilen Bilgi:** Tüm takımların nihai puan tablosu

```
Örnek Bulmaca:

 #  TAKIM        O  G  B  M  AG  YG  AV   P
 1  Arjantin     3  3  0  0   7   1  +6   9
 2  Polonya      3  1  1  1   2   3  -1   4
 3  Meksika      3  1  1  1   2   3  -1   4
 4  Suudi Arabistan 3 0  0  3   3   7  -4   0

Fikstür (tüm skorlar gizli):

Arjantin   vs Suudi Arabistan  →  ? - ?
Polonya    vs Meksika          →  ? - ?
Arjantin   vs Meksika          →  ? - ?
Polonya    vs Suudi Arabistan  →  ? - ?
Polonya    vs Arjantin         →  ? - ?
Suudi Arabistan vs Meksika     →  ? - ?
```

### 5.2 Çözüm Mantığı (Oyuncunun Düşünce Süreci)

**Adım 1 — Puan Çıkarımı**
```
Arjantin: 3G, 0B, 0M → Her maçı kazandı
  → Arjantin 3 maçın hepsini kazandı
  → Arjantin'e karşı oynayan her takım 1 mağlubiyet aldı

Suudi Arabistan: 0G, 0B, 3M → Her maçı kaybetti
  → 3 maçta da yenildi
```

**Adım 2 — Gol Kısıtı**
```
Arjantin AG=7, YG=1 (3 maçta)
  → 7 golü 3 maça dağıtmalı, 1 gol yedi

Suudi Arabistan AG=3, YG=7 (3 maçta)
  → Suudi'nin attığı 3 gol → Yediği 7 gol
  → Arjantin-Suudi maçında Suudi'nin attığı gol sayısı kısıtlanıyor
```

**Adım 3 — Çapraz Doğrulama**
```
Polonya ve Meksika simetrik (aynı istatistikler)
  → Polonya-Meksika maçı berabere bitmeli (0-0, 1-1, veya 2-2?)
  → AG kısıtlarından: tam değer çıkarılabilir
```

**Adım 4 — Eliminasyon**
```
Geriye kalan kısıtlar → tek çözüm:

Arjantin 1-0 Suudi Arabistan   ✓
Polonya 0-0 Meksika             ✓
Arjantin 2-0 Meksika            ✓
Polonya 2-0 Suudi Arabistan    ✓
Polonya 0-2 Arjantin            ✓
Suudi Arabistan 1-1 Meksika    ✓ ← (Meksika 1B için gerekli)
```

### 5.3 Doğrulama Kuralları

Her girilen skor, gerçek zamanlı olarak aşağıdaki kısıtlara göre kontrol edilir:

```
KURAL 1 — Puan tutarlılığı
  G maçı → 3 puan kazanan takıma
  B maçı → her iki takıma 1 puan
  M maçı → kaybeden takıma 0 puan
  
KURAL 2 — Gol tutarlılığı
  Her takımın AG toplamı = o takımın oynadığı maçlarda attığı golların toplamı
  Her takımın YG toplamı = o takımın oynadığı maçlarda yediği golların toplamı
  
KURAL 3 — Çapraz simetri
  Takım A'nın B'ye karşı attığı gol = Takım B'nin A'dan yediği gol
  
KURAL 4 — Averaj kontrolü
  AV = AG - YG (hesaplanan değer tablodakiyle eşleşmeli)
```

### 5.4 Hata Durumları ve Geri Bildirim

| Hata | Gösterim |
|------|---------|
| Puan toplamı tutarsız | İlgili takım satırı kırmızıya döner |
| Gol toplamı aşıldı | AG veya YG sütunu sarı uyarı |
| Averaj tutarsız | AV hücresi titreşim animasyonu |
| Tüm maçlar dolu, çözüm yanlış | Tam tablo kırmızı + "Çelişki var" mesajı |
| Tüm maçlar dolu, çözüm doğru | Tam tablo yeşil + zafer animasyonu |

---

## 6. Bulmaca Üretim Algoritması

### 6.1 Algoritma Akışı

```
[BULMACA ÜRETECİ]

ADIM 1: Ham Skor Üretimi
  - 4 takım için 6 maç kombinasyonu belirle
  - Her maç için rastgele skor üret (0-4 aralığı, gerçekçi dağılım)
  - Gerçekçilik filtresi: toplam maç başı gol ortalaması 2.5 ± 1.2

ADIM 2: İstatistik Hesabı  
  - Her takım için G/B/M/AG/YG/AV/P hesapla
  - Puan tablosunu oluştur ve sırala
  - Tiebreaker'ı uygula (aynı puanda averaj → AG)

ADIM 3: Teklik Doğrulaması (Uniqueness Check)
  - Geriye dönük çözücü (backtracking solver) çalıştır
  - Tüm skor kombinasyonları üzerinde tam arama yap
  - Çözüm sayısı = 1 ise → GEÇER
  - Çözüm sayısı > 1 ise → REDDET ve başa dön

ADIM 4: Zorluk Sınıflandırması
  - Çözücünün kaç çıkarım adımı gerektirdiğini say
  - 1-5 adım → Kolay
  - 6-12 adım → Orta
  - 13-20 adım → Zor

ADIM 5: Veritabanına Kayıt
  - Bulmaca meta verisi ile birlikte sakla
  - Takım adları ata (jenerik: Takım A-B-C-D / tematik: ülke isimleri)
  - Bulmacayı kullanım havuzuna ekle
```

### 6.2 Geriye Dönük Çözücü (Pseudocode)

```python
def solve(puzzle, current_matches, solved_count):
    if solved_count == 6:
        return verify_all_constraints(puzzle, current_matches)
    
    next_match = get_next_unsolved_match(current_matches)
    solutions = []
    
    for home_score in range(0, 5):
        for away_score in range(0, 5):
            candidate = assign_score(next_match, home_score, away_score)
            
            if is_partially_valid(puzzle, current_matches + candidate):
                result = solve(puzzle, current_matches + candidate, solved_count + 1)
                solutions.extend(result)
                
                if len(solutions) > 1:
                    return solutions  # Early exit: birden fazla çözüm var
    
    return solutions

def count_solutions(puzzle):
    return len(solve(puzzle, [], 0))

def is_valid_puzzle(puzzle):
    return count_solutions(puzzle) == 1
```

### 6.3 Üretim Verimliliği

Deneysel testlere dayanan tahminler:
- Ham üretim denemelerin ~%30-40'ı teklik testini geçer
- Her geçerli bulmaca üretimi için ortalama süre: < 50ms
- 10,000 geçerli bulmaca üretimi: < 15 dakika
- MVP için hedef stok: 5,000 doğrulanmış bulmaca (günlük bulmaca 13+ yıl yeter)

### 6.4 Zorluk Kalibrasyon Matrisi

```
KOLAYLİK GÖSTERGELERİ                 ZORLUK GÖSTERGELERİ

✓ Bir takım 3G veya 3M aldıysa        ✗ Tüm takımlar farklı puan
✓ Averajlar büyük fark içeriyorsa     ✗ İki takım aynı istatistiklere sahip
✓ Bir takımın maçları net ayrışıyorsa ✗ Çok sayıda 0-0 skoru içeriyorsa
✓ Gol sayıları düşük toplamsa         ✗ Yüksek gollü karmaşık dağılım
```

---

## 7. Kullanıcı Hikayeleri

### 7.1 Onboarding

**US-01: İlk Açılış Deneyimi**
```
Olarak: Yeni bir kullanıcı
İstiyorum ki: Oyunun nasıl çalıştığını hızla anlayayım
Böylece: Gerçek bulmacaya geçmeden önce kendimi hazır hissedeyim

Kabul Kriterleri:
- Tutorial, 3 adımlı ve atlabilir değil (ilk açılış)
- Her adım etkileşimli: açıklama + hemen uygulama
- Tutorial bulmacası gerçek bir bulmaca gibi hissettirmeli
- Tamamlandığında "Artık hazırsın!" ekranı göstermeli
- Tüm tutorial süresi ≤ 3 dakika olmalı
```

**US-02: Tutorial Bulmacası**
```
Olarak: Mekanikleri öğrenen kullanıcı
İstiyorum ki: Adım adım yönlendirme ile ilk bulmacayı çözeyim
Böylece: Mantık yapısını kendi başıma deneyimleyeyim

Kabul Kriterleri:
- İlk adım: "Arjantin 3 maçı da kazandı — tüm maçlarını G olarak işaretle"
  ← sistem bu çıkarımı gösterir ve kullanıcıdan onay alır
- İkinci adım: "Gol kısıtlarından başlayalım" ← kısıt vurgulama
- Üçüncü adım: Kullanıcı son iki maçı bağımsız çözer
- Hata yapılırsa: nazik uyarı, "şu kısıt çelişiyor" açıklaması
```

### 7.2 Günlük Bulmaca

**US-03: Günlük Bulmacaya Erişim**
```
Olarak: Düzenli kullanıcı
İstiyorum ki: Her gün yeni bir bulmacayla karşılaşayım
Böylece: Günlük alışkanlık oluşturayım

Kabul Kriterleri:
- Ana ekranda günlük bulmaca belirgin ve tarih damgalı olmalı
- UTC 00:00'da güncellenmeli
- Bulmaca aynı gün birden fazla oynanamaz (çözüldükten sonra)
- "Yarınki bulmaca için X saat" geri sayım gösterilmeli
```

**US-04: Sonuç Paylaşımı**
```
Olarak: Günlük bulmacayı çözen kullanıcı
İstiyorum ki: Sonucumu arkadaşlarımla spoiler vermeden paylaşayım
Böylece: Sosyal tatmin yaşayayım ve oyunu organik olarak tanıtayım

Kabul Kriterleri:
- Paylaşım metni emoji grid formatında (Wordle benzeri)
- Spoiler yok: sadece kaç hamlede çözüldüğü ve hata sayısı
- iOS Share Sheet / Android Intent açılmalı
- Kopyala butonu da olmalı
- Örnek format:
  ScoreLogic #142 ⚽
  🟩🟨🟥🟩🟩🟩
  6 maçı 8 hamlede çözdüm!
  scorelogic.app
```

### 7.3 Kampanya Modu

**US-05: İlerleme Takibi**
```
Olarak: Kampanya modu oynayan kullanıcı
İstiyorum ki: Kaçıncı bulmacada olduğumu ve ne kadar yol kat ettiğimi göreyim
Böylece: İlerleme hissiyle motive olayım

Kabul Kriterleri:
- Kampanya haritasında çözülmüş/aktif/kilitli bulmacalar görünmeli
- Her 10 bulmacada "bölüm tamamlandı" kutlama ekranı
- Tamamlanma yüzdesi ve toplam çözülen sayısı gösterilmeli
```

### 7.4 İpucu Sistemi

**US-06: İpucu Kullanımı**
```
Olarak: Takılan kullanıcı
İstiyorum ki: İpucu alarak bulmacadan çıkış yolu bulayım
Böylece: Sinirlenip çıkmak yerine oyunla kalmayı seçeyim

Kabul Kriterleri:
- Bulmaca başına 3 ipucu hakkı (kampanya modu)
- İpucu türleri (sırasıyla sunulacak):
  1. "Hangi takımın maçlarına bakmalısın" ipucu (soft)
  2. "Bu maçı indir/yüksel" yön ipucu (medium)
  3. "Bu bir maçın skorunu doğrudan göster" (hard — reklam karşılığı)
- İpucu kullanılmadan çözülen bulmacalar ⭐ ile işaretlenir
- Günlük bulmacada ipucu kullanılırsa paylaşım metni değişir
```

### 7.5 İstatistikler

**US-07: Kişisel İstatistik Ekranı**
```
Olarak: Düzenli kullanıcı
İstiyorum ki: Performansımı ve alışkanlıklarımı takip edeyim
Böylece: İlerlemeyi somut olarak görebileyim

Kabul Kriterleri:
Gösterilecek metrikler:
- Toplam çözülen bulmaca sayısı
- Mevcut seri (streak) ve en iyi seri
- Ortalama çözüm süresi
- İpuçsuz çözme yüzdesi
- Güçlük dağılımı (Kolay/Orta/Zor kırılımı)
- Aktivite ısı haritası (son 30 gün)
```

---

## 8. Ekranlar ve Kullanıcı Akışları

### 8.1 Ekran Haritası

```
┌─────────────────────────────────────────┐
│              SPLASH / LOGO              │
└──────────────────┬──────────────────────┘
                   │
          ┌────────▼────────┐
          │  ANA EKRAN      │
          │ (Home Screen)   │
          └────┬───────┬────┘
               │       │
    ┌──────────▼──┐  ┌──▼──────────┐
    │ GÜNLÜK      │  │  KAMPANYA   │
    │ BULMACA     │  │  MODU       │
    └──────┬──────┘  └──────┬──────┘
           │                │
           └───────┬─────────┘
                   │
          ┌────────▼────────┐
          │  BULMACA EKRANI │
          │  (Puzzle Screen)│
          └────────┬────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐  ┌───▼───┐  ┌──▼──────┐
   │ ZAFER  │  │ HATA  │  │ İPUCU   │
   │ EKRANI │  │ EKRANI│  │ MODALi  │
   └────────┘  └───────┘  └─────────┘
```

### 8.2 Ana Ekran Düzeni

```
┌──────────────────────────────────┐
│  ScoreLogic              ⚙️  👤  │
├──────────────────────────────────┤
│                                  │
│   🔥 14 Günlük Seri              │
│                                  │
│  ┌──────────────────────────┐   │
│  │   BUGÜNÜN BULMACASI      │   │
│  │   16 Haziran 2026 ⚽      │   │
│  │                          │   │
│  │   Zorluk: ●●○○ Orta     │   │
│  │                          │   │
│  │      [OYNA] 🟢           │   │
│  └──────────────────────────┘   │
│                                  │
│  ┌──────────────────────────┐   │
│  │   🏆 KAMPANYA MODU       │   │
│  │   Bulmaca 12/30          │   │
│  │   ████████░░░░░ 40%      │   │
│  │                          │   │
│  │      [DEVAM ET] →        │   │
│  └──────────────────────────┘   │
│                                  │
│  [📊 İstatistiklerim]            │
│                                  │
└──────────────────────────────────┘
```

### 8.3 Bulmaca Ekranı Düzeni

```
┌──────────────────────────────────┐
│  ← Geri        ⏱️ 02:34   💡 2   │
├──────────────────────────────────┤
│  PUAN TABLOSU                    │
│ ─────────────────────────────── │
│  # Takım   O  G  B  M  AG YG  P │
│  1 ARJ     3  3  0  0   7  1  9 │
│  2 POL     3  1  1  1   2  3  4 │
│  3 MEK     3  1  1  1   2  3  4 │
│  4 SUU     3  0  0  3   3  7  0 │
│ ─────────────────────────────── │
│                                  │
│  FİKSTÜR                         │
│ ┌───────────┬───┬───┬───────────┐│
│ │ ARJ       │ ? │ ? │ SUU       ││
│ │ POL       │ ? │ ? │ MEK       ││
│ │ ARJ       │ ? │ ? │ MEK       ││
│ │ POL       │ ? │ ? │ SUU       ││
│ │ POL       │ ? │ ? │ ARJ       ││
│ │ SUU       │ ? │ ? │ MEK       ││
│ └───────────┴───┴───┴───────────┘│
│                                  │
│  ┌─────────────────────────────┐ │
│  │  1  2  3  4  5              │ │
│  │  6  7  8  9  0              │ │
│  │       [SİL]  [✓]            │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘
```

### 8.4 Zafer Ekranı

```
┌──────────────────────────────────┐
│                                  │
│          🎉 TEBRIKLER!           │
│                                  │
│     Tüm Maç Skorlarını Buldun    │
│                                  │
│  ┌──────────────────────────┐   │
│  │ ⏱️  Süre:     03:47      │   │
│  │ 💡  İpucu:    0 (Mükemmel!)│ │
│  │ 🔥  Seri:     15 Gün     │   │
│  └──────────────────────────┘   │
│                                  │
│  Doğru Cevap:                    │
│  ARJ 1-0 SUU ✅                  │
│  POL 0-0 MEK ✅                  │
│  ARJ 2-0 MEK ✅                  │
│  POL 2-0 SUU ✅                  │
│  POL 0-2 ARJ ✅                  │
│  SUU 1-1 MEK ✅                  │
│                                  │
│   [📤 PAYLAŞ]  [▶ SONRAKİ]      │
│                                  │
└──────────────────────────────────┘
```

---

## 9. UI/UX Prensipleri

### 9.1 Tasarım İlkeleri

**Netlik önce gelir:** Puan tablosu ve fikstür, herhangi bir futbol platformundaki standart görünümüne yakın olmalı. Tanıdıklık öğrenme maliyetini düşürür.

**Renk Sistemi (Duruma Göre):**
```
Boş hücre       → Nötr beyaz/gri
Kullanıcı girişi → Hafif mavi
Kısıt ihlali    → Kırmızı (#E53E3E) + titreşim
Kısmi doğru     → Sarı/turuncu (#F6AD55) uyarı
Tamamen doğru   → Yeşil (#38A169) + pulse
Kilitli/gizli   → Koyu gri, soru işareti
```

**Dokunmatik Hedef Boyutları:**
- Skor giriş hücreleri: minimum 44×44 pt
- Sayı tuş takımı: minimum 48×48 pt
- İpucu butonu: minimum 44×44 pt

### 9.2 Geri Bildirim Döngüsü

```
Kullanıcı eylemi → Anlık görsel geri bildirim (< 100ms)
                 → Kısıt kontrolü (< 200ms)
                 → Renk güncellemesi (animasyonlu, 150ms)

Tamamlanma      → Confetti animasyonu (500ms)
                → Ses efekti (opsiyonel, varsayılan açık)
                → İstatistik güncelleme (100ms)
```

### 9.3 Erişilebilirlik

- Dinamik tipografi (sistem font boyutu desteği)
- Renk körü modu: şekil/desen bazlı kodlama (renk tek başına anlam taşımamalı)
- VoiceOver / TalkBack uyumluluğu (temel düzeyde)
- Dil: İngilizce (MVP), Türkçe (Post-MVP priorite)

---

## 10. Teknik Mimari

### 10.1 Mimari Genel Bakış

```
┌─────────────────────────────────────────────┐
│              MOBİL CLIENT                   │
│         (React Native / Expo)               │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  UI      │  │  State   │  │ Local    │  │
│  │  Layer   │  │  (Zustand│  │ Storage  │  │
│  │          │  │  /Redux) │  │ (MMKV)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └──────────────┴─────────────┘        │
│                      │                      │
└──────────────────────┼──────────────────────┘
                       │ HTTPS / REST API
┌──────────────────────▼──────────────────────┐
│              BACKEND (Node.js / Express)    │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Auth    │  │ Puzzle   │  │  User    │  │
│  │  Service │  │  Service │  │  Service │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └──────────────┴─────────────┘        │
│                      │                      │
└──────────────────────┼──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│              VERİTABANI KATMANI             │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ PostgreSQL   │    │  Redis (Cache)    │  │
│  │ (Ana Veri)   │    │  Günlük bulmaca   │  │
│  └──────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────┘
```

### 10.2 Teknoloji Seçimleri ve Gerekçeler

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Mobil Framework | React Native + Expo | Tek codebase, iOS+Android, geniş ekosistem |
| State Yönetimi | Zustand | Redux'tan daha hafif, öğrenme eğrisi düşük |
| Yerel Depolama | MMKV | AsyncStorage'dan 10x hızlı, oyun durumu için ideal |
| Backend | Node.js + Express | JS ekosistemi bütünlüğü, hızlı prototipleme |
| Veritabanı | PostgreSQL | JSONB desteği, ACID garantisi |
| Cache | Redis | Günlük bulmaca dağıtımı, session cache |
| Hosting | Railway / Render | MVP için düşük maliyet, ölçeklenebilir |
| CDN/Asset | Cloudflare | Görsel dağıtımı, DDoS koruması |
| Analytics | PostHog | Açık kaynak, GDPR uyumlu, ücretsiz başlangıç |
| Crash Monitoring | Sentry | Mobil crash izleme |

### 10.3 API Endpoint'leri (MVP)

```
AUTH
POST   /api/v1/auth/anonymous     → Anonim kullanıcı oluştur
POST   /api/v1/auth/register      → Email ile kayıt
POST   /api/v1/auth/login         → Giriş

BULMACALAR
GET    /api/v1/puzzles/daily             → Bugünün günlük bulmacası
GET    /api/v1/puzzles/campaign          → Kampanya bulmaca listesi
GET    /api/v1/puzzles/:id              → Belirli bulmaca detayı
POST   /api/v1/puzzles/:id/submit       → Çözüm gönderimi ve doğrulama
GET    /api/v1/puzzles/:id/hint         → İpucu al (tip belirterek)

KULLANICI
GET    /api/v1/user/stats               → Kişisel istatistikler
GET    /api/v1/user/progress            → Kampanya ilerleme durumu
PATCH  /api/v1/user/settings            → Ayar güncelleme

İÇERİK
GET    /api/v1/meta/teams               → Takım bilgileri listesi
```

### 10.4 Çevrimdışı (Offline) Stratejisi

```
Kampanya bulmacaları: İlk 30 bulmaca cihaza indirilir
  → Offline oynanabilir

Günlük bulmaca: Her gün senkronize edilir
  → Çevrimiçi gerekli (anti-spoiler nedeniyle)

Kullanıcı ilerlemesi: Yerel önce, cloud senkronize
  → Çevrimdışı oyun kaydedilir, bağlantı kurulunca senkronize

Conflict resolution: Son-yazar-kazanır prensibi (last-write-wins)
  → Zaman damgasına göre çözüm
```

---

## 11. Veri Modelleri

### 11.1 Veritabanı Şeması (PostgreSQL)

```sql
-- TAKIMLAR
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(3) NOT NULL UNIQUE,   -- 'ARJ', 'POL'
  name        VARCHAR(100) NOT NULL,        -- 'Arjantin'
  flag_emoji  VARCHAR(10),                  -- '🇦🇷'
  created_at  TIMESTAMP DEFAULT NOW()
);

-- BULMACALAR
CREATE TABLE puzzles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  difficulty      VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  teams_config    JSONB NOT NULL,   -- [{team_id, position, stats}]
  matches_hidden  JSONB NOT NULL,   -- [{home_id, away_id}] (skor olmadan)
  solution        JSONB NOT NULL,   -- [{home_id, away_id, home_score, away_score}]
  inference_steps INTEGER NOT NULL, -- çözücünün adım sayısı
  daily_date      DATE UNIQUE,      -- null ise kampanya bulmacası
  campaign_order  INTEGER UNIQUE,   -- null ise günlük bulmaca
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- KULLANICILAR
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE,
  is_anonymous    BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active_at  TIMESTAMP DEFAULT NOW()
);

-- KULLANICI BULMACA İLERLEMESİ
CREATE TABLE user_puzzle_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  puzzle_id       UUID REFERENCES puzzles(id),
  status          VARCHAR(20) CHECK (status IN ('in_progress','completed','abandoned')),
  attempts        INTEGER DEFAULT 0,
  hints_used      INTEGER DEFAULT 0,
  hint_types      VARCHAR(10)[] DEFAULT '{}',  -- ['soft','medium','hard']
  time_taken_sec  INTEGER,
  current_state   JSONB,   -- kayıtlı ara durum
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, puzzle_id)
);

-- KULLANICI İSTATİSTİKLERİ (Materialized View)
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  u.id as user_id,
  COUNT(CASE WHEN upp.status = 'completed' THEN 1 END) as total_solved,
  AVG(CASE WHEN upp.status = 'completed' THEN upp.time_taken_sec END) as avg_time_sec,
  COUNT(CASE WHEN upp.status = 'completed' AND hints_used = 0 THEN 1 END) as perfect_solves,
  MAX(upp.completed_at) as last_solve_at
FROM users u
LEFT JOIN user_puzzle_progress upp ON u.id = upp.user_id
GROUP BY u.id;

-- GÜNLÜK STREAK TAKIBI
CREATE TABLE daily_streaks (
  user_id       UUID REFERENCES users(id) PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  best_streak    INTEGER DEFAULT 0,
  last_played    DATE,
  updated_at     TIMESTAMP DEFAULT NOW()
);
```

### 11.2 İstemci Tarafı State Şeması (Zustand)

```typescript
interface GameState {
  // Aktif bulmaca
  activePuzzle: {
    id: string;
    teams: Team[];
    standings: Standing[];
    matches: Match[];          // skor boş
    currentInputs: Record<string, Score>;  // matchId → kullanıcı girişi
    constraintErrors: string[];  // hatalı matchId listesi
    hintsUsed: HintType[];
    startedAt: number;          // timestamp
    isComplete: boolean;
  } | null;

  // Kullanıcı
  user: {
    id: string;
    isAnonymous: boolean;
    stats: UserStats;
    dailyStreak: number;
  } | null;

  // Kampanya
  campaign: {
    totalPuzzles: number;
    completedPuzzles: string[];  // puzzle ID listesi
    currentPuzzleId: string | null;
  };

  // Eylemler
  actions: {
    loadPuzzle: (puzzleId: string) => Promise<void>;
    setScore: (matchId: string, score: Score) => void;
    submitSolution: () => Promise<SubmitResult>;
    requestHint: (type: HintType) => Promise<Hint>;
    resetPuzzle: () => void;
  };
}
```

---

## 12. Monetizasyon Modeli (MVP)

### 12.1 MVP Monetizasyon Felsefesi

MVP döneminde para kazanmaktan çok **elde tutma ve büyümeyi** optimize etmeli. Tek agresif monetizasyon hamlesi, organik büyüme kanalını zehirleme riskini taşır. Bu nedenle MVP monetizasyonu hafif ve değer odaklıdır.

### 12.2 MVP Gelir Kaynakları

**Kaynak 1: Rewarded Reklam (Birincil)**
```
Tetikleyici: Kullanıcı 3. ipucunu (hard hint) talep eder
Akış:
  1. "Reklam izle → 1 Hard İpucu kazan" modal gösterilir
  2. Kullanıcı kabul eder → 15-30s rewarded video oynar
  3. İpucu otomatik uygulanır
  4. Kullanıcı günde en fazla 3 reklam izleyebilir (abuse koruma)

Hedef CPM: $5-8 (mobil bulmaca segmenti ortalaması)
Beklenen ortalama günlük reklam/kullanıcı: 0.4 reklam
```

**Kaynak 2: İpucu Paketi IAP (İkincil)**
```
Ürün: "10 Hard İpucu Paketi" → $0.99
Hedef: Reklamlara toleransı düşük, hızlı çözüm isteyen segment
MVP hedef dönüşüm: MAU'nun %0.5-1'i
```

### 12.3 Ücretsiz vs Ücretli Sınır (MVP)

| Özellik | Ücretsiz |
|---------|---------|
| Günlük bulmaca | ✅ Her zaman ücretsiz |
| Kampanya (30 bulmaca) | ✅ Tamamı ücretsiz |
| Soft & Medium ipucu | ✅ Bulmaca başına 2 adet |
| Hard ipucu | ⚡ Reklam ile kazanılır |
| İstatistikler | ✅ Tam erişim |
| Reklam | Banner yok, sadece rewarded |

> **Not:** MVP'de banner reklam kullanılmayacak. Banner reklamlar düşük CPM'e karşılık yüksek kullanıcı deneyimi maliyeti taşır ve erken aşamada churn'ü artırır.

### 12.4 Post-MVP Monetizasyon Geçişi (Referans)

```
Ay 4+: Premium abonelik ($2.99/ay)
  → Sınırsız bulmaca erişimi
  → Tüm ipuçları sınırsız
  → Reklamdan muaf deneyim
  → İstatistik analizleri

Ay 6+: Turnuva İçerik Paketleri ($1.99-4.99)
  → "UEFA EURO 2028 Paketi" (64 bulmaca)
  → "Şampiyonlar Ligi 2025-26 Paketi"
```

---

## 13. Başarı Metrikleri ve KPI'lar

### 13.1 Temel Metrik Çerçevesi

**Katman 1: Büyüme Metrikleri**
```
Metrik          Tanım                              MVP Hedef (Ay 3)
─────────────────────────────────────────────────────────────────────
Toplam İndirme  Store'dan yükleme                 10,000+
Organik Oran    Organik / Toplam indirme           ≥ 70%
Paylaşım Oranı  Paylaş tıklaması / Günlük çözüm   ≥ 15%
```

**Katman 2: Katılım Metrikleri**
```
Metrik          Tanım                              MVP Hedef
─────────────────────────────────────────────────────────────────────
DAU/MAU Oranı   Günlük aktif / Aylık aktif         ≥ 25%
Oturum/Gün      Kişi başı ortalama günlük oturum   ≥ 1.5
Bulmaca/Oturum  Oturum başına çözülen bulmaca      ≥ 1.2
Tamamlama Oranı Başlayan / Tamamlayan              ≥ 60%
```

**Katman 3: Retansiyon Metrikleri**
```
Metrik          Tanım                              MVP Hedef
─────────────────────────────────────────────────────────────────────
D1 Retansiyon   İndirme sonrası 2. gün aktif       ≥ 55%
D7 Retansiyon   İndirme sonrası 8. gün aktif       ≥ 35%
D30 Retansiyon  İndirme sonrası 31. gün aktif      ≥ 20%
Streak ≥ 7 gün  7+ günlük seri olan kullanıcı %    ≥ 20%
```

**Katman 4: Monetizasyon Metrikleri**
```
Metrik          Tanım                              MVP Hedef
─────────────────────────────────────────────────────────────────────
ARPU (Aylık)    Kullanıcı başı aylık gelir         $0.05-0.15
Reklam Görüntüleme / DAU                           0.3-0.5
IAP Dönüşüm     Ödeme yapan kullanıcı %            ≥ 0.5%
```

**Katman 5: Kalite Metrikleri**
```
Metrik          Tanım                              Hedef
─────────────────────────────────────────────────────────────────────
Crash-Free Rate Çöküş yaşamayan oturum %          ≥ 99.5%
API Latency     Ortalama API yanıt süresi          ≤ 200ms
App Store Puan  Ortalama kullanıcı puanı           ≥ 4.3/5
Puzzle Hata     Birden fazla çözüme sahip bulmaca  0 (sıfır tolerans)
```

### 13.2 Kritik Alarm Eşikleri

```
🚨 ACİL — Hemen müdahale gereken:
  D1 retansiyon < %35 → Onboarding acil revizyonu
  Crash rate > %2 → Teknik acil müdahale
  Puzzle hata raporu → Anında bulmaca kaldırma

⚠️ UYARI — 1 hafta içinde incelenmesi gereken:
  D7 retansiyon < %25 → Gunlük bulmaca mekanik revizyon
  Tamamlama oranı < %45 → Zorluk kalibrasyonu
  Paylaşım oranı < %8 → Paylaşım deneyimi revizyonu
```

---

## 14. Geliştirme Yol Haritası

### 14.1 Ekip Varsayımı (MVP İçin Minimum Uygun Ekip)
```
1x Full-Stack Developer (Backend + API)
1x React Native Developer (Mobil)
1x Designer (UI/UX)
1x QA (Part-time)
[1x Kurucu / PM — teknik koordinasyon]
```

### 14.2 14 Haftalık Sprint Planı

```
FAZA 0 — HAZIRLIK (Hafta 1-2)
─────────────────────────────────────────────
✅ Teknik mimari kararları finalize et
✅ Geliştirme ortamı kurulumu (CI/CD, repo, env)
✅ Veritabanı şeması oluştur ve migrate et
✅ Bulmaca üreteci algoritmasının prototipini yaz ve test et
✅ 100 geçerli bulmaca üret ve doğrula
✅ Wireframe ve tasarım sistemi oluştur

FAZA 1 — CORE ENGINE (Hafta 3-5)
─────────────────────────────────────────────
✅ Bulmaca API endpoint'leri (CRUD)
✅ Çözüm doğrulama servisi
✅ İpucu oluşturma mantığı
✅ Kullanıcı oluşturma + anonim auth
✅ React Native temel navigasyon yapısı
✅ Bulmaca ekranı core UI (tablo + fikstür grid)
✅ Sayı giriş pad'i ve kısıt göstergesi

FAZA 2 — OYUN DENEYİMİ (Hafta 6-8)
─────────────────────────────────────────────
✅ Tutorial akışı (3 adım, interaktif)
✅ Zafer ve hata ekranları
✅ Günlük bulmaca sistemi (zamanlama, UTC güncellemesi)
✅ Kampanya modu navigasyonu ve ilerleme kaydı
✅ İpucu sistemi UI + modal
✅ Streak takibi ve gösterimi
✅ Temel animasyonlar (constraint highlight, zafer confetti)

FAZA 3 — SOSYAL & RETANSIYON (Hafta 9-10)
─────────────────────────────────────────────
✅ Paylaşım özelliği (emoji grid formatter)
✅ İstatistik ekranı (tüm metrikler)
✅ Push notification altyapısı (günlük bulmaca hatırlatma)
✅ Uygulama içi puanlama isteği (D3 sonrası)
✅ Rewarded reklam entegrasyonu (AdMob / Unity Ads)
✅ IAP altyapısı (ipucu paketi)

FAZA 4 — İÇERİK & DOLDURMA (Hafta 11-12)
─────────────────────────────────────────────
✅ 30 kampanya bulmacasını kalite kontrolden geçir ve sırala
✅ 90 günlük bulmaca stoğunu doğrula
✅ Takım veri tabanını zenginleştir (100+ takım, bayrak, kod)
✅ Admin paneli: Bulmaca yönetimi (aktif/pasif, günlük atama)
✅ Hata izleme entegrasyonu (Sentry)
✅ Analytics entegrasyonu (PostHog event tanımları)

FAZA 5 — TEST & LANSMAN HAZIRLIĞI (Hafta 13-14)
─────────────────────────────────────────────
✅ Kapalı beta (50-100 kullanıcı, 1 hafta)
✅ Bug fix sprint (beta geri bildirimleri)
✅ App Store / Play Store varlıkları (ekran görüntüleri, açıklama)
✅ Privacy Policy + Terms of Service
✅ Store gönderimi ve review süreci
✅ Soft lansman (belirli bir coğrafyada — Türkiye veya İngiltere)
```

### 14.3 Günlük Bulmaca İçerik Üretim Planı

```
MVP öncesi hazırlık: 90 günlük bulmaca üretilir ve doğrulanır
Haftalık rutin: Her pazartesi 14 yeni bulmaca onaylanır (2 hafta stok)
Otomasyon: Üretici Cuma akşamı çalışır, Cumartesi QA onaylar

Günlük Bulmaca Zorluk Dağılımı (MVP):
  Pazartesi-Çarşamba: Kolay
  Perşembe-Cumartesi: Orta
  Pazar: Zor (haftalık meydan okuma)
```

---

## 15. Risk Analizi ve Azaltma Stratejileri

### 15.1 Risk Matrisi

| # | Risk | Etki | Olasılık | Öncelik |
|---|------|------|----------|---------|
| R1 | Birden fazla çözümlü bulmaca yayına çıkar | Çok Yüksek | Düşük | Kritik |
| R2 | Tutorial öğretemez, kullanıcı ilk 2 dakikada çıkar | Yüksek | Orta | Kritik |
| R3 | Zorluk kalibrasyonu yanlış | Orta | Yüksek | Yüksek |
| R4 | Günlük bulmaca senkronizasyon hatası | Yüksek | Düşük | Yüksek |
| R5 | Pazar çok niş çıkar, büyüme duvarıyla karşılaşılır | Yüksek | Orta | Yüksek |
| R6 | Rakip hızlı kopya çıkarır | Orta | Düşük | Orta |
| R7 | Store review reddedilir | Orta | Düşük | Orta |

### 15.2 Risk Azaltma Planları

**R1 — Hatalı Bulmaca**
```
Önlem 1: Her bulmaca için üretim sırasında uniqueness check zorunlu
Önlem 2: Bulmaca stoktan çıkmadan ikinci bir doğrulayıcı çalıştır
Önlem 3: Kullanıcı "Bu bulmacada hata var" raporu butonu
Önlem 4: Rapor alındığında 30 dakika içinde bulmaca çekilebilmeli
Önlem 5: Admin panelinde acil deaktivasyonu için 1 tık yeterli
```

**R2 — Tutorial Başarısızlığı**
```
Önlem 1: Beta'da tutorial tamamlama oranını ölç (hedef: %80+)
Önlem 2: A/B test: 3 adımlı vs 2 adımlı tutorial
Önlem 3: İlk gerçek bulmacayı "rehberli mod" olarak sun
Önlem 4: D1 churn analizi ile dropout noktasını belirle
```

**R3 — Zorluk Kalibrasyonu**
```
Önlem 1: Beta'da bulmaca başına ortalama çözüm süresini logla
Önlem 2: İpucu kullanım oranını zorluğa göre takip et
Önlem 3: Terk oranı yüksek bulmacaları "zor" olarak yeniden etiketle
Önlem 4: İlk 2 hafta günlük bulmacalar maksimum "kolay-orta" olsun
```

**R5 — Niş Pazar**
```
Önlem 1: Oyunun çekirdeğini, futbol bilgisi gerektirmeyecek şekilde
         test et (takım A/B/C/D formatı)
Önlem 2: Futbol dışı bulmaca topluluklarına (Wordle/Sudoku subreddits)
         yönelik soft marketing
Önlem 3: Kreator içerikleri için "puzzle of the day" embed özelliği
Önlem 4: Büyüme durur ise mekanik çıkarımı farklı sporlara uygula
```

---

## 16. Post-MVP Yol Haritası

### Ay 4-6: Derinleşme

```
▸ Premium Abonelik lansman
▸ Gerçek tarihsel turnuva bulmacaları (UEFA veri ortaklığı araştır)
▸ 5 takımlı lig grubu formatı (zorluk seviyesi uzman)
▸ Kişiselleştirilmiş zorluk önerisi (kullanıcı geçmişine göre)
▸ Türkçe ve İspanyolca dil desteği
```

### Ay 6-12: Genişleme

```
▸ Sezon Modu: Gerçek lig takvimiyle bağlantılı haftalık içerik
▸ Arkadaşa Meydan Okuma: Aynı bulmacayı rekabetçi çözme
▸ Liderboard: Haftalık en hızlı çözücüler
▸ Kullanıcı Yapımı Bulmacalar: Topluluk içerik oluşturma
▸ Web versiyonu (tarayıcıda oynanabilir)
```

### Ay 12+: Platform Dönüşümü

```
▸ Basketbol adaptasyonu (NBA/EuroBasket grup formatları)
▸ Türkiye B2B: Eğitim oyunu olarak okullara sunum
   (İstatistik okuma becerisini gamifiye eden ürün)
▸ API: Diğer uygulamaların "bulmaca widget" kullanması
▸ Beyaz Etiket: Spor medya markalarına (ör. Fanatik, ESPN)
   özel branded puzzle deneyimi
```

---

## Ekler

### Ek A: Bulmaca Üreteci Test Sonuçları (Beklenen)

```
1,000 deneme üretiminden beklenen çıktılar:
  Teklik testi geçen     : ~350 (%35)
  Kolay sınıflandırılan  : ~140 (%40)
  Orta sınıflandırılan   : ~140 (%40)
  Zor sınıflandırılan    : ~70  (%20)
  Ortalama üretim süresi : ~35ms / bulmaca
```

### Ek B: MVP Maliyet Tahmini (Aylık)

```
Hosting (Railway Pro)     : $20/ay
Veritabanı (Railway PG)   : $10/ay
Redis (Railway)           : $10/ay
Monitoring (Sentry Free)  : $0
Analytics (PostHog Free)  : $0
App Store yıllık ücret    : $99/yıl (~$8/ay)
Play Store tek seferlik   : $25

TOPLAM (ilk 3 ay)         : ~$50-60/ay
```

### Ek C: Oyun İçi Dil ve Ton Kılavuzu

```
Ses tonu    : Dostane, teşvik edici, hiçbir zaman aşağılayıcı değil
Hata mesajı : "Bir çelişki var — bakalım hangisi?" (suçlayıcı değil)
Zafer       : "Mükemmel çıkarım!" / "Harika iş!" (kısa ve samimi)
Tutma       : Hiçbir zaman "Sen çözemedim, devam et mi?" formatı kullanma
İpucu       : "Bir ipucu ister misin?" değil, "Zorlandın mı? Yardım edelim."
```

### Ek D: Başarılı Günlük Bulmaca Paylaşım Formatı

```
ScoreLogic #1 ⚽
🟩⬜🟩🟩🟩⬜
✅ 4/6 doğru — 6:23 sürede
🔥 Seri: 5 gün
scorelogic.app/puzzle/1

[Renk anlamı]
🟩 = İlk denemede doğru
🟨 = 2-3 denemede doğru
🟥 = 4+ denemede doğru
⬜ = İpucu kullanıldı
```

---

*Bu doküman yaşayan bir belgedir. Her sprint sonunda güncellenmesi önerilir.*
*Sürüm: 1.0 | Haziran 2026*
