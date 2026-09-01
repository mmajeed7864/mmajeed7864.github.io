export const NATIVE_BRIDGE_VERSION = 1;

export const VOICE_PHASES = Object.freeze([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "interrupted",
  "recovery_required",
  "unavailable",
]);

export const HEALTH_SOURCES = Object.freeze(["apple_health", "health_connect"]);

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeHealthSummary(input = {}) {
  const source = HEALTH_SOURCES.includes(input.source) ? input.source : null;
  const localDay = /^\d{4}-\d{2}-\d{2}$/u.test(String(input.localDay || "")) ? input.localDay : null;
  if (!source || !localDay) return null;
  const steps = finiteNonNegative(input.steps);
  const activeEnergyKcal = finiteNonNegative(input.activeEnergyKcal);
  if (steps === null || activeEnergyKcal === null) return null;
  return Object.freeze({
    bridgeVersion: NATIVE_BRIDGE_VERSION,
    source,
    localDay,
    steps: Math.round(steps),
    activeEnergyKcal: Math.round(activeEnergyKcal * 10) / 10,
    aggregateOnly: true,
  });
}

export function recoverVoicePhase(state = {}, event = {}) {
  const phase = VOICE_PHASES.includes(state.phase) ? state.phase : "idle";
  const type = String(event.type || "");
  if (type === "permission_denied") return Object.freeze({ phase: "unavailable", resumeOutput: false, resumeListening: false });
  if (["call_started", "audio_focus_lost", "route_disconnected", "app_backgrounded"].includes(type)) {
    return Object.freeze({
      phase: "interrupted",
      resumeOutput: false,
      resumeListening: false,
      interruptedPhase: phase,
    });
  }
  if (type === "interruption_ended" && phase === "interrupted") {
    const outputMayResume = state.interruptedPhase === "speaking" && event.systemAllowsResume === true;
    return Object.freeze({
      phase: outputMayResume ? "speaking" : "recovery_required",
      resumeOutput: outputMayResume,
      resumeListening: false,
    });
  }
  if (type === "user_resume" && ["interrupted", "recovery_required"].includes(phase)) {
    return Object.freeze({ phase: "listening", resumeOutput: false, resumeListening: true });
  }
  return Object.freeze({ ...state, phase });
}
