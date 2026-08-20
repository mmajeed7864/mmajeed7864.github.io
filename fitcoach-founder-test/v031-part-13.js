function explainDecision(id) {
  const decision = load().decisions.find(item => item.id === id);
  if (!decision) return;
  openSheet(`<h2>Why Nova chose this</h2><p>${esc(decision.why || decision.evidence?.[0] || "The current verified context cleared the action gate.")}</p><div class="privacy-note" style="margin-top:16px"><span class="privacy-icon">i</span><p>This reveals the relevant fact and rule, not hidden chain-of-thought.</p></div><button class="button button-primary button-wide" data-close-sheet>Got it</button>`);
}

function previewPlan(planId) {
  const data = load();
  const plan = planLibrary(data).find(item => item.id === planId);
  if (!plan) return;
  openSheet(`<div class="kicker">${plan.label}</div><h2>${plan.minutes}-minute session</h2><p>${esc(plan.why)}</p><div class="history">${plan.items.map(item => `<div class="history-item"><span><b>${esc(item.name)}</b><small>${item.sets} × ${item.reps}</small></span><span>${item.weight}${data.settings.units}</span></div>`).join("")}</div><button class="button button-primary button-wide" data-start-from-sheet="${plan.id}">Start ${plan.label}</button>`);
}

function openSwap(exerciseIndex) {
  const data = load();
  const alternatives = ["Goblet squat","Dumbbell floor press","Cable row","Machine press","Walking lunge","Push-up","Chest-supported row"];
  openSheet(`<h2>Swap exercise</h2><p>Choose a practical substitute. The founder build does not claim every swap is identical.</p><div class="option-list" style="margin-top:16px">${alternatives.map(name => `<button class="option" data-swap-choice="${esc(name)}" data-swap-index="${exerciseIndex}"><span class="emoji">↔</span><span><b>${esc(name)}</b><small>Keep the session moving</small></span></button>`).join("")}</div>`);
}

function resolvePlanProposal(id, accepted) {
  const data = load();
  const proposal = data.planProposals.find(item => item.id === id);
  if (!proposal) return;
  proposal.status = accepted ? "accepted" : "rejected";
  proposal.resolvedAt = new Date().toISOString();
  if (accepted) {
    data.acceptedPlanNotes.push({ id: proposal.id, title: proposal.title, changes: proposal.changes || [], at: proposal.resolvedAt });
    data.memories = uniqueStrings([...data.memories, `Accepted plan change: ${proposal.title}`]).slice(-24);
  }
  save(data);
  toast(accepted ? "Plan change confirmed and remembered." : "Plan change declined.");
  renderCoach(data);
}

function openFeedback(decisionId = null) {
  app.feedbackChoice = "";
  openSheet(`<div class="kicker">FOUNDER SIGNAL</div><h2>What should change?</h2><p>This feedback stays on this device. Full coach conversations are not copied into the feedback record.</p><div class="feedback-grid">${["Useful","Unnecessary","Coach misunderstood me","UI / bug","Missing feature","Feels generic"].map(value => `<button class="feedback-option" data-feedback-choice="${value}">${value}</button>`).join("")}</div><div class="field"><label>Optional note</label><textarea id="feedback-note" rows="4" maxlength="700" placeholder="What happened?"></textarea></div><button class="button button-primary button-wide" data-save-feedback data-decision-id="${decisionId || ""}">Save founder feedback</button>`);
}

function openSheet(html) {
  $("#sheet-content").innerHTML = html;
  $("#backdrop").hidden = false;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  $("#backdrop").hidden = true;
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
}

function handleSheetClick(event) {
  if (event.target.closest("[data-close-sheet]")) return closeSheet();
  const feedback = event.target.closest("[data-feedback-choice]");
  if (feedback) {
    app.feedbackChoice = feedback.dataset.feedbackChoice;
    $$(".feedback-option", $("#sheet")).forEach(button => button.classList.toggle("active", button === feedback));
    return;
  }
  const saveFeedback = event.target.closest("[data-save-feedback]");
  if (saveFeedback) {
    if (!app.feedbackChoice) return toast("Choose a feedback category first.");
    const data = load();
    data.feedback.push({
      id: uid(), category: app.feedbackChoice,
      note: $("#feedback-note")?.value.trim() || "",
      decisionId: saveFeedback.dataset.decisionId || null,
      route: app.route, build: BUILD, at: new Date().toISOString()
    });
    save(data); closeSheet(); toast("Founder feedback saved."); return;
  }
  const start = event.target.closest("[data-start-from-sheet]");
  if (start) { closeSheet(); return startWorkout(start.dataset.startFromSheet); }
  const route = event.target.closest("[data-route-from-sheet]");
  if (route) { closeSheet(); return navigate(route.dataset.routeFromSheet); }
  const swap = event.target.closest("[data-swap-choice]");
  if (swap) {
    const data = load();
    const exercise = data.activeWorkout?.exercises?.[Number(swap.dataset.swapIndex)];
    if (exercise) exercise.name = swap.dataset.swapChoice;
    save(data); closeSheet(); render(); toast("Exercise swapped."); return;
  }
  if (event.target.closest("[data-confirm-cancel]")) {
    const data = load(); data.activeWorkout = null; save(data); clearInterval(app.restInterval); app.restInterval = null; closeSheet(); render(); return;
  }
}

function showInstallSteps() {
  openSheet(`<h2>Install FitCoach</h2><p><b>iPhone:</b> open this link in Safari → Share → Add to Home Screen → enable Open as Web App → Add.</p><p><b>Android:</b> open in Chrome → menu → Install app or Add to Home Screen.</p><p>When an old green build keeps opening, delete the old Home Screen icon first, revisit the new link, and install again.</p><button class="button button-primary button-wide" data-close-sheet>Got it</button>`);
}

async function forceRefresh() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations || []).map(registration => registration.update()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== "fitcoach-symbio-v0360").map(key => caches.delete(key)));
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set("v", `0360-${Date.now()}`);
  location.replace(url);
}

function exportData() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `fitcoach-${app.founder}-${todayISO()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

function clearChat() {
  openSheet(`<h2>Clear coach conversation?</h2><p>This removes chat messages from this device. Workout logs and memories stay.</p><div class="hero-actions"><button class="button button-ghost" data-close-sheet>Keep chat</button><button class="button button-primary" data-confirm-clear-chat>Clear chat</button></div>`);
  setTimeout(() => {
    const button = $("[data-confirm-clear-chat]", $("#sheet"));
    if (button) button.onclick = () => { const data = load(); data.chat = []; save(data); closeSheet(); render(); };
  }, 0);
}

function resetProfile() {
  openSheet(`<h2>Reset this founder profile?</h2><p>This deletes local workouts, chat, decisions, and settings for ${founders[app.founder].name} on this device.</p><div class="hero-actions"><button class="button button-ghost" data-close-sheet>Cancel</button><button class="button button-primary" data-confirm-reset>Reset profile</button></div>`);
  setTimeout(() => {
    const button = $("[data-confirm-reset]", $("#sheet"));
    if (button) button.onclick = () => { localStorage.removeItem(storageKey()); closeSheet(); showOnboarding(); };
  }, 0);
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter(value => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

window.addEventListener("DOMContentLoaded", init);
