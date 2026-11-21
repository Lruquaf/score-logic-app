# P01–P20 mobil parite kontrol listesi

> 20 Kasım 2026 · Faz 6 kaynak envanteri, Faz 7 sertleştirme ve Faz 8 kabul hazırlığı. Aşağıdaki “uygulandı” durumu signed iOS/Android cihaz kabulü değildir.

Özellik tanımları [ana planla](../mobil-uygulama-donusum-plani-2026-11-12.md) ve [karar kaydındaki sahiplikle](karar-kaydi.md) aynı kalır. Tam ekran/state envanteri [Faz 6 raporundadır](faz-6-uygulama-raporu-2026-11-14.md). Yerel testlerde OS API’leri mock/test port kullanabilir; bu nedenle cihaz sütunu ayrıca tutulur.

| ID | Kaynakta mevcut karşılık | Yerel kanıt | Açık kabul kapısı |
|---|---|---|---|
| P01 Guest | Kalıcı installation/session, açık yeni guest, daily/pack girişleri | Core identity/runtime; gerçek HTTP guest/merge/logout smoke | İlk kurulum, gerçek OS vault ve reinstall matrisi |
| P02 Home/rehber | Attempt başlatmayan preview, devam, yeniden açılan kurallar/örnekler | Player component Home GET/no command + Help/back | Gerçek cihaz okunurluk ve görev denemesi |
| P03 Daily | Server business date, canonical puzzle identity | DB integration İstanbul gün devri; lifecycle/core | Farklı cihaz timezone’ları ve background gece yarısı |
| P04 Campaign | 5×30, canonical unlock, devam, Previous/Next pack geçişleri | Player pack/grid/locked/neighbor testleri; beş pack HTTP smoke | Telefon/tablet gerçek gezinti ve scroll |
| P05 Prefill/feedback | Pack/level verilen skorlar ve public feedback politikası | Contract/root testleri; beş pack HTTP fixture matrisi | İki platformdaki bütün yardım varyantları |
| P06 Final Table | Sabit bütün metrikler, yatay scroll, accessibility etiketleri | Gameplay component testleri | VoiceOver/TalkBack ve büyük yazı görsel kabul |
| P07 Skor/not | 0–19/boş, 12 hücre, given/hint readonly, ayrı maç notu | Core validation + etkileşimli score/note component testleri | Gerçek numeric keyboard/IME/selection |
| P08 Autosave | Owner draft/cache/outbox, revision/conflict arşivi | Gerçek disk SQLite migration/atomicity ve Node SIGKILL restart | Gerçek OS kill, app upgrade ve storage failure |
| P09 Hint | Açık eylem, bir hücre/ücret, immutable retry, başarıda kapanma | Core/UI Hint; gerçek HTTP lost receipt | Cihaz sheet/foreground etkileşimi |
| P10 Check | Server solve-any, pack feedback disclosure | Alternatif doğru çözüm DB integration; core/UI + beş pack HTTP | İki platform klavye/feedback kabulü |
| P11 Reveal | Açık onay, ayrı terminal, normal unlock üretmeme | DB/core/UI + gerçek HTTP lost reveal | Cihaz confirmation/restart |
| P12 Analyze | Beginner 1–3 GUIDED / 4–15 ASSISTED, snapshot ve SAT/UNSAT/UNKNOWN | Policy/integration + core stale/replay + gameplay UI | İki platformda ekran/assistive technology |
| P13 Replay | Yeni attempt, official/first/best/unlock korunumu | DB idempotent replay ve gerçek HTTP lost replay/reveal | Cihaz lifecycle/confirmation |
| P14 Süre/gün devri | Server süre, monotonic display, ayrı daily draft, >120 dk | DB 121 dk Check ve daily rollover; clock/lifecycle core | Uzun gerçek cihaz background/timezone testi |
| P15 Stats | 15 canonical metrik, null süre/gerçek sıfır ayrımı | Stats component + real HTTP account aggregate | Aynı hesap web/iOS/Android karşılaştırması |
| P16 Son kayıtlar | Son altı puzzle aggregate kaydı, tarih/durum/süre ve açma | Component altı kayıt + real HTTP history | Cihaz uzun metin/scroll; ortak geçmiş kabulü |
| P17 Hesap | Native login/register/guest devam, merge, intent, revoke, silme recovery | Core + DB + navigation UI + lost register/logout/delete HTTP/disk smoke | Gerçek OS vault; A→guest→B ortak geçmiş; backup/restore |
| P18 Paylaşım | Canonical attempt, kimlik/süre/hint/HTTPS davet; selectable fallback, cancel | Formatter/core + share failure/cancel UI; allowlist link testleri | Native sheet/iPad anchor, verified links installed/absent |
| P19 Hata/yardım | In-app help/privacy/support; ortak loading/empty/offline/cache/session/storage/retry | Shell/resource/player component ve owner isolation testleri | Accessibility, ağ kesintisi/OS hata kabulü; gerçek support adresi |
| P20 Operasyonlar | Mevcut backend content/QA/editorial/buffer/backup alanları korunur; migration/session/deletion cleanup genişletildi | Root unit/integration/build, yalnız yerel migration | Production readiness/cron/buffer/restore/deletion kararları ve rollout kanıtı |

## Teslim kontrolü

- [x] P01–P19 oyuncu davranışlarının native kaynak karşılığı var; zorunlu oyun/hesap özelliği yalnız website’e bırakılmadı.
- [x] P20 backend sorumluluğu korundu; consumer uygulamaya yeni admin özelliği eklenmedi.
- [x] Faz 6 ekran/state envanteri, test komutları ve deployment migration bağımlılığı kaydedildi.
- [x] Yerel: 75 native core, 33 component, 348 root unit, 52 DB integration başarılı; iki bootstrap testi koşullu skip olarak açıkça ayrıldı.
- [x] Local production backend ve iOS/Android Hermes export başarılı.
- [ ] iOS signed build + gerçek iPhone/iPad parite kabulü.
- [ ] Android signed build + gerçek telefon/tablet/foldable parite kabulü.
- [ ] Production migration/API rollout, readiness/cleanup/backup-restore ve domain association kanıtı.
- [ ] Hukuki privacy/store declaration, support işletimi, beta ve store kabulü.

Bu liste cihaz veya production kanıtı olmadan otomatik olarak tamamlanmış sayılmaz. Faz 7–10’da her açık kapı için artifact/test kaydı eklenir; kaynak testleri gerçek cihaz kabulü yerine işaretlenmez.


## Faz 7 sertleştirme kanıtı

[Entegrasyon raporu](faz-7-entegrasyon-raporu-2026-11-14.md): P03/P14 için offline saat kayması, P08/P17 için memory-pressure/vault/reinstall ayrımı, P09/P10 için iki bağımsız gerçek session ile Hint/solve receipt tekliği, P18 için cold/warm/auth link ve clipboard, P19/P20 için opt-in diagnostics/source-map ve association kontrolleri eklendi.

Güncel yerel sayılar **86 core, 39 component, 353 root unit, 52 DB integration**; iki koşullu bootstrap skip. Bunlar üstteki Faz 6 tarihsel sayılarını genişletir. Gerçek OS/device/production kutuları açık kalır. Signing metadata henüz yoktur ve kullanıcı bunlar olmadan devam edilmesini istedi. [Runbook](native-entegrasyon-runbook.md) bu değerlerin nereden alınacağını ve açık cihaz testlerini kaydeder.

## Faz 8 kabul hazırlığı

[Faz 8 raporu](faz-8-kabul-raporu-2026-11-20.md): P06/P07/P09/P19 için screen-reader metinleri, sheet odağı/izolasyonu, Reduce Motion, form/keyboard ve kaynak kontrastı; P14 için timer render izolasyonu; P08/P17 için receipt sorgusu sırasında owner değişimi koruması eklendi. 20 Kasım native doğrulaması **92 core ve 49 component** başarılı. Önceki Faz 8 DB koşularında 54 + ayrı boş DB'de 2 bootstrap, web'de 353 unit ve 60 browser başarılıdır.

[Kabul JSON'u](acceptance/phase8-record.json) 39 gerçek senaryoyu pending tutar; doğrulayıcı kaynak/Jest testlerinden cihaz kabulü üretmez. İlk Android telefon USB'de tanındı; [kurulum/test adımları](android-cihaz-kurulumu.md) sürüyor. Üstteki gerçek cihaz/production kutuları kanıt geldikçe güncellenir.

İlk Android debug smoke'u gerçekleşti: gerçek APK kuruldu; P01–P04 temel yüklemeleri, P09 tek Hint/kapalı modal ve P08/P17 process-stop sonrası skor/not/hint/owner korunumu ürün sahibiyle doğrulandı. Bu tek cihaz/debug kanıtı tam release kutularını kapatmaz. Kullanıcı kapsamlı UI/200% çalışmasını kurulum/çalışabilirlik sonrasına erteledi; başlangıç font ayarı geri yüklendi.

Son ek: Test backend şifreli yedek ve 22 migration ile yayımlandı; health 200, kimliksiz v1 401 ve sentetik HTTPS/disk gameplay/receipt/refresh/cleanup smoke geçti. Gömülü JS'li ARM64 internal APK, yerel API/Metro/DB kapalı ve USB çıkarılmışken ürün sahibiyle doğrulandı; Home/Daily/Campaign/Hint devamı çalışıyor. [Rollout](acceptance/railway-test-rollout-2026-11-20.json) ve [APK kanıtı](acceptance/android-internal-artifact-2026-11-20.json) tek Android internal kabulünü kaydeder. Production rollout/operasyon ve iOS/tam cihaz matrisi kutuları açık kalır.
