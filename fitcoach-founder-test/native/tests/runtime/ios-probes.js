// Test-bundle resource only. Executed in the installed app's actual WKWebView.
// No synthetic bridge, permission grants, account login or direct media playback.
async function fitcoachRuntimeProbe(kind, value) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label, timeout = 15000) => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      if (predicate()) return;
      await delay(100);
    }
    throw new Error("Timed out: " + label);
  };
  const moduleURL = (path) =>
    new URL("/fitcoach-founder-test/v040/" + path, location.href).href;
  const storageClean = () =>
    !JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value);
  const run = async () => {
    if (kind === "launch") {
      const health =
        await window.Capacitor.Plugins.FitCoachNative.healthAvailability();
      return {
        url: location.href,
        platform: window.Capacitor.getPlatform(),
        heading: document.querySelector("h1")?.textContent,
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        healthSource: health.source,
        healthAvailableBoolean: typeof health.available === "boolean",
      };
    }
    if (kind === "artwork") {
      const { EXERCISE_MEDIA_MANIFEST: media } = await import(
        moduleURL("data/exercise-media-manifest.mjs")
      );
      const posters = media.filter((item) => item.type === "poster"),
        widths = [];
      for (const item of [posters[0], posters[49], posters[99]]) {
        const image = new Image();
        image.src = item.path;
        await image.decode();
        widths.push(image.naturalWidth);
      }
      return {
        posters: posters.length,
        videos: media.filter((item) => item.type === "mp4").length,
        widths,
      };
    }
    if (kind === "session-write" || kind === "session-recover-clear") {
      const { createNativePlatformClient } = await import(
        moduleURL("services/native-client.mjs")
      );
      const storage = createNativePlatformClient().secureSessionStorage;
      if (kind === "session-write") {
        await storage.clear();
        return {
          available: storage.available,
          saved: await storage.write(value),
          matches: (await storage.read()) === value,
          webStorageClean: storageClean(),
        };
      }
      const matches = (await storage.read()) === value,
        cleared = await storage.clear();
      return {
        matches,
        cleared,
        absent: (await storage.read()) === null,
        webStorageClean: storageClean(),
      };
    }
    if (kind !== "motion") throw new Error("Unknown runtime probe");
    const click = (selector) => {
      const button = document.querySelector(selector);
      if (!button || button.disabled)
        throw new Error("Unavailable control: " + selector);
      button.click();
    };
    // The real adult age gate and all real onboarding steps, not a preseeded profile.
    click('[data-field="ageBand"][data-value="adult_18_plus"]');
    for (let step = 0; step < 18; step++) {
      const header = document.querySelector(
        ".onboarding-screen header small",
      )?.textContent;
      if (header !== "Step " + (step + 1) + " of 18")
        throw new Error("Unexpected onboarding step");
      document
        .querySelector('[data-field="speakReplies"][data-value="false"]')
        ?.click();
      const consent = document.querySelector(
        '[data-action="onboarding-consent"]',
      );
      if (consent && !consent.checked) consent.click();
      click('[data-action="onboarding-next"]');
      await waitFor(
        () =>
          document.querySelector(".onboarding-screen header small")
            ?.textContent !== header,
        "onboarding step " + (step + 1),
      );
    }
    document.querySelector('[data-action="skip-tutorial"]')?.click();
    await waitFor(
      () => !document.querySelector('[data-action="skip-tutorial"]'),
      "tutorial dismissal",
    );
    await waitFor(
      () =>
        !!document.querySelector('[data-action="route"][data-value="train"]'),
      "training navigation",
    );
    click('[data-action="route"][data-value="train"]');
    await waitFor(
      () => !!document.querySelector("#train-tab-exercises"),
      "exercise tab",
    );
    click("#train-tab-exercises");
    await waitFor(
      () => !!document.querySelector("#exercise-search"),
      "exercise search",
    );
    const search = document.querySelector("#exercise-search");
    search.value = "Barbell Back Squat";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(
      () =>
        !!document.querySelector(
          '[data-action="open-exercise"][data-value="barbell-back-squat"]',
        ),
      "squat search result",
    );
    click('[data-action="open-exercise"][data-value="barbell-back-squat"]');
    await waitFor(
      () => !!document.querySelector("video[data-media-video]"),
      "real motion player",
    );
    const video = document.querySelector("video[data-media-video]");
    const figure = video.closest(".exercise-motion");
    const toggle = figure.querySelector(
      '[data-action="toggle-exercise-motion"]',
    );
    const healthy = () => {
      if (!video.isConnected || video.error)
        throw new Error(
          "Motion player disconnected or failed: " + video.error?.code,
        );
      return true;
    };
    await waitFor(
      () => healthy() && video.readyState >= 2,
      "local video decoding",
    );
    if (
      !Number.isFinite(video.duration) ||
      video.duration < 3 ||
      video.duration > 20
    )
      throw new Error("Unexpected motion duration");
    const frames = () =>
      new Promise((resolve, reject) => {
        if (!video.requestVideoFrameCallback)
          return reject(new Error("Decoded-frame observation unavailable"));
        let id,
          count = 0;
        const timer = setTimeout(() => {
          video.cancelVideoFrameCallback(id);
          reject(new Error("Video did not present three frames"));
        }, 5000);
        const frame = () => {
          if (++count === 3) {
            clearTimeout(timer);
            resolve(count);
          } else id = video.requestVideoFrameCallback(frame);
        };
        id = video.requestVideoFrameCallback(frame);
      });
    const playing = () =>
      healthy() &&
      !video.paused &&
      figure.dataset.motionStatus === "playing" &&
      toggle.getAttribute("aria-pressed") === "true";
    const paused = () =>
      healthy() &&
      video.paused &&
      figure.dataset.motionStatus === "paused" &&
      toggle.getAttribute("aria-pressed") === "false";
    if (video.paused) toggle.click();
    await waitFor(playing, "initial playback");
    const firstFrames = await frames();
    toggle.click();
    await waitFor(paused, "pause button");
    const pauseTime = video.currentTime;
    await delay(400);
    if (!paused() || Math.abs(video.currentTime - pauseTime) > 0.08)
      throw new Error("Paused video kept moving");
    toggle.click();
    await waitFor(playing, "resume button");
    const resumeFrames = await frames();
    await waitFor(
      () => healthy() && Math.abs(video.currentTime - pauseTime) > 0.15,
      "resumed timeline",
    );
    let previous = video.currentTime;
    await waitFor(
      () => {
        healthy();
        const looped = video.currentTime + 0.3 < previous;
        previous = video.currentTime;
        return looped && playing();
      },
      "uninterrupted real loop",
      video.duration * 1000 + 6000,
    );
    const loopFrames = await frames();
    toggle.click();
    await waitFor(paused, "pause after loop");
    const source = new URL(video.currentSrc);
    return {
      firstFrames,
      resumeFrames,
      loopFrames,
      paused: video.paused,
      localSource:
        source.protocol === "capacitor:" && source.hostname === "localhost",
      id: video.dataset.motionId,
      muted: video.muted,
      inline: video.playsInline,
      width: video.videoWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  };
  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Runtime probe deadline exceeded: " + kind)),
          90000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
