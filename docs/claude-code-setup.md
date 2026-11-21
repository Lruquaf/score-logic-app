# Claude Code kurulumu

> Tarih: 21 Kasım 2026 · Kapsam: ScoreLogic ve diğer projeler için temel Claude Code düzeni.

## 1. Katmanlar

| Katman | Nerede | Ne var |
|---|---|---|
| Global (tüm projeler) | `~/.claude/` | Kişisel `CLAUDE.md`, kullanıcı kapsamında Superpowers + Context7, Playwright CLI |
| Proje (git'e girer) | `CLAUDE.md`, `.claude/`, `.mcp.json` | Proje kuralları, path-scoped rules, izinler, hook'lar, agent'lar, skill'ler, Next DevTools MCP, Expo plugin |
| Kişisel proje (git'e girmez) | `.claude/settings.local.json`, `CLAUDE.local.md` | Sadece sana ait izin/deneme ayarları |

## 2. Bu repoya eklenen dosyalar

- `CLAUDE.md` — stack, komutlar, dizin haritası, kanonik dokümanlar, kırmızı çizgiler, çalışma tarzı. `@AGENTS.md` importu korunur (Next.js bloğunu `next dev` yeniden yazar).
- `.claude/rules/` — yalnız ilgili dosyalarla çalışırken yüklenen kurallar: `mobile.md` (`apps/mobile/**`), `api.md` (API/services/contracts), `database.md` (prisma/db/scripts), `engine.md` (engine/puzzles/difficulty).
- `.claude/settings.json`
  - **allow:** type-check, lint, unit/integration testleri, mobil kontroller, git okuma komutları.
  - **ask:** `git push`, db deploy/release/push/editorial, ops backup/restore, `railway`, `eas`, `npm install`.
  - **deny:** `.env`, `.env.local`, `.local/secrets`, `.backups` okuma.
- `.claude/hooks/protect-files.mjs` — secret dosyalarına Read/Edit/Bash erişimini ve uygulanmış migration düzenlemesini engeller.
- `.claude/hooks/lint-edited-file.mjs` — Claude bir TS/JS dosyasını düzenleyince sadece o dosyada ESLint çalıştırır, hata varsa Claude'a geri verir.
- `.claude/agents/` — `security-reviewer`, `puzzle-integrity-auditor` (K20 çözüm sızıntısı), `contract-parity-checker` (`/api/v1` geriye uyumluluk). Hepsi salt okunur, Sonnet.
- `.claude/skills/verify` — değişen alana göre doğru kontrolleri çalıştırır (`/verify`).
- `.claude/skills/content-release` — puzzle içerik akışı; yalnız sen `/content-release` yazınca çalışır.
- `.claude/skills/run-mobile` — mobil uygulamayı çalıştırıp görsel doğrulama: design studio → Android USB cihaz → iOS simülatör (Xcode varsa) → Maestro akışları.
- `.claude/launch.json` — `web-local` (3007) ve `design-studio` (8082); masaüstü uygulamasının tarayıcı panelinde önizleme için.
- `.mcp.json` — Next DevTools MCP (Next 16 dev server'ına bağlanır; ilk açılışta onay ister).

## 3. Kurulum adımları

Önce mevcut değişiklikleri commit'le; sonra bu setup'ı ayrı bir commit olarak ekle.

**Durum (21 Kasım 2026):** `claude` CLI (`~/.local/bin`, PATH `~/.zshrc`'ye eklendi), Superpowers + Context7 (user) ve Expo (project) kuruldu; `~/.claude/CLAUDE.md` yazıldı. Kalan: Context7/Expo girişi, Playwright CLI (opsiyonel).

### 3.1 Global (bir kez, terminalde)

Plugin'ler yerleşik `anthropic-plugin-directory` marketplace'inden gelir (`claude plugin marketplace list`).

```bash
claude update                                   # Claude Code'u güncelle
claude plugin install superpowers@anthropic-plugin-directory --scope user
claude plugin install context7@anthropic-plugin-directory --scope user
npm install -g @playwright/cli@latest           # opsiyonel: tarayıcı otomasyonu (MCP yerine CLI)
```

Claude Code içinde `/mcp` ile Context7 girişini tamamla (ücretsiz kota var).

### 3.2 Bu proje (repo kökünde)

```bash
claude plugin install expo@anthropic-plugin-directory --scope project   # Expo skills + Expo MCP
playwright-cli install --skills                                       # Playwright skill'i .claude/skills'e
```

Sonra `claude` aç → `/mcp` → Expo hesabına giriş. Next DevTools için `npm run dev:local` açıkken çalışır.

İsteğe bağlı (web UI çalışırken):

```bash
npx skills add vercel-labs/agent-skills    # sadece react-best-practices + web-design-guidelines seç
```

### 3.3 Global `~/.claude/CLAUDE.md` önerisi

```markdown
# Personal defaults
- Reply in Turkish; keep code, commits and config in English.
- Before large changes, make sure the git tree is clean or work in a branch/worktree.
- Commit messages: imperative, specific (`fix(hint): keep requestId on retry`), never "fix fix".
- Prefer existing CLI tools (gh, rg, jq, git) over adding MCP servers.
- Ask before installing dependencies, running migrations against non-local DBs, or pushing.
```

## 4. Günlük kullanım

- Yeni iş = yeni oturum veya `/clear`. Uzun oturumda `/compact`. `/context` ile neyin yer kapladığına bak.
- Büyük özellik: plan mode (Shift+Tab) veya Superpowers brainstorming → plan → uygula. Küçük fix: direkt.
- Paralel işler için `git worktree` (Superpowers `using-git-worktrees`).
- İş bitmeden `/verify`; auth/API değişikliğinde "security-reviewer ile incele" de.
- `/memory` ile Auto Memory notlarını gözden geçir; kalıcı kural olacaksa `CLAUDE.md`'ye taşı.
- `/usage` ile tüketimi izle.

## 5. Şimdilik ertelenenler

| Araç | Ne zaman |
|---|---|
| Serena / Graphify | Kod tabanında gezinme belirgin şekilde yavaşlarsa |
| Caveman | `/usage` ölçümleri araç çıktısının çok token yediğini gösterirse |
| Claude-Mem | Auto Memory yetersiz kalırsa |
| Ponytail / Karpathy skills | Karpathy ilkeleri zaten `CLAUDE.md` "Working style" bölümünde |
| Chrome DevTools MCP | Ciddi web performans incelemesinde |
| GSD / ECC / gstack | Superpowers yerine ayrı bir projede deneme olarak |

Üçüncü taraf plugin/hook kurmadan önce kaynağına bak: hook'lar komut çalıştırır, MCP'ler veri dışarı gönderebilir.
