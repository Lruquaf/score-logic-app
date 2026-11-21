---
name: run-mobile
description: Run and visually check the ScoreLogic native app (apps/mobile). Design studio on web for UI work, Android device over USB, or iOS simulator when Xcode is installed, plus Maestro acceptance flows. Use when asked to run, see, screenshot or try the mobile app or a mobile UI change.
---

# Run the ScoreLogic mobile app

Pick the cheapest target that proves the change. Read `apps/mobile/README.md` and `docs/mobile/android-cihaz-kurulumu.md` for the full environment; do not duplicate secrets or device serials in output.

## 1. UI-only change → design studio (fastest, no device)

- Start with the browser preview: `preview_start` name `design-studio` (from `.claude/launch.json`), port 8082. It renders the real native UI with fixture services.
- Check narrow (375 wide) and wide layouts, Final Table pinned, touch targets ≥ 44 px.
- Then run `npm --prefix apps/mobile run test:components` and `npm --prefix apps/mobile run check:a11y`.

## 2. Behavior needing the real runtime → Android device over USB

Preconditions (ask the user if any is missing; never start remote DBs):
- Local API + DB running on port 3109 (local test DB only, never Railway). Check `curl -s http://127.0.0.1:3109/api/health`.
- `apps/mobile/.env.local` exists (do not read it; the user maintains it).
- Phone connected: `npm --prefix apps/mobile run device:android:check` with `ANDROID_HOME` and JDK 17 exported as in the Android guide.

Steps:
1. `"$ANDROID_HOME/platform-tools/adb" -d reverse tcp:3109 tcp:3109` and `tcp:8081 tcp:8081` (redo after reconnect/reboot).
2. First time or after native dependency changes: `cd apps/mobile && npm run android -- --device` (long Gradle build, run in background).
3. JS-only changes afterwards: `cd apps/mobile && npm start -- --localhost` and reload on the device.
4. Screenshot for verification: `"$ANDROID_HOME/platform-tools/adb" -d exec-out screencap -p > <scratchpad>/screen.png`, then read the image.

## 3. iOS simulator (only when full Xcode is installed)

- `xcode-select -p` must point into `Xcode.app`, not CommandLineTools. If not, tell the user; do not try to fix it.
- Open the simulator panel first (iOS simulator `attach`), then `cd apps/mobile && npm run ios`, then verify with simulator screenshots/taps.

## 4. Acceptance flows (Maestro)

- Flows live in `apps/mobile/.maestro/` (`smoke`, `gameplay`, `player`, `resilience`). They need an installed development build and the `maestro` CLI.
- `maestro test --env APP_ID=<test app id> --env PUZZLE_URL=<scheme url> apps/mobile/.maestro/smoke.yaml`. Defaults are in `.github/workflows/native-device-e2e.yml`.
- Do not clear app storage: flows rely on the same installation.

## Report

Say which target you used, what you saw (attach the screenshot), and what you could not check (e.g. no Xcode, device not connected).
