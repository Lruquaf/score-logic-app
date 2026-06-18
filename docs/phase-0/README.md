# Phase 0 Baseline

## Amaç

Bu klasor, ScoreLogic web uygulamasinin kod yazimina baslamadan once sabitlenmis teknik kararlarini, domain kontratlarini ve uygulama sirasini toplar.

Bu dokuman setinin amaci:

- MVP ve teknik dokuman arasindaki celiskileri kapatmak
- Faz 1 ve sonrasi icin baglayici veri ve API kontratlari tanimlamak
- "ne yapacagiz" sorusunu "ne sirayla ve hangi sinirlarla yapacagiz" seviyesine indirmek

## Kaynaklar

- [teknik-dokuman-scorelogic-web.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/teknik-dokuman-scorelogic-web.md)
- [mvp-dokumani-futbol-puzzle.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/mvp-dokumani-futbol-puzzle.md)

## Faz 0 Ciktilari

- [decision-log.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/docs/phase-0/decision-log.md)
- [domain-and-data-contracts.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/docs/phase-0/domain-and-data-contracts.md)
- [api-contracts.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/docs/phase-0/api-contracts.md)
- [build-sequence.md](/Users/yavuzselim/Desktop/Cursor/ScoreLogic/docs/phase-0/build-sequence.md)

## Faz 0 Karar Ozeti

1. Uygulamanin uygulama kaynagi web teknik dokumanidir.
   Mobil MVP dokumani urun hedefleri icin referanstir, ancak React Native, Express ve offline-first varsayimlari web MVP'ye tasinmayacaktir.

2. Ilk gelistirme dilimi "playable daily puzzle" olacaktir.
   Buna puzzle listeleme degil, tek gunluk bulmaca cekme, anonim oynama, autosave, submit, hint ve victory akisi dahildir.

3. Domain modeli 3 katmana ayrilacaktir.
   Database record, internal domain entity ve public API DTO birbirinden ayrilacaktir.

4. `solution` yalnizca server-private veri olarak ele alinacaktir.
   Client, route handler veya cache katmaninda public cevaplara karismayacaktir.

5. Submit dogrulamasi yalnizca "kisit ihlali yok" seviyesinde kalmayacaktir.
   Sunucu, gonderilen skorlarin kayitli cozumle birebir eslestigini dogrulayacaktir.

6. Progress persist iki kaynaga ayrilacaktir.
   Runtime UI state local store'da, canonical puzzle progress ise veritabaninda tutulacaktir.

7. Kampanya modu ve istatistik ekrani veri modeli icinde korunacak, ancak ilk oynanabilir dilimin zorunlu teslimi olmayacaktir.

## Engineering MVP Siniri

Asagidaki ozellikler ilk uygulama diliminde zorunludur:

- `GET /api/puzzles/daily`
- `GET /api/puzzles/[id]`
- `POST /api/puzzles/[id]/submit`
- `POST /api/puzzles/[id]/hint`
- `PUT /api/puzzles/[id]/progress`
- anonim kullanici cookie akisi
- puzzle ekrani
- standings table
- fixture grid
- numpad
- autosave + restore
- victory state

Asagidaki ozellikler desteklenecek ancak sonradan UI olarak acilabilir:

- streak yazma akisi
- kullanici aggregate stats
- campaign puzzle modeli

Asagidaki ozellikler Faz 0 itibariyla kapsam disidir:

- onboarding tutorial
- social share polish
- admin panel
- puzzle reporting UI
- production analytics ve sentry entegrasyonu
- monetization
- gercek offline campaign senkronizasyonu

## Faz 1 Giris Kriterleri

Faz 1'e gecmeden once asagidaki noktalar bu klasordeki dokumanlarla sabitlenmis olmalidir:

- public puzzle DTO tanimli
- private puzzle DTO tanimli
- progress state semasi tanimli
- auth davranisi tanimli
- submit ve hint endpointlerinin request/response semalari tanimli
- MVP ile post-MVP siniri net
- bilinen celiskiler kapatilmis

## Faz 1 Cikis Beklentisi

Faz 1 sonunda su altyapi calisiyor olmali:

- Next.js 15 app iskeleti
- TypeScript ve test altyapisi
- Prisma schema
- base design tokens
- env yapisi
- CI baslangic iskeleti

## Fazlar Arasi Uygulama Sirasi

1. Faz 0: karar ve kontratlar
2. Faz 1: bootstrap ve altyapi
3. Faz 2: engine
4. Faz 3: database ve query katmani
5. Faz 4: API
6. Faz 5: auth ve progress
7. Faz 6: state management
8. Faz 7: UI ve oyun ekrani
9. Faz 8: diger sayfalar
10. Faz 9: observability, performance, accessibility
11. Faz 10: hardening, CI, deploy

## Faz 0 Tamamlanmis Sayilma Kriteri

Faz 0, su sorularin cevabi repo icinde tekil ve tutarli hale geldiginde tamamlanmis sayilir:

- Public puzzle verisi tam olarak ne gonderiyor?
- Server hangi durumda bir cozumun dogru olduguna karar veriyor?
- Oyun durumu local ve remote'ta nasil saklaniyor?
- Anonim kullanici nasil olusuyor ve nasil ilerliyor?
- Hangi endpointler ilk oynanabilir dilim icin zorunlu?
- Hangi ozellikler bilerek erteleniyor?
