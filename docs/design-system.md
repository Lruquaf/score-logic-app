# ScoreLogic Design System

## Editorial Sports Puzzle v1

Bu doküman ScoreLogic arayüzünün görsel dilini, layout kararlarını, tipografi sistemini, component davranışlarını ve içerik/copy standardını tanımlar.

Amaç, uygulamayı kutu kutu dizilmiş amatör bir dashboard görüntüsünden çıkarıp; özgün, şık, sade ve hafif eğlenceli bir futbol mantık bulmacası deneyimine dönüştürmektir.

---

## 1. Tasarım Pozisyonu

### 1.1 Ürün Hissi

ScoreLogic bir spor istatistik paneli değildir. Bir futbol tablosunun içine gizlenmiş mantık bulmacasını çözdüren premium bir puzzle ürünüdür.

Arayüz şu hissi vermelidir:

- Sakin ama sıkıcı değil.
- Futbol temalı ama forma, top, çim klişesine yaslanmayan.
- Analitik ama dashboard gibi soğuk olmayan.
- Kompakt ama sıkışık olmayan.
- Eğlenceli ama oyuncak gibi görünmeyen.

### 1.2 Ana Tasarım Cümlesi

> A refined football logic puzzle interface with editorial hierarchy, compact sports utility, and subtle match-day character.

Bu cümle tüm tasarım kararlarını yönlendirir.

### 1.3 Seçilen Yön

Nihai yön: **Editorial Sports Puzzle**

Bu yön iki kaynağın birleşimidir:

- **Clean Football Editorial:** premium, sakin, iyi tipografi, güçlü hiyerarşi.
- **Minimal Sports App:** hızlı kullanım, kompakt puzzle akışı, net aksiyonlar.

Bu sistemde ana sayfa ve istatistik sayfaları daha editorial hisseder. Puzzle çözme ekranı ise daha kompakt ve uygulama odaklıdır.

---

## 2. Tasarım Prensipleri

### 2.1 Fewer Boxes, Stronger Hierarchy

Mevcut tasarımdaki ana problem her bilginin ayrı kutu olarak sunulmasıdır. Bu, kullanıcının neye odaklanacağını belirsizleştirir.

Yeni prensip:

- Her bilgi kart olmak zorunda değildir.
- Kart yalnızca gerçek bir içerik grubu veya bağımsız bir aksiyon alanı varsa kullanılmalıdır.
- Küçük metrikler yatay kutucuklar yerine inline metadata, pill, divider veya compact stat strip olarak verilmelidir.
- Sayfa akışı önce ana iş, sonra destekleyici bilgi şeklinde kurulmalıdır.

### 2.2 One Screen, One Primary Job

Her sayfanın tek bir ana görevi olmalıdır.

- Home: kullanıcıyı bugünkü bulmacaya başlatmak.
- Daily: skorları çözmek.
- Stats: ilerlemeyi anlamak.
- Login: oturumu bağlamak veya anonim kullanıma devam etmek.

Ana görev dışındaki bilgiler görsel olarak daha düşük ağırlıkta olmalıdır.

### 2.3 Football as Structure, Not Decoration

Futbol teması doğrudan ikon, top, çim dokusu, stadyum görseliyle verilmemelidir.

Tema şu yollarla verilir:

- Yeşil vurgu rengi.
- İnce saha çizgisi benzeri divider ritmi.
- Tablo ve fixture akışı.
- Matchday terimleri.
- Skor inputlarında daha net sayısal vurgu.

Futbol görselliği atmosfer yaratmalı, arayüzü domine etmemelidir.

### 2.4 Quiet Interface, Clear Moments

Arayüz genel durumda sakin olmalıdır. Sadece önemli anlar güçlü görünmelidir:

- Puzzle completed.
- Check failed.
- Hint revealed.
- Active score cell.
- Primary CTA.

Bu sayede oyun içi geri bildirimler daha anlamlı hale gelir.

### 2.5 English Product Copy

Uygulama içindeki tüm kullanıcıya görünen metinler İngilizce olmalıdır.

Türkçe metinler yalnızca internal dokümanlarda, geliştirici notlarında veya bu tasarım dokümanında kullanılabilir.

---

## 3. Görsel Dil

### 3.1 Genel Atmosfer

Arayüz açık temalı kalmalıdır. Koyu tema veya neon spor ekranı kullanılmamalıdır.

Ana atmosfer:

- Warm off-white background.
- Deep green accents.
- Ink-like dark text.
- Thin separators.
- Muted secondary information.
- Occasional highlight states.

### 3.2 Görsel Anahtar Kelimeler

Kullanılması gereken kelimeler:

- Editorial
- Compact
- Calm
- Matchday
- Tactile
- Structured
- Refined
- Playful restraint

Kaçınılması gereken kelimeler:

- Dashboard
- SaaS
- Neon
- Gamer
- Corporate
- Card wall
- Generic AI UI

### 3.3 Görsel Ritim

Sayfa ritmi şu üç unsurdan oluşur:

- Büyük ve rahat başlık alanları.
- İnce çizgilerle ayrılmış kompakt içerik blokları.
- Sadece gerektiğinde kullanılan yüzeyler/paneller.

Her alanın kendine ait kalın border'lı bir kutuya dönüşmesi yasaktır.

---

## 4. Renk Sistemi

### 4.1 Palette

```css
:root {
  /* Base */
  --paper: #f7f5ef;
  --paper-soft: #fbfaf6;
  --surface: #ffffff;
  --surface-warm: #f1eee6;

  /* Text */
  --ink: #17211b;
  --ink-soft: #3c493f;
  --muted: #6f7a72;
  --faint: #9aa39c;

  /* Football green */
  --field: #2f6f45;
  --field-deep: #1f5535;
  --field-soft: #e7f1e9;
  --field-line: #c8dacd;

  /* Match accents */
  --chalk: #e8e0cf;
  --gold: #c99a2e;
  --blue: #315f8d;

  /* Feedback */
  --success: #2f6f45;
  --success-soft: #e7f1e9;
  --warning: #b7791f;
  --warning-soft: #fff4d7;
  --danger: #b7433f;
  --danger-soft: #fae8e6;

  /* Lines */
  --line: #ded8cc;
  --line-strong: #c9c1b4;
}
```

### 4.2 Renk Kullanım Kuralları

`--field` yalnızca şu yerlerde kullanılmalıdır:

- Primary CTA.
- Active score input.
- Completion state.
- Small brand accents.
- Very subtle page highlights.

`--danger` yalnızca final check sonrası görünmelidir. Skor yazarken anlık kırmızı hata gösterimi yapılmamalıdır.

`--gold` başarı/ödül anlarında çok kontrollü kullanılabilir. Ana renk haline gelmemelidir.

### 4.3 Background Rules

Sayfa zemininde tek düz beyaz kullanılmamalıdır. Hafif sıcak kağıt tonu tercih edilir.

Önerilen:

```css
body {
  background:
    linear-gradient(180deg, #fbfaf6 0%, #f3f0e8 100%);
}
```

Opsiyonel çok hafif saha çizgisi hissi:

```css
.page-shell {
  background-image:
    linear-gradient(90deg, rgba(47, 111, 69, 0.035) 1px, transparent 1px);
  background-size: 84px 84px;
}
```

Bu pattern yalnızca büyük sayfa zemininde ve çok düşük opaklıkla kullanılmalıdır.

---

## 5. Tipografi

### 5.1 Font Stack

Önerilen font sistemi:

- Display: **Fraunces**
- Body: **IBM Plex Sans**
- Numbers: **IBM Plex Mono**

Neden:

- Fraunces editorial ve özgün bir karakter verir.
- IBM Plex Sans okunabilir, ciddi ve uygulama hissi için dengelidir.
- IBM Plex Mono skor, süre ve tablo sayılarında güvenilir bir teknik netlik sağlar.

Alternatif:

- Display: Newsreader
- Body: Source Sans 3
- Numbers: IBM Plex Mono

### 5.2 Kullanım Kuralları

Display font yalnızca şuralarda kullanılmalıdır:

- Home hero heading.
- Page-level headings.
- Major empty/loading/error headings.
- Victory heading.

Body font tüm açıklama, navigation, label ve UI metinlerinde kullanılmalıdır.

Mono font yalnızca şu tip içeriklerde kullanılmalıdır:

- Scores.
- Timers.
- Table numeric columns.
- Compact stats.

Mono font uzun metinlerde kullanılmamalıdır.

### 5.3 Type Scale

```css
:root {
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  --text-xs: 0.75rem;     /* 12 */
  --text-sm: 0.875rem;    /* 14 */
  --text-md: 1rem;        /* 16 */
  --text-lg: 1.125rem;    /* 18 */
  --text-xl: 1.375rem;    /* 22 */
  --text-2xl: 1.75rem;    /* 28 */
  --text-3xl: 2.375rem;   /* 38 */
  --text-4xl: 3.25rem;    /* 52 */
}
```

### 5.4 Heading Rules

H1:

- Home: 48-64px desktop, 36-44px mobile.
- Daily: 28-36px desktop, 26-30px mobile.
- Stats: 36-48px desktop, 30-36px mobile.

H2:

- 24-30px.
- Fazla kullanılmamalı.

Labels:

- Uppercase kullanılabilir ama çok sık değil.
- Letter spacing düşük tutulmalı.
- Her alanı label ile boğmamak gerekir.

### 5.5 Copy Density

Metin miktarı azaltılmalıdır.

Kural:

- Home hero açıklaması maksimum 2 satır.
- Daily puzzle instruction maksimum 1 kısa cümle.
- Error mesajı maksimum 1 cümle.
- Hint mesajı maksimum 1-2 cümle.

---

## 6. Spacing, Radius, Elevation

### 6.1 Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
}
```

### 6.2 Radius

Radius küçük ve tutarlı olmalıdır.

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

Kullanım:

- Buttons: `--radius-md`
- Inputs: `--radius-sm`
- Large surfaces: `--radius-lg`
- Modals: `--radius-xl`

Pill yapılar yalnızca metadata veya filter benzeri alanlarda kullanılmalıdır. Her küçük bilgi pill olmamalıdır.

### 6.3 Elevation

Gölge çok sınırlı kullanılmalıdır.

```css
:root {
  --shadow-subtle: 0 1px 2px rgba(23, 33, 27, 0.06);
  --shadow-lift: 0 14px 40px rgba(23, 33, 27, 0.10);
}
```

Gölge kullanımı:

- Modal.
- Active board surface.
- Hover edilen ana CTA.

Her karta gölge verilmemelidir.

---

## 7. Layout Sistemi

### 7.1 Page Width

```css
.page-container {
  width: min(100% - 32px, 1180px);
  margin-inline: auto;
}
```

Daily puzzle gibi yoğun ekranlarda maksimum genişlik 1280px olabilir.

### 7.2 Page Structure

Standart sayfa yapısı:

```text
Header
Main
  Page intro
  Primary content area
  Secondary content area
Footer
```

Daily puzzle için:

```text
Header
Puzzle top bar
Puzzle workspace
  Fixtures / inputs
  Standings / reference
Feedback drawer or inline result
```

### 7.3 Kart Kullanımı

Kart kullanılabilecek durumlar:

- Daily puzzle ana workspace.
- Modal veya overlay.
- Home'da Today Puzzle preview.
- Stats'te büyük progress summary.

Kart kullanılmaması gereken durumlar:

- Her küçük stat.
- Her navigation item.
- Her tablo satırı.
- Her explanatory text.

### 7.4 Divider Kullanımı

Kutu yerine divider tercih edilmelidir.

Örnek:

```text
Daily Puzzle
June 18 · Medium · 4 teams
────────────────────────
Fixture rows
```

Divider görsel olarak kutudan daha sofistike ve daha az yorucudur.

---

## 8. Component Kuralları

### 8.1 Buttons

Primary button:

- Tek sayfada tercihen bir ana primary button.
- Daily puzzle'da ana primary: `Check`.
- Home'da ana primary: `Play Today`.

Secondary button:

- `Hint`
- `Reset`
- `View Stats`

Button text kısa olmalıdır.

Do:

- `Check`
- `Play Today`
- `Use Hint`
- `Try Again`

Don't:

- `Click here to check your answers`
- `Submit your current puzzle solution`

### 8.2 Inputs

Score inputları özel ele alınmalıdır.

Kurallar:

- Skor inputları normal form inputu gibi görünmemeli.
- Sayılar büyük, net ve merkezi olmalı.
- Active state yeşil outline veya underline ile gösterilmeli.
- Empty state sakin olmalı.
- Error state yalnızca final check sonrası görünmeli.

Önerilen görünüm:

```text
ARS   [ 2 ] - [ 1 ]   CHE
```

veya daha editorial:

```text
ARS      2  -  1      CHE
```

### 8.3 Tables

Standings table arayüzün en önemli referans objesidir. Dashboard tablosu gibi değil, maç programı/lig tablosu gibi görünmelidir.

Kurallar:

- Header küçük ve muted.
- Takım adı daha güçlü.
- Numeric columns mono.
- Row height kompakt ama okunabilir.
- Çok fazla border yok.
- Vertical grid lines kullanılmamalı veya çok silik olmalı.
- Zebra stripe kullanılacaksa çok düşük kontrastlı olmalı.

Kolon standardı:

```text
Team  P  W  D  L  GF  GA  Pts
```

GD kolonu gösterilmeyecekse bu karar tutarlı kalmalıdır.

### 8.4 Metadata

Metadata kart değil, satır veya pill olarak görünmelidir.

Örnek:

```text
Daily Puzzle · Medium · 6 fixtures · Saved
```

veya:

```text
June 18
Medium
4 teams
```

### 8.5 Feedback

Feedback üç seviyeye ayrılır:

- Passive: saved, filled count, timer.
- Corrective: check failed.
- Celebratory: solved.

Passive feedback küçük ve üst satırda olmalıdır.

Corrective feedback final check sonrası görünmeli, teknik olmamalıdır.

Celebratory feedback ayrı bir modal veya sakin bir completion panel olabilir.

### 8.6 Modals

Modal sadece gerçek odak değişimi gerektiğinde kullanılmalıdır:

- Victory.
- Hint selection.
- Confirm reset only if destructive.

Sıradan açıklamalar modal olmamalıdır.

---

## 9. Page-Level Design Specs

### 9.1 Home Page

Ana görev: kullanıcının bugünkü puzzle'a başlaması.

Layout:

```text
Hero
  Big headline
  Short explanation
  Primary CTA
  Secondary CTA

Today puzzle preview
How it works
Practice / archive teaser
```

Hero heading önerileri:

- `Find the hidden scores behind the table.`
- `A football table. Six missing scores. One logical solution.`
- `Solve the scoreline hidden in the standings.`

Hero body:

- `Use the final table to reconstruct every match result. No guesses, just football logic.`

CTA:

- Primary: `Play Today`
- Secondary: `See How It Works`

Tasarım:

- Büyük editorial heading.
- Sağda veya altta küçük fixture/table preview olabilir.
- Çok fazla açıklama metni olmamalı.
- Practice alanı ana hero ile yarışmamalı.

### 9.2 Daily Puzzle Page

Ana görev: skorları çözmek.

Desktop layout:

```text
Puzzle intro row
  Daily Puzzle
  June 18 · Medium · Saved
  Timer / Check

Workspace
  Left: Fixture input list
  Right: Standings reference

Feedback/result area
```

Kolon oranı:

- Fixtures: 52%
- Standings: 48%

Alternatif:

- Fixtures: minmax(520px, 1fr)
- Standings: minmax(420px, 0.9fr)

Mobile layout:

```text
Top bar
Fixtures
Standings
Feedback
```

Daily page'de kaçınılacak şeyler:

- Üstte 5-6 kutucuk halinde metrik göstermek.
- Her maç satırını ağır kart yapmak.
- Numpad göstermek.
- Skor yazarken constraint hatası göstermek.
- Teknik hata mesajları.

Daily page'de kullanılacak şeyler:

- Tek ana workspace yüzeyi.
- Kompakt status line.
- Sadece final check sonrası error panel.
- Skor inputlarında yüksek okunabilirlik.

Top bar copy:

- Title: `Daily Puzzle`
- Subtitle: `Reconstruct the fixtures from the final table.`
- Primary action: `Check`
- Secondary action: `Hint`
- Reset: `Reset Board`

Passive status examples:

- `4 of 6 filled`
- `Saved`
- `2 hints used`
- `03:42`

Check failed copy:

- `Some scores do not fit the table yet.`
- `Check the highlighted teams and adjust the scores.`

Violation copy:

- `ARS: Goals for do not match the table.`
- `CHE: Points do not match the table.`
- `MCI: Wins, draws, and losses do not match the table.`

Solved copy:

- `Solved.`
- `Every score fits the final table.`

### 9.3 Stats Page

Ana görev: kullanıcının ilerlemesini anlaması.

Layout:

```text
Stats intro
Main progress statement
Large summary block
Recent puzzles
Streak / completion details
```

Stats sayfası çok sayıda küçük metric card'a bölünmemelidir.

Önerilen ana metin:

- `Your puzzle form`
- `Track your solved puzzles, current streak, and recent attempts.`

Ana summary:

```text
You have solved 12 puzzles with a 5-day streak.
```

Metrikler bu cümlenin altında daha küçük şekilde yer alabilir.

### 9.4 Login Page

Ana görev: anonim ilerlemeyi kaybetmeden hesap bağlamak.

Layout:

```text
Left / top: product explanation
Right / center: sign in form
```

Copy:

- `Keep your puzzle history.`
- `Sign in to sync your streak, solved puzzles, and progress.`
- `Continue as guest`
- `Sign in`

Login sayfası da aynı tasarım dilini kullanmalı; ayrı bir auth template gibi görünmemelidir.

### 9.5 Loading, Empty, Error States

Loading:

- `Loading today’s puzzle`
- `Preparing the table...`

Empty:

- `No puzzles yet.`
- `Check back soon for a new challenge.`

Error:

- `We could not load the puzzle.`
- `Try refreshing the page.`

Hata metinleri teknik detay içermemelidir.

---

## 10. Copywriting Standard

### 10.1 Language

All user-facing interface copy must be English.

Bu kapsama girenler:

- Buttons
- Headings
- Empty states
- Error messages
- Hints
- Validation messages
- Table labels
- Navigation
- Modal content

### 10.2 Tone

Tone:

- Clear
- Short
- Confident
- Lightly playful
- Not childish

Avoid:

- Technical backend language.
- Long instructions.
- Excessive enthusiasm.
- Turkish-English mixture.

### 10.3 Vocabulary

Preferred:

- puzzle
- table
- fixtures
- scorelines
- standings
- check
- hint
- solved
- streak
- progress

Avoid:

- submit
- constraint
- payload
- validation
- mutation
- failed target distribution
- overwrite

### 10.4 Error Message Rules

Backend veya validator teknik mesajı doğrudan UI'a basılmamalıdır.

Teknik:

```text
ckscoreargteam000000000001 win/draw/loss distribution exceeded target
```

Kullanıcıya gösterilecek:

```text
ARS: Results do not match the table.
```

Genel hata:

```text
Something went wrong while saving. Your local board is still safe.
```

Completed replay conflict:

```text
This puzzle is already solved. You can replay it locally.
```

---

## 11. Motion

Motion az ama anlamlı olmalıdır.

Kullanılacak yerler:

- Page entrance: çok hafif fade/translate.
- Active score cell: subtle focus transition.
- Check result: feedback panel reveal.
- Victory: short celebratory reveal.
- Hint: slide/fade.

Kullanılmayacak yerler:

- Her kart hover animasyonu.
- Sürekli pulse.
- Fazla spring hareketi.
- Skor inputlarında dikkat dağıtan animasyon.

Timing:

```css
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--duration-fast: 120ms;
--duration-normal: 180ms;
--duration-slow: 280ms;
```

---

## 12. Accessibility

### 12.1 Contrast

Tüm text ve interactive states WCAG AA kontrastını karşılamalıdır.

Yeşil zemin üstünde beyaz metin kullanılacaksa kontrast kontrol edilmelidir. `--field` rengi primary button için yeterince koyu tutulmalıdır.

### 12.2 Keyboard

Daily puzzle skor alanları klavye ile çözülebilir olmalıdır.

Gerekenler:

- Tab order mantıklı.
- Arrow key navigation varsa tutarlı.
- Active cell görünür.
- Check button keyboard-accessible.

### 12.3 Screen Reader

Score inputs anlamlı label'a sahip olmalıdır.

Örnek:

```text
Arsenal home score against Chelsea
Chelsea away score against Arsenal
```

Hatalar final check sonrası `aria-live="assertive"` ile duyurulabilir.

---

## 13. Responsive Rules

### 13.1 Breakpoints

```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
```

### 13.2 Mobile Priorities

Mobile daily page sırası:

1. Title and check action.
2. Fixture inputs.
3. Standings.
4. Feedback.
5. Secondary metadata.

Stats veya streak bilgisi fixture inputlarının önüne geçmemelidir.

### 13.3 Desktop Priorities

Desktop daily page iki kolon olmalıdır:

- Sol: skor girişi.
- Sağ: tablo referansı.

Header alanı aşırı yüksek olmamalıdır. Kullanıcının mümkün olduğunca hızlı puzzle workspace'i görmesi gerekir.

---

## 14. Implementation Rules

### 14.1 CSS Token Strategy

Tüm ana renk, font, radius, spacing değerleri `app/globals.css` içinde CSS variable olarak tutulmalıdır.

Component içinde magic color kullanılmamalıdır.

Do:

```tsx
className="text-[var(--ink)] border-[var(--line)]"
```

Don't:

```tsx
className="text-[#17211b] border-[#ded8cc]"
```

### 14.2 Component Refactor Priority

Uygulama sırası:

1. Global tokens and font loading.
2. Shared layout shell/header/footer.
3. Button/input/table primitives.
4. Daily puzzle layout.
5. Home page.
6. Stats page.
7. Login/loading/error states.
8. Copy cleanup.

### 14.3 Component Anti-Patterns

Kaçınılacaklar:

- `panel` class'ını her şeye vermek.
- Her metrik için ayrı bordered card.
- Aynı ekranda 3'ten fazla görsel ağırlıklı CTA.
- Aynı satırda çok fazla pill.
- Color-coded UI without hierarchy.
- Mixed Turkish/English copy.

### 14.4 Design QA Checklist

Her sayfa için kontrol:

- Sayfanın ana işi 3 saniyede anlaşılıyor mu?
- İlk bakışta tek bir ana odak var mı?
- Gereksiz kutular kaldırıldı mı?
- Text yoğunluğu azaltıldı mı?
- Tüm copy İngilizce mi?
- Primary CTA net mi?
- Mobile layout aynı önceliği koruyor mu?
- Score/table okunabilir mi?
- Error states teknik detay içermiyor mu?

---

## 15. Component Specs

### 15.1 App Header

Header sade olmalıdır.

Desktop:

```text
ScoreLogic        Daily   Stats        Streak 5   Sign in
```

Mobile:

```text
ScoreLogic                         Menu
```

Header yüksekliği 56-64px aralığında kalmalıdır.

### 15.2 Puzzle Top Bar

Eski çok kutulu status alanı yerine tek satır veya iki satırlı kompakt bar.

```text
Daily Puzzle
June 18 · Medium · 4 of 6 filled · Saved

[Hint] [Check]
```

Desktop'ta aksiyonlar sağa alınabilir.

### 15.3 Fixture List

Fixture list bir kartlar grid'i değil, maç satırlarından oluşan bir çalışma alanıdır.

Örnek:

```text
Fixtures

ARS              [  ] - [  ]              CHE
LIV              [  ] - [  ]              TOT
MCI              [  ] - [  ]              NEW
```

Satırlar:

- 56-64px yüksekliğinde.
- İnce divider ile ayrılmış.
- Hover state çok hafif.
- Active score input belirgin.

### 15.4 Standings

Standings daha sessiz bir referans alanıdır.

```text
Final Table

Team       P  W  D  L  GF  GA  Pts
Arsenal    3  2  1  0   7   3    7
Chelsea    3  1  1  1   4   4    4
```

Kurallar:

- Table başlığı `Final Table` olmalı.
- Numeric values mono veya tabular.
- Highlight sadece check sonrası.

### 15.5 Feedback Panel

Feedback panel her zaman görünmemelidir.

Görünür durumlar:

- Check failed.
- Hint used.
- Puzzle solved.
- Save problem.

Failed:

```text
Some scores do not fit the table yet.
Check the highlighted teams and adjust the scorelines.
```

Solved:

```text
Solved.
Every score fits the final table.
```

### 15.6 Victory Modal

Victory modal abartılı olmamalı.

```text
Solved in 03:42
Every fixture fits the final table.

Hints used: 1
Share result
Play another
```

---

## 16. Final UI Copy Set

### Navigation

- `Home`
- `Daily`
- `Stats`
- `Sign in`
- `Guest`

### Home

- `Find the hidden scores behind the table.`
- `Use the final standings to reconstruct every match result. No guesses, just football logic.`
- `Play Today`
- `See How It Works`
- `How it works`
- `Read the table`
- `Fill the fixtures`
- `Check the logic`

### Daily

- `Daily Puzzle`
- `Reconstruct the fixtures from the final table.`
- `Fixtures`
- `Final Table`
- `Hint`
- `Check`
- `Checking...`
- `Reset Board`
- `Saved`
- `Saving`
- `Not saved`
- `filled`
- `hints used`

### Feedback

- `Some scores do not fit the table yet.`
- `Check the highlighted teams and adjust the scorelines.`
- `Solved.`
- `Every score fits the final table.`
- `We could not save your progress. Your local board is still safe.`
- `This puzzle is already solved. You can replay it locally.`

### Stats

- `Your puzzle form`
- `Track your solved puzzles, current streak, and recent attempts.`
- `Current streak`
- `Solved puzzles`
- `Recent puzzles`
- `Best time`

### Login

- `Keep your puzzle history.`
- `Sign in to sync your streak, solved puzzles, and progress.`
- `Continue as guest`
- `Sign in`

---

## 17. Definition of Done

Tasarım sistemi uygulanmış sayılmak için:

- Tüm kullanıcıya görünen metinler İngilizce.
- Daily page çok kutulu dashboard görünümünden çıkmış.
- Fixture ve standings alanları güçlü iki kolonlu workspace olarak çalışıyor.
- Header/status alanı kompakt ve düşük ağırlıklı.
- Renk sistemi CSS token'lara bağlanmış.
- Font sistemi uygulanmış.
- Mobile layout kullanılabilir.
- CSS asset doğru yükleniyor.
- `type-check`, `lint`, `build` temiz.
- Kritik puzzle akışı e2e veya manuel smoke test ile doğrulanmış.

