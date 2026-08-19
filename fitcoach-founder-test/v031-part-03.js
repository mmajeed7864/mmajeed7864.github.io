function renderOnboarding() {
  const data = load();
  const profile = data.profile;
  $("#ob-label").textContent = `Step ${app.onboardingStep + 1} of 4`;
  $("#ob-progress").style.width = `${(app.onboardingStep + 1) * 25}%`;
  $("#ob-back").disabled = app.onboardingStep === 0;
  $("#ob-next").textContent = app.onboardingStep === 3 ? "Build my coach" : "Continue";

  const body = $("#ob-body");
  if (app.onboardingStep === 0) {
    body.innerHTML = `
      <h2>What are we building toward?</h2>
      <p>Your coach uses one clear objective to decide what matters and what should wait.</p>
      <div class="option-list">
        ${goalOptions.map(([value, title, copy, icon]) => `
          <button class="option ${profile.goal === value ? "active" : ""}" data-ob-field="goal" data-ob-value="${value}">
            <span class="emoji">${icon}</span><span><b>${title}</b><small>${copy}</small></span>
          </button>`).join("")}
      </div>`;
  }
  if (app.onboardingStep === 1) {
    body.innerHTML = `
      <h2>Build a plan that fits your week.</h2>
      <p>Real availability beats an ambitious plan you cannot repeat.</p>
      <div class="form-grid">
        <div class="field"><label>Training days per week</label><div class="pills">
          ${[2,3,4,5,6].map(value => `<button class="pill ${Number(profile.days) === value ? "active" : ""}" data-ob-field="days" data-ob-value="${value}">${value} days</button>`).join("")}
        </div></div>
        <div class="field"><label>Typical session length</label><div class="pills">
          ${[20,30,45,60,75].map(value => `<button class="pill ${Number(profile.duration) === value ? "active" : ""}" data-ob-field="duration" data-ob-value="${value}">${value} min</button>`).join("")}
        </div></div>
        <div class="field"><label>Equipment</label><select id="ob-equipment">
          ${["full gym","home gym","dumbbells only","bodyweight"].map(value => `<option ${profile.equipment === value ? "selected" : ""}>${value}</option>`).join("")}
        </select></div>
      </div>`;
  }
  if (app.onboardingStep === 2) {
    body.innerHTML = `
      <h2>What usually gets in the way?</h2>
      <p>The trainer should solve the real blocker, not send generic motivation.</p>
      <div class="option-list">
        ${blockerOptions.map(([value, title, copy, icon]) => `
          <button class="option ${profile.blocker === value ? "active" : ""}" data-ob-field="blocker" data-ob-value="${value}">
            <span class="emoji">${icon}</span><span><b>${title}</b><small>${copy}</small></span>
          </button>`).join("")}
      </div>
      <div class="field" style="margin-top:22px"><label>Accountability style</label><div class="pills">
        ${["Supportive","Direct","Strict","Competitive"].map(value => `<button class="pill ${profile.tone === value ? "active" : ""}" data-ob-field="tone" data-ob-value="${value}">${value}</button>`).join("")}
      </div></div>`;
  }
  if (app.onboardingStep === 3) {
    body.innerHTML = `
      <h2>Give the coach boundaries.</h2>
      <p>Proactive coaching is opt-in. It should know when to speak, when to stay quiet, and when you want space.</p>
      <div class="form-grid">
        <div class="field"><label>Quiet hours begin</label><input id="ob-qstart" type="time" value="${profile.quietStart}"></div>
        <div class="field"><label>Quiet hours end</label><input id="ob-qend" type="time" value="${profile.quietEnd}"></div>
        <label class="consent"><input id="ob-proactive" type="checkbox" ${profile.proactive ? "checked" : ""}><span><b>Allow proactive coaching</b><br>The coach may initiate a message only when it references a real fact and offers a useful action.</span></label>
        <label class="consent"><input id="ob-feedback-opt" type="checkbox" ${profile.feedbackOptIn ? "checked" : ""}><span><b>Share founder-test feedback</b><br>Build version, screen, action and rating stay on this device. Full coach conversations are not copied into feedback records.</span></label>
      </div>`;
  }

  body.onclick = event => {
    const choice = event.target.closest("[data-ob-field]");
    if (!choice) return;
    const current = load();
    const field = choice.dataset.obField;
    const value = ["days", "duration"].includes(field) ? Number(choice.dataset.obValue) : choice.dataset.obValue;
    current.profile[field] = value;
    save(current);
    renderOnboarding();
  };
}

function nextOnboarding() {
  const data = load();
  if (app.onboardingStep === 1) data.profile.equipment = $("#ob-equipment")?.value || data.profile.equipment;
  if (app.onboardingStep === 3) {
    data.profile.quietStart = $("#ob-qstart").value;
    data.profile.quietEnd = $("#ob-qend").value;
    data.profile.proactive = $("#ob-proactive").checked;
    data.profile.feedbackOptIn = $("#ob-feedback-opt").checked;
    data.profile.onboarded = true;
    data.memories = uniqueStrings([
      ...data.memories,
      `Goal: ${data.profile.goal}`,
      `${data.profile.days} days/week`,
      `${data.profile.duration}-minute sessions`,
      `Main blocker: ${data.profile.blocker}`,
      `Tone: ${data.profile.tone}`
    ]).slice(-20);
    save(data);
    showShell();
    return;
  }
  save(data);
  app.onboardingStep += 1;
  renderOnboarding();
}

function navigate(route) {
  if (!ROUTES.includes(route)) return;
  app.route = route;
  const url = new URL(location.href);
  url.searchParams.set("v", "0310");
  url.searchParams.set("route", route);
  history.replaceState({}, "", url);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const data = load();
  const founder = founders[app.founder];
  $("#avatar").textContent = founder.initial;
  $("#head-kicker").textContent = app.route.toUpperCase();
  $("#head-title").textContent = {
    today: greeting(), train: "Build the session", coach: "Your trainer",
    progress: "Your progress", profile: "Your setup"
  }[app.route];
  $$(".nav-btn").forEach(button => button.classList.toggle("active", button.dataset.route === app.route));

  if (app.route === "today") renderToday(data);
  if (app.route === "train") renderTrain(data);
  if (app.route === "coach") renderCoach(data);
  if (app.route === "progress") renderProgress(data);
  if (app.route === "profile") renderProfile(data);
}

function greeting() {
  const hour = new Date().getHours();
  return `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${founders[app.founder].name}`;
}

