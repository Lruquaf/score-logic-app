# Decision Log

## Karar Kaydi Formati

Her karar su sorulari cevaplar:

- Celiski neydi?
- Hangi kaynaklarda farkli tarif edildi?
- Nihai karar ne?
- Gerekce ne?
- Koda etkisi ne olacak?

## D-001: Platform Kaynagi Web Olacak

- Celiski:
  MVP dokumani mobil uygulama ve Express backend oneriyor. Teknik dokuman ise Next.js 15 App Router tabanli bir web uygulamasi tarif ediyor.
- Karar:
  Uygulama kaynagi Next.js 15 web mimarisi olacak.
- Gerekce:
  Repo hedefi dogrudan web uygulamasi. Iki farkli platform mimarisini birlikte tasimak gereksiz karar borcu olusturur.
- Koda etkisi:
  `app/` tabanli route yapisi, route handlers, server components ve web-first tasarim esas alinacak.

## D-002: Engineering MVP Kapsami Product MVP'den Daha Dar Olacak

- Celiski:
  Product MVP dokumani campaign mode, tutorial, stats ve monetization iceren daha genis bir alan tanimliyor.
  Teknik dokuman bunlari ayni repoda onerse de uygulama sifirdan baslayacak.
- Karar:
  Ilk implementasyon dilimi sadece playable daily puzzle olacak.
- Gerekce:
  Bu projede teknik riskin cekirdegi engine dogrulugu, DTO tasarimi ve puzzle progress akisinda. Dikey bir ilk dilim riski dusurur.
- Koda etkisi:
  Campaign ve stats veri modeli korunacak, ancak ilk fazlarda UI teslim kriteri olmayacak.

## D-003: Puzzle Veri Modeli 3 Katmana Ayrilacak

- Celiski:
  Teknik dokuman Prisma modeli, engine tipi ve client tipi arasinda ayni isimleri farkli anlamlarda kullaniyor.
- Karar:
  Su uc katman acikca ayrilacak:
  `PuzzleRecord`, `PuzzleEntity`, `PuzzlePublicDTO`.
- Gerekce:
  `solution` gibi private alanlarin sizmasini onlemek ve mapping katmanini explicit hale getirmek gerekiyor.
- Koda etkisi:
  Prisma sorgularindan donen nesneler dogrudan client'a gonderilmeyecek.

## D-004: `solution` Public Response Icinde Hicbir Zaman Yer Almayacak

- Celiski:
  Teknik dokuman cozumun public response'tan cikarilacagini soylerken bazi tipler bu siniri yeterince acik ifade etmiyor.
- Karar:
  `solution`, sadece server-private DTO ve internal domain entity icinde bulunacak.
- Gerekce:
  Oyun butunlugu burada kirilir. Bu sinir baglayici olmalidir.
- Koda etkisi:
  Cache, route handler ve page loader katmanlarinda public/private DTO ayrimi zorunlu olacak.

## D-005: Submit Dogrulamasi Exact Solution Eslesmesi Yapacak

- Celiski:
  Teknik dokumandaki `validateCompleteSolution` yalnizca tum maclar dolduruldu mu ve kisit ihlali var mi diye bakiyor.
  Bu, bazi teorik durumlarda exact solution eslesmesi yapmadan "dogru" kabul yaratabilir.
- Karar:
  Submit sirasinda sunucu iki kontrol yapacak:
  1. gonderilen tum skorlar semantik olarak gecerli
  2. gonderilen skorlar kayitli `solution` ile birebir ayni
- Gerekce:
  "tek cozumlu bulmaca" taahhudu sunucu tarafinda exact match ile korunmali.
- Koda etkisi:
  `validatePartialSolution` ve `validateCompleteSolution` ayrimi korunacak ama submit route'u `solution` map karsilastirmasi da yapacak.

## D-006: Progress Kaydi Icin Ayrik Endpoint Olacak

- Celiski:
  Teknik dokumanda `currentState` veritabaninda var ancak bunu yazan bir endpoint tarif edilmiyor.
  MVP dokumani local-first sync mantigi tarif ediyor.
- Karar:
  `PUT /api/puzzles/[id]/progress` canonical progress kaydi icin zorunlu endpoint olacak.
- Gerekce:
  Autosave ve refresh sonrasi devam etme davranisi explicit bir yazma akisina ihtiyac duyar.
- Koda etkisi:
  Store yalnizca local persist ile yetinmeyecek; debounce edilmis remote save de yapacak.

## D-007: Local Store ve Remote Progress Ayrilacak

- Celiski:
  Teknik dokumandaki Zustand store hem runtime UI state'i hem de kalici progress'i tek yapida tasiyor.
- Karar:
  Asagidaki ayrim zorunlu:
  `remote progress`: canonical input state, hints used, timestamps
  `local UI state`: selected cell, open modal, temporary animation flags
- Gerekce:
  UI state'in veritabanina yazilmasi gereksiz. Ayrica restore akisini kirletir.
- Koda etkisi:
  Persist middleware sadece belirlenmis alanlari serialize edecek; hydration'da `Set` benzeri yapilar yeniden kurulacak.

## D-008: `Set` ve Benzeri Yapilar Public/Stored State'te Array Olarak Tasinacak

- Celiski:
  Teknik dokuman `Set` kullaniyor ama persist katmaninda geri donus mantigi tarif etmiyor.
- Karar:
  Store icinde runtime icin `Set` kullanilabilir; kalici state semasi ise array tabanli olacak.
- Gerekce:
  JSON ve DB uyumlulugu.
- Koda etkisi:
  `revealedMatchIds` ve `completedMatchIds` canonical durumda `string[]` saklanacak.

## D-009: `user_stats` Materialized View Yerine Yazilabilir Aggregate Tablo Kullanilacak

- Celiski:
  MVP dokumani materialized view oneriyor, teknik dokuman ise Prisma ile mutable `UserStats` modeli kullaniyor.
- Karar:
  Faz 1-5 araliginda mutable `UserStats` tablosu kullanilacak.
- Gerekce:
  Prisma ile yazma ve okuma akisini basitlestirir. Materialized view refresh karmasikligini erken getirmez.
- Koda etkisi:
  Solve sirasinda stats transactional olarak guncellenecek.

## D-010: Auth Stratejisi Anonymous-First Olacak

- Celiski:
  Teknik dokuman NextAuth email/social auth tarif ediyor, MVP dokumani anonim kullaniciyi ayrik endpoint ile veriyor.
- Karar:
  Ilk oynanabilir dilimde cookie-backed anonymous user davranisi zorunlu, tam NextAuth login ise sonraki teslimlerde acilabilir.
- Gerekce:
  Oyun akisini test etmek icin hesap duvari gerekli degil. Progress kaydi icin anonim kimlik yeterli.
- Koda etkisi:
  `getOrCreateAnonymousUser()` davranisi erken fazlarda ana yol olacak.

## D-011: Hint Endpoint `POST` Olacak

- Celiski:
  MVP dokumani `GET /hint`, teknik dokuman `POST /hint` tarif ediyor.
- Karar:
  Hint endpoint `POST /api/puzzles/[id]/hint` olacak.
- Gerekce:
  Hint secimi ve mevcut kullanici girdileri request body gerektirir.
- Koda etkisi:
  `hintType` ve `currentInputs` body'de tasinacak.

## D-012: Campaign Veri Modelde Kalacak, Ilk Oynanabilir Dilimde UI Zorunlu Olmayacak

- Celiski:
  Urun hedeflerinde campaign erken onemli; teknik risk ve repo durumu ise once tek puzzle akisini destekliyor.
- Karar:
  `campaignOrder` veri modelde korunacak, ancak ilk teslimde campaign sayfasi kritik yol olmayacak.
- Gerekce:
  Domain'i kirpmadan UI kapsam borcunu ertelemek daha saglikli.
- Koda etkisi:
  Puzzle sorgulari `dailyDate` ve `campaignOrder` ayrimini destekleyecek, fakat ilk page seti minimum tutulabilecek.

## D-013: Puzzle Uretimi Ilk Oynanabilir Dilim Icin Runtime Zorunlulugu Degil

- Celiski:
  Teknik dokuman puzzle generator ve cron isi tanimliyor, ancak repo sifir durumda.
- Karar:
  Ilk oynanabilir slice seeded test puzzle'lari ile baslayacak; generator sonradan entegre edilecek.
- Gerekce:
  Oynanabilirligi engine dogrulugu ve API akisi uzerinden erken gostermek daha onemli.
- Koda etkisi:
  `scripts/generate-puzzles.ts` ve QA akisi sonradan eklenecek; ilk DB seed sabit puzzle verisi icerecek.
