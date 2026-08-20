"use strict";

/* FitCoach v0.3.6 — bounded DeepSeek-primary trainer renderer + device voice experience.
   The model changes wording only. Safety, action choice, plan state, and memory stay deterministic. */

const FC35_CHAT_API = "https://symbioai.dev/api/fitcoach-chat-v3";
const FC35_BUILD = "0.3.6-deepseek-qwen";
const FC35_STYLES = ["Supportive", "Direct", "Strict", "Competitive"];
const FC35_BROKEN_REPLY = [
  /^let(?:'|’)s make the next action specific\.?$/i,
  /^give me the specific decision you want help with/i,
  /^what specific decision do you want help with/i,
  /^please provide more details\.?$/i,
  /^could you be more specific\??$/i,
];
const FC35_PRIVATE_INPUT = /\b(?:(?:api[_ -]?key|password|secret|token)\s*(?:is|[:=])\s*\S+|bearer\s+(?:sk-)?[a-z0-9._~+/=-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}|medicat\w*|prescription|dosage?|\d+\s?mg\b|diagnos\w*|pregnan\w*|eating\s+disorder)\b/i;

let fc35SpeakingMessageId = null;
let fc35Utterance = null;

Object.assign(MODEL_MODES.fast, {
  label: "Quick",
  detail: "Concise answer · same safety rules",
});
Object.assign(MODEL_MODES.smart, {
  label: "Balanced",
  detail: "Useful context · one clear next move",
});
Object.assign(MODEL_MODES.deep, {
  label: "Deep",
  detail: "More explanation · no extra authority",
});

setApiState = function setApiStateV35(state, label) {
  app.apiStatus = state;
  const node = $("#api-state");
  if (!node) return;
  node.className = `api-state ${["busy", "error", "speaking"].includes(state) ? state : ""}`;
  node.innerHTML = `<span></span>${esc(label)}`;
};

function fc35BrokenReply(text) {
  const normalized = String(text || "").trim();
  return !normalized || FC35_BROKEN_REPLY.some(pattern => pattern.test(normalized));
}

function fc35Code(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function fc35DeviceId() {
  let value = localStorage.getItem("fitcoach-device-id");
  if (!value) {
    value = uid().replace(/[^a-zA-Z0-9_-]/g, "");
    localStorage.setItem("fitcoach-device-id", value);
  }
  return value;
}

function fc35Style(data) {
  const value = String(data.profile?.tone || "Direct").toLowerCase();
  return ["supportive", "direct", "strict", "competitive"].includes(value) ? value : "direct";
}

function fc35RememberTone(data) {
  data.memories = [
    ...(data.memories || []).filter(memory => !/^Tone:/i.test(String(memory))),
    `Tone: ${data.profile.tone}`,
  ].slice(-24);
}

function fc35PlanCode(plan) {
  return plan?.id === "B" ? "plan_b" : plan?.id === "MIN" ? "minimum_dose" : "plan_a";
}

function fc35Conversation(data) {
  return (data.chat || [])
    .filter(item => item && item.text && !fc35BrokenReply(item.text))
    .slice(-6)
    .map(item => ({
      role: item.role === "coach" ? "assistant" : "user",
      content: String(item.text).slice(0, 800),
    }));
}

function fc35Payload(data, message) {
  const week = weekStats(data);
  const plan = planLibrary(data)[0];
  const exercises = [...new Set(plan.items.map(item => fc35Code(item.name)).filter(Boolean))].slice(0, 12);
  const goalMap = {
    "build muscle": "build_muscle",
    "get stronger": "get_stronger",
    "lose fat": "lose_fat",
    "stay consistent": "stay_consistent",
  };
  const equipmentMap = {
    "full gym": "full_gym",
    "home gym": "home_gym",
    "dumbbells only": "dumbbells_only",
    bodyweight: "bodyweight",
  };
  const blockerMap = {
    time: "time",
    motivation: "motivation",
    "all-or-nothing": "all_or_nothing",
    uncertainty: "uncertainty",
  };
  const approvedAction = computeDecision(data).type;

  return {
    message: String(message).slice(0, 2_000),
    session_id: `fitcoach-${app.founder}-${fc35DeviceId()}`,
    data_classification: "synthetic_low_sensitivity",
    style: fc35Style(data),
    response_depth: ["fast", "smart", "deep"].includes(data.settings?.coachMode)
      ? data.settings.coachMode
      : "smart",
    context: {
      goal_code: goalMap[data.profile.goal] || "stay_consistent",
      experience_code: ["beginner", "intermediate", "advanced"].includes(data.profile.experience)
        ? data.profile.experience
        : "intermediate",
      days_per_week: clamp(Number(data.profile.days) || 3, 1, 7),
      session_minutes: clamp(Number(data.profile.duration) || 45, 10, 120),
      equipment_code: equipmentMap[data.profile.equipment] || "bodyweight",
      blocker_code: blockerMap[data.profile.blocker] || "uncertainty",
      energy_1_to_5: clamp(Number(data.profile.energy) || 3, 1, 5),
      weekly_completed: clamp(Number(week.done) || 0, 0, Math.max(1, Number(week.target) || 3)),
      weekly_target: clamp(Number(week.target) || 3, 1, 14),
      days_since_last_session: clamp(Number(daysSinceLastSession(data)) || 0, 0, 999),
      approved_action: ACTIONS.includes(approvedAction) ? approvedAction : "SAY_NOTHING",
      plan_code: fc35PlanCode(plan),
      plan_minutes: clamp(Number(plan.minutes) || 45, 10, 120),
      exercise_codes: exercises.length ? exercises : ["full_body_session"],
    },
    conversation: fc35Conversation(data),
  };
}

function fc35ProviderLabel(message) {
  if (message.provider === "deterministic-copy") return "Local fallback";
  if (message.provider === "deterministic-safety") return "Safety boundary";
  if (message.provider === "connection-error") return "Connection notice";
  return "Live trainer";
}

function fc35ApplyResult(data, payload) {
  data.lastApi = {
    at: new Date().toISOString(),
    provider: payload.provider || "unknown",
    model: payload.model || "unknown",
    approved_action: payload.approved_action || null,
    suggested_action: payload.approved_action || null,
    fallback_used: Boolean(payload.fallback_used),
    fallback_reason: payload.fallback_reason || null,
    attempts: Number(payload.attempts || 0),
    renderer_version: payload.renderer_version || "unknown",
    route: "fitcoach-chat-v3-contract",
  };
}

function fc35EphemeralReply(text, kind = "notice") {
  app.fc35EphemeralReply = {
    id: `ephemeral-${Date.now()}`,
    role: "coach",
    text,
    at: new Date().toISOString(),
    provider: kind === "safety" ? "deterministic-safety" : "connection-error",
    ephemeral: true,
  };
}

sendChat = async function sendChatV35(text = null) {
  if (app.chatBusy) return;
  const input = $("#coach-input");
  const message = String(text ?? input?.value ?? "").normalize("NFKC").trim().slice(0, 2_000);
  if (!message) return;
  if (FC35_PRIVATE_INPUT.test(message)) {
    toast("Remove personal, medical, or credential details before sending.");
    return;
  }

  const current = load();
  current.chat = (current.chat || []).filter(item => !(item?.role === "coach" && fc35BrokenReply(item?.text)));
  save(current);
  app.fc35EphemeralReply = null;
  app.fc35PendingMessage = message;
  app.chatBusy = true;
  if (input) input.value = "";
  setApiState("busy", "Trainer thinking");
  renderCoach(load());

  let payload;
  try {
    const response = await fetch(FC35_CHAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FitCoach-Build": FC35_BUILD,
      },
      body: JSON.stringify(fc35Payload(load(), message)),
    });
    payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || fc35BrokenReply(payload.reply)) {
      throw new Error(payload.error || `HTTP_${response.status}`);
    }
  } catch {
    app.fc35PendingMessage = null;
    app.chatBusy = false;
    fc35EphemeralReply(
      "The live trainer connection is unavailable. I did not save or forward this message, and your plan did not change. Check the connection and try again."
    );
    setApiState("error", "Connection unavailable");
    if (app.route === "coach") renderCoach(load());
    return;
  }

  app.fc35PendingMessage = null;
  app.chatBusy = false;

  if (payload.safety_intercepted) {
    fc35EphemeralReply(payload.reply, "safety");
    setApiState("ready", "Safety boundary");
    if (app.route === "coach") renderCoach(load());
    return;
  }

  const latest = load();
  const userMessage = {
    id: uid(),
    role: "user",
    text: message,
    at: new Date().toISOString(),
  };
  const coachMessage = {
    id: uid(),
    role: "coach",
    text: payload.reply,
    at: new Date().toISOString(),
    provider: payload.provider || "unknown",
    model: payload.model || "unknown",
    fallbackUsed: Boolean(payload.fallback_used),
    speakAllowed: payload.speak_allowed !== false,
  };
  latest.chat.push(userMessage, coachMessage);
  fc35ApplyResult(latest, payload);
  save(latest);

  setApiState("ready", payload.fallback_used ? "Local reply" : "Trainer live");
  if (app.route === "coach") renderCoach(load());
  if (latest.settings?.speakReplies !== false && coachMessage.speakAllowed) {
    void speak(coachMessage.text, { messageId: coachMessage.id, automatic: true });
  }
};

function fc35Intro(data) {
  const style = fc35Style(data);
  if (style === "supportive") return "I’m Nova. We’ll make the plan fit real life without pretending missed days erase your progress.";
  if (style === "strict") return "I’m Nova. I’ll hold the standard clearly, cut the excuses, and never confuse discipline with punishment.";
  if (style === "competitive") return "I’m Nova. We compete against your own verified baseline—one honest session, one useful decision, no fake hype.";
  return "I’m Nova. Give me the real constraint and I’ll give you a clear, practical next move.";
}

renderCoach = function renderCoachV35(data) {
  document.body.dataset.trainerStyle = fc35Style(data);
  data.chat = (data.chat || []).filter(item => !(item?.role === "coach" && fc35BrokenReply(item?.text)));
  if (!data.chat.length) {
    data.chat.push({
      id: uid(),
      role: "coach",
      text: fc35Intro(data),
      at: new Date().toISOString(),
      provider: "deterministic-copy",
      model: "founder-intro",
      speakAllowed: true,
    });
    save(data);
  }

  const mode = data.settings?.coachMode || "smart";
  const approvedAction = data.lastApi?.approved_action;
  const suggested = approvedAction && ACTIONS.includes(approvedAction)
    ? decisionPayload(approvedAction, data, true)
    : null;
  const pendingMessage = app.fc35PendingMessage
    ? `<div class="message user pending"><div class="message-copy">${esc(app.fc35PendingMessage)}</div><div class="message-footer"><small>Sending securely…</small></div></div>`
    : "";
  const ephemeral = app.fc35EphemeralReply ? fc35RenderMessage(app.fc35EphemeralReply) : "";

  $("#view").innerHTML = `
    <div class="stack coach-stage fc35-coach-stage">
      <section class="coach-banner fc35-coach-banner">
        <div class="coach-identity">
          <div class="coach-orb fc35-orb" aria-hidden="true"><i></i><b></b><span></span></div>
          <div><div class="kicker">DYNAMIC AI TRAINER</div><h3>Nova</h3><p>${esc(data.profile.tone)} voice · ${esc(MODEL_MODES[mode]?.detail || MODEL_MODES.smart.detail)}</p></div>
        </div>
        <div class="fc35-presence" aria-label="Trainer response state"><span></span><b>${app.chatBusy ? "Thinking through your question" : fc35SpeakingMessageId ? "Speaking now" : "Ready when you are"}</b></div>
        <div class="coach-meta"><span class="tag green">DeepSeek primary</span><span class="tag">Direct Qwen backup</span><span class="tag">Local safe fallback</span><span class="tag">No plan auto-changes</span></div>
        <div class="fc35-control-label">Answer depth</div>
        <div class="mode-switch">${Object.entries(MODEL_MODES).map(([key, value]) => `<button class="mode-button ${mode === key ? "active" : ""}" data-coach-mode="${key}" title="${esc(value.detail)}">${esc(value.label)}</button>`).join("")}</div>
        <div class="fc35-control-label">Trainer tone</div>
        <div class="fc35-style-switch" role="group" aria-label="Trainer tone">${FC35_STYLES.map(style => `<button class="${data.profile.tone === style ? "active" : ""}" data-fc35-style="${style}" aria-pressed="${data.profile.tone === style}">${style}</button>`).join("")}</div>
      </section>
      <section class="card chat-card fc35-chat-card">
        <div id="chat-scroll" class="chat-scroll" aria-live="polite">
          ${data.chat.map(message => fc35RenderMessage(message)).join("")}
          ${pendingMessage}${ephemeral}
          ${app.chatBusy ? `<div class="typing" aria-label="Nova is thinking"><i></i><i></i><i></i></div>` : ""}
        </div>
        ${suggested ? `<div class="coach-suggestion"><div class="kicker">DETERMINISTIC NEXT ACTION</div><b>${esc(suggested.title)}</b><p>${esc(suggested.copy)}</p><button class="secondary" data-use-ai-action="${suggested.type}">Review this action</button></div>` : ""}
        <div class="quick-row">
          ${["I missed a workout. What should I do?", "I only have 15 minutes today.", "Should I train or rest?", "Challenge my current plan."].map(prompt => `<button class="quick-chip" data-quick-prompt="${esc(prompt)}">${esc(prompt.replace(" today", "").slice(0, 24))}</button>`).join("")}
        </div>
        <div class="composer fc35-composer">
          <button class="composer-button" data-voice-start aria-label="Talk to Nova"><svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
          <textarea id="coach-input" rows="1" maxlength="2000" placeholder="Ask your trainer anything…" ${app.chatBusy ? "disabled" : ""}></textarea>
          <button class="composer-button send" data-send-chat aria-label="Send message" ${app.chatBusy ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="m5 12 14-8-4 16-3-6z"/><path d="m12 14 7-10"/></svg></button>
        </div>
        <div class="privacy-line">Synthetic founder test only. Ordinary low-sensitivity text may use DeepSeek or direct Qwen through Symbio’s server. FitCoach does not upload voice audio; browser or device speech services may process dictation. Never enter medical records, medication details, identifiers, or credentials.</div>
      </section>
    </div>`;
  requestAnimationFrame(scrollChatToBottom);
};

function fc35RenderMessage(message) {
  const isCoach = message.role !== "user";
  const meta = isCoach ? fc35ProviderLabel(message) : fmtTime(message.at);
  const speaking = fc35SpeakingMessageId === message.id;
  const voiceButton = isCoach && message.speakAllowed !== false
    ? `<button class="message-voice-button ${speaking ? "speaking" : ""}" data-speak-message="${esc(message.id)}" aria-label="${speaking ? "Stop spoken reply" : "Hear Nova read this reply"}" aria-pressed="${speaking}">${speaking ? "■" : "▶"}</button>`
    : "";
  return `<div class="message ${message.role === "user" ? "user" : "coach"} ${message.ephemeral ? "ephemeral" : ""}" data-message-id="${esc(message.id || "")}"><div class="message-copy">${formatReply(message.text)}</div><div class="message-footer"><small>${esc(meta)}${message.ephemeral ? " · not saved" : ""}</small>${voiceButton}</div></div>`;
}

renderMessage = fc35RenderMessage;

function fc35VoiceProfile(data) {
  const style = fc35Style(data);
  const persona = ["nova", "atlas", "sage"].includes(data.settings?.voicePersona)
    ? data.settings.voicePersona
    : "nova";
  const prosody = {
    supportive: { rate: 0.94, pitch: 1.04 },
    direct: { rate: 1.02, pitch: 0.98 },
    strict: { rate: 0.97, pitch: 0.90 },
    competitive: { rate: 1.08, pitch: 1.02 },
  }[style];
  const patterns = {
    nova: /Samantha|Ava|Serena|Allison|Jenny|Aria|Karen|Moira/i,
    atlas: /Daniel|Alex|Aaron|Fred|Tom|Arthur|Oliver/i,
    sage: /Premium|Enhanced|Natural|Siri/i,
  };
  return { ...prosody, persona, pattern: patterns[persona] };
}

function fc35FindVoice(profile) {
  const voices = speechSynthesis.getVoices();
  return voices.find(voice => profile.pattern.test(voice.name) && /^en[-_]/i.test(voice.lang))
    || voices.find(voice => profile.pattern.test(voice.name))
    || voices.find(voice => /^en[-_]/i.test(voice.lang))
    || voices[0]
    || null;
}

function fc35StopSpeech({ rerender = true } = {}) {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  fc35Utterance = null;
  fc35SpeakingMessageId = null;
  if (!app.chatBusy) setApiState("ready", "Trainer live");
  if (rerender && app.route === "coach") renderCoach(load());
}

speak = async function speakTrainerV35(text, { messageId = null, automatic = false } = {}) {
  if (!("speechSynthesis" in window)) {
    if (!automatic) toast("Spoken replies are unavailable on this device.");
    return false;
  }
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2_400);
  if (!clean) return false;
  fc35StopSpeech({ rerender: false });
  const profile = fc35VoiceProfile(load());
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.voice = fc35FindVoice(profile);
  utterance.rate = profile.rate;
  utterance.pitch = profile.pitch;
  utterance.volume = 1;
  fc35Utterance = utterance;
  fc35SpeakingMessageId = messageId;
  utterance.onstart = () => {
    setApiState("speaking", `${String(load().profile.tone || "Trainer")} voice`);
    if (app.route === "coach") renderCoach(load());
  };
  utterance.onend = () => fc35StopSpeech();
  utterance.onerror = () => fc35StopSpeech();
  speechSynthesis.speak(utterance);
  return true;
};

startVoice = async function startVoiceV35() {
  if (app.chatBusy) return;
  fc35StopSpeech({ rerender: false });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast("Use the microphone on your phone keyboard. This build does not upload raw audio.");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  app.voiceFallbackRecognition = recognition;
  app.fc35VoiceCancelled = false;
  app.fc35VoiceText = "";
  $("#voice-overlay").hidden = false;
  $("#voice-overlay").dataset.trainerStyle = fc35Style(load());
  $("#voice-title").textContent = "Listening…";
  $("#voice-copy").textContent = "Your browser handles dictation. FitCoach does not receive the audio.";
  $("#voice-stop").textContent = "Use transcript";
  $("#voice-stop").disabled = false;

  recognition.onresult = event => {
    const transcript = [...event.results].map(result => result[0].transcript).join(" ").trim();
    app.fc35VoiceText = transcript;
    $("#voice-copy").textContent = transcript || "Listening…";
  };
  recognition.onerror = event => {
    app.fc35VoiceCancelled = true;
    $("#voice-overlay").hidden = true;
    app.voiceFallbackRecognition = null;
    toast(event.error === "not-allowed" ? "Microphone permission was denied." : "Dictation stopped. Try the keyboard microphone.");
  };
  recognition.onend = () => {
    const transcript = String(app.fc35VoiceText || "").trim();
    app.voiceFallbackRecognition = null;
    $("#voice-overlay").hidden = true;
    if (!app.fc35VoiceCancelled && transcript) void sendChat(transcript);
  };
  try {
    recognition.start();
  } catch {
    app.fc35VoiceCancelled = true;
    $("#voice-overlay").hidden = true;
    app.voiceFallbackRecognition = null;
    toast("Voice dictation is busy. Try again in a moment.");
  }
};

stopVoiceAndSend = function stopVoiceAndSendV35() {
  const recognition = app.voiceFallbackRecognition;
  if (!recognition) return;
  $("#voice-title").textContent = "Using transcript…";
  $("#voice-stop").disabled = true;
  recognition.stop();
};

cancelVoice = function cancelVoiceV35() {
  app.fc35VoiceCancelled = true;
  try { app.voiceFallbackRecognition?.abort(); } catch {}
  app.voiceFallbackRecognition = null;
  app.fc35VoiceText = "";
  $("#voice-overlay").hidden = true;
};

const fc35OriginalRenderProfile = renderProfile;
renderProfile = function renderProfileV35(data) {
  fc35OriginalRenderProfile(data);
  const settings = document.querySelector(".v33-coach-settings .v33-settings-stack");
  if (settings && !settings.querySelector("[data-setting='voicePersona']")) {
    const persona = ["nova", "atlas", "sage"].includes(data.settings?.voicePersona)
      ? data.settings.voicePersona
      : "nova";
    settings.insertAdjacentHTML("beforeend", `<label class="v33-setting-row"><span class="v33-setting-icon">♫</span><span><b>Voice character</b><small>Nova is bright, Atlas is grounded, Sage follows the best natural device voice</small></span><select data-setting="voicePersona"><option value="nova" ${persona === "nova" ? "selected" : ""}>Nova</option><option value="atlas" ${persona === "atlas" ? "selected" : ""}>Atlas</option><option value="sage" ${persona === "sage" ? "selected" : ""}>Sage</option></select></label>`);
  }
  const deviceCard = document.querySelector(".v33-device-card p");
  if (deviceCard) deviceCard.textContent = "Install the newest interface, export founder data, or clear only what you choose. Voice uses device speech; raw audio is not uploaded.";
  const deviceHeading = document.querySelector(".v33-device-card h3");
  if (deviceHeading) deviceHeading.textContent = `FitCoach ${FC35_BUILD}`;
};

const fc35OriginalHandleViewChange = handleViewChange;
handleViewChange = function handleViewChangeV35(event) {
  fc35OriginalHandleViewChange(event);
  if (event.target?.dataset?.profileSetting === "tone") {
    const data = load();
    fc35RememberTone(data);
    save(data);
    if (app.route === "profile") renderProfile(data);
  }
};

function fc35InjectStyles() {
  if (document.getElementById("fitcoach-v035-trainer-styles")) return;
  const style = document.createElement("style");
  style.id = "fitcoach-v035-trainer-styles";
  style.textContent = `
    .fc35-coach-stage{--trainer-accent:#5c8cff;--trainer-accent-2:#985cff}.fc35-coach-stage .coach-banner{overflow:hidden}.fc35-coach-banner:after{content:"";position:absolute;inset:auto -12% -70% 35%;height:260px;background:radial-gradient(circle,var(--trainer-accent) 0,transparent 66%);opacity:.16;pointer-events:none}.fc35-orb{position:relative;isolation:isolate}.fc35-orb b,.fc35-orb span{position:absolute;inset:-7px;border:1px solid color-mix(in srgb,var(--trainer-accent) 42%,transparent);border-radius:50%;animation:fc35Orbit 4.6s linear infinite}.fc35-orb span{inset:-13px;animation-direction:reverse;animation-duration:7s;opacity:.55}.fc35-orb i{background:linear-gradient(135deg,var(--trainer-accent),var(--trainer-accent-2))!important;box-shadow:0 0 28px color-mix(in srgb,var(--trainer-accent) 55%,transparent)}.fc35-presence{display:flex;align-items:center;gap:8px;margin:14px 0 4px;color:var(--muted);font-size:.72rem}.fc35-presence span{width:7px;height:7px;border-radius:50%;background:var(--trainer-accent);box-shadow:0 0 12px var(--trainer-accent)}.fc35-control-label{margin-top:13px;color:var(--muted);font-size:.65rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.fc35-style-switch{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px}.fc35-style-switch button{min-height:38px;border:1px solid rgba(132,154,214,.18);border-radius:12px;background:rgba(255,255,255,.035);color:var(--muted);font-size:.72rem;font-weight:750}.fc35-style-switch button.active{color:#fff;border-color:color-mix(in srgb,var(--trainer-accent) 55%,transparent);background:linear-gradient(135deg,color-mix(in srgb,var(--trainer-accent) 27%,transparent),rgba(255,255,255,.04));box-shadow:0 10px 24px color-mix(in srgb,var(--trainer-accent) 18%,transparent)}.message-copy{min-width:0}.message-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px}.message-footer small{margin-top:0!important}.message-voice-button{flex:0 0 36px;width:36px;height:36px;border:1px solid color-mix(in srgb,var(--trainer-accent) 35%,transparent);border-radius:12px;background:color-mix(in srgb,var(--trainer-accent) 12%,transparent);color:#c5d2ff;font-size:12px;display:grid;place-items:center}.message-voice-button.speaking{background:linear-gradient(135deg,var(--trainer-accent),var(--trainer-accent-2));color:#fff;box-shadow:0 0 22px color-mix(in srgb,var(--trainer-accent) 48%,transparent);animation:pulse 1s infinite}.message.ephemeral{border:1px solid rgba(255,190,91,.28);background:rgba(255,190,91,.07)}.message.pending{opacity:.72}.fc35-composer textarea:disabled{opacity:.65}.api-state.speaking span{background:var(--trainer-accent);box-shadow:0 0 12px var(--trainer-accent);animation:pulse .9s infinite}body[data-trainer-style="supportive"] .fc35-coach-stage{--trainer-accent:#61c6a0;--trainer-accent-2:#6b86ff}body[data-trainer-style="strict"] .fc35-coach-stage{--trainer-accent:#ff7d61;--trainer-accent-2:#a54cff}body[data-trainer-style="competitive"] .fc35-coach-stage{--trainer-accent:#ffb144;--trainer-accent-2:#ff4f75}.voice-overlay[data-trainer-style="supportive"] .voice-orb{filter:hue-rotate(105deg)}.voice-overlay[data-trainer-style="strict"] .voice-orb{filter:hue-rotate(315deg)}.voice-overlay[data-trainer-style="competitive"] .voice-orb{filter:hue-rotate(350deg) saturate(1.4)}@keyframes fc35Orbit{to{transform:rotate(360deg)}}@media(max-width:520px){.fc35-style-switch{grid-template-columns:repeat(2,1fr)}.fc35-style-switch button,.message-voice-button{min-height:44px}.fc35-coach-stage button,.fc35-coach-stage textarea{font-size:16px}}
  `;
  document.head.appendChild(style);
}

document.addEventListener("click", event => {
  const styleButton = event.target.closest?.("[data-fc35-style]");
  if (styleButton) {
    event.preventDefault();
    event.stopPropagation();
    const data = load();
    data.profile.tone = styleButton.dataset.fc35Style;
    fc35RememberTone(data);
    save(data);
    fc35StopSpeech({ rerender: false });
    renderCoach(data);
    toast(`${data.profile.tone} trainer tone selected.`);
    return;
  }

  const voiceButton = event.target.closest?.("[data-speak-message]");
  if (!voiceButton) return;
  event.preventDefault();
  event.stopPropagation();
  const id = voiceButton.dataset.speakMessage;
  if (fc35SpeakingMessageId === id) {
    fc35StopSpeech();
    return;
  }
  const message = (load().chat || []).find(item => item.id === id)
    || (app.fc35EphemeralReply?.id === id ? app.fc35EphemeralReply : null);
  if (message?.text && message.speakAllowed !== false && message.provider !== "deterministic-safety") {
    void speak(message.text, { messageId: id, automatic: false });
  }
}, true);

document.addEventListener("DOMContentLoaded", () => {
  fc35InjectStyles();
  const data = load();
  data.settings = data.settings || {};
  if (typeof data.settings.speakReplies !== "boolean") data.settings.speakReplies = true;
  if (!["nova", "atlas", "sage"].includes(data.settings.voicePersona)) data.settings.voicePersona = "nova";
  data.chat = (data.chat || []).filter(item => !(item?.role === "coach" && fc35BrokenReply(item?.text)));
  fc35RememberTone(data);
  save(data);
  document.body.dataset.trainerStyle = fc35Style(data);
  if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => {});
});
