/* FitCoach v0.3.2 — Nova intelligence + literal spoken replies.
   Loaded after the v0.3.1 application so it can replace the founder-build chat/voice adapters
   without rewriting the workout and earned-interruption layers. */

const FC_CHAT_V2_API = "https://symbioai.dev/api/fitcoach-chat-v2";
const FC_SPEECH_API = "https://symbioai.dev/api/fitcoach-speech";
const FC_PATCH_BUILD = "0.3.2-nova-voice";
const FC_BROKEN_REPLY_PATTERNS = [
  /^let(?:'|’)s make the next action specific\.?$/i,
  /^give me the specific decision you want help with/i,
  /^what specific decision do you want help with/i,
  /^please provide more details\.?$/i,
  /^could you be more specific\??$/i,
  /^i(?:'|’)m using your goal .* one next action\.?$/i,
];

let fcVoiceAudio = null;
let fcVoiceObjectUrl = "";
let fcAudioContext = null;
let fcAudioUnlocked = false;
let fcSpeakingMessageId = null;

function fcIsBrokenReply(text) {
  const normalized = String(text || "").trim();
  return !normalized || FC_BROKEN_REPLY_PATTERNS.some(pattern => pattern.test(normalized));
}

function fcModeModel(mode) {
  if (mode === "fast") return "deepseek/deepseek-v4-flash";
  if (mode === "deep") return "moonshotai/kimi-k3";
  return "deepseek/deepseek-v4-pro";
}

function fcModeDescription(mode) {
  if (mode === "fast") return "DeepSeek Flash · fastest response";
  if (mode === "deep") return "Kimi K3 · DeepSeek Pro fallback";
  return "DeepSeek Pro · quality recovery enabled";
}

function fcConversationForApi(data) {
  return (data.chat || [])
    .slice(-14, -1)
    .filter(message => message && message.text && !fcIsBrokenReply(message.text))
    .map(message => ({
      role: message.role === "coach" ? "assistant" : "user",
      content: message.text,
    }));
}

function fcBuildPayload(data, message) {
  const week = weekStats(data);
  const plan = planLibrary(data)[0];
  const mode = data.settings?.coachMode || "smart";
  return {
    message,
    session_id: `fitcoach-${app.founder}-${deviceId()}`,
    profile: {
      goal: data.profile.goal,
      experience: data.profile.experience,
      days: data.profile.days,
      duration: data.profile.duration,
      equipment: data.profile.equipment,
      blocker: data.profile.blocker,
      tone: data.profile.tone,
      energy: data.profile.energy,
    },
    plan: {
      label: plan.label,
      minutes: plan.minutes,
      exercises: plan.items.map(item => ({
        name: item.name,
        sets: item.sets,
        reps: item.reps,
      })),
    },
    recent_workouts: (data.sessions || []).slice(-10),
    memory: (data.memories || []).slice(-18),
    signals: {
      weekly_sessions_complete: week.done,
      weekly_target: week.target,
      days_since_last_session: daysSinceLastSession(data),
      current_energy: data.profile.energy,
      current_deterministic_action: computeDecision(data).type,
    },
    conversation: fcConversationForApi(data),
    mode,
    model: fcModeModel(mode),
  };
}

function fcApplyApiResult(data, payload) {
  if (Array.isArray(payload.memory_writes)) {
    const facts = payload.memory_writes
      .map(item => String(item?.value || "").trim())
      .filter(Boolean);
    data.memories = uniqueStrings([...(data.memories || []), ...facts]).slice(-28);
  }
  if (payload.plan_proposal && typeof payload.plan_proposal === "object") {
    data.planProposals = data.planProposals || [];
    data.planProposals.push({
      id: uid(),
      status: "pending",
      at: new Date().toISOString(),
      ...payload.plan_proposal,
      requires_confirmation: true,
    });
  }
  data.lastApi = {
    at: new Date().toISOString(),
    provider: payload.provider || "AI",
    model: payload.model || "unknown",
    suggested_action: payload.suggested_action || null,
    quality_recovered: Boolean(payload.quality_recovered),
    attempts: Number(payload.attempts || 1),
    route: "fitcoach-chat-v2",
  };
}

/* Replace the canned v0.3.1 chat adapter with the quality-gated v2 route. */
sendChat = async function sendChatV2(text = null) {
  if (app.chatBusy) return;
  const input = $("#coach-input");
  const message = String(text ?? input?.value ?? "").trim();
  if (!message) return;
  if (/\b(?:api[_ -]?key|password|secret|token)\s*(?:is|[:=])/i.test(message)) {
    toast("Remove credentials or secrets before sending.");
    return;
  }

  const data = load();
  data.chat = (data.chat || []).filter(item => !(
    item?.role === "coach" && fcIsBrokenReply(item?.text)
  ));
  data.chat.push({
    id: uid(),
    role: "user",
    text: message,
    at: new Date().toISOString(),
  });
  save(data);
  if (input) input.value = "";

  app.chatBusy = true;
  setApiState("busy", "Nova thinking");
  renderCoach(load());

  let payload;
  try {
    const response = await fetch(FC_CHAT_V2_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FitCoach-Build": FC_PATCH_BUILD,
      },
      body: JSON.stringify(fcBuildPayload(load(), message)),
    });
    payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || fcIsBrokenReply(payload.reply)) {
      throw new Error(payload.error || `HTTP_${response.status}`);
    }
  } catch (error) {
    const failed = load();
    failed.chat.push({
      id: uid(),
      role: "coach",
      text: "The live coach connection failed, and I’m not going to disguise a canned sentence as intelligence. Check the connection and send that again.",
      at: new Date().toISOString(),
      provider: "connection error",
      model: String(error?.message || "unknown"),
    });
    failed.lastApi = {
      at: new Date().toISOString(),
      provider: "error",
      model: String(error?.message || "unknown"),
      route: "fitcoach-chat-v2",
    };
    save(failed);
    app.chatBusy = false;
    setApiState("error", "AI unavailable");
    if (app.route === "coach") renderCoach(load());
    return;
  }

  const latest = load();
  latest.chat.push({
    id: uid(),
    role: "coach",
    text: payload.reply,
    at: new Date().toISOString(),
    provider: payload.provider || "AI",
    model: payload.model || "unknown",
    qualityRecovered: Boolean(payload.quality_recovered),
  });
  fcApplyApiResult(latest, payload);
  save(latest);

  app.chatBusy = false;
  setApiState("ready", payload.quality_recovered ? "AI recovered" : "AI live");
  if (app.route === "coach") renderCoach(load());

  if (latest.settings?.speakReplies !== false) {
    void speak(payload.reply, { messageId: latest.chat.at(-1)?.id, automatic: true });
  }
};

/* Keep the premium UI, but make its model label match the route that is actually called. */
const fcOriginalRenderCoach = renderCoach;
renderCoach = function renderCoachV2(data) {
  data.chat = (data.chat || []).filter(item => !(
    item?.role === "coach" && fcIsBrokenReply(item?.text)
  ));
  save(data);
  fcOriginalRenderCoach(data);

  const mode = data.settings?.coachMode || "smart";
  const description = document.querySelector(".coach-banner .coach-identity p");
  if (description) {
    description.textContent = `${data.profile.tone} accountability · ${fcModeDescription(mode)}`;
  }
  const meta = document.querySelector(".coach-meta");
  if (meta && !meta.querySelector("[data-voice-live]")) {
    const badge = document.createElement("span");
    badge.className = "tag blue";
    badge.dataset.voiceLive = "true";
    badge.textContent = data.settings?.speakReplies === false ? "Voice replies off" : "Voice replies on";
    meta.appendChild(badge);
  }
  requestAnimationFrame(scrollChatToBottom);
};

/* Add a replay control to every coach answer. */
renderMessage = function renderMessageWithVoice(message) {
  const isCoach = message.role !== "user";
  const meta = isCoach && message.provider
    ? `${message.provider}${message.model ? ` · ${message.model}` : ""}`
    : fmtTime(message.at);
  const voiceButton = isCoach
    ? `<button class="message-voice-button ${fcSpeakingMessageId === message.id ? "speaking" : ""}" data-speak-message="${esc(message.id)}" aria-label="Hear Nova read this reply aloud">${fcSpeakingMessageId === message.id ? "■" : "◖"}</button>`
    : "";
  return `<div class="message ${message.role === "user" ? "user" : "coach"}" data-message-id="${esc(message.id || "")}"><div class="message-copy">${formatReply(message.text)}</div><div class="message-footer"><small>${esc(meta)}</small>${voiceButton}</div></div>`;
};

function fcInjectVoiceStyles() {
  if (document.getElementById("fitcoach-v032-voice-styles")) return;
  const style = document.createElement("style");
  style.id = "fitcoach-v032-voice-styles";
  style.textContent = `
    .message-copy{min-width:0}.message-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}.message-footer small{margin-top:0!important}.message-voice-button{flex:0 0 30px;width:30px;height:30px;border:1px solid rgba(111,140,255,.24);border-radius:11px;background:rgba(75,139,255,.09);color:#a9beff;font-size:16px;display:grid;place-items:center}.message-voice-button.speaking{background:linear-gradient(135deg,#2f6bff,#7a4dff);color:white;box-shadow:0 0 20px rgba(75,139,255,.45);animation:pulse 1s infinite}.message.coach{position:relative}.api-state.speaking span{background:#7a4dff;box-shadow:0 0 12px #7a4dff;animation:pulse .9s infinite}
  `;
  document.head.appendChild(style);
}

async function fcUnlockAudio() {
  if (fcAudioUnlocked) return;
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      fcAudioContext = fcAudioContext || new AudioContextCtor();
      await fcAudioContext.resume();
      const buffer = fcAudioContext.createBuffer(1, 1, 22050);
      const source = fcAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(fcAudioContext.destination);
      source.start(0);
    }
    fcAudioUnlocked = true;
  } catch {
    /* An explicit message speaker button remains available. */
  }
}

function fcStopSpeech() {
  try {
    if (fcVoiceAudio) {
      fcVoiceAudio.pause();
      fcVoiceAudio.src = "";
    }
  } catch {}
  fcVoiceAudio = null;
  if (fcVoiceObjectUrl) URL.revokeObjectURL(fcVoiceObjectUrl);
  fcVoiceObjectUrl = "";
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  fcSpeakingMessageId = null;
  if (!app.chatBusy) setApiState("ready", "AI live");
}

function fcBrowserSpeech(text) {
  if (!("speechSynthesis" in window)) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3200));
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(voice => /Samantha|Ava|Serena|Allison|Jenny|Aria/i.test(voice.name))
    || voices.find(voice => /^en[-_]/i.test(voice.lang))
    || null;
  utterance.rate = 1.01;
  utterance.pitch = 0.98;
  utterance.onstart = () => setApiState("speaking", "Nova speaking");
  utterance.onend = () => {
    fcSpeakingMessageId = null;
    setApiState("ready", "AI live");
    if (app.route === "coach") renderCoach(load());
  };
  utterance.onerror = () => setApiState("ready", "AI live");
  speechSynthesis.speak(utterance);
  return true;
}

async function fcPlayServerSpeech(text, { messageId = null, automatic = false } = {}) {
  const clean = String(text || "").trim();
  if (!clean) return;
  fcStopSpeech();
  await fcUnlockAudio();
  fcSpeakingMessageId = messageId;
  if (app.route === "coach") renderCoach(load());
  setApiState("speaking", "Nova speaking");

  try {
    const response = await fetch(FC_SPEECH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FitCoach-Build": FC_PATCH_BUILD,
      },
      body: JSON.stringify({
        text: clean,
        voice: "af_nova",
        session_id: `fitcoach-${app.founder}-${deviceId()}`,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `TTS_HTTP_${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("EMPTY_TTS_AUDIO");

    fcVoiceObjectUrl = URL.createObjectURL(blob);
    const audio = new Audio(fcVoiceObjectUrl);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = 1;
    fcVoiceAudio = audio;

    audio.onended = () => {
      fcStopSpeech();
      if (app.route === "coach") renderCoach(load());
    };
    audio.onerror = () => {
      fcStopSpeech();
      fcBrowserSpeech(clean);
    };
    await audio.play();
  } catch (error) {
    fcSpeakingMessageId = null;
    if (!fcBrowserSpeech(clean)) {
      setApiState("ready", "AI live");
      if (!automatic) toast("Spoken reply is unavailable on this device right now.");
    }
    if (app.route === "coach") renderCoach(load());
  }
}

/* Existing call sites already invoke speak() after a reply; this now means real audio. */
speak = function speakNova(text, options = {}) {
  return fcPlayServerSpeech(text, options);
};

/* Starting a new voice question interrupts the old spoken answer, like a real conversation. */
const fcOriginalStartVoice = startVoice;
startVoice = async function startVoiceV2() {
  fcStopSpeech();
  await fcUnlockAudio();
  return fcOriginalStartVoice();
};

document.addEventListener("pointerdown", fcUnlockAudio, { capture: true, passive: true });
document.addEventListener("touchstart", fcUnlockAudio, { capture: true, passive: true });
document.addEventListener("click", event => {
  const button = event.target.closest?.("[data-speak-message]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const id = button.dataset.speakMessage;
  if (fcSpeakingMessageId === id) {
    fcStopSpeech();
    if (app.route === "coach") renderCoach(load());
    return;
  }
  const message = (load().chat || []).find(item => item.id === id);
  if (message?.text) void speak(message.text, { messageId: id, automatic: false });
}, true);

document.addEventListener("DOMContentLoaded", () => {
  fcInjectVoiceStyles();
  const data = load();
  data.settings = data.settings || {};
  if (typeof data.settings.speakReplies !== "boolean") data.settings.speakReplies = true;
  data.chat = (data.chat || []).filter(item => !(
    item?.role === "coach" && fcIsBrokenReply(item?.text)
  ));
  save(data);
});
