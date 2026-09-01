# Required real-device matrix

Browser emulation and structural tests are not evidence for these rows.

## iOS

- Current supported iPhone OS plus the minimum supported OS
- Built-in mic/speaker, wired headset where supported, AirPods HFP, AirPods A2DP output
- Connect/disconnect before listening, while listening, while speaking, and while paused
- Incoming call, outgoing call, Siri, alarm, Control Center route switch, screen lock, app background/foreground
- Microphone denied, Speech denied, Health denied, partial Health permission, permission revoked in Settings
- VoiceOver, Dynamic Type largest sizes, Reduce Motion, Low Power Mode, offline/poor network
- StoreKit sandbox: new, trial, pending/Ask to Buy where available, renew, expire, cancel, refund, restore, reinstall, second device

## Android

- Pixel/reference device and at least one Samsung device at the minimum and current supported API levels
- Built-in route, wired/USB where available, Bluetooth headset
- Android 26–30 uses the legacy Bluetooth SCO request path, which does not
  provide a confirmed active communication-device callback in this scaffold.
  Treat that route as unconfirmed until physical-device audio and interruption
  evidence is recorded; do not advertise legacy Bluetooth support from source
  structure alone.
- Phone call/audio-focus transient loss, permanent loss, Bluetooth disconnect, app process recreation
- On-device recognition available/unavailable and default network recognizer
- Health Connect unavailable, update required, partial permission, revoked permission, Android 13 app and Android 14+ system integration
- TalkBack, font/display scaling, Reduce animations, battery saver, offline/poor network
- Play Billing license tester: purchased, pending-completes, pending-cancels, grace, hold, expired, restore, reinstall, second device

Every row needs device/OS/build, exact steps, expected result, observed result, logs, screenshot/video where appropriate, tester, and date.
