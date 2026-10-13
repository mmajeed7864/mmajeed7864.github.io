# Mobile release-quality pass — 0.7.9

This milestone tightens the production web shell without changing FitCoach's
training, nutrition, progress, onboarding or AI-coach product direction.

## Corrections

- The weekly schedule now owns a single shrinkable title column. A historical
  base rule had survived the visual redesign and created implicit grid columns,
  making the schedule 80–100 pixels wider than a phone viewport. Session names,
  descriptions and start controls now wrap inside the available column.
- Voice Room's browser playback primer now converts its reviewed silent WAV to
  an in-memory Blob URL. The old data URL was rejected by the app's own stricter
  `media-src 'self' blob:` policy when Voice Room opened. The fix keeps the
  stricter policy and removes the policy error rather than allowing arbitrary
  inline media.
- The web version and shell cache generation advance together to 0.7.9 / 0709,
  so installed web clients cannot retain the corrected 0.7.8 shell.

## Mobile matrix

The release harness completed 78 rendered states in isolated Chromium contexts:

- 320, 390 and 430 CSS-pixel widths;
- light and dark themes;
- Today, Train, Food, Coach, Progress and Profile;
- Train workout, schedule, exercise catalogue and exercise detail;
- quick actions, Voice Room consent, food capture and private progress-photo
  dialogs.

Every state passed the checked conditions: zero page or console errors, zero
missing local requests, zero document-width overflow, zero broken expected
images, zero duplicate IDs, zero unnamed controls or form fields, zero form text
below 16 pixels, zero fixed-navigation terminal overlap and zero effective tap
targets below 44 by 44 pixels. Deliberate horizontal filmstrips and filter rails
remain internally scrollable without widening the document.

Evidence is retained outside the repository at
`/Users/mohammed/.codex/artifacts/fitcoach-mohammed/qa-mobile-release/`, including
the JSON report and 390-pixel screenshots in both themes. The harness itself is
`/Users/mohammed/.codex/artifacts/fitcoach-mohammed/qa-mobile-release.mjs`.

## Verification

- 487/487 web tests pass.
- The 45-module graph, syntax, PWA cache contract, media declarations and bundle
  integrity pass.
- A fresh immutable lossless native bundle contains 353 files and 226,749,645
  bytes with content SHA-256
  `96fbb63e63c6777740690b3dfe095e133406ac8325531ded0ada0157739b71f2`.
- 69/69 native code tests pass and all 12 code-owned release gates remain green.

This is code, browser and assembled-bundle evidence. It is not physical-device
voice proof, production signing, provider activation, store approval, merge or
live deployment. The 30 external/device/account release gates remain open.
