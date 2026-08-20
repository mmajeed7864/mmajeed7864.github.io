import { MODEL_MODES, TRAINER_TONES, VOICE_PERSONAS, VOICE_PERSONA_LABELS } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { button, icon, renderMessage } from "./components.mjs";

const TONE_DESCRIPTIONS = Object.freeze({
  Supportive: "Warm, candid, and no-shame",
  Direct: "Clear, concise, and practical",
  Strict: "Firm standards without humiliation",
  Competitive: "Compare only with your own verified baseline",
});

const TONE_SHORT = Object.freeze({
  Supportive: "Warm, no-shame",
  Direct: "Concise, practical",
  Strict: "Firm, exacting",
  Competitive: "Personal baseline",
});

const VOICE_LABELS = Object.freeze({
  ...VOICE_PERSONA_LABELS,
});

export function renderCoachScreen({ state, decision, ui, coachConnection }) {
  const voiceName = VOICE_LABELS[state.settings.voicePersona] || VOICE_LABELS.nova;
  const speechStatus = ui.voiceProvider === "elevenlabs"
    ? "ElevenLabs premium voice"
    : ui.voiceProvider === "device-fallback"
      ? "Device voice fallback"
      : "Premium voice ready";
  const pending = state.pendingPlanProposal;
  const connection = coachConnection || { label: "Browser online · Coach unverified", state: "unverified" };
  const preferenceCount = ["preferred","reduced","excluded"].reduce((sum,key) => sum + (state.exercisePreferences?.[key]?.length || 0), 0);
  const trainerFacts = [
    ["Goal", state.profile.goal],
    ["Week", `${state.profile.days} days · ${state.profile.duration} min`],
    ["Setup", `${state.profile.location} · ${state.profile.equipment}`],
    ["Constraint", state.profile.blocker],
    ["Current plan", `${state.activePlan?.label || "Plan A"} · ${state.activePlan?.minutes || state.profile.duration} min`],
    ["History", `${state.sessions.length} completed · ${preferenceCount} movement preferences`],
  ];
  return `<div class="page coach-page" data-tone="${escapeHtml(state.profile.tone.toLowerCase())}">
    <section class="coach-hero teal-panel">
      <div class="coach-identity"><div class="trainer-orb" aria-hidden="true"><i></i><b></b><span></span></div><div><span class="eyebrow">PERSISTENT AI TRAINER</span><h1>${escapeHtml(voiceName.split(" · ")[0])}</h1><p>${escapeHtml(TONE_DESCRIPTIONS[state.profile.tone])}</p></div></div>
      <div class="coach-status" role="status"><span class="status-dot ${escapeHtml(connection.state)}"></span><b>${ui.speakingMessageId ? "Speaking now" : escapeHtml(connection.label)}</b></div>
      <div class="provider-boundary"><span>DeepSeek primary</span><span>Qwen backup when configured</span><span>${escapeHtml(speechStatus)}</span><span>No plan auto-changes</span></div>
      <div class="coach-setting-group"><span>Trainer tone</span><div role="radiogroup" aria-label="Trainer tone">${TRAINER_TONES.map(value => `<button role="radio" aria-checked="${state.profile.tone === value}" class="tone-choice ${state.profile.tone === value ? "active" : ""}" data-action="set-tone" data-value="${value}"><b>${value}</b><small>${escapeHtml(TONE_SHORT[value])}</small></button>`).join("")}</div></div>
      <div class="coach-setting-row"><label>Answer depth<select data-action="set-answer-depth">${Object.entries(MODEL_MODES).map(([key,value]) => `<option value="${key}" ${state.settings.coachMode === key ? "selected" : ""}>${escapeHtml(value.label)}</option>`).join("")}</select></label><label>Premium voice<select data-action="set-voice-persona">${VOICE_PERSONAS.map(value => `<option value="${value}" ${state.settings.voicePersona === value ? "selected" : ""}>${escapeHtml(VOICE_LABELS[value])}</option>`).join("")}</select></label></div>
      ${button({label:"Enter Voice Room",action:"open-voice-room",variant:"voice",iconName:"mic"})}
    </section>

    ${pending ? `<section class="plan-proposal coach-proposal card"><span class="eyebrow">PLAN CHANGE PREVIEW</span><h2>${escapeHtml(pending.candidate.label)} · ${pending.candidate.minutes} min</h2><p>${escapeHtml(pending.reason)}</p><ul>${pending.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul><footer>${button({label:"Keep current plan",action:"reject-proposal",value:pending.id,variant:"quiet"})}${button({label:"Approve change",action:"approve-proposal",value:pending.id,variant:"primary"})}</footer></section>` : ""}

    <section class="chat-surface card">
      <header><span><b>Your training thread</b><small>Text always appears even if speech is unavailable</small></span><button class="icon-only" data-action="clear-chat" aria-label="Clear chat">${icon("close")}</button></header>
      <div id="chat-log" class="chat-log" role="log" aria-live="polite">${state.chat.length ? state.chat.map(message => renderMessage(message,ui.speakingMessageId)).join("") : `<div class="coach-welcome"><span class="trainer-orb small"><i></i></span><h2>I know the plan. Tell me what changed.</h2><p>I can explain today’s recommendation, open the exact movement guide, and prepare a plan option for your approval. I cannot diagnose, prescribe, or change the plan by myself.</p></div>`}${ui.pendingMessage ? `<article class="chat-message user pending"><div>${escapeHtml(ui.pendingMessage)}</div><footer><span>Sending as low-sensitivity text…</span></footer></article>` : ""}${ui.chatNotice ? `<article class="chat-notice ${escapeHtml(ui.chatNotice.kind)}"><b>${escapeHtml(ui.chatNotice.title)}</b><p>${escapeHtml(ui.chatNotice.message)}</p>${ui.chatNotice.retryable ? button({label:"Restore draft",action:"restore-chat-draft",variant:"secondary"}) : ""}</article>` : ""}${ui.chatBusy ? `<div class="typing-indicator" aria-label="Trainer is thinking"><i></i><i></i><i></i></div>` : ""}</div>
      <div class="suggested-prompts">${["Show me how to do a goblet squat.","I only have 20 minutes.","What should I train today?","Show my progress."].map(prompt => `<button data-action="quick-prompt" data-value="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}</div>
      <div class="coach-composer"><button class="icon-only mic-button" data-action="open-voice-room" aria-label="Open Voice Room">${icon("mic")}</button><label><span class="sr-only">Message your trainer</span><textarea id="coach-input" rows="1" maxlength="2000" placeholder="Ask your trainer…" ${ui.chatBusy ? "disabled" : ""}>${escapeHtml(ui.chatDraft || "")}</textarea></label><button class="icon-only send-button" data-action="send-chat" aria-label="Send message" ${ui.chatBusy ? "disabled" : ""}>${icon("send")}</button></div>
      <footer class="chat-privacy">Synthetic founder test. Ordinary low-sensitivity text may use DeepSeek or direct Qwen through Symbio’s server. When spoken replies are enabled, bounded coach reply text may be sent server-side to ElevenLabs; FitCoach never uploads microphone audio. Do not enter medical records, medication details, identifiers, credentials, or private health information.</footer>
    </section>

    <section class="trainer-memory card"><header><span><span class="eyebrow">LOCAL TRAINER MEMORY</span><h2>What your trainer knows</h2></span><span class="soft-badge">You control this</span></header><div>${trainerFacts.map(([label,value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(String(value))}</b></span>`).join("")}</div><footer>${icon("info")}<p>The full structured state stays on this device. DeepSeek or Qwen receives only the bounded low-sensitivity codes needed for a reply. In-app links and plan proposals are selected locally.</p></footer></section>

    <section class="coach-context card"><span class="eyebrow">CURRENT DETERMINISTIC CONTEXT</span><div><span><small>Action</small><b>${escapeHtml(decision.type.replaceAll("_"," "))}</b></span><span><small>Goal</small><b>${escapeHtml(state.profile.goal)}</b></span><span><small>Energy</small><b>${state.profile.energy}/5</b></span><span><small>Plan</small><b>${escapeHtml(state.activePlan?.label || "Plan A")}</b></span></div><button class="text-button" data-action="explain-decision">See why this action cleared →</button></section>
  </div>`;
}

const PHASE_COPY = Object.freeze({
  closed: ["Voice Room ended", "Your last transcript remains in the Coach thread."],
  consent: ["Before we listen", "Review how voice is handled, then start the microphone yourself."],
  starting: ["Starting…", "Preparing the next voice turn."],
  listening: ["Listening…", "Speak naturally. Tap Stop trainer to end the room."],
  finalizing: ["Got it", "Finalizing your transcript as text."],
  thinking: ["Trainer is thinking…", "Your microphone is off while the text request is processed."],
  speaking: ["Trainer speaking", "Tap the orb to interrupt and ask the next question."],
  cooldown: ["Your turn next", "Keeping a short pause so the microphone does not hear the speaker."],
  paused: ["Voice Room paused", "Nothing is listening. Resume only when you are ready."],
  retryable_error: ["Reply unavailable", "Your finalized transcript is still here. Retry only when you choose."],
  safety_stop: ["Voice stopped for safety", "Follow the on-screen safety guidance. FitCoach will not automatically resume."],
});

export function renderVoiceRoom(voiceState, state) {
  if (!voiceState?.active) return "";
  const [title, copy] = PHASE_COPY[voiceState.phase] || PHASE_COPY.paused;
  const transcript = voiceState.interimTranscript || voiceState.pendingTranscript || voiceState.lastTranscript;
  const trainerText = voiceState.currentReply || voiceState.lastReply;
  return `<section id="voice-room" class="voice-room" role="dialog" aria-modal="true" aria-labelledby="voice-room-title" data-phase="${escapeHtml(voiceState.phase)}" data-tone="${escapeHtml(state.profile.tone.toLowerCase())}">
    <header><button class="voice-text-exit" data-action="voice-text-mode">Text view</button><span><b>${escapeHtml((VOICE_LABELS[state.settings.voicePersona] || VOICE_LABELS.nova).split(" · ")[0])}</b><small>${escapeHtml(state.profile.tone)} trainer</small></span><button class="voice-end" data-action="voice-exit">End</button></header>
    <main><div class="voice-room-orb" data-action="voice-interrupt" role="button" tabindex="0" aria-label="${voiceState.phase === "speaking" ? "Interrupt trainer" : "Voice status"}"><i></i><b></b><span></span></div><p class="voice-state-label">${escapeHtml(title)}</p><h2 id="voice-room-title">${escapeHtml(copy)}</h2><div class="voice-captions" aria-live="polite">${transcript ? `<p class="voice-user-caption"><span>You</span>${escapeHtml(transcript)}</p>` : ""}${trainerText ? `<p class="voice-trainer-caption"><span>Trainer</span>${escapeHtml(trainerText)}</p>` : `<p class="voice-status-caption">${escapeHtml(voiceState.caption?.text || "")}</p>`}</div></main>
    ${voiceState.phase === "consent" ? `<section class="voice-consent"><div>${icon("info")}<p>Your browser or device may process microphone audio. FitCoach sends the resulting transcript—not an audio recording—to Symbio’s server for DeepSeek or Qwen. Spoken coach reply text may then use ElevenLabs premium speech, with device speech as fallback. Avoid medical records, medication details, identifiers, and credentials.</p></div>${button({label:"Start listening",action:"voice-consent",variant:"primary",iconName:"mic"})}</section>` : ""}
    <footer><button data-action="voice-mute" aria-pressed="${voiceState.muted}">${icon(voiceState.muted ? "volume" : "mic")}<span>${voiceState.muted ? "Unmute voice" : "Mute replies"}</span></button>${voiceState.phase === "paused" ? `<button data-action="voice-resume">${icon("play")}<span>Resume</span></button>` : ""}${voiceState.phase === "retryable_error" ? `<button data-action="voice-retry">${icon("spark")}<span>Retry</span></button>` : ""}${voiceState.lastReply ? `<button data-action="voice-replay">${icon("volume")}<span>Replay</span></button>` : ""}<button data-action="voice-exit">${icon("close")}<span>Stop trainer</span></button></footer>
    <small class="voice-privacy">ElevenLabs reply voice · device fallback · captions on · no FitCoach microphone-audio upload</small>
  </section>`;
}
