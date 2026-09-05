(() => {
  let preference = "light";
  try {
    const saved = localStorage.getItem("fitcoach-theme");
    if (["light", "dark", "system"].includes(saved)) preference = saved;
  } catch {}
  const resolved = preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : preference === "dark" ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]').content = resolved === "dark" ? "#090d16" : "#f7f8fc";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js?v=0600", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {});
  }
})();
