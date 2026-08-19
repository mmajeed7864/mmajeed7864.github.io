/* FitCoach v0.3.3 — distinct product surfaces for Today, Train, Progress, and Profile.
   This patch intentionally leaves the Coach/chat implementation untouched. */

const V33_BUILD = "0.3.3-distinct-pages";

function v33RouteClass(route) {
  document.body.dataset.fitRoute = route || app.route || "today";
  const shell = document.querySelector("#shell");
  if (shell) shell.dataset.route = route || app.route || "today";
}

function v33DateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA");
}

function v33UniqueSessionDates(data) {
  return new Set((data.sessions || []).map(session => v33DateKey(session.completedAt || session.date)).filter(Boolean));
}

function v33Readiness(data) {
  const energy = clamp(Number(data.profile.energy || 3), 1, 4);
  const week = weekStats(data);
  const recency = daysSinceLastSession(data);
  const energyScore = energy * 18;
  const adherenceScore = Math.min(22, Math.round((week.done / Math.max(1, week.target)) * 22));
  const recencyScore = recency === 0 ? 12 : recency === 1 ? 10 : recency === 2 ? 7 : recency === 3 ? 4 : 1;
  const score = clamp(energyScore + adherenceScore + recencyScore, 28, 100);
  const label = score >= 82 ? "Primed" : score >= 65 ? "Ready" : score >= 48 ? "Adjust" : "Recover";
  return { score, label };
}

function v33DayStrip(data) {
  const sessionDates = v33UniqueSessionDates(data);
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return labels.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toLocaleDateString("en-CA");
    const completed = sessionDates.has(iso);
    const planned = (data.profile.preferredDays || []).includes(index + 1);
    const isToday = iso === todayISO();
    return `<div class="v33-day ${completed ? "is-complete" : ""} ${planned ? "is-planned" : ""} ${isToday ? "is-today" : ""}">
      <span>${label}</span><i>${completed ? "✓" : date.getDate()}</i>
    </div>`;
  }).join("");
}

function v33DecisionButtons(decision) {
  return `<div class="v33-command-actions">
    <button class="v33-cta v33-cta-primary" data-decision-primary="${decision.id}">${esc(decision.primary)}</button>
    ${decision.secondary ? `<button class="v33-cta v33-cta-secondary" data-decision-secondary="${decision.id}">${esc(decision.secondary)}</button>` : ""}
    <button class="v33-text-action" data-decision-why="${decision.id}">Why this decision?</button>
  </div>`;
}

function v33PlanFocus(plan) {
  const text = plan.items.map(item => item.name.toLowerCase()).join(" ");
  const tags = [];
  if (/squat|lunge|leg|deadlift|romanian/.test(text)) tags.push("Lower body");
  if (/press|bench|push/.test(text)) tags.push("Push");
  if (/row|pull|pulldown/.test(text)) tags.push("Pull");
  if (/raise|curl|extension/.test(text)) tags.push("Accessories");
  return tags.length ? tags : ["Full body"];
}

function v33PlanCard(plan, index, data) {
  const focus = v33PlanFocus(plan);
  const intensity = plan.id === "A" ? "Full intent" : plan.id === "B" ? "Reduced volume" : "Keep the habit";
  const icon = plan.id === "A" ? "A" : plan.id === "B" ? "B" : "12";
  return `<article class="v33-plan-card v33-plan-${plan.id.toLowerCase()} ${index === 0 ? "is-featured" : ""}">
    <div class="v33-plan-top">
      <span class="v33-plan-glyph">${icon}</span>
      <div><span class="v33-eyebrow">${intensity}</span><h3>${esc(plan.label)}</h3></div>
      <strong>${plan.minutes}<small>min</small></strong>
    </div>
    <p>${esc(plan.why)}</p>
    <div class="v33-focus-row">${focus.map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
    <div class="v33-plan-moves">
      ${plan.items.slice(0, 4).map((item, moveIndex) => `<div><i>${moveIndex + 1}</i><span><b>${esc(item.name)}</b><small>${item.sets} × ${item.reps} · ${item.weight}${data.settings.units}</small></span></div>`).join("")}
    </div>
    <div class="v33-plan-actions">
      <button class="v33-cta v33-cta-primary" data-start-plan="${plan.id}">Start ${esc(plan.label)}</button>
      <button class="v33-icon-action" data-preview-plan="${plan.id}" aria-label="Preview ${esc(plan.label)}">↗</button>
    </div>
  </article>`;
}

function v33WeeklyAdherence(data) {
  const now = new Date();
  const weeks = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7) - offset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = (data.sessions || []).filter(session => {
      const date = new Date(session.completedAt || session.date);
      return date >= start && date < end;
    }).length;
    weeks.push({ label: `W${6 - offset}`, count, pct: clamp(Math.round((count / Math.max(1, Number(data.profile.days || 3))) * 100), 0, 100) });
  }
  return weeks;
}

function v33PersonalBests(data) {
  const bests = new Map();
  for (const session of data.sessions || []) {
    for (const exercise of session.exercises || []) {
      for (const set of exercise.sets || []) {
        const weight = Number(set.weight || 0);
        const reps = Number(set.reps || 0);
        const estimated = weight && reps ? Math.round(weight * (1 + reps / 30)) : weight;
        const current = bests.get(exercise.name);
        if (!current || estimated > current.estimated) {
          bests.set(exercise.name, { name: exercise.name, weight, reps, estimated, date: session.completedAt || session.date });
        }
      }
    }
  }
  return [...bests.values()].sort((a, b) => b.estimated - a.estimated).slice(0, 5);
}

function v33Heatmap(data) {
  const dates = v33UniqueSessionDates(data);
  const today = new Date();
  const cells = [];
  for (let offset = 27; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const iso = date.toLocaleDateString("en-CA");
    const active = dates.has(iso);
    const isToday = offset === 0;
    cells.push(`<span class="v33-heat ${active ? "is-active" : ""} ${isToday ? "is-today" : ""}" title="${iso}${active ? " · workout logged" : ""}"></span>`);
  }
  return cells.join("");
}

function v33TrendPath(values, width = 320, height = 150) {
  if (!values.length) return { line: `0,${height - 12} ${width},${height - 12}`, area: `M0 ${height - 12} L${width} ${height - 12} L${width} ${height} L0 ${height} Z` };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 20 - ((value - min) / range) * (height - 45);
    return [x, y];
  });
  const line = points.map(point => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  const area = `M${points.map(point => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" L")} L${width} ${height} L0 ${height} Z`;
  return { line, area };
}

function v33GoalLabel(goal) {
  return ({ "build muscle": "Build muscle", "get stronger": "Get stronger", "lose fat": "Lose fat", "stay consistent": "Stay consistent" })[goal] || goal;
}

function v33SetRouteHeader(route) {
  const titles = {
    today: ["TODAY", greeting()],
    train: ["TRAIN", "Choose your session"],
    progress: ["PROGRESS", "Proof of the work"],
    profile: ["PROFILE", "Make FitCoach yours"]
  };
  const pair = titles[route];
  if (!pair) return;
  const kicker = document.querySelector("#head-kicker");
  const title = document.querySelector("#head-title");
  if (kicker) kicker.textContent = pair[0];
  if (title) title.textContent = pair[1];
}

renderToday = function renderTodayV33(data) {
  v33RouteClass("today");
  const week = weekStats(data);
  const decision = computeDecision(data);
  const plan = planLibrary(data)[0];
  const readiness = v33Readiness(data);
  const remaining = Math.max(0, week.target - week.done);
  const last = data.sessions.at(-1);
  $("#view").innerHTML = `<div class="v33-page v33-today-page">
    <section class="v33-command-card"><div class="v33-command-copy"><span class="v33-eyebrow">TODAY'S COACH DECISION</span><h3>${esc(decision.title)}</h3><p>${esc(decision.copy)}</p>${v33DecisionButtons(decision)}<div class="v33-decision-receipt"><i></i>${esc(decision.type.replaceAll("_", " "))} · based on your current profile and logs</div></div><div class="v33-readiness" style="--readiness:${readiness.score}"><div class="v33-readiness-orbit"><span>${readiness.score}</span><small>${readiness.label}</small></div><p>Daily readiness</p></div></section>
    <section class="v33-energy-dock"><div><span class="v33-eyebrow">CHECK IN</span><h3>How much do you have today?</h3><p>This changes the plan, not your worth.</p></div><div class="v33-energy-options">${[[1,"Empty","◔"],[2,"Low","◑"],[3,"Ready","◕"],[4,"Strong","●"]].map(([value,label,icon]) => `<button class="v33-energy ${Number(data.profile.energy) === value ? "is-active" : ""}" data-energy="${value}"><b>${icon}</b><span>${label}</span></button>`).join("")}</div></section>
    <section class="v33-week-ribbon"><div class="v33-week-head"><span><b>${week.done}/${week.target}</b> sessions this week</span><small>${remaining ? `${remaining} left · every valid version counts` : "Weekly target complete"}</small></div><div class="v33-week-days">${v33DayStrip(data)}</div></section>
    <div class="v33-today-grid"><section class="v33-next-session"><div class="v33-section-head"><div><span class="v33-eyebrow">NEXT SESSION</span><h3>${esc(plan.label)} · ${plan.minutes} min</h3></div><button class="v33-icon-action" data-preview-plan="A">↗</button></div><div class="v33-session-route">${plan.items.map((item, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><i></i><p><b>${esc(item.name)}</b><small>${item.sets} sets × ${item.reps} reps</small></p><strong>${item.weight}${data.settings.units}</strong></div>`).join("")}</div><button class="v33-cta v33-cta-primary v33-wide" data-start-plan="A">Start today's workout</button></section>
    <section class="v33-weekly-pulse"><span class="v33-eyebrow">YOUR MOMENTUM</span><div class="v33-pulse-number"><strong>${week.pct}%</strong><span>weekly plan</span></div><div class="v33-pulse-track"><i style="width:${week.pct}%"></i></div><div class="v33-pulse-facts"><div><b>${data.sessions.length}</b><span>total sessions</span></div><div><b>${daysSinceLastSession(data) >= 999 ? "—" : `${daysSinceLastSession(data)}d`}</b><span>since last</span></div></div><p>${last ? `Last completed: ${esc(last.planLabel || "Workout")} on ${fmtDate(last.completedAt || last.date)}.` : "Your history starts with the first session you actually complete."}</p><button class="v33-text-action" data-route-target="progress">Open progress view →</button></section></div>
  </div>`;
};

renderTrain = function renderTrainV33(data) {
  v33RouteClass("train");
  if (data.activeWorkout) { renderActiveWorkout(data); document.querySelector("#view > .stack")?.classList.add("v33-active-workout"); return; }
  const plans = planLibrary(data);
  const week = weekStats(data);
  const focus = [...new Set(plans[0].items.flatMap(item => v33PlanFocus({ items: [item] })))];
  $("#view").innerHTML = `<div class="v33-page v33-train-page">
    <section class="v33-train-hero"><div><span class="v33-eyebrow">SESSION STUDIO</span><h3>One goal.<br><em>Three ways to show up.</em></h3><p>Your full plan, a lower-volume version, and a 12-minute floor. Pick the version that fits the day—then train.</p></div><div class="v33-training-dial" style="--week:${week.pct}"><span>${week.done}</span><small>of ${week.target}<br>this week</small></div></section>
    <section class="v33-plan-deck">${plans.map((plan, index) => v33PlanCard(plan, index, data)).join("")}</section>
    <section class="v33-program-map"><div class="v33-section-head"><div><span class="v33-eyebrow">PROGRAM DNA</span><h3>What this block trains</h3></div><span class="v33-mini-badge">${esc(v33GoalLabel(data.profile.goal))}</span></div><div class="v33-muscle-map"><div class="v33-body-silhouette" aria-hidden="true"><i class="head"></i><i class="torso"></i><i class="arm left"></i><i class="arm right"></i><i class="leg left"></i><i class="leg right"></i><span></span></div><div class="v33-program-notes">${focus.map((tag, index) => `<div><i>${index + 1}</i><span><b>${esc(tag)}</b><small>${index === 0 ? "Primary pattern in today's plan" : "Supporting pattern for balanced development"}</small></span></div>`).join("")}<div><i>${focus.length + 1}</i><span><b>Progression</b><small>Previous working weights are prefilled from real logs.</small></span></div></div></div></section>
    <section class="v33-training-rules"><div><span>01</span><p><b>Plan A</b><small>Use it when time and energy support the full session.</small></p></div><div><span>02</span><p><b>Plan B</b><small>Keep the movement pattern; cut unnecessary volume.</small></p></div><div><span>03</span><p><b>Minimum Dose</b><small>Protect consistency without pretending twelve minutes equals a full workout.</small></p></div></section>
  </div>`;
};

startWorkout = function startWorkoutV33(planId) {
  const data = load();
  const plan = planLibrary(data).find(item => item.id === planId);
  if (!plan) return;
  data.activeWorkout = { id: uid(), planId: plan.id, planLabel: plan.label, startedAt: new Date().toISOString(), exercises: plan.items.map(item => ({ name: item.name, sets: Array.from({ length: item.sets }, (_, index) => ({ id: uid(), index: index + 1, weight: item.weight, reps: item.reps, done: false })) })) };
  save(data); closeSheet(); app.route = "train"; render(); toast(`${plan.label} started.`);
};

renderProgress = function renderProgressV33(data) {
  v33RouteClass("progress");
  const totalVolume = (data.sessions || []).reduce((sum, session) => sum + sessionVolume(session), 0);
  const week = weekStats(data); const bests = v33PersonalBests(data); const values = (data.sessions || []).slice(-10).map(sessionVolume); const trend = v33TrendPath(values); const adherence = v33WeeklyAdherence(data);
  const averageDuration = data.sessions.length ? Math.round(data.sessions.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0) / data.sessions.length) : 0;
  const completedSets = data.sessions.reduce((sum, session) => sum + (session.exercises || []).reduce((inner, exercise) => inner + (exercise.sets || []).length, 0), 0);
  $("#view").innerHTML = `<div class="v33-page v33-progress-page">
    <section class="v33-progress-hero"><div class="v33-proof-copy"><span class="v33-eyebrow">PROOF, NOT STREAKS</span><h3>${data.sessions.length ? `${data.sessions.length} sessions logged` : "The record starts with your first rep"}</h3><p>${data.sessions.length ? `You moved ${compactNumber(totalVolume)} ${data.settings.units} across ${completedSets} completed sets.` : "No demo workouts. Every chart and milestone is built from work you actually log."}</p></div><div class="v33-proof-score"><strong>${week.pct}</strong><span>%</span><small>weekly adherence</small></div></section>
    <section class="v33-metric-rail"><div><span>Sessions</span><b>${data.sessions.length}</b><small>${week.done}/${week.target} this week</small></div><div><span>Volume</span><b>${compactNumber(totalVolume)}</b><small>${data.settings.units} moved</small></div><div><span>Avg. session</span><b>${averageDuration || "—"}</b><small>${averageDuration ? "minutes" : "no data yet"}</small></div><div><span>Best lifts</span><b>${bests.length}</b><small>movements tracked</small></div></section>
    <section class="v33-trend-card"><div class="v33-section-head"><div><span class="v33-eyebrow">TRAINING LOAD</span><h3>Volume across recent sessions</h3></div><span class="v33-mini-badge">Last ${values.length || 0}</span></div>${values.length ? `<div class="v33-chart"><svg viewBox="0 0 320 150" preserveAspectRatio="none"><defs><linearGradient id="v33Line" x1="0" x2="1"><stop stop-color="#56a0ff"/><stop offset=".52" stop-color="#6373ff"/><stop offset="1" stop-color="#9b5cff"/></linearGradient><linearGradient id="v33Area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4b8bff" stop-opacity=".28"/><stop offset="1" stop-color="#7a4dff" stop-opacity="0"/></linearGradient></defs><path class="v33-gridline" d="M0 30H320M0 75H320M0 120H320"/><path class="v33-area" d="${trend.area}"/><polyline class="v33-line" points="${trend.line}"/></svg></div>` : `<div class="v33-empty-state"><i>↗</i><b>No trend yet</b><span>Complete a workout to start the chart.</span></div>`}<div class="v33-adherence-bars">${adherence.map(weekItem => `<div><span style="height:${Math.max(6, weekItem.pct)}%"></span><small>${weekItem.label}</small></div>`).join("")}</div></section>
    <div class="v33-progress-grid"><section class="v33-consistency-card"><div class="v33-section-head"><div><span class="v33-eyebrow">LAST 28 DAYS</span><h3>Consistency map</h3></div><span class="v33-mini-badge">${v33UniqueSessionDates(data).size} active days</span></div><div class="v33-heatmap">${v33Heatmap(data)}</div><p>Intensity is not the goal here. This shows whether the plan survives real life.</p></section><section class="v33-bests-card"><div class="v33-section-head"><div><span class="v33-eyebrow">PERSONAL BESTS</span><h3>Strongest logged work</h3></div></div>${bests.length ? `<div class="v33-best-list">${bests.map((best, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><p><b>${esc(best.name)}</b><small>${best.weight}${data.settings.units} × ${best.reps}</small></p><strong>${best.estimated}<small>est.</small></strong></div>`).join("")}</div>` : `<div class="v33-empty-state compact"><i>★</i><b>No bests yet</b><span>Your first completed sets create the baseline.</span></div>`}</section></div>
    <section class="v33-timeline-card"><div class="v33-section-head"><div><span class="v33-eyebrow">SESSION HISTORY</span><h3>Recent work</h3></div><span class="v33-mini-badge">No demo history</span></div>${data.sessions.length ? `<div class="v33-session-timeline">${[...data.sessions].reverse().slice(0, 8).map(session => `<div><span>${fmtDate(session.completedAt || session.date)}</span><i></i><p><b>${esc(session.planLabel || "Workout")}</b><small>${session.durationMinutes || 0} min · ${(session.exercises || []).length} movements</small></p><strong>${compactNumber(sessionVolume(session))}<small>vol</small></strong></div>`).join("")}</div>` : `<div class="v33-empty-state"><i>＋</i><b>Nothing fabricated</b><span>Your history is intentionally empty until you train.</span><button class="v33-cta v33-cta-primary" data-route-target="train">Choose a session</button></div>`}</section>
  </div>`;
};

renderProfile = function renderProfileV33(data) {
  v33RouteClass("profile");
  const mode = data.settings.coachMode || "smart"; const week = weekStats(data);
  const goalOptions = ["build muscle", "get stronger", "lose fat", "stay consistent"]; const equipmentOptions = ["full gym", "home gym", "dumbbells only", "bodyweight"];
  $("#view").innerHTML = `<div class="v33-page v33-profile-page">
    <section class="v33-profile-hero"><div class="v33-profile-mark">${founders[app.founder].initial}<i></i></div><div><span class="v33-eyebrow">FOUNDER PROFILE</span><h3>${founders[app.founder].name}</h3><p>${esc(v33GoalLabel(data.profile.goal))} · ${data.profile.days} days/week · ${data.profile.duration} minutes</p><div class="v33-profile-status"><span><i></i>Local founder data</span><span>${week.done}/${week.target} this week</span></div></div></section>
    <section class="v33-profile-section v33-training-dna"><div class="v33-section-head"><div><span class="v33-eyebrow">TRAINING DNA</span><h3>The plan should fit you</h3></div><span class="v33-mini-badge">Editable</span></div><div class="v33-control-grid">
      <label class="v33-control"><span><b>Primary goal</b><small>Defines the base program</small></span><select data-profile-setting="goal">${goalOptions.map(value => `<option value="${value}" ${data.profile.goal === value ? "selected" : ""}>${v33GoalLabel(value)}</option>`).join("")}</select></label>
      <label class="v33-control"><span><b>Days per week</b><small>Your realistic commitment</small></span><select data-profile-setting="days">${[2,3,4,5,6].map(value => `<option value="${value}" ${Number(data.profile.days) === value ? "selected" : ""}>${value} days</option>`).join("")}</select></label>
      <label class="v33-control"><span><b>Session length</b><small>Plan A duration</small></span><select data-profile-setting="duration">${[20,30,45,60,75].map(value => `<option value="${value}" ${Number(data.profile.duration) === value ? "selected" : ""}>${value} min</option>`).join("")}</select></label>
      <label class="v33-control"><span><b>Equipment</b><small>Controls exercise selection</small></span><select data-profile-setting="equipment">${equipmentOptions.map(value => `<option value="${value}" ${data.profile.equipment === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="v33-control"><span><b>Main blocker</b><small>What coaching should solve</small></span><select data-profile-setting="blocker">${[["time","Time"],["motivation","Motivation"],["all-or-nothing","All or nothing"],["uncertainty","Uncertainty"]].map(([value,label]) => `<option value="${value}" ${data.profile.blocker === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="v33-control"><span><b>Units</b><small>Workout logging</small></span><select data-setting="units"><option value="lb" ${data.settings.units === "lb" ? "selected" : ""}>Pounds</option><option value="kg" ${data.settings.units === "kg" ? "selected" : ""}>Kilograms</option></select></label>
    </div></section>
    <section class="v33-profile-section v33-coach-settings"><div class="v33-section-head"><div><span class="v33-eyebrow">COACH EXPERIENCE</span><h3>How Nova should show up</h3></div><span class="v33-mini-badge">${esc(MODEL_MODES[mode]?.label || "Smart")}</span></div><div class="v33-settings-stack">
      <label class="v33-setting-row"><span class="v33-setting-icon">◎</span><span><b>Accountability style</b><small>Direct is honest; strict is firm, never humiliating</small></span><select data-profile-setting="tone">${["Supportive","Direct","Strict","Competitive"].map(value => `<option ${data.profile.tone === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="v33-setting-row"><span class="v33-setting-icon">◖</span><span><b>Spoken replies</b><small>Read coach responses aloud when available</small></span><span class="switch"><input type="checkbox" data-setting="speakReplies" ${data.settings.speakReplies ? "checked" : ""}><span></span></span></label>
      <label class="v33-setting-row"><span class="v33-setting-icon">✦</span><span><b>Earned proactive coaching</b><small>Nova may initiate only with verified context</small></span><span class="switch"><input type="checkbox" data-profile-setting="proactive" ${data.profile.proactive ? "checked" : ""}><span></span></span></label>
    </div></section>
    <div class="v33-profile-split"><section class="v33-profile-section v33-boundaries"><div class="v33-section-head"><div><span class="v33-eyebrow">BOUNDARIES</span><h3>Quiet hours</h3></div></div><div class="v33-time-pair"><label><span>Start</span><input type="time" data-profile-setting="quietStart" value="${esc(data.profile.quietStart || "21:30")}"></label><i>→</i><label><span>End</span><input type="time" data-profile-setting="quietEnd" value="${esc(data.profile.quietEnd || "08:00")}"></label></div><p>Proactive messages should never stack or break your quiet window.</p></section><section class="v33-profile-section v33-memory-vault"><div class="v33-section-head"><div><span class="v33-eyebrow">MEMORY VAULT</span><h3>What FitCoach knows</h3></div><span class="v33-mini-badge">${data.memories.length}</span></div><div class="v33-memory-cloud">${data.memories.length ? data.memories.slice(-12).map(memory => `<span>${esc(memory)}</span>`).join("") : `<span class="empty">No learned facts yet</span>`}</div><p>Founder data is still stored on this device. Account sync is not active yet.</p></section></div>
    <section class="v33-profile-section v33-device-card"><div class="v33-device-visual"><span>F</span><i></i></div><div><span class="v33-eyebrow">PHONE BUILD</span><h3>FitCoach ${V33_BUILD}</h3><p>Install the newest interface, export your founder data, or clear only what you choose.</p><div class="v33-tool-row"><button class="v33-cta v33-cta-secondary" data-install>Install steps</button><button class="v33-cta v33-cta-secondary" data-export>Export data</button><button class="v33-text-action" data-force-refresh>Refresh app assets</button></div></div></section>
    <section class="v33-danger-zone"><div><span class="v33-eyebrow">FOUNDER TOOLS</span><p>These actions affect only ${founders[app.founder].name}'s local profile on this device.</p></div><div><button class="v33-text-action" data-clear-chat>Clear coach conversation</button><button class="v33-text-action danger" data-reset-profile>Reset profile</button><button class="v33-text-action danger" data-switch-founder>Switch founder</button></div></section>
  </div>`;
};

const v33OriginalRender = render;
render = function renderV33() { v33RouteClass(app.route); v33OriginalRender(); v33SetRouteHeader(app.route); };
const v33OriginalNavigate = navigate;
navigate = function navigateV33(route) { v33RouteClass(route); return v33OriginalNavigate(route); };
document.addEventListener("DOMContentLoaded", () => { v33RouteClass(app.route); document.documentElement.classList.add("fitcoach-v033"); });
