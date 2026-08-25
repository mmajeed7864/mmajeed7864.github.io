import {
  CACHE_GENERATION,
  DEFAULT_VOICE_BY_TONE,
  ROUTES,
} from "./core/constants.mjs";
import { createFitCoachStore } from "./core/store.mjs";
import { deepClone, escapeHtml, localDateKey, safeNumber, uid } from "./core/utils.mjs";
import { computeDecision } from "./domain/decisions.mjs";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  addEntryToDay,
  applyFoodEdit,
  applyPortionEdit,
  confirmNutritionEntry,
  copySlotFromDay,
  createFoodEntry,
  findEntry,
  mealSlotForHour,
  normalizeMultiplier,
  normalizeTargets,
  recordRecentFood,
  removeEntry as removeNutritionEntry,
  searchFoods,
  toggleFavoriteFood,
} from "./domain/nutrition.mjs";
import { DEMO_MEALS, estimatePhotoMeal, estimateTextMeal } from "./domain/nutrition-estimator.mjs";
import { deriveTrainerAction } from "./domain/trainer-actions.mjs";
import {
  adjustRestTimer,
  approvePlanProposal,
  buildPlan,
  buildProgressionTracker,
  buildWorkoutSchedule,
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
import { createNutritionClient, normalizeBarcode } from "./services/nutrition-client.mjs";
import { createPremiumVoiceClient } from "./services/voice-client.mjs";
import { renderCoachScreen, renderVoiceRoom } from "./ui/coach-screen.mjs";
import { icon } from "./ui/components.mjs";
import { ONBOARDING_STEP_COUNT, renderOnboarding } from "./ui/onboarding.mjs";
import { renderModal } from "./ui/modal.mjs";
import { renderNutritionScreen } from "./ui/nutrition-screen.mjs";
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
  mode: "onboarding",
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
  nutritionDate: null,
  speakingMessageId: null,
  voiceProvider: "premium-ready",
  voiceDocked: false,
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
// Photo previews live ONLY in this object URL — never in state or localStorage.
let nutritionPreviewUrl = null;
let communityPreviewUrl = null;
const communityPreviews = new Map();

function releaseNutritionPreview() {
  if (!nutritionPreviewUrl) return;
  try { URL.revokeObjectURL(nutritionPreviewUrl); } catch {}
  nutritionPreviewUrl = null;
}

function releaseCommunityPreview() {
  if (!communityPreviewUrl) return;
  try { URL.revokeObjectURL(communityPreviewUrl); } catch {}
  communityPreviewUrl = null;
}

function nutritionDateKey() {
  return ui.nutritionDate || localDateKey(new Date());
}

const trainerClient = createTrainerClient();
const nutritionClient = createNutritionClient();
const SILENT_AUDIO_URI = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
const sharedPremiumAudio = typeof Audio === "function" ? new Audio() : null;
let sharedVoiceAudioContext = null;
if (sharedPremiumAudio) {
  sharedPremiumAudio.preload = "auto";
  sharedPremiumAudio.setAttribute("playsinline", "");
}
function voiceAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!sharedVoiceAudioContext || sharedVoiceAudioContext.state === "closed") {
    sharedVoiceAudioContext = new AudioContextConstructor({ latencyHint: "interactive" });
  }
  return sharedVoiceAudioContext;
}

function webAudioHandle(blob, context) {
  let source = null;
  let cancelled = false;
  const handle = {
    preload: "auto",
    onended: null,
    onerror: null,
    async play() {
      try {
        await context.resume();
        const bytes = await blob.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (cancelled) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => { if (!cancelled) handle.onended?.(); };
        source.start(0);
      } catch (error) {
        if (!cancelled) handle.onerror?.(error);
        throw error;
      }
    },
    pause() {
      cancelled = true;
      try { source?.stop?.(); } catch {}
      try { source?.disconnect?.(); } catch {}
      source = null;
    },
  };
  return handle;
}

const premiumVoice = createPremiumVoiceClient({
  audioFactory: (url, { blob } = {}) => {
    const context = sharedVoiceAudioContext;
    if (blob && context?.state === "running") return webAudioHandle(blob, context);
    if (!sharedPremiumAudio) return new Audio(url);
    sharedPremiumAudio.src = url;
    sharedPremiumAudio.preload = "auto";
    sharedPremiumAudio.loop = false;
    sharedPremiumAudio.muted = false;
    sharedPremiumAudio.volume = 1;
    return sharedPremiumAudio;
  },
});

function unlockVoicePlayback() {
  const context = voiceAudioContext();
  try { void context?.resume?.(); } catch {}
  try { speechSynthesis?.resume?.(); } catch {}
  try {
    if ("SpeechSynthesisUtterance" in window && speechSynthesis?.speak) {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      primer.rate = 10;
      speechSynthesis.speak(primer);
    }
  } catch {}
  if (!sharedPremiumAudio || sharedPremiumAudio.dataset.fitcoachUnlocked === "true") return;
  try {
    sharedPremiumAudio.muted = true;
    sharedPremiumAudio.src = SILENT_AUDIO_URI;
    sharedPremiumAudio.load?.();
    const attempt = sharedPremiumAudio.play();
    Promise.resolve(attempt).then(() => {
      sharedPremiumAudio.pause();
      sharedPremiumAudio.currentTime = 0;
      sharedPremiumAudio.muted = false;
      sharedPremiumAudio.dataset.fitcoachUnlocked = "true";
    }).catch(() => { sharedPremiumAudio.muted = false; });
  } catch {
    sharedPremiumAudio.muted = false;
  }
}

function createStore(founder) {
  store = createFitCoachStore({ founder });
  state = store.load();
  migrateLegacyVoiceDefault();
  ensurePlan();
  ensureDecision();
  applyTheme(state.settings.theme);
}

function migrateLegacyVoiceDefault() {
  if (state.settings.voiceProfileMigrated0402) return;
  state = store.update(draft => {
    const recommended = DEFAULT_VOICE_BY_TONE[draft.profile.tone];
    if (recommended && (draft.settings.voicePersona === "nova" || draft.settings.voicePersona === "atlas")) {
      draft.settings.voicePersona = recommended;
    }
    draft.settings.voiceProfileMigrated0402 = true;
  });
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
  const color = resolved === "dark" ? "#061126" : "#F5F8FF";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function routeTitle(route) {
  return {
    today: ["TODAY", "Your training day"],
    train: ["TRAIN", ui.trainSegment === "exercises" ? "Exercise library" : ui.trainSegment === "schedule" ? "Workout schedule" : "Your workout"],
    coach: ["COACH", "Your trainer"],
    progress: ["PROGRESS", "Proof of the work"],
    profile: ["PROFILE", "Your FitCoach"],
    nutrition: ["NUTRITION", "Confirmed-only diary"],
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
  if (!navigator.onLine) return { label: "Offline mode", state: "offline" };
  if (ui.chatBusy) return { label: "Checking coach", state: "busy" };
  if (ui.chatNotice?.kind === "error") return { label: "Last request failed", state: "error" };
  if (state?.lastApi?.fallbackUsed) return { label: "Ready with offline guidance", state: "fallback" };
  if (state?.lastApi?.at) return { label: "Live reply received", state: "live" };
  return { label: "Coach status", state: "unverified" };
}

function renderHeader() {
  const [kicker, title] = routeTitle(ui.route);
  const connection = coachConnection();
  return `<header class="app-header">
    <button class="brand-button brand-lockup" data-action="route" data-value="today" aria-label="Open FitCoach Today">
      <span class="brand-mark" aria-hidden="true"><span>F</span></span>
      <span class="brand-wordmark"><b>FitCoach</b><small>AI personal trainer</small></span>
    </button>
    <div class="page-identity"><small>${escapeHtml(kicker)}</small><b>${escapeHtml(title)}</b></div>
    <div class="header-actions">
      <button class="connection-pill" data-action="connection-info" aria-label="Coach connection: ${escapeHtml(connection.label)}"><span class="status-dot ${escapeHtml(connection.state)}"></span><span>${escapeHtml(connection.label)}</span></button>
      <button class="theme-quick" data-action="cycle-theme" aria-label="Change theme">${state.settings.theme === "dark" ? "☾" : state.settings.theme === "system" ? "◐" : "☀"}</button>
      <button class="header-avatar" data-action="route" data-value="profile" aria-label="Open profile">${icon("profile")}</button>
    </div>
  </header>`;
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
    workoutSchedule: buildWorkoutSchedule(state, EXERCISES),
    progressionRows: buildProgressionTracker(state, EXERCISES),
    exerciseById: getExerciseById,
    filteredExercises: filteredLibrary(),
    ui,
    coachConnection: coachConnection(),
    communityPreviews,
    now: new Date(),
  };
  let screen;
  if (ui.route === "today") screen = renderTodayScreen(context);
  if (ui.route === "train") screen = renderTrainScreen(context);
  if (ui.route === "coach") screen = renderCoachScreen(context);
  if (ui.route === "progress") screen = renderProgressScreen(context);
  if (ui.route === "profile") screen = renderProfileScreen(context);
  if (ui.route === "nutrition") screen = renderNutritionScreen(context);
  const activeWorkoutFullscreen = ui.route === "train" && state.activeWorkout && ui.showActiveWorkout;
  const exerciseDetailFullscreen = ui.route === "train" && Boolean(ui.exerciseDetailId);
  const focusedSurface = activeWorkoutFullscreen || exerciseDetailFullscreen;
  dom.stage.innerHTML = `${focusedSurface ? "" : renderHeader()}<main id="main-content" class="app-main">${screen}</main>`;
  dom.nav.hidden = focusedSurface;
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
  if (ui.mode === "onboarding") {
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
  dom.modal.innerHTML = renderModal(ui.modal, { state, decision, exerciseById: getExerciseById, previewUrl: nutritionPreviewUrl, communityPreviewUrl });
  dom.modal.hidden = !ui.modal;
  document.querySelector("#app-frame")?.toggleAttribute("inert", Boolean(ui.modal) || (voiceController.getState().active && !ui.voiceDocked));
  if (ui.modal) requestAnimationFrame(() => dom.modal.querySelector("button:not([disabled]),input,select,textarea")?.focus());
}

function maybeOpenTutorial() {
  if (ui.mode !== "app" || ui.modal || state?.settings?.tutorialDismissed) return;
  ui.modal = { type: "tutorial", step: 0 };
}

function renderVoiceRoot() {
  const voiceState = voiceController.getState();
  const previousVoiceAction = dom.voice.contains(document.activeElement)
    ? document.activeElement?.dataset?.action
    : null;
  dom.voice.innerHTML = renderVoiceRoom(voiceState, state, { docked: ui.voiceDocked });
  dom.voice.hidden = !voiceState.active;
  dom.voice.classList.toggle("docked", Boolean(voiceState.active && ui.voiceDocked));
  document.querySelector("#app-frame")?.toggleAttribute("inert", Boolean(ui.modal) || (voiceState.active && !ui.voiceDocked));
  if (voiceState.active && !ui.voiceDocked) {
    const preservedControl = previousVoiceAction
      ? dom.voice.querySelector(`[data-action="${previousVoiceAction}"]`)
      : null;
    const phaseControl = dom.voice.querySelector('[data-action="voice-consent"], [data-action="voice-resume"], [data-action="voice-retry"], .voice-room-orb, .voice-text-exit, [data-action="voice-exit"]');
    (preservedControl || phaseControl)?.focus({ preventScroll: true });
  }
}

function openModal(modal) {
  modalReturnFocus = document.activeElement;
  ui.modal = modal;
  renderModalRoot();
}

function closeModal() {
  if (ui.modal && typeof ui.modal.type === "string" && ui.modal.type.startsWith("nutrition-")) releaseNutritionPreview();
  if (ui.modal?.type === "community-draft") releaseCommunityPreview();
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

function applyTonePreference(draft, tone) {
  draft.profile.tone = tone;
  draft.settings.voicePersona = DEFAULT_VOICE_BY_TONE[tone] || draft.settings.voicePersona;
  draft.memories = [...draft.memories.filter(item => !/^Tone:/i.test(item)), `Tone: ${tone}`].slice(-24);
}

function applyOnboardingTone(tone) {
  ui.onboardingDraft.profile.tone = tone;
  ui.onboardingDraft.settings.voicePersona = DEFAULT_VOICE_BY_TONE[tone] || ui.onboardingDraft.settings.voicePersona;
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
  const proposal = createPlanProposal(state, EXERCISES, { [field]: parsed, reason: `Today’s ${field} changed. FitCoach rebuilt only the affected part of your plan.` });
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

function startScheduledWorkout(slotId) {
  if (state.activeWorkout) return resumeWorkout();
  const slot = buildWorkoutSchedule(state, EXERCISES).find(item => item.id === slotId);
  if (!slot) return toast("That scheduled workout is no longer available.");
  state = store.update(draft => { draft.activeWorkout = startWorkoutFromPlan(slot.plan); });
  ui.route = "train";
  ui.trainSegment = "workout";
  ui.showActiveWorkout = true;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  toast(`${slot.label} started. This session stays linked to ${slot.dayLabel}.`);
}

function startSavedRoutine(routineId) {
  if (state.activeWorkout) return resumeWorkout();
  const routine = (state.workoutDrafts || []).find(item => item.id === routineId && item.plan?.exercises?.length);
  if (!routine) return toast("That saved routine is no longer available.");
  const plan = { ...deepClone(routine.plan), id: routine.plan.id || "saved-routine", label: routine.label || routine.plan.label || "Saved workout" };
  state = store.update(draft => { draft.activeWorkout = startWorkoutFromPlan(plan); });
  ui.route = "train";
  ui.trainSegment = "workout";
  ui.showActiveWorkout = true;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  toast(`${plan.label} started from your saved routines.`);
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
    rude: { rate: 1.04, pitch: .92 },
  }[tone] || { rate: 1, pitch: 1 };
  const pattern = {
    nova: /Samantha|Ava|Serena|Allison|Jenny|Aria|Karen|Moira/i,
    atlas: /Daniel|Alex|Aaron|Fred|Tom|Arthur|Oliver/i,
    bennett: /Daniel|Arthur|Oliver|Jamie|Thomas|James|British|English|UK/i,
    mira: /Samantha|Ava|Serena|Allison|Jenny|Aria|Karen|Moira|Tessa/i,
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
      ui.voiceProvider = metadata.provider === "elevenlabs"
        ? "elevenlabs"
        : /rate_limited|budget/u.test(String(metadata.fallbackReason || ""))
          ? "premium-limited"
          : "device-fallback";
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
    return { text: result.reply, speak: result.speakAllowed !== false };
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
    if (trainerAction) queueMicrotask(() => executeTrainerAction(trainerAction, { fromVoice: true }));
  },
  onStateChange: () => renderVoiceRoot(),
  onSafety: () => { ui.chatNotice = { kind: "safety", title: "Voice stopped for safety", message: "Follow the safety guidance shown in Voice Room. The intercepted transcript was not added to chat." }; },
  createRoomId: serial => `fitcoach-${ui.founder}-voice-${serial}`,
});

function openVoiceRoom() {
  if (!navigator.onLine) return openModal({type:"offline"});
  stopSpeech({ renderCoach: false });
  unlockVoicePlayback();
  voiceReturnFocus = document.activeElement;
  ui.voiceDocked = false;
  ui.route = "coach";
  render();
  voiceController.open({ consentGranted: state.settings.voiceConsent });
  renderVoiceRoot();
}

function executeTrainerAction(trainerAction, { fromVoice = false } = {}) {
  if (!trainerAction) return false;
  if (fromVoice) ui.voiceDocked = true;
  const { kind, value } = trainerAction;
  if (kind === "open_exercise") openExercise(value);
  else if (kind === "open_workout") { ui.trainSegment = "schedule"; navigate("train"); }
  else if (kind === "propose_minutes") proposePlan("minutes", Number(value));
  else if (kind === "open_progress") navigate("progress");
  else if (kind === "open_voice") {
    if (!voiceController.getState().active) openVoiceRoom();
    else { ui.voiceDocked = false; renderVoiceRoot(); }
  }
  else if (kind === "open_nutrition") { closeModal(); navigate("nutrition"); }
  else if (kind === "nutrition_draft") {
    ui.nutritionDate = null;
    const estimate = estimateTextMeal(value, new Date());
    createDraftFromEstimate(estimate, estimate.suggestedSlot);
  } else return false;
  renderVoiceRoot();
  return true;
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


// ── Nutrition flows ─────────────────────────────────────────────────────────
// The ONLY call to confirmNutritionEntry in this app lives in the
// "nutrition-confirm-entry" click handler, which is rendered exclusively by the
// draft review sheet. A camera/text draft therefore cannot become confirmed
// without the user pressing that button.

function syncReviewEdits() {
  const modal = ui.modal;
  if (!modal || modal.type !== "nutrition-review") return;
  const name = document.querySelector("#review-name")?.value;
  const per = {
    calories: document.querySelector("#review-kcal")?.value,
    protein: document.querySelector("#review-protein")?.value,
    carbs: document.querySelector("#review-carbs")?.value,
    fat: document.querySelector("#review-fat")?.value,
  };
  if (name === undefined && per.calories === undefined) return;
  state = store.update(draft => {
    applyFoodEdit(draft.nutrition, modal.dateKey, modal.entryId, { name, per });
  });
}

function openNutritionReview(dateKey, entryId) {
  ui.route = "nutrition";
  openModal({ type: "nutrition-review", dateKey, entryId });
  render();
}

function createDraftFromEstimate(result, slot, { photoFile = null } = {}) {
  releaseNutritionPreview();
  if (photoFile) {
    try { nutritionPreviewUrl = URL.createObjectURL(photoFile); } catch { nutritionPreviewUrl = null; }
  }
  const dateKey = nutritionDateKey();
  let entryId = null;
  state = store.update(draft => {
    const entry = createFoodEntry({
      slot,
      source: photoFile ? "photo_estimate" : "text_estimate",
      food: result.food,
      multiplier: 1,
      estimate: result.estimate,
      photo: result.photo,
    });
    if (entry && addEntryToDay(draft.nutrition, dateKey, entry)) entryId = entry.id;
  });
  if (!entryId) {
    releaseNutritionPreview();
    toast("Could not create a draft estimate.");
    return null;
  }
  openNutritionReview(dateKey, entryId);
  return entryId;
}

function shiftNutritionDay(direction) {
  const current = new Date(`${nutritionDateKey()}T12:00:00`);
  current.setDate(current.getDate() + direction);
  const key = localDateKey(current);
  const todayKey = localDateKey(new Date());
  ui.nutritionDate = key >= todayKey ? null : key;
  render();
}

function addSelectedFood() {
  const modal = ui.modal;
  const selected = modal?.selected;
  const slot = MEAL_SLOTS.includes(modal?.slot) ? modal.slot : null;
  if (!selected || !slot) return toast("Choose a meal slot first.");
  const source = selected.origin === "favorite" ? "favorite" : selected.origin === "recent" ? "recent" : selected.origin === "barcode" ? "barcode" : "manual";
  const dateKey = nutritionDateKey();
  let added = false;
  state = store.update(draft => {
    const entry = createFoodEntry({ slot, source, food: selected, multiplier: modal.multiplier || 1 });
    if (entry && addEntryToDay(draft.nutrition, dateKey, entry)) {
      recordRecentFood(draft.nutrition, entry);
      added = true;
    }
  });
  closeModal();
  render();
  toast(added ? `Added to ${MEAL_SLOT_LABELS[slot].toLowerCase()}.` : "That entry could not be added.");
}

async function lookupBarcodeFood() {
  const modal = ui.modal;
  if (!modal || modal.type !== "nutrition-add") return;
  const barcode = normalizeBarcode(document.querySelector("#nutrition-barcode")?.value || modal.barcode || "");
  if (!barcode) {
    ui.modal = { ...modal, lookupError: "Enter 6–18 barcode digits." };
    renderModalRoot();
    return;
  }

  ui.modal = { ...modal, barcode, lookupBusy: true, lookupError: "" };
  renderModalRoot();
  const result = await nutritionClient.lookupBarcode({
    sessionId: `fitcoach-${ui.founder}-nutrition-v040`,
    barcode,
  });
  if (!ui.modal || ui.modal.type !== "nutrition-add") return;
  if (result.status !== "ready") {
    ui.modal = {
      ...ui.modal,
      lookupBusy: false,
      lookupError: result.reason === "FOOD_NOT_FOUND"
        ? "No verified product found for that barcode. You can still add it manually."
        : "Barcode lookup is unavailable right now. Try manual add.",
    };
    renderModalRoot();
    return;
  }
  ui.modal = {
    ...ui.modal,
    lookupBusy: false,
    lookupError: "",
    selected: result.food,
    multiplier: 1,
  };
  renderModalRoot();
  toast("Verified label data loaded. Review the portion before adding it.");
}

function addCustomFood() {
  const modal = ui.modal;
  const slot = MEAL_SLOTS.includes(modal?.slot) ? modal.slot : null;
  if (!slot) return toast("Choose a meal slot first.");
  const name = document.querySelector("#custom-name")?.value?.trim();
  const kcal = document.querySelector("#custom-kcal")?.value;
  if (!name || kcal === "" || kcal === undefined) return toast("A name and calories per serving are required.");
  const food = {
    name,
    servingLabel: document.querySelector("#custom-serving")?.value?.trim() || "1 serving",
    per: {
      calories: kcal,
      protein: document.querySelector("#custom-protein")?.value || 0,
      carbs: document.querySelector("#custom-carbs")?.value || 0,
      fat: document.querySelector("#custom-fat")?.value || 0,
    },
  };
  const dateKey = nutritionDateKey();
  let added = false;
  state = store.update(draft => {
    const entry = createFoodEntry({ slot, source: "manual", food, multiplier: 1 });
    if (entry && addEntryToDay(draft.nutrition, dateKey, entry)) {
      recordRecentFood(draft.nutrition, entry);
      added = true;
    }
  });
  if (!added) return toast("Check the custom food values — they did not validate.");
  closeModal();
  render();
  toast(`Added to ${MEAL_SLOT_LABELS[slot].toLowerCase()}.`);
}

function handleNutritionPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  const context = document.querySelector("#nutrition-context")?.value || ui.modal?.context || "";
  const slot = MEAL_SLOTS.includes(ui.modal?.slot) ? ui.modal.slot : mealSlotForHour(new Date().getHours());
  // Deterministic preview estimate: file CONTENT is never read or stored.
  const result = estimatePhotoMeal({ photoName: file.name, photoSize: file.size, context, now: new Date() });
  input.value = "";
  createDraftFromEstimate(result, slot, { photoFile: file });
}

function handleCommunityPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  releaseCommunityPreview();
  communityPreviewUrl = URL.createObjectURL(file);
  if (ui.modal?.type === "community-draft") {
    ui.modal.caption = document.querySelector("#community-caption")?.value || ui.modal.caption || "";
    ui.modal.visibility = ui.modal.visibility || "private";
  }
  input.value = "";
  renderModalRoot();
}

function setMotionState(figure, state, label) {
  if (!figure) return;
  figure.dataset.motionStatus = state;
  const status = figure.querySelector("[data-motion-status-label]");
  if (status && label) status.textContent = label;
}

function syncMotionToggle(figure, isPlaying) {
  if (!figure) return;
  const video = figure.querySelector("[data-media-video]");
  const button = figure.querySelector(".motion-toggle");
  if (!button) return;
  const name = video?.dataset.motionName || "exercise";
  button.setAttribute("aria-pressed", String(Boolean(isPlaying)));
  button.setAttribute("aria-label", `${isPlaying ? "Pause" : "Play"} ${name} movement guide`);
  button.innerHTML = `${icon(isPlaying ? "pause" : "play")}<span>${isPlaying ? "Pause motion" : "Play motion"}</span>`;
}

function playMotionVideo(figure, video) {
  if (!figure || !video) return;
  if (figure.dataset.motionPending === "true") return;
  if (video.error?.code) {
    figure.dataset.motionIntent = "pause";
    figure.classList.add("media-error");
    setMotionState(figure, "error", "Video could not load — try again");
    syncMotionToggle(figure, false);
    return;
  }
  if (!video.paused) {
    figure.dataset.motionIntent = "play";
    figure.classList.remove("media-paused", "media-error");
    setMotionState(figure, "playing", "Motion playing");
    syncMotionToggle(figure, true);
    return;
  }
  figure.dataset.motionIntent = "play";
  figure.dataset.motionPending = "true";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  figure.classList.remove("media-paused");
  setMotionState(figure, "loading", "Loading motion guide");
  const attempt = video.play?.();
  if (attempt?.then) {
    attempt.then(() => {
      delete figure.dataset.motionPending;
      figure.classList.remove("media-paused", "media-error");
      setMotionState(figure, "playing", "Motion playing");
      syncMotionToggle(figure, true);
    }).catch(() => {
      delete figure.dataset.motionPending;
      // iOS may reject autoplay while still allowing a user-initiated tap.
      // Treat that as paused, not as a broken asset.
      figure.dataset.motionIntent = "pause";
      if (video.error?.code) {
        figure.classList.add("media-error");
        setMotionState(figure, "error", "Motion unavailable — use the preview");
      } else {
        figure.classList.add("media-paused");
        setMotionState(figure, "paused", "Use Play motion to start the guide");
      }
      syncMotionToggle(figure, false);
    });
  } else {
    delete figure.dataset.motionPending;
  }
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const value = target.dataset.value || "";
  if (action === "exit-onboarding") { ui.mode=state?.profile?.onboarded ? "app" : "onboarding"; render(); return; }
  if (action === "onboarding-choice") { ui.onboardingDraft.profile[target.dataset.field]=value; render(); return; }
  if (action === "onboarding-setting") { ui.onboardingDraft.settings[target.dataset.field]=value; if(target.dataset.field==="theme") applyTheme(value); render(); return; }
  if (action === "onboarding-profile-field") { if(target.dataset.field==="tone") applyOnboardingTone(value); else ui.onboardingDraft.profile[target.dataset.field]=value; render(); return; }
  if (action === "onboarding-number") { ui.onboardingDraft.profile[target.dataset.field]=Number(value); render(); return; }
  if (action === "onboarding-toggle-focus") {
    const focusAreas = new Set(ui.onboardingDraft.profile.focusAreas || []);
    if (value === "full body") {
      if (focusAreas.has(value)) focusAreas.clear();
      else {
        focusAreas.clear();
        focusAreas.add(value);
      }
    } else {
      focusAreas.delete("full body");
      if (focusAreas.has(value)) focusAreas.delete(value);
      else if (focusAreas.size < 3) focusAreas.add(value);
      else return toast("Choose up to three areas, or switch to Full body.");
    }
    ui.onboardingDraft.profile.focusAreas = [...focusAreas];
    render();
    requestAnimationFrame(() => {
      [...document.querySelectorAll('[data-action="onboarding-toggle-focus"]')]
        .find(button => button.dataset.value === value)
        ?.focus({ preventScroll: true });
    });
    return;
  }
  if (action === "onboarding-setting-toggle") { ui.onboardingDraft.settings[target.dataset.field]=value ? value==="true" : target.checked; render(); return; }
  if (action === "onboarding-toggle") { ui.onboardingDraft.profile[target.dataset.field]=value ? value==="true" : target.checked; render(); return; }
  if (action === "onboarding-gym-equipment") {
    const equipment = new Set(ui.onboardingDraft.gymProfile?.equipment || []);
    if (equipment.has(value)) equipment.delete(value); else equipment.add(value);
    ui.onboardingDraft.gymProfile = { ...ui.onboardingDraft.gymProfile, equipment: [...equipment].slice(0, 60), source: "manual" };
    render();
    return;
  }
  if (action === "onboarding-consent") { ui.onboardingDraft.consent=target.checked; render(); return; }
  if (action === "onboarding-back") { ui.onboardingStep=Math.max(0,ui.onboardingStep-1); render(); return; }
  if (action === "onboarding-next") {
    if (ui.onboardingStep < ONBOARDING_STEP_COUNT - 1) { ui.onboardingStep+=1; render(); return; }
    if (!ui.onboardingDraft.consent) return;
    state=store.update(draft=>{draft.profile={...draft.profile,...ui.onboardingDraft.profile,onboarded:true};draft.settings={...draft.settings,...ui.onboardingDraft.settings};draft.gymProfile={...draft.gymProfile,...ui.onboardingDraft.gymProfile,source:"manual"};draft.activePlan=buildPlan({...draft,profile:{...draft.profile,...ui.onboardingDraft.profile},gymProfile:draft.gymProfile},EXERCISES,{minutes:ui.onboardingDraft.profile.duration});draft.memories=[`Goal: ${draft.profile.goal}`,`Focus: ${draft.profile.focusAreas?.join(", ") || "balanced training"}`,`${draft.profile.days} days/week`,`${draft.profile.duration}-minute sessions`,`Training space: ${draft.gymProfile.selectedGymName || draft.profile.location}`,`${draft.gymProfile.equipment.length} equipment types available`,`Main blocker: ${draft.profile.blocker}`,`Tone: ${draft.profile.tone}`];});
    applyTheme(state.settings.theme);ui.mode="app";ui.route="today";ensureDecision();maybeOpenTutorial();render();return;
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
  if (action === "start-scheduled-workout") { startScheduledWorkout(value);return; }
  if (action === "start-routine") { startSavedRoutine(value);return; }
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
  if (action === "toggle-exercise-motion") {
    const figure=target.closest(".exercise-motion");
    const video=figure?.querySelector("[data-media-video]");
    if(!video)return;
    if(video.paused){
      figure.dataset.motionIntent = "play";
      playMotionVideo(figure, video);
    }else{
      figure.dataset.motionIntent = "pause";
      video.pause?.();
      figure.classList.add("media-paused");
      setMotionState(figure, "paused", "Motion paused");
      syncMotionToggle(figure, false);
    }
    return;
  }
  if (action === "retry-exercise-motion") {
    const figure = target.closest(".exercise-motion");
    const video = figure?.querySelector("[data-media-video]");
    if (!figure || !video) return;
    figure.dataset.motionIntent = "play";
    delete figure.dataset.motionPending;
    figure.classList.remove("media-error", "media-paused");
    video.hidden = false;
    setMotionState(figure, "loading", "Reloading motion guide");
    video.load?.();
    // The canplay listener starts the loop after Safari rebuilds its Range
    // request. Calling play immediately after load can race on iOS.
    return;
  }
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
  if (action === "profile-edit") { ui.profileEditing=ui.profileEditing===value?null:value;render();return; }
  if (action === "profile-field" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.profile[target.dataset.field]=value;});render();toast("Profile saved. Review a proposal before changing today’s plan.");return; }
  if (action === "profile-number" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.profile[target.dataset.field]=Number(value);});render();toast("Preference saved. The active plan did not change.");return; }
  if (action === "setting-field" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.settings[target.dataset.field]=value;});render();return; }
  if (action === "cycle-theme") { const order=["light","dark","system"];const next=order[(order.indexOf(state.settings.theme)+1)%order.length];state=store.update(draft=>{draft.settings.theme=next;});applyTheme(next);render();toast(`${next[0].toUpperCase()+next.slice(1)} theme selected.`);return; }
  if (action === "set-tone" && target.tagName === "BUTTON") { state=store.update(draft=>applyTonePreference(draft,value));stopSpeech({renderCoach:false});render();return; }
  if (action === "set-answer-depth" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.settings.coachMode=value;});render();return; }
  if (action === "set-voice-persona" && target.tagName === "BUTTON") { state=store.update(draft=>{draft.settings.voicePersona=value;});stopSpeech({renderCoach:false});render();return; }
  if (action === "quick-prompt") { if(value==="I only have 20 minutes."){proposePlan("minutes",20);ui.chatNotice={kind:"info",title:"20-minute option is ready for review",message:"FitCoach opened a deterministic proposal. Approve it before today’s plan changes."};render();return;}void sendChat(value);return; }
  if (action === "send-chat") { void sendChat();return; }
  if (action === "coach-message-action") {
    executeTrainerAction({ kind: target.dataset.kind, value });
    return;
  }
  if (action === "restore-chat-draft") { ui.chatDraft=ui.lastFailedChatDraft;ui.chatNotice=null;render();requestAnimationFrame(()=>document.querySelector("#coach-input")?.focus());return; }
  if (action === "speak-message") { const message=state.chat.find(item=>item.id===value);if(!message)return;if(ui.speakingMessageId===value)stopSpeech();else speakText(message.text,{messageId:value});return; }
  if (action === "open-voice-room") { openVoiceRoom();return; }
  if (action === "voice-consent") { unlockVoicePlayback();state=store.update(draft=>{draft.settings.voiceConsent=true;});voiceController.grantConsent();renderVoiceRoot();return; }
  if (action === "voice-text-mode") { ui.voiceDocked=true;render();return; }
  if (action === "voice-expand") { ui.voiceDocked=false;renderVoiceRoot();return; }
  if (action === "voice-exit") { voiceController.exit();ui.voiceDocked=false;renderVoiceRoot();render();voiceReturnFocus?.focus?.();voiceReturnFocus=null;return; }
  if (action === "voice-resume") { unlockVoicePlayback();voiceController.resume();return; }
  if (action === "voice-retry") { voiceController.retry();return; }
  if (action === "voice-interrupt") { voiceController.interrupt();return; }
  if (action === "voice-mute") { voiceController.setMuted(!voiceController.getState().muted);return; }
  if (action === "voice-replay") { if(!voiceController.replayLast())toast("Replay is unavailable in this voice state.");return; }
  if (action === "connection-info") { if(!navigator.onLine)openModal({type:"offline"});else toast("Live coaching is ready. If the live service is unavailable, FitCoach falls back to safe local guidance.");return; }
  if (action === "open-apple-health-plan") { openModal({ type: "apple-health" }); return; }
  if (action === "mark-apple-health-planned") { state=store.update(draft=>{draft.integrations.appleHealth.status="planned";draft.integrations.appleHealth.syncMode="manual_until_ios";draft.integrations.appleHealth.requestedAt=new Date().toISOString();});closeModal();render();toast("Apple Health sync marked for the native iOS build.");return; }
  if (action === "open-pro-preview") { openModal({ type: "pro-preview" }); return; }
  if (action === "select-pro-plan") { state=store.update(draft=>{draft.integrations.payments.selectedPlan=value==="monthly"?"monthly":"yearly";draft.integrations.payments.status="preview";});renderModalRoot();renderAppScreen();return; }
  if (action === "mark-pro-preview") { state=store.update(draft=>{draft.integrations.payments.status="preview";});closeModal();render();toast("Pro preview saved. Payments are still not active.");return; }
  if (action === "open-exercise-roadmap") { openModal({ type: "exercise-roadmap" }); return; }
  if (action === "open-gym-setup") { openModal({ type: "gym-setup" }); return; }
  if (action === "save-gym-profile") { const selected=[...document.querySelectorAll('[data-action="gym-toggle-equipment"]:checked')].map(node=>node.dataset.value).filter(Boolean);state=store.update(draft=>{draft.gymProfile.selectedGymName=(document.querySelector("#gym-name")?.value || "").trim().slice(0,120);draft.gymProfile.selectedGymAddress=(document.querySelector("#gym-address")?.value || "").trim().slice(0,180);draft.gymProfile.equipment=selected.slice(0,60);draft.gymProfile.source="manual";});closeModal();render();toast("Equipment profile saved locally.");return; }
  if (action === "open-community-draft") { openModal({ type: "community-draft", caption: "", visibility: "private" }); return; }
  if (action === "community-visibility") { if (ui.modal?.type === "community-draft") { ui.modal.caption=document.querySelector("#community-caption")?.value || ui.modal.caption || "";ui.modal.visibility=["private","founders","public_preview"].includes(value)?value:"private";renderModalRoot(); } return; }
  if (action === "save-community-draft") { const caption=(document.querySelector("#community-caption")?.value || "").trim().slice(0,280);const visibility=["private","founders","public_preview"].includes(ui.modal?.visibility)?ui.modal.visibility:"private";if(!caption&&!communityPreviewUrl)return toast("Add a caption or photo before saving a draft.");const draftId=uid("social-draft");state=store.update(draft=>{draft.socialDrafts=[...(draft.socialDrafts || []),{id:draftId,status:"draft",visibility,caption,hasImagePreview:Boolean(communityPreviewUrl),imagePersisted:false,createdAt:new Date().toISOString()}].slice(-24);});if(communityPreviewUrl){communityPreviews.set(draftId,communityPreviewUrl);communityPreviewUrl=null;}closeModal();render();toast("Saved privately on this device. Public posting stays locked until accounts and moderation exist.");return; }
  if (action === "delete-community-draft") { const preview=communityPreviews.get(value);if(preview){try{URL.revokeObjectURL(preview);}catch{}communityPreviews.delete(value);}state=store.update(draft=>{draft.socialDrafts=(draft.socialDrafts||[]).filter(item=>item.id!==value);});render();toast("Local progress draft deleted.");return; }
  if (action === "open-tutorial") { ui.modal={type:"tutorial",step:0};renderModalRoot();return; }
  if (action === "tutorial-next") { ui.modal={type:"tutorial",step:Math.min(2,Number(target.dataset.step || 0)+1)};renderModalRoot();return; }
  if (action === "tutorial-back") { ui.modal={type:"tutorial",step:Math.max(0,Number(target.dataset.step || 0)-1)};renderModalRoot();return; }
  if (action === "skip-tutorial" || action === "finish-tutorial") { state=store.update(draft=>{draft.settings.tutorialDismissed=true;});closeModal();render();return; }
  if (action === "clear-chat") { openModal({type:"confirm-clear-chat"});return; }
  if (action === "confirm-clear-chat") { state=store.update(draft=>{draft.chat=[];});closeModal();render();return; }
  if (action === "reset-profile") { openModal({type:"confirm-reset"});return; }
  if (action === "confirm-reset") { state=store.reset();applyTheme(state.settings.theme);ui.onboardingStep=0;ui.onboardingDraft={profile:deepClone(state.profile),settings:deepClone(state.settings),gymProfile:deepClone(state.gymProfile),consent:false};ui.mode="onboarding";closeModal();render();return; }
  if (action === "export-data") { exportData();return; }
  if (action === "force-refresh") { void forceRefresh();return; }
  if (action === "open-nutrition") { closeModal(); navigate("nutrition"); return; }
  if (action === "nutrition-day") { shiftNutritionDay(Number(value) || 0); return; }
  if (action === "nutrition-open-add") { openModal({ type: "nutrition-add", slot: MEAL_SLOTS.includes(value) ? value : mealSlotForHour(new Date().getHours()), query: "" }); return; }
  if (action === "nutrition-open-capture") { openModal({ type: "nutrition-capture", slot: MEAL_SLOTS.includes(value) ? value : mealSlotForHour(new Date().getHours()), context: "" }); return; }
  if (action === "nutrition-capture-slot") { if (ui.modal) { ui.modal.context = document.querySelector("#nutrition-context")?.value ?? ui.modal.context; ui.modal.query = document.querySelector("#nutrition-search")?.value ?? ui.modal.query; ui.modal.slot = value; renderModalRoot(); } return; }
  if (action === "nutrition-toggle-custom") { if (ui.modal) { ui.modal.custom = !ui.modal.custom; renderModalRoot(); } return; }
  if (action === "nutrition-pick-food") { const results = searchFoods(state.nutrition, ui.modal?.query || ""); const item = results[Number(value)]; if (item && ui.modal) { ui.modal.selected = { name: item.name, servingLabel: item.servingLabel, per: { ...item.per }, origin: item.origin }; ui.modal.multiplier = normalizeMultiplier(item.multiplier || 1); renderModalRoot(); } return; }
  if (action === "nutrition-add-back") { if (ui.modal) { ui.modal.selected = null; renderModalRoot(); } return; }
  if (action === "nutrition-add-portion") { if (ui.modal) { ui.modal.multiplier = normalizeMultiplier((ui.modal.multiplier || 1) + Number(value)); renderModalRoot(); } return; }
  if (action === "nutrition-barcode-search") { lookupBarcodeFood(); return; }
  if (action === "nutrition-add-confirm") { addSelectedFood(); return; }
  if (action === "nutrition-add-custom") { addCustomFood(); return; }
  if (action === "nutrition-copy-yesterday") { const dateKey = nutritionDateKey(); const from = new Date(`${dateKey}T12:00:00`); from.setDate(from.getDate() - 1); let copied = 0; state = store.update(draft => { copied = copySlotFromDay(draft.nutrition, localDateKey(from), dateKey, value); }); render(); toast(copied ? `Copied ${copied} confirmed item${copied === 1 ? "" : "s"} from yesterday.` : "Nothing confirmed yesterday to copy."); return; }
  if (action === "nutrition-open-review") { openNutritionReview(target.dataset.date || nutritionDateKey(), value); return; }
  if (action === "nutrition-first-draft") { const day = state.nutrition.days[nutritionDateKey()]; const draftEntry = (day?.entries || []).find(entry => entry.status === "draft"); if (draftEntry) openNutritionReview(nutritionDateKey(), draftEntry.id); return; }
  if (action === "nutrition-review-portion") { if (ui.modal) { syncReviewEdits(); const entry = findEntry(state.nutrition, ui.modal.dateKey, ui.modal.entryId); if (entry) { state = store.update(draft => { applyPortionEdit(draft.nutrition, ui.modal.dateKey, ui.modal.entryId, entry.multiplier + Number(value)); }); renderModalRoot(); } } return; }
  if (action === "nutrition-review-candidate") { if (ui.modal) { const candidate = DEMO_MEALS.find(item => item.name === value); if (candidate) { state = store.update(draft => { applyFoodEdit(draft.nutrition, ui.modal.dateKey, ui.modal.entryId, { name: candidate.name, servingLabel: candidate.servingLabel, per: { ...candidate.per } }); }); renderModalRoot(); } } return; }
  if (action === "nutrition-confirm-entry") { if (!ui.modal) return; syncReviewEdits(); const { dateKey } = ui.modal; let confirmed = false; state = store.update(draft => { const result = confirmNutritionEntry(draft.nutrition, dateKey, value, { userConfirmed: true }); if (result.ok) { recordRecentFood(draft.nutrition, result.entry); confirmed = true; } }); closeModal(); render(); toast(confirmed ? "Confirmed — it now counts in the day’s totals." : "This entry could not be confirmed."); return; }
  if (action === "nutrition-discard-entry") { if (!ui.modal) return; const { dateKey } = ui.modal; state = store.update(draft => { removeNutritionEntry(draft.nutrition, dateKey, value); }); closeModal(); render(); toast("Draft discarded. Totals were never affected."); return; }
  if (action === "nutrition-open-entry") { openModal({ type: "nutrition-entry", dateKey: target.dataset.date || nutritionDateKey(), entryId: value }); return; }
  if (action === "nutrition-entry-portion") { if (ui.modal) { const entry = findEntry(state.nutrition, ui.modal.dateKey, ui.modal.entryId); if (entry) { state = store.update(draft => { applyPortionEdit(draft.nutrition, ui.modal.dateKey, ui.modal.entryId, entry.multiplier + Number(value)); }); render(); } } return; }
  if (action === "nutrition-favorite") { if (ui.modal) { let nowFavorite = false; state = store.update(draft => { const entry = findEntry(draft.nutrition, ui.modal.dateKey, value); if (entry) nowFavorite = toggleFavoriteFood(draft.nutrition, { name: entry.name, servingLabel: entry.servingLabel, per: { ...entry.per }, multiplier: entry.multiplier }); }); render(); toast(nowFavorite ? "Saved to favorites." : "Removed from favorites."); } return; }
  if (action === "nutrition-remove-entry") { if (!ui.modal) return; const { dateKey } = ui.modal; state = store.update(draft => { removeNutritionEntry(draft.nutrition, dateKey, value); }); closeModal(); render(); toast("Entry removed."); return; }
  if (action === "nutrition-open-targets") { openModal({ type: "nutrition-targets" }); return; }
  if (action === "nutrition-save-targets") { const read = id => document.querySelector(id)?.value; state = store.update(draft => { draft.nutrition.targets = normalizeTargets({ calories: read("#target-kcal"), protein: read("#target-protein"), carbs: read("#target-carbs"), fat: read("#target-fat"), userSet: true }); }); closeModal(); render(); toast("Targets saved. FitCoach never adjusts them on its own."); return; }
  if (action === "close-modal") { closeModal();return; }
}

function handleChange(event) {
  const target=event.target;
  const action=target.dataset.action;
  if (action === "nutrition-photo") { handleNutritionPhoto(target); return; }
  if (action === "community-photo") { handleCommunityPhoto(target); return; }
  if (action === "onboarding-profile-field") {
    if (target.dataset.field === "tone") applyOnboardingTone(target.value);
    else ui.onboardingDraft.profile[target.dataset.field]=target.value;
    render();
  }
  if (action === "onboarding-number") { ui.onboardingDraft.profile[target.dataset.field]=Number(target.value);render(); }
  if (action === "onboarding-setting") { ui.onboardingDraft.settings[target.dataset.field]=target.value;if(target.dataset.field==="theme")applyTheme(target.value);render(); }
  if (action === "profile-field") { state=store.update(draft=>{draft.profile[target.dataset.field]=target.value;});render();toast("Profile saved. Review a proposal before changing today’s plan."); }
  if (action === "profile-number") { state=store.update(draft=>{draft.profile[target.dataset.field]=Number(target.value);});render();toast("Preference saved. The active plan did not change."); }
  if (action === "setting-field") { state=store.update(draft=>{draft.settings[target.dataset.field]=target.value;});render(); }
  if (action === "setting-toggle") { state=store.update(draft=>{draft.settings[target.dataset.field]=target.checked;});render(); }
  if (action === "profile-toggle") { state=store.update(draft=>{draft.profile[target.dataset.field]=target.checked;});render(); }
  if (action === "set-tone") { state=store.update(draft=>applyTonePreference(draft,target.value));stopSpeech({renderCoach:false});render(); }
  if (action === "set-answer-depth") { state=store.update(draft=>{draft.settings.coachMode=target.value;});render(); }
  if (action === "set-voice-persona") { state=store.update(draft=>{draft.settings.voicePersona=target.value;});stopSpeech({renderCoach:false});render(); }
  if (action === "gym-toggle-equipment") { const value=target.dataset.value || "";state=store.update(draft=>{const equipment=new Set(draft.gymProfile.equipment || []);if(target.checked)equipment.add(value);else equipment.delete(value);draft.gymProfile.equipment=[...equipment].slice(0,60);draft.gymProfile.source="manual";});renderModalRoot();renderAppScreen(); }
  if (action === "filter-favorites") { ui.exerciseFilters.favorites=target.checked;render(); }
}

function handleInput(event) {
  const target=event.target;
  if (target.dataset.action === "onboarding-gym-name") {
    ui.onboardingDraft.gymProfile = { ...ui.onboardingDraft.gymProfile, selectedGymName: target.value.slice(0, 120), source: "manual" };
  }
  if (target.id === "exercise-search") { ui.exerciseFilters.query=target.value;render();requestAnimationFrame(()=>{const input=document.querySelector("#exercise-search");input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}); }
  if (target.dataset.action === "set-field") updateSetField(target);
  if (target.id === "workout-notes") state=store.update(draft=>{if(draft.activeWorkout)draft.activeWorkout.notes=target.value.slice(0,2_000);});
  if (target.id === "coach-input") ui.chatDraft=target.value;
  if (target.id === "nutrition-search" && ui.modal) { ui.modal.query=target.value; renderModalRoot(); requestAnimationFrame(()=>{const input=document.querySelector("#nutrition-search");input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}); }
  if (target.id === "nutrition-barcode" && ui.modal) ui.modal.barcode=target.value;
  if (target.id === "nutrition-context" && ui.modal) ui.modal.context=target.value;
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const root = voiceController.getState().active && !ui.voiceDocked ? dom.voice : ui.modal ? dom.modal : null;
  if (!root) return;
  const focusable=[...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(node=>!node.hidden);
  if (!focusable.length) return;
  const first=focusable[0],last=focusable.at(-1);
  if (event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

function bootstrap() {
  createStore(ui.founder);
  ui.mode=state.profile.onboarded?"app":"onboarding";
  ui.onboardingDraft={profile:deepClone(state.profile),settings:deepClone(state.settings),gymProfile:deepClone(state.gymProfile),consent:false};
  const route=new URLSearchParams(location.search).get("route");
  if(ROUTES.includes(route))ui.route=route;
  document.addEventListener("click",handleClick);
  document.addEventListener("change",handleChange);
  document.addEventListener("input",handleInput);
  document.addEventListener("canplay",event=>{
    const video=event.target?.closest?.("[data-media-video]");
    if(!video || ui.motionPaused || video.paused === false) return;
    const figure = video.closest(".exercise-motion");
    if (!figure || figure.dataset.motionIntent === "pause") return;
    playMotionVideo(figure, video);
  },true);
  document.addEventListener("playing", event=>{
    const video=event.target?.closest?.("[data-media-video]");
    if(!video) return;
    const figure=video.closest(".exercise-motion");
    figure?.classList.remove("media-paused", "media-error");
    if (figure) {
      figure.dataset.motionIntent = "play";
      delete figure.dataset.motionPending;
    }
    setMotionState(figure, "playing", "Motion playing");
    syncMotionToggle(figure, true);
  },true);
  document.addEventListener("pause", event=>{
    const video=event.target?.closest?.("[data-media-video]");
    if(!video) return;
    const figure=video.closest(".exercise-motion");
    if (figure && !figure.classList.contains("media-error") && figure.dataset.motionIntent === "pause") {
      delete figure.dataset.motionPending;
      figure.classList.add("media-paused");
      setMotionState(figure, "paused", "Motion paused");
      syncMotionToggle(figure, false);
    }
  },true);
  document.addEventListener("error",event=>{
    const media=event.target?.closest?.("[data-media-image],[data-media-video]");
    if(!media)return;
    if (media.matches?.("[data-media-video]")) {
      // A bubbling non-media error must never turn a playable video into a
      // retry card. Only a real HTMLMediaElement error may hide the video.
      window.setTimeout(() => {
        if (!media.error?.code) return;
        media.hidden = true;
        const figure = media.closest("figure");
        if (figure) {
          figure.dataset.motionIntent = "pause";
          delete figure.dataset.motionPending;
        }
        figure?.classList.add("media-error");
        if (figure?.classList.contains("exercise-motion")) {
          setMotionState(figure, "error", "Video could not load — try again");
          syncMotionToggle(figure, false);
        }
      }, 0);
      return;
    }
    media.hidden=true;
    const figure = media.closest("figure");
    figure?.classList.add("media-error");
    if (figure?.classList.contains("exercise-motion")) setMotionState(figure, "error", "Motion unavailable — use the preview");
  },true);
  document.addEventListener("keydown",event=>{
    if((event.key==="Enter"||event.key===" ")&&event.target?.classList?.contains("voice-room-orb")){event.preventDefault();voiceController.interrupt();}
    if(event.key==="Escape"){if(voiceController.getState().active){voiceController.exit();ui.voiceDocked=false;render();voiceReturnFocus?.focus?.();voiceReturnFocus=null;}else if(ui.modal)closeModal();}
    if(event.key==="Enter"&&event.target.id==="coach-input"&&!event.shiftKey){event.preventDefault();void sendChat();}
    trapDialogFocus(event);
  });
  window.addEventListener("online",()=>{voiceController.setForeground(document.visibilityState==="visible");render();toast("Back online. Live Coach is available.");});
  window.addEventListener("offline",()=>{voiceController.setForeground(false);render();});
  document.addEventListener("visibilitychange",()=>voiceController.setForeground(document.visibilityState==="visible"));
  window.addEventListener("pagehide",()=>{voiceController.exit();stopSpeech({renderCoach:false});chatRequestController?.abort();});
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(state?.settings.theme==="system")applyTheme("system");});
  beginRestTicker();
  maybeOpenTutorial();
  render();
}

bootstrap();
