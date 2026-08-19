function save(data) {
  data.version = BUILD;
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(storageKey(), JSON.stringify(data));
}

function setFounderSession() {
  localStorage.setItem("fitcoach-session", JSON.stringify({ founder: app.founder, at: Date.now(), build: BUILD }));
}

function getFounderSession() {
  try {
    return JSON.parse(localStorage.getItem("fitcoach-session") || "null");
  } catch {
    return null;
  }
}

function init() {
  const requestedRoute = new URLSearchParams(location.search).get("route");
  if (ROUTES.includes(requestedRoute)) app.route = requestedRoute;

  bindStaticEvents();
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    app.deferredInstall = event;
  });
  window.addEventListener("appinstalled", () => toast("FitCoach installed on this device."));
  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
  updateOnlineState();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js?v=0310").then(registration => registration.update()).catch(() => {});
  }

  const session = getFounderSession();
  if (session && founders[session.founder]) {
    app.founder = session.founder;
    const data = load();
    data.profile.onboarded ? showShell() : showOnboarding();
  }
}

function bindStaticEvents() {
  $$(".founder").forEach(button => button.addEventListener("click", () => {
    app.founder = button.dataset.founder;
    $$(".founder").forEach(item => item.classList.toggle("active", item === button));
  }));
  $("#enter").addEventListener("click", enterGate);
  $("#code").addEventListener("keydown", event => {
    if (event.key === "Enter") enterGate();
  });
  $("#ob-exit").addEventListener("click", exitToGate);
  $("#ob-back").addEventListener("click", () => {
    if (app.onboardingStep > 0) {
      app.onboardingStep -= 1;
      renderOnboarding();
    }
  });
  $("#ob-next").addEventListener("click", nextOnboarding);
  $$(".nav-btn").forEach(button => button.addEventListener("click", () => navigate(button.dataset.route)));
  $("#avatar").addEventListener("click", () => navigate("profile"));
  $("#feedback").addEventListener("click", () => openFeedback());
  $("#view").addEventListener("click", handleViewClick);
  $("#view").addEventListener("change", handleViewChange);
  $("#view").addEventListener("input", handleViewInput);
  $("#backdrop").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", handleSheetClick);
  $("#voice-close").addEventListener("click", cancelVoice);
  $("#voice-stop").addEventListener("click", stopVoiceAndSend);
}

function enterGate() {
  const accepted = $("#code").value.trim().toUpperCase() === ACCESS_CODE;
  $("#gate-error").hidden = accepted;
  if (!accepted) return;
  setFounderSession();
  load().profile.onboarded ? showShell() : showOnboarding();
}

function exitToGate() {
  localStorage.removeItem("fitcoach-session");
  $("#gate").hidden = false;
  $("#onboarding").hidden = true;
  $("#shell").hidden = true;
}

function showOnboarding() {
  $("#gate").hidden = true;
  $("#shell").hidden = true;
  $("#onboarding").hidden = false;
  app.onboardingStep = 0;
  renderOnboarding();
}

function showShell() {
  $("#gate").hidden = true;
  $("#onboarding").hidden = true;
  $("#shell").hidden = false;
  render();
}

function updateOnlineState() {
  $("#offline").hidden = navigator.onLine;
  if (!navigator.onLine) setApiState("error", "Offline");
  else if (!app.chatBusy) setApiState("ready", "AI ready");
}

const goalOptions = [
  ["build muscle", "Build muscle", "Add size with progressive training", "◢"],
  ["get stronger", "Get stronger", "Push the big lifts and measurable PRs", "↑"],
  ["lose fat", "Lose fat", "Reduce body fat while protecting performance", "◇"],
  ["stay consistent", "Stay consistent", "Build a routine that survives real life", "◎"]
];
const blockerOptions = [
  ["time", "Not enough time", "My schedule breaks the plan", "◴"],
  ["motivation", "Motivation drops", "I know what to do but do not start", "△"],
  ["all-or-nothing", "All or nothing", "One miss turns into a lost week", "↺"],
  ["uncertainty", "I second-guess the plan", "I keep changing what I am doing", "?"]
];

