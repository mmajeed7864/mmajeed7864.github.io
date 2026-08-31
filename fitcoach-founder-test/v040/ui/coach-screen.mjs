import { MODEL_MODES, TRAINER_TONES, VOICE_PERSONAS, VOICE_PERSONA_LABELS } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { button, icon, renderMessage } from "./components.mjs";

const TONE_DESCRIPTIONS = Object.freeze({
  Supportive: "Warm, candid, and no-shame",
  Direct: "Clear, concise, and practical",
  Strict: "Firm standards without humiliation",
  Competitive: "Compare only with your own verified baseline",
  Rude: "A consent-based roast of the excuse—not of you",
});

const TONE_SHORT = Object.freeze({
  Supportive: "Warm, no-shame",
  Direct: "Concise, practical",
  Strict: "Firm, exacting",
  Competitive: "Personal baseline",
  Rude: "Roast the excuse",
});

const VOICE_LABELS = Object.freeze({
  ...VOICE_PERSONA_LABELS,
});

export function renderCoachScreen({ state, decision, ui, coachConnection }) {
  const voiceName = VOICE_LABELS[state.settings.voicePersona] || VOICE_LABELS.nova;
  const pending = state.pendingPlanProposal;
  const connection = coachConnection || { label: "Ready when you are", state: "unverified" };
  const preferenceCount = ["preferred","reduced","excluded"].reduce((sum,key) => sum + (state.exercisePreferences?.[key]?.length || 0), 0);
  const trainerFacts = [
    ["Goal", state.profile.goal],
    ["Week", `${state.profile.days} days · ${state.profile.duration} min`],
    ["Setup", `${state.profile.location} · ${state.profile.equipment}`],
    ["Constraint", state.profile.blocker],
    ["Current plan", `${state.activePlan?.label || "Plan A"} · ${state.activePlan?.minutes || state.profile.duration} min`],
    ["History", `${state.sessions.length} completed · ${preferenceCount} movement preferences`],
  ];
  const starterPrompts = [
    { prompt: "I only have 20 minutes.", label: "Make today shorter", detail: "20-minute plan", iconName: "clock" },
    { prompt: "Show me how to do a goblet squat.", label: "Open a movement", detail: "Technique guide", iconName: "play" },
    { prompt: "What should I train today?", label: "Plan today", detail: "Your next session", iconName: "spark" },
    { prompt: "Show my progress.", label: "View progress", detail: "Your baseline", iconName: "progress" },
  ];
  return `<div class="page coach-page" data-tone="${escapeHtml(state.profile.tone.toLowerCase())}">
    <section class="coach-hero teal-panel">
      <div class="coach-identity"><div class="trainer-orb" aria-hidden="true"><i></i><b></b><span></span></div><div><span class="eyebrow">YOUR AI TRAINER</span><h1>${escapeHtml(voiceName.split(" · ")[0])}</h1><p>${escapeHtml(TONE_DESCRIPTIONS[state.profile.tone])}</p></div></div>
      <div class="coach-status" role="status"><span class="status-dot ${escapeHtml(connection.state)}"></span><b>${ui.speakingMessageId ? "Speaking now" : escapeHtml(connection.label)}</b></div>
      <div class="voice-room-launch"><div class="voice-launch-orb" aria-hidden="true"><i></i><span></span></div><div><span class="eyebrow">LIVE VOICE</span><h2>Talk naturally. Hear the answer.</h2><p>Captions stay visible. Replies play automatically. Tap once to interrupt.</p></div>${button({label:"Start Voice Room",action:"open-voice-room",variant:"voice",iconName:"mic"})}</div>
    </section>

    ${pending ? `<section class="plan-proposal coach-proposal card"><span class="eyebrow">PLAN CHANGE PREVIEW</span><h2>${escapeHtml(pending.candidate.label)} · ${pending.candidate.minutes} min</h2><p>${escapeHtml(pending.reason)}</p><ul>${pending.changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul><footer>${button({label:"Keep current plan",action:"reject-proposal",value:pending.id,variant:"quiet"})}${button({label:"Approve change",action:"approve-proposal",value:pending.id,variant:"primary"})}</footer></section>` : ""}

    <section class="chat-surface card">
      <header><span><b>Your training thread</b><small>Text always appears even if speech is unavailable</small></span><button class="icon-only" data-action="clear-chat" aria-label="Clear chat">${icon("close")}</button></header>
      <div id="chat-log" class="chat-log" role="log" aria-live="polite">${state.chat.length ? state.chat.map(message => renderMessage(message,ui.speakingMessageId)).join("") : `<div class="coach-welcome"><span class="trainer-orb small"><i></i></span><h2>I know your plan. What changed today?</h2><p>Adjust today, open a movement, or prepare a plan change for your review.</p><small class="coach-welcome-boundary">${icon("info")}Training guidance, not medical care. You approve every plan change.</small></div>`}${ui.pendingMessage ? `<article class="chat-message user pending"><div>${escapeHtml(ui.pendingMessage)}</div><footer><span>Sending as low-sensitivity text…</span></footer></article>` : ""}${ui.chatNotice ? `<article class="chat-notice ${escapeHtml(ui.chatNotice.kind)}"><b>${escapeHtml(ui.chatNotice.title)}</b><p>${escapeHtml(ui.chatNotice.message)}</p>${ui.chatNotice.retryable ? button({label:"Restore draft",action:"restore-chat-draft",variant:"secondary"}) : ""}</article>` : ""}${ui.chatBusy ? `<div class="typing-indicator" aria-label="Trainer is thinking"><i></i><i></i><i></i></div>` : ""}</div>
      <div class="suggested-prompts">${starterPrompts.map(item => `<button class="coach-starter-card" data-action="quick-prompt" data-value="${escapeHtml(item.prompt)}">${icon(item.iconName)}<span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail)}</small></span></button>`).join("")}</div>
      <div class="coach-composer"><button class="icon-only mic-button" data-action="open-voice-room" aria-label="Open Voice Room">${icon("mic")}</button><label><span class="sr-only">Message your trainer</span><textarea id="coach-input" rows="1" maxlength="2000" placeholder="Ask your trainer…" ${ui.chatBusy ? "disabled" : ""}>${escapeHtml(ui.chatDraft || "")}</textarea></label><button class="icon-only send-button" data-action="send-chat" aria-label="Send message" ${ui.chatBusy ? "disabled" : ""}>${icon("send")}</button></div>
      <footer class="chat-privacy">Your workout data stays on this device. Voice uses your device transcript and sends only the trainer reply text for speech—never microphone audio. Avoid entering private medical or account information.</footer>
    </section>

    <details class="coach-disclosure coach-personality card" data-disclosure="coach-style" ${ui.disclosures?.["coach-style"] ? "open" : ""}><summary><span class="section-heading"><span><span class="eyebrow">MAKE IT YOURS</span><h2>How your trainer shows up</h2></span></span><span class="disclosure-current">${escapeHtml(state.profile.tone)} · ${escapeHtml((MODEL_MODES[state.settings.coachMode] || {}).label || "Balanced")} · ${escapeHtml(voiceName.split(" · ")[0])}</span><span class="disclosure-chevron" aria-hidden="true">${icon("chevron")}</span></summary><div class="disclosure-body"><div class="coach-setting-group"><span>Trainer tone</span><div role="radiogroup" aria-label="Trainer tone">${TRAINER_TONES.map(value => `<button role="radio" aria-checked="${state.profile.tone === value}" class="tone-choice ${state.profile.tone === value ? "active" : ""}" data-action="set-tone" data-value="${value}"><b>${value}</b><small>${escapeHtml(TONE_SHORT[value])}</small></button>`).join("")}</div></div><div class="coach-preference-block"><span>Answer length</span><div class="preference-pill-grid" role="radiogroup" aria-label="Answer length">${Object.entries(MODEL_MODES).map(([key,value]) => `<button role="radio" aria-checked="${state.settings.coachMode === key}" class="preference-pill ${state.settings.coachMode === key ? "active" : ""}" data-action="set-answer-depth" data-value="${key}"><b>${escapeHtml(value.label)}</b><small>${escapeHtml(value.detail)}</small></button>`).join("")}</div></div><div class="coach-preference-block"><span>Trainer voice</span><div class="voice-choice-grid" role="radiogroup" aria-label="Trainer voice">${VOICE_PERSONAS.map(value => `<button role="radio" aria-checked="${state.settings.voicePersona === value}" class="voice-choice ${state.settings.voicePersona === value ? "active" : ""}" data-action="set-voice-persona" data-value="${value}"><i aria-hidden="true"></i><b>${escapeHtml(VOICE_LABELS[value].split(" · ")[0])}</b><small>${escapeHtml(VOICE_LABELS[value].split(" · ")[1] || "trainer")}</small></button>`).join("")}</div></div><p class="style-boundary">Tone, answer length, and voice change presentation only. Safety rules and plan decisions stay the same.</p></div></details>

    <details class="coach-disclosure trainer-memory card" data-disclosure="coach-memory" ${ui.disclosures?.["coach-memory"] ? "open" : ""}><summary><span class="section-heading"><span><span class="eyebrow">WHAT YOUR TRAINER REMEMBERS</span><h2>Your current training context</h2></span></span><span class="disclosure-current">You control this</span><span class="disclosure-chevron" aria-hidden="true">${icon("chevron")}</span></summary><div class="disclosure-body"><div>${trainerFacts.map(([label,value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(String(value))}</b></span>`).join("")}</div><footer>${icon("info")}<p>Your full profile stays on this device. The live trainer receives only the limited context needed to answer this turn. Links and plan options are selected inside FitCoach.</p></footer></div></details>

    <section class="coach-context card"><span class="eyebrow">WHY THIS COACHING</span><h2>${escapeHtml(decision.title || "Built from your current plan")}</h2><div><span><small>Goal</small><b>${escapeHtml(state.profile.goal)}</b></span><span><small>Energy</small><b>${state.profile.energy}/5</b></span><span><small>Plan</small><b>${escapeHtml(state.activePlan?.label || "Plan A")}</b></span></div><button class="text-button" data-action="explain-decision">See the evidence →</button></section>
  </div>`;
}

const PHASE_COPY = Object.freeze({
  closed: ["Voice Room ended", "Your last transcript remains in the Coach thread."],
  consent: ["Ready when you are", "Talk naturally. Your trainer answers out loud."],
  starting: ["Starting…", "Preparing the next voice turn."],
  listening: ["Listening", "Say what changed today."],
  finalizing: ["Got it", "Finalizing your transcript as text."],
  thinking: ["Thinking", "Building a short, useful answer."],
  speaking: ["Speaking automatically", "Tap the orb to interrupt."],
  cooldown: ["Your turn", "Listening resumes in a moment."],
  paused: ["Voice Room paused", "Nothing is listening. Resume only when you are ready."],
  retryable_error: ["Reply unavailable", "Your finalized transcript is still here. Retry only when you choose."],
  safety_stop: ["Voice stopped for safety", "Follow the on-screen safety guidance. FitCoach will not automatically resume."],
});

export function renderVoiceRoom(voiceState, state, { docked = false } = {}) {
  if (!voiceState?.active) return "";
  const [title, copy] = PHASE_COPY[voiceState.phase] || PHASE_COPY.paused;
  const transcript = voiceState.interimTranscript || voiceState.pendingTranscript || voiceState.lastTranscript;
  const trainerText = voiceState.currentReply || voiceState.lastReply;
  const trainerName = (VOICE_LABELS[state.settings.voicePersona] || VOICE_LABELS.nova).split(" · ")[0];
  if (docked) {
    return `<aside class="voice-dock" role="region" aria-label="Active trainer voice session" data-phase="${escapeHtml(voiceState.phase)}">
      <button class="voice-dock-main" data-action="voice-expand" aria-label="Expand Voice Room"><span class="voice-dock-orb"><i></i><b></b></span><span><small>${escapeHtml(title)}</small><b>${escapeHtml(trainerName)} · ${escapeHtml(state.profile.tone)}</b><em>${escapeHtml(trainerText || transcript || "Voice session stays active while you use FitCoach.")}</em></span></button>
      <button class="voice-dock-control" data-action="voice-mute" aria-pressed="${voiceState.muted}" aria-label="${voiceState.muted ? "Unmute trainer" : "Mute trainer"}">${icon(voiceState.muted ? "volume" : "mic")}</button>
      <button class="voice-dock-control end" data-action="voice-exit" aria-label="End Voice Room">${icon("close")}</button>
    </aside>`;
  }
  return `<section id="voice-room" class="voice-room" role="dialog" aria-modal="true" aria-labelledby="voice-room-title" data-phase="${escapeHtml(voiceState.phase)}" data-tone="${escapeHtml(state.profile.tone.toLowerCase())}">
    <header><button class="voice-text-exit" data-action="voice-text-mode">Use app</button><span><b>${escapeHtml(trainerName)}</b><small>${escapeHtml(state.profile.tone)} trainer</small></span><button class="voice-end" data-action="voice-exit">End</button></header>
    <main><div class="voice-room-orb" data-action="voice-interrupt" role="button" tabindex="0" aria-label="${voiceState.phase === "speaking" ? "Interrupt trainer" : "Voice status"}"><i></i><b></b><span></span></div><p class="voice-state-label">${escapeHtml(title)}</p><h2 id="voice-room-title">${escapeHtml(copy)}</h2><div class="voice-captions" aria-live="polite">${transcript ? `<p class="voice-user-caption"><span>You</span>${escapeHtml(transcript)}</p>` : ""}${trainerText ? `<p class="voice-trainer-caption"><span>${escapeHtml((VOICE_LABELS[state.settings.voicePersona] || VOICE_LABELS.nova).split(" · ")[0])}</span>${escapeHtml(trainerText)}</p>` : `<p class="voice-status-caption">${escapeHtml(voiceState.caption?.text || "Captions will appear here.")}</p>`}</div></main>
    ${voiceState.phase === "consent" ? `<section class="voice-consent"><div class="voice-consent-points"><span>${icon("mic")}<b>FitCoach uploads no audio</b></span><span>${icon("volume")}<b>Replies speak automatically</b></span><span>${icon("close")}<b>End anytime</b></span></div>${button({label:"Start talking",action:"voice-consent",variant:"primary",iconName:"mic"})}<details><summary>Voice privacy</summary><p>Your browser or operating system may process speech to create a transcript. FitCoach itself sends only the resulting limited text for a trainer reply, then may send the safe reply text to the speech service. FitCoach does not upload microphone audio. Avoid private medical details, identifiers, and credentials.</p></details></section>` : ""}
    <footer><button data-action="voice-mute" aria-pressed="${voiceState.muted}">${icon(voiceState.muted ? "volume" : "mic")}<span>${voiceState.muted ? "Unmute voice" : "Mute replies"}</span></button>${voiceState.phase === "paused" ? `<button data-action="voice-resume">${icon("play")}<span>Resume</span></button>` : ""}${voiceState.phase === "retryable_error" ? `<button data-action="voice-retry">${icon("spark")}<span>Retry</span></button>` : ""}${voiceState.lastReply ? `<button data-action="voice-replay">${icon("volume")}<span>Replay</span></button>` : ""}<button data-action="voice-exit">${icon("close")}<span>Stop trainer</span></button></footer>
    <small class="voice-privacy">Automatic voice reply · compatible audio engine · captions stay in this chat</small>
  </section>`;
}
