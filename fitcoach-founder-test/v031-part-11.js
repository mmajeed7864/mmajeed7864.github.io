function renderProfile(data) {
  const mode = data.settings.coachMode || "smart";
  $("#view").innerHTML = `
    <div class="stack">
      <article class="card"><div class="summary"><div><div class="kicker">FOUNDER PROFILE</div><h3>${founders[app.founder].name}</h3><p>${esc(data.profile.goal)} · ${data.profile.days} days/week · ${data.profile.duration} min</p></div><div class="profile-avatar">${founders[app.founder].initial}</div></div></article>
      <article class="card"><div class="row-head"><h3>Nova controls</h3><span class="tag green">API connected</span></div><div class="settings-list">
        <div class="setting"><span><b>Coach intelligence</b><small>${esc(MODEL_MODES[mode].detail)}</small></span><select data-setting="coachMode">${Object.entries(MODEL_MODES).map(([key,value]) => `<option value="${key}" ${mode === key ? "selected" : ""}>${value.label}</option>`).join("")}</select></div>
        <div class="setting"><span><b>Accountability style</b><small>Strict is direct, never humiliating</small></span><select data-profile-setting="tone">${["Supportive","Direct","Strict","Competitive"].map(value => `<option ${data.profile.tone === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
        <div class="setting"><span><b>Speak coach replies</b><small>Uses your device voice</small></span><label class="switch"><input type="checkbox" data-setting="speakReplies" ${data.settings.speakReplies ? "checked" : ""}><span></span></label></div>
        <div class="setting"><span><b>Earned proactive coaching</b><small>Nova can initiate only with verified context</small></span><label class="switch"><input type="checkbox" data-profile-setting="proactive" ${data.profile.proactive ? "checked" : ""}><span></span></label></div>
        <div class="setting"><span><b>Units</b><small>Workout logger display</small></span><select data-setting="units"><option ${data.settings.units === "lb" ? "selected" : ""}>lb</option><option ${data.settings.units === "kg" ? "selected" : ""}>kg</option></select></div>
      </div></article>
      <article class="card"><div class="row-head"><h3>What Nova remembers</h3><span class="tag">Editable next</span></div><div class="memory-list">${data.memories.length ? data.memories.slice(-20).map(memory => `<span class="memory-chip">${esc(memory)}</span>`).join("") : `<span class="memory-chip">No learned facts yet</span>`}</div><p>Memory is stored on this device in the founder build. Server sync is not active yet.</p></article>
      <article class="card install-card"><div class="kicker">PHONE APP</div><h3>Install or refresh FitCoach</h3><p>iPhone: Safari → Share → Add to Home Screen. Delete the old icon first when it still opens the green build.</p><div class="hero-actions"><button class="secondary" data-install>Install steps</button><button class="secondary" data-force-refresh>Refresh assets</button></div></article>
      <article class="card"><div class="row-head"><h3>Founder tools</h3><span class="tag">Build ${BUILD}</span></div><div class="hero-actions"><button class="secondary" data-export>Export data</button><button class="secondary" data-clear-chat>Clear chat</button><button class="secondary" data-reset-profile>Reset profile</button><button class="out danger" data-switch-founder>Switch founder</button></div><p>Live messages use an external model provider through Symbio’s server. No provider key is stored in this app.</p></article>
    </div>`;
}

