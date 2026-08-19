async function sendChat(text = null) {
  if (app.chatBusy) return;
  const input = $("#coach-input");
  const message = String(text ?? input?.value ?? "").trim();
  if (!message) return;
  if (/\b(?:api[_ -]?key|password|secret|token)\s*(?:is|[:=])/i.test(message)) {
    toast("Remove credentials or secrets before sending.");
    return;
  }

  const data = load();
  data.chat.push({ id: uid(), role: "user", text: message, at: new Date().toISOString() });
  save(data);
  if (input) input.value = "";
  app.chatBusy = true;
  setApiState("busy", "Nova thinking");
  renderCoach(load());

  const mode = data.settings.coachMode || "smart";
  let lastError = null;
  let responsePayload = null;

  for (const model of modelSequence(mode)) {
    try {
      const response = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-FitCoach-Build": BUILD },
        body: JSON.stringify(buildChatPayload(load(), message, model, mode))
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      responsePayload = payload;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  const latest = load();
  if (responsePayload) {
    latest.chat.push({
      id: uid(), role: "coach", text: responsePayload.reply,
      at: new Date().toISOString(), provider: responsePayload.provider || "AI",
      model: responsePayload.model || "unknown"
    });
    if (Array.isArray(responsePayload.memory_writes)) {
      const writes = responsePayload.memory_writes.map(item => item?.value).filter(Boolean);
      latest.memories = uniqueStrings([...latest.memories, ...writes]).slice(-24);
    }
    if (responsePayload.plan_proposal) {
      latest.planProposals.push({
        id: uid(), status: "pending", at: new Date().toISOString(), ...responsePayload.plan_proposal
      });
    }
    latest.lastApi = {
      at: new Date().toISOString(), provider: responsePayload.provider || "AI",
      model: responsePayload.model || "unknown", suggested_action: responsePayload.suggested_action || null
    };
    save(latest);
    setApiState("ready", "AI live");
    if (latest.settings.speakReplies) speak(responsePayload.reply);
  } else {
    latest.chat.push({
      id: uid(), role: "coach",
      text: "The live coach connection failed, so I’m not going to pretend a canned answer is AI. Check your connection and try again.",
      at: new Date().toISOString(), provider: "connection error", model: String(lastError?.message || "unknown")
    });
    latest.lastApi = { at: new Date().toISOString(), provider: "error", model: String(lastError?.message || "unknown"), suggested_action: null };
    save(latest);
    setApiState("error", "AI unavailable");
  }

  app.chatBusy = false;
  if (app.route === "coach") renderCoach(load());
}

function setApiState(state, label) {
  app.apiStatus = state;
  const node = $("#api-state");
  if (!node) return;
  node.className = `api-state ${state === "busy" ? "busy" : state === "error" ? "error" : ""}`;
  node.innerHTML = `<span></span>${esc(label)}`;
}

function deviceId() {
  let value = localStorage.getItem("fitcoach-device-id");
  if (!value) {
    value = uid().replace(/[^a-zA-Z0-9_-]/g, "");
    localStorage.setItem("fitcoach-device-id", value);
  }
  return value;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).replace(/\n/g, " ").slice(0, 1500));
  utterance.rate = 1.02;
  utterance.pitch = 0.96;
  speechSynthesis.speak(utterance);
}

async function startVoice() {
  if (app.chatBusy) return;
  if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
    startSpeechRecognitionFallback();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    app.voiceStream = stream;
    app.voiceRecorder = recorder;
    app.voiceChunks = [];
    app.voiceStartedAt = Date.now();
    recorder.ondataavailable = event => { if (event.data?.size) app.voiceChunks.push(event.data); };
    recorder.start(250);
    $("#voice-overlay").hidden = false;
    $("#voice-title").textContent = "Listening…";
    $("#voice-copy").textContent = "Tap stop when you are finished.";
    $("#voice-stop").disabled = false;
    setTimeout(() => {
      if (app.voiceRecorder?.state === "recording") stopVoiceAndSend();
    }, 45000);
  } catch (error) {
    toast(error?.name === "NotAllowedError" ? "Microphone permission was denied." : "Voice recording is unavailable on this device.");
    startSpeechRecognitionFallback();
  }
}

function startSpeechRecognitionFallback() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast("Use the microphone on your phone keyboard to dictate a message.");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  app.voiceFallbackRecognition = recognition;
  $("#voice-overlay").hidden = false;
  $("#voice-title").textContent = "Listening…";
  $("#voice-copy").textContent = "Your device is transcribing locally.";
  $("#voice-stop").disabled = false;
  let finalText = "";
  recognition.onresult = event => {
    finalText = [...event.results].map(result => result[0].transcript).join(" ");
    $("#voice-copy").textContent = finalText || "Listening…";
  };
  recognition.onerror = () => {
    cancelVoice();
    toast("Voice recognition failed. Try the keyboard microphone.");
  };
  recognition.onend = () => {
    if (finalText.trim()) {
      $("#voice-overlay").hidden = true;
      sendChat(finalText.trim());
    } else {
      cancelVoice();
    }
  };
  recognition.start();
}

