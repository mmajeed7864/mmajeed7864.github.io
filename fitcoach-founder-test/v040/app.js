import {
  ACCESS_CODE,
  BUILD,
  CACHE_GENERATION,
  FOUNDERS,
  ROUTES,
} from "./core/constants.mjs";
import { createFitCoachStore } from "./core/store.mjs";
import { deepClone, escapeHtml, safeNumber, uid } from "./core/utils.mjs";
import { computeDecision } from "./domain/decisions.mjs";
import { deriveTrainerAction } from "./domain/trainer-actions.mjs";
import {
  adjustRestTimer,
  approvePlanProposal,
  buildPlan,
  completeWorkout,
  createPlanProposal,
  isValidCompletedSet,
  rejectPlanProposal,
  restSecondsRemaining,
  startRestTimer,
  startWorkoutFromPlan,
  swapWorkoutExercise,
} from "./domain/workouts.mjs";
import {
  EXERCISES,
  filterExercises,
  getExerciseById,
} from "./data/exercise-library.mjs";
import { createTrainerClient, isPrivateTrainerInput } from "./services/trainer-client.mjs";
import { createPremiumVoiceClient } from "./services/voice-client.mjs";
import { renderCoachScreen, renderVoiceRoom } from "./ui/coach-screen.mjs";
import { icon } from "./ui/components.mjs";
import { renderGate, renderOnboarding } from "./ui/onboarding.mjs";
import { renderModal } from "./ui/modal.mjs";
import { renderProfileScreen } from "./ui/profile-screen.mjs";
import { renderProgressScreen } from "./ui/progress-screen.mjs";
import { renderTodayScreen } from "./ui/today-screen.mjs";
import { renderTrainScreen } from "./ui/train-screen.mjs";
import {
  createBrowserVoiceAdapters,
  createVoiceRoomController,
} from "./voice/voice-room-controller.mjs";

const dom = {
  stage: document.querySelector("#app-stage"),
  nav: document.querySelector("#bottom-nav"),
  mini: document.querySelector("#mini-workout"),
  modal: document.querySelector("#modal-root"),
  voice: document.querySelector("#voice-root"),
  toast: document.querySelector("#toast"),
  offline: document.querySelector("#offline-banner"),
};

const ui = {
  mode: "gate",
  founder: "mo",
  route: "today",
  trainSegment: "workout",
  exerciseDetailId: null,
  exerciseFilters: { query: "", muscle: "", equipment: "", favorites: false },
  motionPaused: false,
  replacementIndex: null,
  replacementMode: null,
  addMode: false,
  showActiveWorkout: true,
  onboardingStep: 0,
  onboardingDraft: null,
  modal: null,
  chatBusy: false,
  pendingMessage: "",
  chatDraft: "",
  chatNotice: null,
  speakingMessageId: null,
  voiceProvider: "premium-ready",
  lastFailedChatDraft: "",
};

let store;
let state;
let decision;
let modalReturnFocus = null;
let chatRequestController = null;
let activeUtterance = null;
let activeSpeech = null;
let activeSpeechToken = null;
let voiceLastMetadata = null;
let restTicker = null;
let voiceReturnFocus = null;

const trainerClient = createTrainerClient();
const premiumVoice = createPremiumVoiceClient();

function readSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem("fitcoach-session") || "null");
    return parsed && FOUNDERS[parsed.founder] ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession() {
  localStorage.setItem("fitcoach-session", JSON.stringify({ founder: ui.founder, build: BUILD, at: Date.now() }));
}

function createStore(founder) {
  store = createFitCoachStore({ founder });
  state = store.load();
  ensurePlan();
  ensureDecision();
  applyTheme(state.settings.theme);
}

function ensurePlan() {
  if (state.activePlan?.exercises?.length) return;
  state = store.update(draft => {
    draft.activePlan = buildPlan(draft, EXERCISES, { planId: "A", minutes: draft.profile.duration });
  });
}

function ensureDecision() {
  const next = computeDecision(state);
  const exists = state.decisions.some(item => item.id === next.id);
  if (!exists) {
    state = store.update(draft => { draft.decisions.push(next); });
  }
  decision = state.decisions.find(item => item.id === next.id) || next;
}

function refreshState() {
  state = store.get();
  ensurePlan();
  ensureDecision();
  render();
}

function resolvedTheme(preference) {
  if (preference !== "system") return preference;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference) {
  const resolved = resolvedTheme(preference);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  localStorage.setItem("fitcoach-theme", preference);
  const color = resolved === "dark" ? "#071116" : "#F6F9FB";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function routeTitle(route) {
  return {
    today: ["TODAY", "Your training day"],
    train: ["TRAIN", ui.trainSegment === "exercises" ? "Exercise library" : "Your workout"],
    coach: ["COACH", "Your trainer"],
    progress: ["PROGRESS", "Proof of the work"],
    profile: ["PROFILE", "Your FitCoach"],
  }[route];
}

function filteredLibrary() {
  const matches = filterExercises({
    query: ui.exerciseFilters.query,
    primaryMuscle: ui.exerciseFilters.muscle,
    equipment: ui.exerciseFilters.equipment,
  });
  return ui.exerciseFilters.favorites
    ? matches.filter(exercise => state.exercisePreferences.favorites.includes(exercise.id))
    : matches;
}

function coachConnection() {
  if (!navigator.onLine) return { label: "Browser offline", state: "offline" };
  if (ui.chatBusy) return { label: "Connecting", state: "busy" };
  if (ui.chatNotice?.kind === "error") return { label: "Last request failed", state: "error" };
  if (state?.lastApi?.fallbackUsed) return { label: "Local fallback used", state: "fallback" };
  if (state?.lastApi?.at) return { label: "Live reply received", state: "live" };
  return { label: "Browser online · Coach unverified", state: "unverified" };
}

function renderHeader() {
  const [kicker,title] = routeTitle(ui.route);
  const connection = coachConnection();
  return `<header class="app-header"><button class="brand-button" data-action="route" data-value="today" aria-label="FitCoach Today"><span>F</span></button><div><small>${kicker}</small><b>${escapeHtml(title)}</b></div><div class="header-actions"><button class="connection-pill" data-action="connection-info"><span class="status-dot ${escapeHtml(connection.state)}"></span>${escapeHtml(connection.label)}</button><button class="theme-quick" data-action="cycle-theme" aria-label="Change theme">${state.settings.theme === "dark" ? "☾" : state.settings.theme === "system" ? "◐" : "☀"}</button><button class="header-avatar" data-action="route" data-value="profile" aria-label="Open profile">${FOUNDERS[ui.founder].initial}</button></div></header>`;
}

function renderMiniWorkout() {
  if (ui.mode !== "app" || !state.activeWorkout || (ui.route === "train" && ui.showActiveWorkout)) {
    dom.mini.hidden = true;
    dom.mini.innerHTML = "";
    return;
  }
  const workout = state.activeWorkout;
  const current = workout.exercises[Math.min(workout.currentExerciseIndex || 0, workout.exercises.length - 1)];
  const all = workout.exercises.flatMap(item => item.sets);
  const done = all.filter(set => set.done).length;
  const rest = restSecondsRemaining(workout);
  dom.mini.innerHTML = `<button class="mini-player" data-action="resume-workout"><span class="mini-progress" style="--progress:${Math.round((done/Math.max(1,all.length))*100)}%"><i>${icon("play")}</i></span><span><small>${rest ? `REST · ${formatClock(rest)}` : "WORKOUT ACTIVE"}</small><b>${escapeHtml(current?.snapshot?.name || workout.planLabel)}</b><em>${done}/${all.length} sets · tap to resume</em></span><strong>${icon("chevron")}</strong></button>`;
  dom.mini.hidden = false;
}

function renderAppScreen() {
  const context = {
    state,
    decision,
    plan: state.activePlan,
    exerciseById: getExerciseById,
    filteredExercises: filteredLibrary(),
    founderName: FOUNDERS[ui.founder].name,
    ui,
    coachConnection: coachConnection(),
    now: new Date(),
  };
  let screen;
  if (ui.route === "today") screen = renderTodayScreen(context);
  if (ui.route === "train") screen = renderTrainScreen(context);
  if (ui.route === "coach") screen = renderCoachScreen(context);
  if (ui.route === "progress") screen = renderProgressScreen(context);
  if (ui.route === "profile") screen = renderProfileScreen(context);
  dom.stage.innerHTML = `${ui.route === "train" && state.activeWorkout && ui.showActiveWorkout ? "" : renderHeader()}<main id="main-content" class="app-main">${screen}</main>`;
  dom.nav.hidden = false;
  dom.nav.querySelectorAll("[data-route]").forEach(button => {
    const active = button.dataset.route === ui.route;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.body.dataset.route = ui.route;
  renderMiniWorkout();
  requestAnimationFrame(() => {
    const log = document.querySelector("#chat-log");
    if (log && ui.route === "coach") log.scrollTop = log.scrollHeight;
  });
}

function render() {
  if (ui.mode === "gate") {
    dom.stage.innerHTML = renderGate(ui.founder);
    dom.nav.hidden = true;
    dom.mini.hidden = true;
  } else if (ui.mode === "onboarding") {
    dom.stage.innerHTML = renderOnboarding({ step: ui.onboardingStep, draft: ui.onboardingDraft });
    dom.nav.hidden = true;
    dom.mini.hidden = true;
  } else {
    renderAppScreen();
  }
  renderModalRoot();
  renderVoiceRoot();
  dom.offline.hidden = navigator.onLine;
}

function renderModalRoot() {
  dom.modal.innerHTML = renderModal(ui.modal, { state, decision, exerciseById: getExerciseById });
  dom.modal.hidden = !ui.modal;
  document.querySelector("#app-frame")?.toggleAttribute("inert", Boolean(ui.modal) || voiceController.getState().active);
  if (ui.modal) requestAnimationFrame(() => dom.modal.querySelector("button:not([disabled]),input,select,textarea")?.focus());
}

function renderVoiceRoot() {
  const voiceState = voiceController.getState();
  dom.voice.innerHTML = renderVoiceRoom(voiceState, state);
  dom.voice.hidden = !voiceState.active;
  document.querySelector("#app-frame")?.toggleAttribute("inert", Boolean(ui.modal) || voiceState.active);
}

function openModal(modal) {
  modalReturnFocus = document.activeElement;
  ui.modal = modal;
  renderModalRoot();
}

function closeModal() {
  ui.modal = null;
  renderModalRoot();
  modalReturnFocus?.focus?.();
  modalReturnFocus = null;
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => dom.toast.classList.remove("show"), 2800);
}

function navigate(route) {
  if (!ROUTES.includes(route)) return;
  if (state.activeWorkout && ui.route === "train" && ui.showActiveWorkout) {
    state = store.update(draft => { if (draft.activeWorkout) draft.activeWorkout.scrollTop = window.scrollY; });
  }
  ui.route = route;
  ui.exerciseDetailId = null;
  if (route === "train" && state.activeWorkout) ui.showActiveWorkout = true;
  const url = new URL(location.href);
  url.searchParams.set("v", CACHE_GENERATION);
  url.searchParams.set("route", route);
  history.replaceState({}, "", url);
  render();
  requestAnimationFrame(() => window.scrollTo({ top: route === "train" && state.activeWorkout ? state.activeWorkout.scrollTop || 0 : 0, behavior: "instant" }));
}

function stageProposal(proposal) {
  state = store.update(draft => { draft.pendingPlanProposal = proposal; });
  openModal({ type: "proposal" });
  renderAppScreen();
  renderModalRoot();
}

function stageCandidate(candidate, reason, changes) {
  stageProposal({
    id: uid("proposal"),
    status: "pending",
    baseVersionId: state.activePlan.versionId,
    createdAt: new Date().toISOString(),
    reason,
    changes,
    candidate: { ...deepClone(candidate), versionId: uid("plan-version"), createdAt: new Date().toISOString() },
  });
}

function proposePlan(field, value) {
  const parsed = field === "minutes" ? Number(value) : value;
  const proposal = createPlanProposal(state, EXERCISES, { [field]: parsed, reason: `Today’s ${field} changed. FitCoach rebuilt only the affected deterministic plan inputs.` });
  stageProposal(proposal);
}

function approveProposal(id) {
  state = store.update(draft => approvePlanProposal(draft, id));
  closeModal();
  toast("Plan version approved and activated.");
  render();
}

function rejectProposal(id) {
  state = store.update(draft => rejectPlanProposal(draft, id));
  closeModal();
  toast("Current plan kept.");
  render();
}

function startWorkout(planId) {
  if (state.activeWorkout) return resumeWorkout();
  const plan = planId === state.activePlan.id
    ? state.activePlan
    : buildPlan(state, EXERCISES, { planId, minutes: planId === "MIN" ? 12 : planId === "B" ? Math.min(30,state.activePlan.minutes) : state.activePlan.minutes });
  state = store.update(draft => { draft.activeWorkout = startWorkoutFromPlan(plan); });
  ui.route = "train";
  ui.trainSegment = "workout";
  ui.showActiveWorkout = true;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  toast(`${plan.label} started. Every change is saved locally.`);
}

function resumeWorkout() {
  ui.route = "train";
  ui.showActiveWorkout = true;
  render();
  requestAnimationFrame(() => window.scrollTo({ top: state.activeWorkout?.scrollTop || 0, behavior: "instant" }));
}

function updateSetField(element) {
  if (state.activeWorkout?.status === "paused") return;
  const exerciseIndex = Number(element.dataset.exerciseIndex);
  const setIndex = Number(element.dataset.setIndex);
  const field = element.dataset.field;
  const bounds = field === "weight" ? [0,5_000] : field === "reps" ? [0,1_000] : [1,10];
  const value = element.value === "" && field === "rpe" ? null : safeNumber(element.value,0,...bounds);
  state = store.update(draft => {
    const set = draft.activeWorkout?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (set && ["weight","reps","rpe"].includes(field)) {
      set[field] = value;
      set.error = "";
      if (field === "weight") set.unit = draft.activeWorkout.units || draft.settings.units;
    }
  });
}

function toggleSet(element) {
  if (state.activeWorkout?.status === "paused") return toast("Resume the workout before changing sets.");
  const exerciseIndex = Number(element.dataset.exerciseIndex);
  const setIndex = Number(element.dataset.setIndex);
  state = store.update(draft => {
    const set = draft.activeWorkout?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!set) return;
    if (!set.done) {
      set.unit = draft.activeWorkout.units || draft.settings.units;
      if (!isValidCompletedSet({ ...set, done: true })) {
        set.done = false;
        set.completedAt = null;
        set.error = "Enter at least 1 rep before completing this set.";
        return;
      }
    }
    set.error = "";
    set.done = !set.done;
    set.completedAt = set.done ? new Date().toISOString() : null;
    if (set.done && draft.settings.autoRestTimer) {
      startRestTimer(draft.activeWorkout, draft.activeWorkout.exercises[exerciseIndex].target.restSeconds || 90);
    }
  });
  render();
}

function formatClock(seconds) {
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}

function updateRestDisplays() {
  if (!state?.activeWorkout) return;
  const seconds = restSecondsRemaining(state.activeWorkout);
  document.querySelectorAll("[data-rest-display]").forEach(node => { node.textContent = formatClock(seconds); });
  const mini = document.querySelector(".mini-player small");
  if (mini && seconds) mini.textContent = `REST · ${formatClock(seconds)}`;
  if (!seconds && state.activeWorkout.restTimer.running) {
    state = store.update(draft => { if (draft.activeWorkout) draft.activeWorkout.restTimer.running = false; });
    if (state.settings.workoutCues) toast("Rest complete. Your next set is ready.");
    render();
  }
}

function beginRestTicker() {
  clearInterval(restTicker);
  restTicker = setInterval(updateRestDisplays, 1_000);
}

function completeActiveWorkout() {
  const result = completeWorkout(state);
  if (result.error) return toast(result.error === "NO_COMPLETED_SETS" ? "Complete at least one valid set before finishing." : "This workout could not be saved twice.");
  state = store.replace(result.state);
  closeModal();
  ui.showActiveWorkout = false;
  ui.modal = { type: "completion" };
  render();
}

function planMutation(type, index) {
  const candidate = deepClone(state.activePlan);
  if (type === "remove") {
    if (candidate.exercises.length <= 2) return toast("Keep at least two exercises in this plan version.");
    const [removed] = candidate.exercises.splice(index,1);
    stageCandidate(candidate, "You asked to remove one exercise.", [`Remove ${removed.snapshot.name}`, `${candidate.exercises.length} exercises remain`]);
  } else if (type === "reorder") {
    const next = (index + 1) % candidate.exercises.length;
    const [item] = candidate.exercises.splice(index,1);
    candidate.exercises.splice(next,0,item);
    stageCandidate(candidate, "You asked to reorder one exercise.", [`Move ${item.snapshot.name} to position ${next+1}`]);
  }
}

function setExercisePreference(kind, exerciseId) {
  state = store.update(draft => {
    const groups = ["preferred","reduced","excluded"];
    groups.forEach(group => { draft.exercisePreferences[group] = draft.exercisePreferences[group].filter(id => id !== exerciseId); });
    if (kind && groups.includes(kind)) draft.exercisePreferences[kind].push(exerciseId);
  });
  render();
}

function toggleFavorite(exerciseId) {
  state = store.update(draft => {
    const list = draft.exercisePreferences.favorites;
    draft.exercisePreferences.favorites = list.includes(exerciseId) ? list.filter(id => id !== exerciseId) : [...list,exerciseId];
  });
  render();
}

function dynamicVoiceSettings() {
  const tone = String(state.profile.tone || "Direct").toLowerCase();
  const prosody = {
    supportive: { rate: .94, pitch: 1.04 },
    direct: { rate: 1.02, pitch: .98 },
    strict: { rate: .97, pitch: .9 },
    competitive: { rate: 1.08, pitch: 1.02 },
  }[tone] || { rate: 1, pitch: 1 };
  const pattern = {
    nova: /Samantha|Ava|Serena|Allison|Jenny|Aria|Karen|Moira/i,
    atlas: /Daniel|Alex|Aaron|Fred|Tom|Arthur|Oliver/i,
  }[state.settings.voicePersona] || /Premium|Enhanced|Natural|Siri/i;
  return { ...prosody, pattern };
}

function stopSpeech({ renderCoach = true } = {}) {
  const handle = activeSpeech;
  activeSpeech = null;
  activeSpeechToken = null;
  try { handle?.cancel?.(); } catch {}
  try { speechSynthesis?.cancel?.(); } catch {}
  activeUtterance = null;
  ui.speakingMessageId = null;
  if (renderCoach && ui.route === "coach") render();
}

function speakDeviceText(text, { onEnd = () => {}, onError = () => {} } = {}) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    onError(new Error("DEVICE_SPEECH_UNAVAILABLE"));
    return { cancel() {} };
  }
  const profile = dynamicVoiceSettings();
  const utterance = new SpeechSynthesisUtterance(String(text).replace(/\s+/g," ").trim().slice(0,2_400));
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(voice => profile.pattern.test(voice.name) && /^en[-_]/i.test(voice.lang)) || voices.find(voice => /^en[-_]/i.test(voice.lang)) || voices[0] || null;
  utterance.rate = profile.rate;
  utterance.pitch = profile.pitch;
  activeUtterance = utterance;
  utterance.onend = () => { if (activeUtterance !== utterance) return; activeUtterance = null; onEnd(); };
  utterance.onerror = error => { if (activeUtterance !== utterance) return; activeUtterance = null; onError(error); };
  speechSynthesis.speak(utterance);
  return {
    cancel() {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      try { speechSynthesis.cancel(); } catch {}
    },
  };
}

function speakText(text, { messageId = null, onEnd = () => {}, onError = () => {} } = {}) {
  stopSpeech({ renderCoach: false });
  const token = {};
  activeSpeechToken = token;
  ui.speakingMessageId = messageId;

  const finish = (kind, error) => {
    if (activeSpeechToken !== token) return;
    activeSpeechToken = null;
    activeSpeech = null;
    activeUtterance = null;
    ui.speakingMessageId = null;
    if (kind === "end") onEnd();
    else {
      onError(error);
      if (messageId) toast("Voice playback is unavailable; the text reply is still saved.");
    }
    if (ui.route === "coach") render();
  };

  activeSpeech = premiumVoice.speak({
    text,
    sessionId: `fitcoach-${ui.founder}-voice-v040`,
    tone: state.profile.tone,
    voicePersona: state.settings.voicePersona,
    deviceFallback: callbacks => speakDeviceText(text, callbacks),
    onEnd: () => finish("end"),
    onError: error => finish("error", error),
    onMetadata: metadata => {
      if (activeSpeechToken !== token) return;
      ui.voiceProvider = metadata.provider === "elevenlabs" ? "elevenlabs" : "device-fallback";
      if (ui.route === "coach") render();
    },
  });
  if (ui.route === "coach") render();
  return { cancel: () => { if (activeSpeechToken === token) stopSpeech(); } };
}

async function sendChat(raw = null) {
  if (ui.chatBusy) return;
  const input = document.querySelector("#coach-input");
  const message = String(raw ?? input?.value ?? ui.chatDraft).normalize("NFKC").trim().slice(0,2_000);
  if (!message) return;
  if (isPrivateTrainerInput(message)) {
    ui.chatNotice = { kind: "private", title: "Message not sent", message: "Remove personal, medical, measurement, medication, identifier, or credential details. This draft was not saved." };
    ui.chatDraft = "";
    render();
    return;
  }
  ui.chatBusy = true;
  ui.pendingMessage = message;
  ui.chatDraft = "";
  ui.chatNotice = null;
  chatRequestController = new AbortController();
  render();
  const result = await trainerClient.requestTurn({ state: store.get(), message, approvedAction: decision.type, founder: ui.founder, signal: chatRequestController.signal });
  chatRequestController = null;
  ui.chatBusy = false;
  ui.pendingMessage = "";
  if (result.status === "safety") {
    ui.chatNotice = { kind: "safety", title: "Safety boundary", message: result.reply };
    render();
    return;
  }
  if (result.status !== "ready") {
    ui.lastFailedChatDraft = message;
    ui.chatNotice = { kind: "error", title: "Live trainer unavailable", message: "Your text is retained only as an editable local draft. Nothing was retried automatically and your plan did not change.", retryable: true };
    render();
    return;
  }
  const trainerAction = deriveTrainerAction({ state: store.get(), message, exercises: EXERCISES });
  const at = new Date().toISOString();
  const userMessage = { id: uid("message"), role: "user", text: message, at };
  const coachMessage = { id: uid("message"), role: "coach", text: result.reply, at: new Date().toISOString(), provider: result.provider, model: result.model, speakAllowed: result.speakAllowed, action: trainerAction };
  userMessage.providerEligible = true;
  userMessage.contractVersion = "fitcoach-chat-v3";
  coachMessage.providerEligible = true;
  coachMessage.contractVersion = "fitcoach-chat-v3";
  state = store.update(draft => {
    draft.chat.push(userMessage,coachMessage);
    draft.lastApi = { at, provider: result.provider, model: result.model, fallbackUsed: Boolean(result.fallbackUsed), approvedAction: decision.type, route: "fitcoach-chat-v3-contract" };
  });
  ui.chatNotice = null;
  render();
  if (state.settings.speakReplies && result.speakAllowed) speakText(coachMessage.text,{messageId:coachMessage.id});
}

const browserVoice = createBrowserVoiceAdapters(window);
const voiceSpeech = {
  speak({ text, onEnd, onError }) { return speakText(text,{onEnd,onError}); },
  cancel() { stopSpeech({renderCoach:false}); },
};

const voiceController = createVoiceRoomController({
  recognitionFactory: browserVoice.recognitionFactory,
  speech: voiceSpeech,
  classifyInput: transcript => ({ kind: isPrivateTrainerInput(transcript) ? "private" : "normal" }),
  requestTurn: async ({ transcript, signal }) => {
    const result = await trainerClient.requestTurn({ state: store.get(), message: transcript, approvedAction: decision.type, founder: ui.founder, signal });
    voiceLastMetadata = result;
    if (result.status === "private_block") return { text: "", privateIntercepted: true, speak: false };
    if (result.status === "safety") return { text: result.reply, safetyIntercepted: true, speak: false };
    if (result.status !== "ready") throw Object.assign(new Error("Trainer reply unavailable"), { code: result.reason || "trainer_unavailable", userMessage: "Live trainer unavailable. Your transcript is retained locally for an explicit retry." });
    return { text: result.reply, speak: state.settings.speakReplies && result.speakAllowed };
  },
  onCommitTurn: turn => {
    const meta = voiceLastMetadata || {};
    const trainerAction = deriveTrainerAction({ state: store.get(), message: turn.transcript, exercises: EXERCISES });
    state = store.update(draft => {
      draft.chat.push(
        { id: uid("message"), role: "user", text: turn.transcript, at: new Date().toISOString(), source: "voice-transcript", providerEligible: true, contractVersion: "fitcoach-chat-v3" },
        { id: uid("message"), role: "coach", text: turn.reply, at: new Date().toISOString(), provider: meta.provider || "unknown", model: meta.model || "unknown", speakAllowed: meta.speakAllowed !== false, providerEligible: true, contractVersion: "fitcoach-chat-v3", action: trainerAction },
      );
      draft.lastApi = { at: new Date().toISOString(), provider: meta.provider || "unknown", model: meta.model || "unknown", fallbackUsed: Boolean(meta.fallbackUsed), approvedAction: decision.type, route: "fitcoach-chat-v3-contract" };
    });
    voiceLastMetadata = null;
  },
  onStateChange: () => renderVoiceRoot(),
  onSafety: () => { ui.chatNotice = { kind: "safety", title: "Voice stopped for safety", message: "Follow the safety guidance shown in Voice Room. The intercepted transcript was not added to chat." }; },
  createRoomId: serial => `fitcoach-${ui.founder}-voice-${serial}`,
});

function openVoiceRoom() {
  if (!navigator.onLine) return openModal({type:"offline"});
  voiceReturnFocus = document.activeElement;
  ui.route = "coach";
  render();
  voiceController.open({ consentGranted: state.settings.voiceConsent });
  renderVoiceRoot();
}

function openExercise(exerciseId) {
  if (!getExerciseById(exerciseId)) return toast("That local exercise record is unavailable.");
  ui.route = "train";
  ui.trainSegment = "exercises";
  ui.showActiveWorkout = false;
  ui.exerciseDetailId = exerciseId;
  ui.motionPaused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  render();
  window.scrollTo({top:0,behavior:"instant"});
}

function applyPlanExercise(exerciseId) {
  const exercise = getExerciseById(exerciseId);
  if (!exercise) return;
  const candidate = deepClone(state.activePlan);
  const item = {
    exerciseId: exercise.id,
    snapshot: { id:exercise.id,name:exercise.name,movementPattern:exercise.movementPattern,equipment:[...exercise.equipment],primaryMuscles:[...exercise.primaryMuscles],mediaPoster:exercise.media[0]?.path || "" },
    target: { sets:3,reps:10,restSeconds:90,suggestedWeight:0 },
  };
  if (ui.replacementMode === "plan" && ui.replacementIndex != null) {
    const previous = candidate.exercises[ui.replacementIndex];
    candidate.exercises[ui.replacementIndex] = item;
    stageCandidate(candidate,"You selected a replacement exercise.",[`Replace ${previous.snapshot.name} with ${exercise.name}`]);
  } else {
    if (candidate.exercises.some(entry=>entry.exerciseId===exerciseId)) return toast("That exercise is already in the plan.");
    candidate.exercises.push(item);
    stageCandidate(candidate,"You selected an exercise to add.",[`Add ${exercise.name}`,`${candidate.exercises.length} exercises total`]);
  }
  ui.exerciseDetailId = null;
  ui.replacementIndex = null;
  ui.replacementMode = null;
  ui.addMode = false;
}

function handleDecision(kind) {
  const action = kind === "secondary" ? decision.secondary : decision.primary;
  if (!action) return;
  state = store.update(draft => {
    const item = draft.decisions.find(entry=>entry.id===decision.id);
    if (item) { item.outcome=kind; item.outcomeAt=new Date().toISOString(); }
    draft.interventionOutcomes.push({decisionId:decision.id,type:decision.type,outcome:kind,at:new Date().toISOString()});
  });
  if (action.kind === "route") navigate(action.value);
  else if (action.kind === "start_plan") startWorkout(action.value);
  else if (action.kind === "proposal") proposePlan(action.value === "light" ? "intensity" : "minutes", action.value === "light" ? "light" : Math.min(30,state.activePlan.minutes));
  else toast("Choice acknowledged. No plan was changed.");
}

async function forceRefresh() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations || []).map(registration=>registration.update()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith("fitcoach-")).map(key=>caches.delete(key)));
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set("v",`${CACHE_GENERATION}-${Date.now()}`);
  location.replace(url);
}

function exportData() {
  const blob = new Blob([store.export()],{type:"application/json"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fitcoach-v040-${ui.founder}-${new Date().toLocaleDateString("en-CA")}.json`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),500);
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const value = target.dataset.value || "";
  if (action === "choose-founder") { ui.founder=value; render(); return; }
  if (action === "enter-gate") {
    const accepted = document.querySelector("#founder-code")?.value.trim().toUpperCase() === ACCESS_CODE;
    document.querySelector("#gate-error")?.toggleAttribute("hidden",accepted);
    if (!accepted) return;
    saveSession();
    createStore(ui.founder);
    ui.mode = state.profile.onboarded ? "app" : "onboarding";
    ui.onboardingDraft = { profile:deepClone(state.profile),settings:deepClone(state.settings),consent:false };
    render();
    return;
  }
  if (action === "exit-onboarding") { ui.mode="gate"; render(); return; }
  if (action === "onboarding-choice") { ui.onboardingDraft.profile[target.dataset.field]=value; render(); return; }
  if (action === "onboarding-setting") { ui.onboardingDraft.settings[target.dataset.field]=value; if(target.dataset.field==="theme") applyTheme(value); render(); return; }
  if (action === "onboarding-toggle") { ui.onboardingDraft.profile[target.dataset.field]=target.checked; render(); return; }
  if (action === "onboarding-consent") { ui.onboardingDraft.consent=target.checked; render(); return; }
  if (action === "onboarding-back") { ui.onboardingStep=Math.max(0,ui.onboardingStep-1); render(); return; }
  if (action === "onboarding-next") {
    if (ui.onboardingStep<3) { ui.onboardingStep+=1; render(); return; }
    if (!ui.onboardingDraft.consent) return;
    state=store.update(draft=>{draft.profile={...draft.profile,...ui.onboardingDraft.profile,onboarded:true};draft.settings={...draft.settings,...ui.onboardingDraft.settings};draft.activePlan=buildPlan({...draft,profile:{...draft.profile,...ui.onboardingDraft.profile}},EXERCISES,{minutes:ui.onboardingDraft.profile.duration});draft.memories=[`Goal: ${draft.profile.goal}`,`${draft.profile.days} days/week`,`${draft.profile.duration}-minute sessions`,`Main blocker: ${draft.profile.blocker}`,`Tone: ${draft.profile.tone}`];});
    applyTheme(state.settings.theme);ui.mode="app";ui.route="today";ensureDecision();render();return;
  }
  if (action === "route") { closeModal(); navigate(value); return; }
  if (action === "train-segment") { ui.trainSegment=value;ui.exerciseDetailId=null;ui.showActiveWorkout=false;render();return; }
  if (action === "set-energy") { state=store.update(draft=>{draft.profile.energy=Number(value);draft.decisions=draft.decisions.filter(item=>item.date!==new Date().toLocaleDateString("en-CA"));});ensureDecision();render();toast("Energy check-in saved. Your worth did not change.");return; }
  if (action === "propose-plan") { proposePlan(target.dataset.field,value);return; }
  if (action === "approve-proposal") { approveProposal(value);return; }
  if (action === "reject-proposal") { rejectProposal(value);return; }
  if (action === "decision") { handleDecision(value);return; }
  if (action === "explain-decision") { openModal({type:"decision"});return; }
  if (action === "why-workout") { openModal({type:"why-workout"});return; }
  if (action === "start-workout") { startWorkout(value);return; }
  if (action === "resume-workout") { resumeWorkout();return; }
  if (action === "minimize-workout") { ui.showActiveWorkout=false;ui.route="today";render();return; }
  if (action === "toggle-set") { toggleSet(target);return; }
  if (action === "add-set") { if(state.activeWorkout?.status==="paused")return toast("Resume the workout before adding sets.");state=store.update(draft=>{const exercise=draft.activeWorkout?.exercises?.[draft.activeWorkout.currentExerciseIndex];if(exercise&&exercise.sets.length<20)exercise.sets.push({id:uid("set"),index:exercise.sets.length+1,kind:"work",weight:0,reps:exercise.target.reps||8,rpe:null,unit:draft.activeWorkout.units||draft.settings.units,done:false,completedAt:null,error:""});});render();return; }
  if (action === "adjust-rest") { state=store.update(draft=>{if(draft.activeWorkout)adjustRestTimer(draft.activeWorkout,Number(value));});render();return; }
  if (action === "stop-rest") { state=store.update(draft=>{if(draft.activeWorkout)draft.activeWorkout.restTimer={endsAt:null,durationSeconds:draft.activeWorkout.restTimer.durationSeconds,running:false,paused:false};});render();return; }
  if (action === "toggle-workout-pause") { state=store.update(draft=>{const workout=draft.activeWorkout;if(!workout)return;if(workout.status==="paused"){workout.accumulatedPausedMs+=(Date.now()-new Date(workout.pausedAt).getTime());workout.pausedAt=null;workout.status="active";if(workout.restTimer?.paused&&workout.restTimer.durationSeconds>0)startRestTimer(workout,workout.restTimer.durationSeconds);}else{workout.pausedAt=new Date().toISOString();workout.status="paused";const remaining=restSecondsRemaining(workout);if(workout.restTimer?.running&&remaining>0)workout.restTimer={...workout.restTimer,durationSeconds:remaining,endsAt:null,running:false,paused:true};}});render();return; }
  if (action === "previous-exercise") { state=store.update(draft=>{if(draft.activeWorkout)draft.activeWorkout.currentExerciseIndex=Math.max(draft.activeWorkout.currentExerciseIndex-1,0);});render();window.scrollTo({top:0,behavior:"smooth"});return; }
  if (action === "next-exercise") { state=store.update(draft=>{if(draft.activeWorkout)draft.activeWorkout.currentExerciseIndex=Math.min(draft.activeWorkout.currentExerciseIndex+1,draft.activeWorkout.exercises.length-1);});render();window.scrollTo({top:0,behavior:"smooth"});return; }
  if (action === "view-current-instructions") { const current=state.activeWorkout?.exercises?.[state.activeWorkout.currentExerciseIndex];if(current)openExercise(current.exerciseId);return; }
  if (action === "finish-workout") { openModal({type:"finish-workout"});return; }
  if (action === "confirm-finish-workout") { completeActiveWorkout();return; }
  if (action === "exit-workout") { openModal({type:"confirm-exit-workout"});return; }
  if (action === "confirm-exit-workout") { state=store.update(draft=>{draft.activeWorkout=null;});closeModal();ui.showActiveWorkout=false;navigate("train");return; }
  if (action === "rate-session") { state=store.update(draft=>{const session=draft.sessions.at(-1);if(session)session.rating=Number(value);});renderModalRoot();toast("Session rating saved locally.");return; }
  if (action === "close-completion") { closeModal();navigate(value);return; }
  if (action === "reorder-exercise") { planMutation("reorder",Number(value));return; }
  if (action === "remove-plan-exercise") { planMutation("remove",Number(value));return; }
  if (action === "swap-plan-exercise") { ui.replacementIndex=Number(value);ui.replacementMode="plan";ui.trainSegment="exercises";ui.exerciseDetailId=null;ui.showActiveWorkout=false;render();toast("Choose a replacement from the library.");return; }
  if (action === "add-exercise") { ui.addMode=true;ui.replacementMode="add";ui.replacementIndex=null;ui.trainSegment="exercises";render();return; }
  if (action === "save-routine") { state=store.update(draft=>{draft.workoutDrafts=[...(draft.workoutDrafts||[]),{id:uid("routine"),label:draft.activePlan.label,plan:deepClone(draft.activePlan),savedAt:new Date().toISOString()}].slice(-12);});toast("Routine snapshot saved locally.");return; }
  if (action === "open-exercise") { openExercise(value);return; }
  if (action === "close-exercise") { ui.exerciseDetailId=null;ui.replacementIndex=null;ui.replacementMode=null;ui.addMode=false;render();return; }
  if (action === "toggle-exercise-motion") { ui.motionPaused=!ui.motionPaused;render();return; }
  if (action === "toggle-favorite") { toggleFavorite(value);return; }
  if (action === "set-exercise-preference") { setExercisePreference(target.dataset.field,value);return; }
  if (action === "add-exercise-to-plan" || action === "confirm-exercise-replacement") {
    if (ui.replacementMode === "active") { ui.modal={type:"active-swap",exerciseId:value};renderModalRoot(); }
    else applyPlanExercise(value);
    return;
  }
  if (action === "swap-active-exercise") { const current=state.activeWorkout?.exercises?.[Number(value)];if(current?.sets.some(set=>set.done))return toast("Finish or undo completed sets before swapping this exercise.");ui.replacementMode="active";ui.replacementIndex=Number(value);ui.trainSegment="exercises";ui.exerciseDetailId=null;ui.showActiveWorkout=false;render();return; }
  if (action === "apply-active-swap") { state=store.update(draft=>{if(draft.activeWorkout)swapWorkoutExercise(draft.activeWorkout,ui.replacementIndex,getExerciseById(value));});ui.replacementIndex=null;ui.replacementMode=null;closeModal();ui.showActiveWorkout=true;render();toast("Exercise replaced in the active workout.");return; }
  if (action === "reorder-active-exercise") { state=store.update(draft=>{const workout=draft.activeWorkout;const index=Number(value);const direction=Number(target.dataset.direction)||1;const next=index+direction;if(!workout||next<0||next>=workout.exercises.length)return;const [item]=workout.exercises.splice(index,1);workout.exercises.splice(next,0,item);workout.currentExerciseIndex=next;});render();return; }
  if (action === "clear-exercise-search") { ui.exerciseFilters.query="";render();return; }
  if (action === "clear-exercise-filters") { ui.exerciseFilters={query:"",muscle:"",equipment:"",favorites:false};render();return; }
  if (action === "filter-exercises") { ui.exerciseFilters[target.dataset.field]=value;render();return; }
  if (action === "ask-about-exercise") { const exercise=getExerciseById(value);ui.chatDraft=`Explain how ${exercise?.name || "this exercise"} fits my current plan without changing it.`;navigate("coach");return; }
  if (action === "open-library") { ui.route="train";ui.trainSegment="exercises";ui.showActiveWorkout=false;render();return; }
  if (action === "set-theme") { state=store.update(draft=>{draft.settings.theme=value;});applyTheme(value);render();return; }
  if (action === "cycle-theme") { const order=["light","dark","system"];const next=order[(order.indexOf(state.settings.theme)+1)%order.length];state=store.update(draft=>{draft.settings.theme=next;});applyTheme(next);render();toast(`${next[0].toUpperCase()+next.slice(1)} theme selected.`);return; }
  if (action === "set-tone" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.profile.tone=value;draft.memories=[...draft.memories.filter(item=>!/^Tone:/i.test(item)),`Tone: ${value}`].slice(-24);});stopSpeech({renderCoach:false});render();return; }
  if (action === "quick-prompt") { if(value==="I only have 20 minutes."){proposePlan("minutes",20);ui.chatNotice={kind:"info",title:"20-minute option is ready for review",message:"FitCoach opened a deterministic proposal. Approve it before today’s plan changes."};render();return;}void sendChat(value);return; }
  if (action === "send-chat") { void sendChat();return; }
  if (action === "coach-message-action") {
    const kind = target.dataset.kind;
    if (kind === "open_exercise") openExercise(value);
    else if (kind === "open_workout") navigate("train");
    else if (kind === "propose_minutes") proposePlan("minutes",Number(value));
    else if (kind === "open_progress") navigate("progress");
    else if (kind === "open_voice") openVoiceRoom();
    return;
  }
  if (action === "restore-chat-draft") { ui.chatDraft=ui.lastFailedChatDraft;ui.chatNotice=null;render();requestAnimationFrame(()=>document.querySelector("#coach-input")?.focus());return; }
  if (action === "speak-message") { const message=state.chat.find(item=>item.id===value);if(!message)return;if(ui.speakingMessageId===value)stopSpeech();else speakText(message.text,{messageId:value});return; }
  if (action === "open-voice-room") { openVoiceRoom();return; }
  if (action === "voice-consent") { state=store.update(draft=>{draft.settings.voiceConsent=true;});voiceController.grantConsent();renderVoiceRoot();return; }
  if (action === "voice-exit" || action === "voice-text-mode") { voiceController.exit();renderVoiceRoot();ui.route="coach";render();voiceReturnFocus?.focus?.();voiceReturnFocus=null;return; }
  if (action === "voice-resume") { voiceController.resume();return; }
  if (action === "voice-retry") { voiceController.retry();return; }
  if (action === "voice-interrupt") { voiceController.interrupt();return; }
  if (action === "voice-mute") { voiceController.setMuted(!voiceController.getState().muted);return; }
  if (action === "voice-replay") { if(!voiceController.replayLast())toast("Replay is unavailable in this voice state.");return; }
  if (action === "connection-info") { if(!navigator.onLine)openModal({type:"offline"});else toast("Live text uses DeepSeek first, configured Qwen backup second, then local safe copy.");return; }
  if (action === "clear-chat") { openModal({type:"confirm-clear-chat"});return; }
  if (action === "confirm-clear-chat") { state=store.update(draft=>{draft.chat=[];});closeModal();render();return; }
  if (action === "reset-profile") { openModal({type:"confirm-reset"});return; }
  if (action === "confirm-reset") { state=store.reset();applyTheme(state.settings.theme);ui.onboardingStep=0;ui.onboardingDraft={profile:deepClone(state.profile),settings:deepClone(state.settings),consent:false};ui.mode="onboarding";closeModal();render();return; }
  if (action === "export-data") { exportData();return; }
  if (action === "force-refresh") { void forceRefresh();return; }
  if (action === "close-modal") { closeModal();return; }
}

function handleChange(event) {
  const target=event.target;
  const action=target.dataset.action;
  if (action === "onboarding-profile-field") { ui.onboardingDraft.profile[target.dataset.field]=target.value;render(); }
  if (action === "onboarding-number") { ui.onboardingDraft.profile[target.dataset.field]=Number(target.value);render(); }
  if (action === "onboarding-setting") { ui.onboardingDraft.settings[target.dataset.field]=target.value;if(target.dataset.field==="theme")applyTheme(target.value);render(); }
  if (action === "profile-field") { state=store.update(draft=>{draft.profile[target.dataset.field]=target.value;});render();toast("Profile saved. Review a proposal before changing today’s plan."); }
  if (action === "profile-number") { state=store.update(draft=>{draft.profile[target.dataset.field]=Number(target.value);});render();toast("Preference saved. The active plan did not change."); }
  if (action === "setting-field") { state=store.update(draft=>{draft.settings[target.dataset.field]=target.value;});render(); }
  if (action === "setting-toggle") { state=store.update(draft=>{draft.settings[target.dataset.field]=target.checked;});render(); }
  if (action === "profile-toggle") { state=store.update(draft=>{draft.profile[target.dataset.field]=target.checked;});render(); }
  if (action === "set-tone") { state=store.update(draft=>{draft.profile.tone=target.value;});stopSpeech({renderCoach:false});render(); }
  if (action === "set-answer-depth") { state=store.update(draft=>{draft.settings.coachMode=target.value;});render(); }
  if (action === "set-voice-persona") { state=store.update(draft=>{draft.settings.voicePersona=target.value;});stopSpeech({renderCoach:false});render(); }
  if (action === "filter-favorites") { ui.exerciseFilters.favorites=target.checked;render(); }
}

function handleInput(event) {
  const target=event.target;
  if (target.id === "exercise-search") { ui.exerciseFilters.query=target.value;render();requestAnimationFrame(()=>{const input=document.querySelector("#exercise-search");input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}); }
  if (target.dataset.action === "set-field") updateSetField(target);
  if (target.id === "workout-notes") state=store.update(draft=>{if(draft.activeWorkout)draft.activeWorkout.notes=target.value.slice(0,2_000);});
  if (target.id === "coach-input") ui.chatDraft=target.value;
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const root = voiceController.getState().active ? dom.voice : ui.modal ? dom.modal : null;
  if (!root) return;
  const focusable=[...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(node=>!node.hidden);
  if (!focusable.length) return;
  const first=focusable[0],last=focusable.at(-1);
  if (event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

function bootstrap() {
  const session=readSession();
  if(session){ui.founder=session.founder;createStore(ui.founder);ui.mode=state.profile.onboarded?"app":"onboarding";ui.onboardingDraft={profile:deepClone(state.profile),settings:deepClone(state.settings),consent:false};}
  else {ui.mode="gate";applyTheme(localStorage.getItem("fitcoach-theme")||"light");}
  const route=new URLSearchParams(location.search).get("route");
  if(ROUTES.includes(route))ui.route=route;
  document.addEventListener("click",handleClick);
  document.addEventListener("change",handleChange);
  document.addEventListener("input",handleInput);
  document.addEventListener("error",event=>{
    const image=event.target?.closest?.("[data-media-image]");
    if(!image)return;
    image.hidden=true;
    image.closest("figure")?.classList.add("media-error");
  },true);
  document.addEventListener("keydown",event=>{
    if((event.key==="Enter"||event.key===" ")&&event.target?.classList?.contains("voice-room-orb")){event.preventDefault();voiceController.interrupt();}
    if(event.key==="Escape"){if(voiceController.getState().active){voiceController.exit();render();voiceReturnFocus?.focus?.();voiceReturnFocus=null;}else if(ui.modal)closeModal();}
    if(event.key==="Enter"&&event.target.id==="founder-code")document.querySelector('[data-action="enter-gate"]')?.click();
    if(event.key==="Enter"&&event.target.id==="coach-input"&&!event.shiftKey){event.preventDefault();void sendChat();}
    trapDialogFocus(event);
  });
  window.addEventListener("online",()=>{render();toast("Back online. Live Coach is available.");});
  window.addEventListener("offline",()=>{voiceController.setForeground(false);render();});
  document.addEventListener("visibilitychange",()=>voiceController.setForeground(document.visibilityState==="visible"));
  window.addEventListener("pagehide",()=>{voiceController.exit();stopSpeech({renderCoach:false});chatRequestController?.abort();});
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(state?.settings.theme==="system")applyTheme("system");});
  if("serviceWorker" in navigator)navigator.serviceWorker.register(`./sw.js?v=${CACHE_GENERATION}`).then(registration=>registration.update()).catch(()=>{});
  beginRestTicker();
  render();
}

bootstrap();
