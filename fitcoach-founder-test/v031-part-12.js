function handleViewClick(event) {
  const route = event.target.closest("[data-route-target]");
  if (route) return navigate(route.dataset.routeTarget);

  const planStart = event.target.closest("[data-start-plan]");
  if (planStart) return startWorkout(planStart.dataset.startPlan);

  const planPreview = event.target.closest("[data-preview-plan]");
  if (planPreview) return previewPlan(planPreview.dataset.previewPlan);

  const energy = event.target.closest("[data-energy]");
  if (energy) {
    const data = load();
    data.profile.energy = Number(energy.dataset.energy);
    data.decisions = data.decisions.filter(item => item.date !== todayISO());
    save(data);
    render();
    toast("Energy check-in saved. Nova recalculated today.");
    return;
  }

  const toggle = event.target.closest("[data-toggle-set]");
  if (toggle) return toggleSet(Number(toggle.dataset.exerciseIndex), Number(toggle.dataset.setIndex));

  if (event.target.closest("[data-finish-workout]")) return finishWorkout();
  if (event.target.closest("[data-cancel-workout]")) return cancelWorkout();
  if (event.target.closest("[data-rest-stop]")) {
    clearInterval(app.restInterval); app.restInterval = null; render(); return;
  }

  const swap = event.target.closest("[data-swap-exercise]");
  if (swap) return openSwap(Number(swap.dataset.swapExercise));

  const primary = event.target.closest("[data-decision-primary]");
  if (primary) return useDecision(primary.dataset.decisionPrimary, "primary");
  const secondary = event.target.closest("[data-decision-secondary]");
  if (secondary) return useDecision(secondary.dataset.decisionSecondary, "secondary");
  const out = event.target.closest("[data-decision-out]");
  if (out) return useDecision(out.dataset.decisionOut, "out");
  const why = event.target.closest("[data-decision-why]");
  if (why) return explainDecision(why.dataset.decisionWhy);

  const mode = event.target.closest("[data-coach-mode]");
  if (mode) {
    const data = load();
    data.settings.coachMode = mode.dataset.coachMode;
    save(data); renderCoach(data); toast(`${MODEL_MODES[mode.dataset.coachMode].label} mode selected.`); return;
  }

  const prompt = event.target.closest("[data-quick-prompt]");
  if (prompt) return sendChat(prompt.dataset.quickPrompt);
  if (event.target.closest("[data-send-chat]")) return sendChat();
  if (event.target.closest("[data-voice-start]")) return startVoice();

  const useAi = event.target.closest("[data-use-ai-action]");
  if (useAi) {
    const data = load();
    const preview = decisionPayload(useAi.dataset.useAiAction, data, true);
    openSheet(`<h2>${esc(preview.title)}</h2><p>${esc(preview.copy)}</p><div class="privacy-note" style="margin-top:16px"><span class="privacy-icon">i</span><p>${esc(preview.why)}</p></div><button class="button button-primary button-wide" data-route-from-sheet="${preview.route}">${esc(preview.primary)}</button>`);
    return;
  }

  const accept = event.target.closest("[data-accept-proposal]");
  if (accept) return resolvePlanProposal(accept.dataset.acceptProposal, true);
  const reject = event.target.closest("[data-reject-proposal]");
  if (reject) return resolvePlanProposal(reject.dataset.rejectProposal, false);

  if (event.target.closest("[data-install]")) return showInstallSteps();
  if (event.target.closest("[data-force-refresh]")) return forceRefresh();
  if (event.target.closest("[data-export]")) return exportData();
  if (event.target.closest("[data-clear-chat]")) return clearChat();
  if (event.target.closest("[data-reset-profile]")) return resetProfile();
  if (event.target.closest("[data-switch-founder]")) return exitToGate();
}

function handleViewChange(event) {
  const setting = event.target.dataset.setting;
  const profileSetting = event.target.dataset.profileSetting;
  if (!setting && !profileSetting) return;
  const data = load();
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  if (setting) data.settings[setting] = value;
  if (profileSetting) data.profile[profileSetting] = value;
  save(data);
  render();
}

function handleViewInput(event) {
  if (event.target.id === "coach-input") {
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(122, event.target.scrollHeight)}px`;
    if (event.inputType === "insertLineBreak" && !event.shiftKey) {
      event.preventDefault();
    }
  }
  const field = event.target.dataset.setField;
  if (field) {
    const data = load();
    const set = data.activeWorkout?.exercises?.[Number(event.target.dataset.exerciseIndex)]?.sets?.[Number(event.target.dataset.setIndex)];
    if (set) {
      set[field] = Number(event.target.value) || 0;
      save(data);
    }
  }
}

function useDecision(id, outcome) {
  const data = load();
  const decision = data.decisions.find(item => item.id === id);
  if (!decision) return;
  decision.outcome = outcome;
  decision.outcomeAt = new Date().toISOString();
  data.interventionOutcomes.push({ decisionId: id, type: decision.type, outcome, at: decision.outcomeAt });
  save(data);

  if (outcome === "primary") {
    if (["CHECK_IN"].includes(decision.type)) return startWorkout("A");
    if (["RECOVER_MISSED_SESSION","OFFER_MINIMUM_DOSE"].includes(decision.type)) return startWorkout("MIN");
    if (decision.type === "OFFER_PLAN_B") return startWorkout("B");
    if (decision.type === "RECOMMEND_REST") {
      data.profile.energy = 2; save(data); toast("Recovery day acknowledged."); render(); return;
    }
    if (decision.type === "ASK_FOR_BLOCKER") {
      navigate("coach"); setTimeout(() => { const input = $("#coach-input"); if (input) input.value = "The blocker is: "; }, 50); return;
    }
    if (decision.type === "MOVE_SESSION") { toast("Session moved in this founder build. Calendar sync is next."); render(); return; }
    return navigate(decision.route || "today");
  }
  if (outcome === "secondary" && decision.type === "OFFER_MINIMUM_DOSE") {
    data.profile.energy = 1; save(data); toast("Recovery selected."); render(); return;
  }
  toast(outcome === "out" ? "Nova will remember that this intervention was dismissed." : "Choice saved.");
  render();
}

