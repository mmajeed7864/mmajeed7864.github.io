"use strict";

/**
 * FitCoach v0.3.4 PWA update controller.
 *
 * The legacy founder build registered `sw.js?v=0310` and its manual refresh preserved caches
 * containing `v0310` while deleting newer caches. That could keep an installed phone app on an
 * obsolete bundle. This script supersedes that behavior without touching workout or coach code.
 */
const FITCOACH_PWA_VERSION = "0340";
const FITCOACH_SW_URL = `./sw.js?v=${FITCOACH_PWA_VERSION}`;

async function updateFitCoachServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register(FITCOACH_SW_URL);
  await registration.update();
  return registration;
}

async function forceRefreshV34() {
  const button = document.querySelector("[data-force-refresh]");
  if (button) button.disabled = true;

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations || []).map(registration => registration.update()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("fitcoach-")).map(key => caches.delete(key)));
    }
  } catch (error) {
    console.warn("FitCoach refresh cleanup was incomplete; continuing with a cache-busted reload.", error);
  }

  const url = new URL(location.href);
  url.searchParams.set("v", `${FITCOACH_PWA_VERSION}-${Date.now()}`);
  location.replace(url.toString());
}

// Replace the legacy refresh implementation after its classic script has defined the binding.
window.forceRefresh = forceRefreshV34;

window.addEventListener("DOMContentLoaded", () => {
  updateFitCoachServiceWorker().catch(error => {
    console.warn("FitCoach service worker update failed.", error);
  });
});
