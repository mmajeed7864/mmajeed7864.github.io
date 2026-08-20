function renderCoach(data) {
  if (!data.chat.length) {
    data.chat.push({
      id: uid(), role: "coach",
      text: `I’m Nova. I can see your ${data.profile.goal} goal, ${data.profile.days}-day commitment, and the workouts you actually log. Ask me for a decision—not trivia—and I’ll give you one useful next action.`,
      at: new Date().toISOString(), provider: "system", model: "FitCoach contract"
    });
    save(data);
  }
  const mode = data.settings.coachMode || "smart";
  const pendingProposal = [...data.planProposals].reverse().find(proposal => proposal.status === "pending");
  const suggested = data.lastApi?.suggested_action && ACTIONS.includes(data.lastApi.suggested_action)
    ? decisionPayload(data.lastApi.suggested_action, data, true)
    : null;

  $("#view").innerHTML = `
    <div class="stack coach-stage">
      <section class="coach-banner">
        <div class="coach-identity">
          <div class="coach-orb"><i></i></div>
          <div><div class="kicker">PERSISTENT AI TRAINER</div><h3>Nova</h3><p>${esc(data.profile.tone)} accountability · ${esc(MODEL_MODES[mode].detail)}</p></div>
        </div>
        <div class="coach-meta"><span class="tag green">Live API</span><span class="tag">Memory bounded</span><span class="tag">Plan changes require approval</span></div>
        <div class="mode-switch">${Object.entries(MODEL_MODES).map(([key,value]) => `<button class="mode-button ${mode === key ? "active" : ""}" data-coach-mode="${key}" title="${esc(value.detail)}">${value.label}</button>`).join("")}</div>
      </section>
      <section class="card chat-card">
        <div id="chat-scroll" class="chat-scroll">
          ${data.chat.map(message => renderMessage(message)).join("")}
          ${app.chatBusy ? `<div class="typing" aria-label="Nova is thinking"><i></i><i></i><i></i></div>` : ""}
        </div>
        ${suggested ? `<div class="coach-suggestion"><div class="kicker">NOVA SUGGESTS</div><b>${esc(suggested.title)}</b><p>${esc(suggested.copy)}</p><button class="secondary" data-use-ai-action="${suggested.type}">Use this action</button></div>` : ""}
        ${pendingProposal ? renderPlanProposal(pendingProposal) : ""}
        <div class="quick-row">
          ${["I missed a workout. What should I do?","I only have 15 minutes today.","Should I train or rest?","Challenge my current plan."].map(prompt => `<button class="quick-chip" data-quick-prompt="${esc(prompt)}">${esc(prompt.replace(" today", "").slice(0, 22))}</button>`).join("")}
        </div>
        <div class="composer">
          <button class="composer-button" data-voice-start aria-label="Talk to Nova"><svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
          <textarea id="coach-input" rows="1" maxlength="4000" placeholder="Ask Nova for a decision…"></textarea>
          <button class="composer-button send" data-send-chat aria-label="Send message"><svg viewBox="0 0 24 24"><path d="m5 12 14-8-4 16-3-6z"/><path d="m12 14 7-10"/></svg></button>
        </div>
        <div class="privacy-line">Messages use the selected external AI provider through Symbio’s server. Do not enter diagnoses, medication details, credentials, or private medical records.</div>
      </section>
    </div>`;
  requestAnimationFrame(scrollChatToBottom);
}

function renderMessage(message) {
  const meta = message.role === "coach" && message.provider
    ? `${message.provider}${message.model ? ` · ${message.model}` : ""}`
    : fmtTime(message.at);
  return `<div class="message ${message.role === "user" ? "user" : "coach"}">${formatReply(message.text)}<small>${esc(meta)}</small></div>`;
}

function formatReply(text) {
  return esc(text).replace(/\n/g, "<br>");
}

function renderPlanProposal(proposal) {
  return `<div class="proposal"><div class="kicker">PLAN CHANGE PROPOSAL</div><b>${esc(proposal.title || "Suggested adjustment")}</b><p>${esc(proposal.reason || "Nova recommends a change based on the context you provided.")}</p>${proposal.changes?.length ? `<ul>${proposal.changes.map(change => `<li>${esc(change)}</li>`).join("")}</ul>` : ""}<div class="proposal-actions"><button class="secondary" data-reject-proposal="${proposal.id}">Not now</button><button class="primary" data-accept-proposal="${proposal.id}">Confirm change</button></div></div>`;
}

function scrollChatToBottom() {
  const scroll = $("#chat-scroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

function modelSequence(mode) {
  return MODEL_MODES[mode]?.sequence || MODEL_MODES.smart.sequence;
}

function buildChatPayload(data, message, model, mode) {
  const week = weekStats(data);
  const plan = planLibrary(data)[0];
  const conversation = data.chat.slice(-10).map(item => ({
    role: item.role === "coach" ? "assistant" : "user",
    content: item.text
  }));
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
      energy: data.profile.energy
    },
    plan: {
      label: plan.label,
      minutes: plan.minutes,
      exercises: plan.items.map(item => ({ name: item.name, sets: item.sets, reps: item.reps }))
    },
    recent_workouts: data.sessions.slice(-8).map(session => ({
      date: session.date,
      plan: session.planLabel,
      duration_minutes: session.durationMinutes,
      exercises: (session.exercises || []).map(exercise => ({
        name: exercise.name,
        sets: (exercise.sets || []).map(set => ({ weight: set.weight, reps: set.reps }))
      }))
    })),
    memory: data.memories.slice(-12),
    signals: {
      weekly_sessions_complete: week.done,
      weekly_target: week.target,
      days_since_last_session: daysSinceLastSession(data),
      current_energy: data.profile.energy,
      current_deterministic_action: computeDecision(data).type
    },
    conversation,
    mode: mode === "deep" ? "deep" : "normal",
    model
  };
}
