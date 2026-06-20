# Porter Capture (Plan 4 — Android notification listener)

Reads the **Porter app's notifications** on the dedicated Porter phone (9599157340) and forwards
their text to the cockpit backend's `POST /capture` endpoint as `{ "text": "<title — body>" }`.
This is the no-API data source: it sends nothing to the user and only ingests.

## What it does
- A `NotificationListenerService` (`PorterNotificationListener`) filters notifications whose package
  matches `PORTER_PACKAGE_HINTS` (default: contains `"porter"`), extracts title + body, and POSTs
  the raw text to `<baseUrl>/capture` on a background thread.
- A one-screen setup `MainActivity`: set the backend base URL, open the system "Notification access"
  screen to grant the listener permission, and send a test ping.

## Build (needs Android tooling — NOT buildable in the cockpit repo's Node toolchain)
This module was scaffolded without an Android SDK present. Build it on a machine with Android Studio
(Giraffe+) or the Android command-line tools:

1. Open the `android/` folder in **Android Studio** → let it sync (it provisions the Gradle wrapper
   and SDK). OR from CLI with the SDK installed: `cd android && gradle :app:assembleDebug`.
2. The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.
3. `adb install -r app-debug.apk` onto the Porter phone (or sideload it).

> The Gradle wrapper JAR is not committed (it's a binary). Android Studio generates it on first open;
> from CLI run `gradle wrapper` once if you want `./gradlew`.

## Configure on the phone
1. Launch **Porter Capture**.
2. Enter the backend base URL reachable from the phone (e.g. `http://<server-ip>:3000`, or the
   deployed HTTPS URL once Plan 5 is hosted). Tap **Save URL**.
3. Tap **Grant notification access** → enable "Porter Capture" in the list.
4. Tap **Send test ping** → expect "Test OK (200)". Confirm a row appears in `capture_inbox`.
5. Leave the app installed; the listener runs in the background.

## Tuning
- **Exact Porter package id:** confirm it on the phone (e.g. `com.theporter.android.customerapp`) and
  tighten `PORTER_PACKAGE_HINTS` in `PorterNotificationListener.kt` if other apps collide.
- **Parsers:** the backend stores every raw notification in `capture_inbox`; tune
  `src/capture/parsers.ts` from those real strings (see HANDOFF §9).
- **HTTPS:** `usesCleartextTraffic="true"` is enabled for local-IP/dev. Once the backend is on HTTPS
  (Plan 5), you can drop it for security.
