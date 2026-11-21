# ScoreLogic native development client

For the active UI/UX redesign, run root **`npm run design:studio`** and open
**http://localhost:8082** in the Mac browser. It renders the actual native UI with
isolated fixture services and compares it with the green scorebook direction.
See the [design system and screen plan](../../docs/mobile/ui-ux-tasarim-sistemi-2026-11-20.md).
The revised study uses local Figtree fonts and short functional labels. Final Table also stays pinned in the actual GameScreen: sticky on narrow screens, fixed beside the scrollable fixtures on wide screens. Chromium/WebKit tests exercise real scrolling in both layouts.
The installed standalone Android build remains a separate distribution.

This is the Expo / React Native client with the Phase 2–3 vertical slice and Phase 4 navigation/session/storage foundation and Phase 5 core gameplay parity, plus Phase 6 player screens and Phase 7 integration/resilience hardening.
It uses the versioned ScoreLogic HTTP API and native UI; it does not load the website
in a WebView. The existing Next.js application remains at the repository root.

The current client covers guest bootstrap, daily / campaign puzzle loading, score
and match-note editing, local drafts, explicit hints, Check, Reveal, replay, incoming
puzzle links, and system sharing of an official solved result. Four Home / Daily / Campaign / Stats tabs and puzzle / account / help stacks use React Navigation. Home previews the daily without starting an attempt, campaign offers all five packs and their levels, and Stats shows every canonical metric plus the six latest puzzle progress records. Native sign-in, registration, guest continuation, sign-out, confirmed account/guest deletion, privacy, support and build information are available. Saved navigation intent restores the puzzle or tab after authentication. Source parity is tracked in the [P01–P20 checklist](../../docs/mobile/parite-kontrol-listesi.md); signed-device acceptance remains open.

## Package and toolchain boundary

Run installation and Expo commands **inside `apps/mobile`**. This directory has its
own `package.json`, lockfile, React version, and `node_modules`. Do not run a mobile
dependency update from the root web package. The only shared source dependency is
the public `@scorelogic/contracts` package at `../../packages/contracts`.

| Dependency | Pinned version |
|---|---|
| Node | `22` in `.nvmrc` (verified with 22.22.2); package permits `>=22.13.0 <23` |
| Expo SDK | `58.0.25` |
| React Native | `0.88.1` |
| React / React types | `19.3.0` |
| TypeScript | `6.0.3` |
| SecureStore | `58.0.3` |
| SQLite / Linking | `58.0.17` |
| Crypto | `58.0.8` |
| Development client | `58.0.20` |
| System UI | `58.0.7` |
| Safe-area context | `5.11.1` |
| Zod | `4.6.6` |
| React Navigation native / tabs / native-stack | `7.5.1` / `7.21.0` / `7.21.0` |
| Native Screens / Expo Network | `4.30.1` / `58.0.5` |
| Jest / Jest Expo / RNTL | `30.5.2` / `58.0.14` / `14.1.0` |

SDK 58's initial minimum OS targets are **iOS/iPadOS 16.4** and **Android 7 / API 24**.
The SDK uses Android compile API 37 / target API 36 and requires Xcode 26.4 or later.
These are framework/build requirements, not evidence that every supported device
has been tested. [Official SDK 58 compatibility table](https://docs.expo.dev/versions/v58.0.0/).

Local iOS compilation needs full Xcode, its supported SDK/simulator runtimes, and
the native dependency toolchain. Physical iOS distribution also needs the owner's
signing access. Android needs Android Studio/SDK, an emulator or device, and a
compatible JDK; use the supported JDK 17 toolchain when preparing the local build
environment. EAS is an alternative build service and requires an owner-controlled
account/project and a separate cost/access decision.

The initial toolchain audit found Apple Command Line Tools and Java 23. As of
20 November, Android Studio, the required Android SDK packages and a project-local
JDK 17 are prepared, and a physical Samsung SM-G970F / Android 12 is authorized
over USB. Full iOS tooling/signing and release acceptance remain separate gates.
See the [Android setup guide](../../docs/mobile/android-cihaz-kurulumu.md).

## Development setup

From the repository root:

```sh
cd apps/mobile
nvm use
npm ci
cp .env.example .env
```

Use the version manager available on the machine if `nvm` is not installed. Check
`node --version` in this directory before installing; an unrelated global Node 25
installation is outside the selected SDK/toolchain matrix.

The local backend must already have its migrations, native-session signing key,
versioned API routes, and reviewed/test content configured. The web repository's
local setup is separate; starting Metro does not start PostgreSQL or Next.js.

The example configuration connects an iOS simulator / host process to the isolated
local API on port **3109**:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:3109
EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true
EXPO_PUBLIC_WEB_ORIGIN=https://score-logic-app-test.up.railway.app
EXPO_PUBLIC_SCHEME=scorelogic-dev
```

For the standard Android emulator, change the API URL to
`http://10.0.2.2:3109`; its own `127.0.0.1` refers to the emulator. The development
HTTP exception accepts only `localhost`, `127.0.0.1`, or `10.0.2.2`, and only in a
development runtime. A physical Android development device can use localhost with
`adb reverse` over USB; other devices and release builds need a reachable **HTTPS** backend. A deployed
web instance must receive the Phase 3 identity migrations, Phase 6 deletion-receipt migration, and `/api/v1` deployment before it
can serve this client; an existing website URL alone does not establish that.

Create and install the application's own development build after the native
toolchain is available:

```sh
npm run ios
# Or, for Android:
npm run android
```

For subsequent JS development with that build installed:

```sh
npm start
```

This starts Metro with `--dev-client`. Expo Go is not the acceptance target for
signing, native configuration, device storage, or verified app links.
[Development-build guidance](https://docs.expo.dev/develop/development-builds/introduction/).

## Validation commands

| Command | What it verifies |
|---|---|
| `npm run type-check` | The independent native TypeScript project and public contract integration |
| `npm test` | Core, owner/session/lifecycle, real disk SQLite migration/atomicity, and abrupt Node-process restart tests |
| `npm run test:components` | Native components and real navigator flows with Jest Expo OS mocks |
| `npm run doctor` | Expo project/config/dependency compatibility checks |
| `npm run export:native` | Metro/Hermes bundling for iOS and Android into ignored `dist/` |
| `npm run smoke:gameplay` | Five-pack real HTTP + disk SQLite gameplay/receipt/replay/unlock matrix against a localhost fixture backend |
| `npm run smoke:resilience` | Two independent real HTTP sessions + separate disk SQLite: offline conflicts, clock skew, concurrent Hint and lost solve reply |
| `npm run export:native:maps` / `npm run check:export` | Private maps plus matching Hermes Debug IDs for both platforms; excludes private engine/Prisma source |
| `npm run smoke:account` | Real localhost HTTP + temporary disk SQLite: lost registration/logout/deletion replies, merge, auth return intent, account stats and local owner cleanup |
| `npm run check:a11y` | Thirteen contrast pairs from the actual source palette; not rendered OS accessibility acceptance |
| `npm run device:android:check` | Selected Node/JDK/SDK packages and exactly one authorized physical Android device; serials are not printed |
| `npm run acceptance:init -- <path>` / `acceptance:check -- <path>` | Pending T01–T20 acceptance metadata, physical release evidence and performance budgets; not cryptographic attestation |
| `npm run benchmark:local -- <path>` | Raw Node-host SQLite baseline; excludes native bridge, rendering and physical-device performance |
| `npm run smoke:api` | The same client core against a real **localhost-only** backend; creates and cleans up a test guest |
| `npm run ios` / `npm run android` | Local native compilation and launch, once toolchains and targets are available |
| Root `npm run design:studio` / `npm run test:design:studio` | React Native Web design canvas; current/proposed views, actual viewport sizes, local fixture states, Chromium/WebKit tests |

The API smoke defaults to `http://127.0.0.1:3109`. Set `MOBILE_SMOKE_API_URL` only
for another localhost port. SecureStore uses a memory test port. Set `MOBILE_SMOKE_SQLITE=true` to use a temporary real disk SQLite database; the default gameplay port remains in memory. The smoke deliberately drops a committed hint reply, restores the controller, checks
that the receipt prevents another charge, completes the fixture, refreshes the
session, and deletes its test guest. It requires the isolated test fixture catalog;
it is not a driver for production or external deployments.

Optional source generation, using the installed local CLI:

```sh
npx --no-install expo prebuild --no-install
```

Generated `ios/`, `android/`, `.expo/`, `dist/`, local env files, and signing
credentials are ignored. Prebuild generates project sources; it does not compile,
sign, install, or run a native application. Export creates JavaScript/Hermes assets;
it does not produce a signed `.ipa` or `.aab`.

## Identity, data, and lifecycle behavior

- An installation secret and its first guest-command UUID are persisted in
  SecureStore **before** guest creation. An unknown response retries the same
  immutable request after restart.
- Session credentials and refresh-command state use the OS credential vault.
  Refresh rotation reuses the original token/command after a lost reply. Temporary
  login/register retry payloads also use this vault and are removed after a known
  result; passwords never belong in the gameplay database or logs.
- SQLite schema version 2 migrates version 1 atomically without clearing draft/outbox data. A future version or corrupt critical row blocks recovery rather than downgrading or deleting it. Conflict choices archive the original dirty draft, available to its owner in Account.
- SQLite stores owner-scoped public puzzle caches, score/note drafts, and one
  pending command per owner/puzzle. A command is persisted before network send;
  acknowledgement updates its draft and removes the command transactionally.
  Hint, Check, Reveal, and replay do not start a second action while one is unknown.
- Runtime schemas validate public wire data. Private solver and database modules
  are not imported into the mobile client. Given and previously hinted scores are
  protected when reconciling drafts; revision conflicts require an explicit choice.
- Saved score/note drafts survive a restart. A note still being edited in the note
  sheet is not committed until **Save note**. Local writes must finish before they
  are described as saved; an OS kill cannot guarantee completion of an uncommitted
  write.
- Official elapsed time uses the server's attempt start and terminal result. There
  is no 120-minute gameplay cap. A monotonic clock prevents device wall-clock changes from jumping the visible timer. Foreground, focused-puzzle polling and reconnect reload server time
  and the current daily identity; a new daily uses a separate draft/timer.
- Owner hydration completes before player screens appear. Account transitions lock edits before flushing all owner drafts, including from Home without a mounted board. A 401 cannot retry an old-owner command with a new owner token. Expired/unknown sessions do not create another guest automatically.
- The app reloads through `AppState` and Expo Network, accepts allowlisted public puzzle URLs, and
  uses the system share UI. Neither a share API result nor link parsing proves
  delivery or OS domain verification.

SQLite is not implicitly encrypted; credentials use SecureStore instead. The
SecureStore reinstall/backup behavior differs between iOS and Android, so reinstall
is not an anonymous-progress recovery guarantee.
[SecureStore behavior](https://docs.expo.dev/versions/latest/sdk/securestore/).

## Signing, domain ownership, and release guard

The defaults `dev.scorelogic.localpoc`, `scorelogic-dev`, and `ScoreLogic Dev` are
explicit local-development placeholders. They do not claim a registered production
identifier, domain association, or developer-account ownership.

`eas.json` defines `development`, iOS `simulator`, internal `preview`, and
`production` profiles. No cloud build or signing enrollment is triggered by keeping
these profiles in the repository. To use them, first obtain the owner's verified
application IDs, signing credentials, project access, and an approved EAS CLI/build
environment.

The production profile sets `MOBILE_RELEASE=true`. Configuration then rejects
development identifiers, the development scheme, a missing association host, or
non-HTTPS API configuration. Provide verified values through the build environment:

- `MOBILE_APPLICATION_ID`: registered iOS bundle / Android package identifier.
- `MOBILE_LINK_HOST`: controlled host that serves the correct AASA / assetlinks files.
- `EXPO_PUBLIC_SCHEME`: an explicitly chosen release scheme.
- `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN`: the configured HTTPS services.
- `EXPO_PROJECT_ID`: owner's actual EAS project UUID when EAS is used.

The guard checks configuration shape, not real-world ownership or signing. Domain
files must match the actual Apple team/bundle and Android signing fingerprints.
Verify links in signed builds with the app installed and absent; keep the web
fallback functional. Camera, microphone, contacts, and location are not needed for
the current game; generated permission manifests still require a release review.

Every `EXPO_PUBLIC_*` value is readable in the compiled app. Never put
`DATABASE_URL`, `AUTH_SECRET`, session credentials, refresh secrets, Redis tokens,
signing keys, or upload tokens in the client environment or bundle.

## Remaining acceptance gates

Passing TypeScript, unit tests, Expo Doctor, prebuild, or native export does **not**
claim that the app was signed or executed on a simulator/physical device. The
following still need their own evidence before the native PoC gate closes:

- Signed owner-controlled iOS and Android development artifacts and installation.
- Actual SecureStore/SQLite restart, process-kill, backup/reinstall, and migration tests.
- Real keyboard visibility, safe area, system back, larger text, VoiceOver/TalkBack,
  tablet/foldable, and foreground/background interaction checks.
- Verified HTTPS links, incoming cold/warm navigation, and real system sharing.
- Measured native startup, memory, binary size, and generated release permissions.

Physical product-parity acceptance, review/publication of the production privacy/deletion policy, store listings,
beta acceptance, and store publication remain separate delivery milestones. See
the [mobile conversion plan](../../docs/mobil-uygulama-donusum-plani-2026-11-12.md).


## Phase 4 verification and device E2E

See the [Phase 4 report](../../docs/mobile/faz-4-uygulama-raporu-2026-11-13.md) for implementation and acceptance evidence. `npm test` includes an abrupt SIGKILL of a child Node process after SQLite commits; restart recovers the same pending hint receipt without a second POST. This verifies disk/protocol recovery, not a real mobile OS kill. Tests require the selected Node 22.13+ SQLite API.

The main CI job runs core/disk, component, type, SDK and export checks. A separate manual [native device workflow](../../.github/workflows/native-device-e2e.yml) targets a provisioned `self-hosted`, `scorelogic-mobile`, `ios` or `android` runner with Maestro and the matching build already installed. No such runner or device execution is claimed by the source workflow. Run against a dedicated test installation/backend:

```sh
maestro test --env APP_ID=dev.scorelogic.localpoc .maestro/smoke.yaml
```

The flow does not clear storage. It exercises tabs, help/back, daily load and stop/relaunch. The historical Phase 4 Expo Doctor result was 19/20 with CocoaPods tooling open; current Android setup and device evidence are tracked in Phase 8.


## Phase 5 gameplay

[Phase 5 evidence](../../docs/mobile/faz-5-uygulama-raporu-2026-11-14.md) covers the native table/fixture/score/note components, pack-specific Check disclosure, snapshot Analyze Board, and official/first/best replay distinctions. Beginner 1–3 has guided analysis and 4–15 assisted analysis; other levels do not expose it. SAT, UNSAT and UNKNOWN stay distinct. Editing a score clears Check markers; stale analysis never diagnoses the current board. Next score / Done controls complement the numeric keyboard.

The Phase 5 local contract package was 1.1.0 (now 1.2.0); the wire API remains v1. Canonical completion keeps campaign unlocks after a later replay Reveal; backend deployment must include that access-policy fix. Phase 5 needed no new server migration; Phase 6 adds one below.

The localhost-only `npm run smoke:gameplay` creates its own guest, uses temporary disk SQLite, validates five pack prefill/feedback modes, drops Check/Reveal/Replay replies, verifies receipt recovery and official/unlock preservation, then deletes the guest. SecureStore is a memory test port in this Node driver.

A dedicated device with the matching test build and seeded Beginner level 1 can run:

```sh
maestro test --env APP_ID=dev.scorelogic.localpoc \
  --env PUZZLE_URL=scorelogic-dev://puzzles/ckscorepuzzlecamp000000001 \
  .maestro/gameplay.yaml
```

The manual device workflow offers smoke/gameplay/player/resilience choices. No signed-device gameplay execution is claimed by Jest, Node, or Hermes export.


## Phase 6 player screens and deletion recovery

[Phase 6 evidence and screen/state inventory](../../docs/mobile/faz-6-uygulama-raporu-2026-11-14.md) documents the full player UI and [parity checklist](../../docs/mobile/parite-kontrol-listesi.md). The source now provides:

- Home daily preview, local/server continuation and a repeatable rules guide with examples.
- Five packs × thirty seeded levels, canonical unlock/status and Previous/Next across pack boundaries; locked neighbors stay disabled.
- All fifteen existing statistics and six latest **puzzle progress records**, matching the web aggregate history semantics rather than inventing individual-attempt history.
- Native login/register/guest continuation and durable auth return intent. Known credential errors keep the form editable; an unknown reply preserves its immutable recovery command.
- Account/settings, preserved drafts, explicit sign-out and deletion, in-app privacy/help/support, app version, OS and configured public build identifier.
- Canonical solved-attempt invitation, native share options/iPad anchor and selectable text fallback. Cancellation has no gameplay effect; sharedAction is not recipient-delivery evidence.
- Focus/foreground/reconnect refresh, one-minute active polling, typed error/retry/empty states and owner-scoped cached/offline data.

Deploy **all 22 Prisma migrations**, including `20261114000000_native_deletion_receipts`, with the backend before using native deletion recovery. The contract package is **1.2.0**; the wire API remains **v1**. The paired deletion command UUID and 32-byte random recovery secret are saved in SecureStore before sending. The server stores only the secret hash plus timestamps/command UUID for 90 days, without an account link. A committed deletion can therefore be confirmed after it revoked the session and its response was lost. Local cleanup is itself resumable; it clears this account and merged guest owners, preserving unrelated owners. The success screen requires an explicit action to create a new guest.

Optional public build configuration:

```dotenv
# HTTPS support contact owned and operated by the product owner; omit until provisioned.
# EXPO_PUBLIC_SUPPORT_URL=https://your-owned-domain.example/support
# EXPO_PUBLIC_BUILD_ID=your-public-build-id
```

In-app troubleshooting/help remains available without a support URL. These values are not credentials. Privacy content describes current behavior; final legal policy and store declarations still need release review.

```sh
MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:account
maestro test --env APP_ID=dev.scorelogic.localpoc .maestro/player.yaml
```

The account smoke requires the isolated seeded test backend and deletes only its synthetic identity. It uses real HTTP/disk SQLite and a **memory credential-vault test port**. The Maestro player flow is read-only and requires a provisioned runner/device with the matching build. No actual OS vault, share-sheet, signing or physical-device execution is claimed by these Node/Jest tests or Hermes exports.


## Phase 7 native integration

[Phase 7 evidence](../../docs/mobile/faz-7-entegrasyon-raporu-2026-11-14.md) and the [integration/signing/device runbook](../../docs/mobile/native-entegrasyon-runbook.md) cover association routes, strict release metadata, queued cold/warm/auth links, explicit clipboard writes, offline server-clock estimates, memory-pressure preservation, reinstall/vault cases, and opt-in crash reporting. The owner currently has no verified signing metadata and chose to continue without it. Custom development links remain usable; verified HTTPS association and signed-device acceptance remain open.

New pinned dependencies: **expo-clipboard 58.0.4**, **@sentry/react-native 8.28.0**, matching Expo SDK 58. Android backup is disabled in source config and generated manifest; OS/OEM transfer and iOS reinstall behavior still require actual device tests. A credential-vault failure never silently recreates the owner or sends an old-owner command as a new guest.

Crash reporting is **off by default**. Enabling it requires `EXPO_PUBLIC_CRASH_REPORTING_ENABLED=true` and a valid public `EXPO_PUBLIC_SENTRY_DSN`; development runtime does not initialize the SDK. Native release reporting also requires build-time `SENTRY_ORG` / `SENTRY_PROJECT`; keep `SENTRY_AUTH_TOKEN` only in the secure build environment. `MOBILE_BUILD_NUMBER` supplies iOS buildNumber / Android versionCode. Release web origin must match the associated host. Build shape checks do not prove ownership or OS verification.

The JS event allowlist strips free text, credentials, gameplay data, requests, contexts, breadcrumbs and attachments while preserving bundle/map coordinates. Replay/logs/tracing/session tracking and screenshots/view hierarchy are disabled. **Native-only events may bypass JS beforeSend**; inspect real native envelopes and configure project-side scrubbing/retention before enabling reporting. No Sentry project, upload, cloud build or test crash was sent in this delivery.

Metro uses the Sentry wrapper and native builds include symbol-upload hooks when reporting is enabled. For local source/map checks:

```sh
npm run export:native:maps
npm run check:export
MOBILE_SMOKE_API_URL=http://127.0.0.1:3111 npm run smoke:resilience
```

Keep source maps private; never publish `dist/` maps to the website. Their Debug ID match does not prove server upload or native crash symbolication. Main CI now checks high/critical native production advisories and exported map IDs. The current audit passes that severity gate with six moderate transitive build-tool advisories remaining; no forced major dependency rewrite was applied.

The backend optionally serves AASA/assetlinks using `MOBILE_LINK_HOST`, `MOBILE_IOS_APP_ID`, `MOBILE_ANDROID_PACKAGE`, and `MOBILE_ANDROID_SHA256_FINGERPRINTS`. All blank returns 404 and adds no required website env. After supplying real verified values, run root `npm run mobile:verify-links`; actual iOS/Android OS verification still follows. No new database migration was added in Phase 7; the previous 22 migrations remain required.

The manual runner additionally offers `.maestro/resilience.yaml`: dedicated fixture replay, one confirmed Hint, stop/relaunch, then cold/warm link with unchanged Hint count. It does not clear storage or delete an account. It was not executed in Phase 7. The historical Expo Doctor result was 19/20; later Android toolchain work is recorded below.

## Phase 8 acceptance and accessibility

[Phase 8 report](../../docs/mobile/faz-8-kabul-raporu-2026-11-20.md) records sheet focus/background isolation, OS Reduce Motion, visible auth labels and keyboard actions, accessible table/score descriptions, contrast and 48 dp controls. Timer ticks are isolated from the board. Receipt lookup/retry is pinned to the original owner; an owner change preserves the original pending command. Lost Reveal replies can be retried inside the visible sheet.

On 20 November: **92 core and 49 component tests**, native TypeScript, root lint, 13 source contrast pairs and both mapped Hermes exports passed. Exports check Debug ID correspondence, private-source/canary boundaries and a 5 MB bytecode regression budget. They do not measure APK/IPA size. The report separates previous web/DB regression results from these reruns.

The [acceptance record](../../docs/mobile/acceptance/phase8-record.json) intentionally remains pending/BLOCKED until physical iOS/Android evidence, matching release artifacts, accessibility coverage and profiler samples exist. A connected debug Android phone alone does not close the complete device matrix. Follow the [Android guide](../../docs/mobile/android-cihaz-kurulumu.md) for USB localhost testing; production signing/domain metadata and HTTPS v1 backend rollout remain open.

The real ARM64 debug APK has now been built, verified with apksigner and installed on the Samsung phone. The owner confirmed Home/Daily/Campaign loading, exactly one Hint/cell with no automatic sheet reopening, and score/note/hint retention after a full process stop/relaunch. Server audit showed one Hint event/command; no new guest was created on restart. See the [debug artifact evidence](../../docs/mobile/acceptance/android-debug-artifact-2026-11-20.json). Unused biometric permissions were removed from source configuration and the final APK. This development build receives JS from Metro; its APK hash alone does not pin live JS.

The owner deferred the extensive UI/200% work to prioritize installation/functionality. The temporary 2.0 OS font scale was restored to the original 1.0. The initially unavailable Railway test environment was restored with explicit owner approval after the owner activated a plan. Its database was backed up with verified encrypted output, then five pending native migrations brought it to 22. The test backend is healthy and its exact-origin synthetic HTTPS/API smoke passed. Production deployment operations were not performed. See the [rollout evidence](../../docs/mobile/acceptance/railway-test-rollout-2026-11-20.json).

**Standalone internal Android is now installed and physically confirmed:** ScoreLogic Test 0.1.0 (2), ARM64, 29,856,271 bytes, embedded Hermes, HTTPS test API, native release variant, same development signing certificate. Debugging, cleartext, backup and overlay/unused biometric/storage permissions are disabled. Source maps stay outside the APK. After task-local API/Metro/DB shutdown and USB reverse removal, the owner disconnected USB and confirmed Home/Daily/Campaign, Hint and retained Hint count on reopen. [Internal artifact evidence](../../docs/mobile/acceptance/android-internal-artifact-2026-11-20.json).

`MOBILE_PREVIEW=true` selects the internal label/permissions and requires HTTPS API/web origins plus `MOBILE_BUILD_NUMBER`. It cannot be combined with `MOBILE_RELEASE=true`; production ownership/signing guards remain. The EAS preview profile declares this mode, but this delivery used local Gradle. The latest core suite is **93/93** after adding preview boundary tests; native TypeScript and targeted lint passed. Rebuild/install commands are in [Android guide §5](../../docs/mobile/android-cihaz-kurulumu.md#5-güncel-bağımsız-test-apksı). Increase the build number for later distributions. iOS, verified links, production signing, profiler and full accessibility/device acceptance remain open.
