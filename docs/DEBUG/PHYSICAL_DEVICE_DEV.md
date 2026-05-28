<!--
  How to iterate on a physical iPhone with Expo without rebuilding +
  uploading to TestFlight every time. Written for macOS dev hosts.

  Last update: 2026-05-28.
-->

# Testing on a physical iPhone without TestFlight

This project uses `expo-dev-client` and native modules (`expo-audio`,
`expo-notifications`, `@sentry/react-native`, …). Expo Go cannot run
it. You need a **development build** installed once on the iPhone. After
that, every JS change reloads over the network in seconds — no
recompile, no upload, no TestFlight review.

There are two ways to install the initial development build. Pick the
one that matches your situation; you do not need both.

---

## Option A — Local Xcode build over USB (recommended for the dev's own phone)

**Prerequisites (one-time)**

- Xcode installed and signed in to your Apple ID
  (Xcode → Settings → Accounts).
- An Apple Developer account (the free tier works for personal devices;
  apps signed with a free profile expire after 7 days, paid profiles
  last 1 year).
- The iPhone unlocked, plugged into the Mac with a Lightning / USB-C
  cable, and trusted ("Trust This Computer" prompt accepted).
- Developer Mode enabled on the iPhone: Settings → Privacy & Security →
  Developer Mode → On (requires a reboot the first time).

**First install**

From the project root:

```bash
# Generate the native ios/ folder if it does not already exist.
# Required on first checkout or whenever app.json / app config changes.
npx expo prebuild --platform ios

# Compile and install on the connected device.
# If a single device is connected, --device picks it automatically.
# If multiple devices are connected, pass the device name or UDID:
#   npx expo run:ios --device "iPhone de Aldric"
npx expo run:ios --device
```

The first build takes 5–10 minutes (compiling Hermes + every native
module). Subsequent rebuilds are incremental.

After install, the iPhone home screen will show the Lovoice dev app
(usually with a different icon / name than production — see
`app.json`'s `ios.bundleIdentifier`).

**Day-to-day after install**

```bash
npx expo start --dev-client
```

Then on the iPhone:

1. Open the installed Lovoice dev app.
2. It scans the LAN for the running Metro server. If it finds it, the
   JS bundle loads automatically.
3. If it does not auto-connect, shake the phone to open the dev menu →
   "Configure bundler" → enter the Metro URL Metro printed in the
   terminal (e.g. `http://192.168.1.42:8081`).

JS edits hot-reload by default. To force a full reload: shake the
phone → "Reload".

**When you must rebuild (re-run `npx expo run:ios --device`)**

- A native dependency was added or upgraded (anything `expo-*`,
  `react-native-*`, native config in `app.json`).
- `app.json` plugins, permissions, or bundle identifier changed.
- The provisioning profile expired (after 7 days on free Apple ID).
- The iPhone was restored / reset.

---

## Option B — EAS development build over Wi-Fi (recommended for the client's phone)

Use this when the target device is not plugged into your Mac (the
client's iPhone, a beta tester's device, etc.). It produces an `.ipa`
that can be installed via QR code from anywhere with internet.

**One-time eas.json adjustment**

The current `eas.json` `development` profile is `ios.simulator: true`.
That builds a simulator-only artifact that cannot install on physical
devices. Add a sibling profile:

```jsonc
{
  "build": {
    // ... existing profiles ...
    "development-device": {
      "extends": "base",
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": {
        "simulator": false
      }
    }
  }
}
```

Commit this change once; the rest is repeatable from any machine
authenticated to EAS.

**One-time device registration (per physical iPhone)**

EAS internal builds are signed against an ad-hoc provisioning profile
that whitelists specific device UDIDs. Register the device first:

```bash
eas device:create
```

Follow the QR code prompt on the target iPhone, install the profile in
Settings → General → VPN & Device Management → Profile Downloaded, and
confirm. Repeat once per device that needs to receive dev builds.

**Build and install**

```bash
eas build --profile development-device --platform ios
```

Takes ~15–20 minutes on EAS cloud builders. When it completes, EAS
prints an install URL with a QR code. On the target iPhone:

1. Scan the QR with the camera app.
2. Tap "Install" when prompted.
3. The first launch may show "Untrusted Developer" — go to Settings →
   General → VPN & Device Management and trust the developer profile.

**Day-to-day after install**

Identical to Option A: `npx expo start --dev-client`, the phone
auto-discovers the Metro server on the same Wi-Fi. If the phone is on a
different network than your Mac, use:

```bash
npx expo start --dev-client --tunnel
```

This routes the bundle over Expo's tunnel servers (slower but
works across networks).

**When you must rebuild a new EAS dev build**

Same triggers as Option A (native dep change, plugin / permission
change, profile expiry — but EAS dev builds last 1 year not 7 days
since they use a paid Apple Developer profile).

---

## Native-modules quick reference: when am I stuck with TestFlight?

You are **never** stuck with TestFlight for development. TestFlight is
only needed when:

- You want to share a build with someone whose device is NOT registered
  in your EAS device list AND you do not want to ask them to install a
  provisioning profile.
- You want to test the production release-mode JS bundle exactly as
  end users will receive it (different Hermes optimisations, no dev
  menu, no Metro connection, no `__DEV__` codepaths).
- You are submitting for App Store review.

For everything else — including reproducing iOS-only audio bugs like
the silent-M4A issue documented in
[`SILENT_M4A_FIX.md`](./SILENT_M4A_FIX.md) — use Option A or B.

---

## Troubleshooting

### "Untrusted Developer" / app refuses to launch

Settings → General → VPN & Device Management → tap your developer
profile → Trust.

### Phone does not see the Metro server

- Phone and Mac on the same Wi-Fi network, no VLAN isolation.
- macOS firewall not blocking port 8081
  (System Settings → Network → Firewall → Allow Node / Expo).
- Try `npx expo start --dev-client --tunnel` to bypass LAN entirely.

### `npx expo run:ios --device` fails with code signing errors

Open `ios/Lovoice.xcworkspace` in Xcode once, sign in to your Apple ID
under the project's "Signing & Capabilities" tab, accept the automatic
provisioning profile creation, then re-run the CLI command.

### Push notifications need a development build

Notifications go through APNs which requires a real iPhone AND a paid
Apple Developer account AND the right entitlements in the build. The
local Xcode build (Option A) inherits these from your developer
account. EAS builds (Option B) inherit them from the EAS Apple
credentials configured during `eas credentials`. Simulator notifications
do NOT round-trip APNs — they are local-only stubs.

### Sentry events in DEV vs PROD

Sentry is initialised in `app/_layout.tsx` and currently runs in all
builds. Dev builds DO send events to the same Sentry project as
production, just with `environment: 'development'` and the dev build
fingerprint. When validating a fix (e.g.
[`SILENT_M4A_FIX.md §5`](./SILENT_M4A_FIX.md#5-validation-plan)), filter
the Sentry issue view by `environment:production` and `release:<the
exact production version that has the fix>` so you do not pollute the
signal with dev noise.

### Reset Metro cache when JS reload behaves oddly

```bash
npx expo start --dev-client --clear
```

---

## TL;DR cheat sheet

```bash
# First time on your own iPhone (one-off, ~10 min):
npx expo prebuild --platform ios
npx expo run:ios --device

# Every day after (JS edits, instant reload on phone):
npx expo start --dev-client

# First time on someone else's iPhone (one-off, ~20 min):
eas device:create                                         # they trust the profile
eas build --profile development-device --platform ios     # they scan QR & install

# When in doubt:
npx expo start --dev-client --clear --tunnel
```
