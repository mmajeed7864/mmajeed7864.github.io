function decisionPayload(type, data, preview) {
  const profile = data.profile;
  const last = data.sessions.at(-1);
  const week = weekStats(data);
  const map = {
    SAY_NOTHING: {
      title: "No interruption earned today",
      copy: "You are on track. Nova is staying quiet instead of inventing urgency.",
      primary: "View today’s plan", route: "train", secondary: null, out: "Ask Coach",
      why: "You trained recently and no verified blocker or missed commitment requires a nudge."
    },
    CHECK_IN: {
      title: "Start with one honest session",
      copy: `You chose ${profile.days} days per week. Let’s make the first one real instead of perfect.`,
      primary: "Start Plan A", route: "train", secondary: "Try Minimum Dose", out: "Not today",
      why: `Your plan exists, but no session is logged yet. This references your ${profile.days}-day commitment.`
    },
    RECOVER_MISSED_SESSION: {
      title: "Recover the week — don’t restart it",
      copy: `It has been a few days since ${last?.planLabel || "your last session"}. Choose the smallest useful recovery.`,
      primary: "Start Minimum Dose", route: "train", secondary: "Move to tomorrow", out: "Skip this one",
      why: "A recent commitment appears to have slipped. Nova is offering recovery, not guilt."
    },
    OFFER_PLAN_B: {
      title: "Use the version that fits today",
      copy: `Your equipment is set to ${profile.equipment}. Plan B keeps the training intent without pretending you have a full gym.`,
      primary: "Open Plan B", route: "train", secondary: "Keep Plan A", out: "Not today",
      why: `The constraint comes directly from your saved equipment: ${profile.equipment}.`
    },
    OFFER_MINIMUM_DOSE: {
      title: "Lower the size, not the standard",
      copy: "Your energy is low. A 12-minute minimum dose preserves the habit without pretending recovery does not matter.",
      primary: "Start 12 minutes", route: "train", secondary: "Take a rest day", out: "Dismiss",
      why: "Your current energy rating is low and a full session may be the barrier."
    },
    MOVE_SESSION: {
      title: "Move the session before it becomes a miss",
      copy: `Time is your stated blocker and you still have ${Math.max(0, week.target - week.done)} session(s) left this week.`,
      primary: "Move to tomorrow", route: "today", secondary: "Start Minimum Dose", out: "Keep schedule",
      why: "Your profile names time as the blocker and your weekly target is not complete."
    },
    RECOMMEND_REST: {
      title: "Today’s right move is recovery",
      copy: "Your energy is at the bottom of your range. Rest is part of the plan — not a failure to train.",
      primary: "Log recovery day", route: "today", secondary: "Do light mobility", out: "I feel fine",
      why: "This is based on your self-reported energy, not a diagnosis or medical inference."
    },
    ASK_FOR_BLOCKER: {
      title: "What is actually getting in the way?",
      copy: "The pattern changed, but Nova does not have enough evidence to prescribe a fix.",
      primary: "Name the blocker", route: "coach", secondary: "Not motivated", out: "Something else",
      why: "Nova has a repeated-miss signal but insufficient evidence about the cause."
    },
    CELEBRATE: {
      title: "This is becoming a pattern",
      copy: `You have completed ${data.sessions.length} sessions. That is a real consistency milestone, not an app-opening streak.`,
      primary: "View progress", route: "progress", secondary: null, out: "Keep going",
      why: `The milestone is based on ${data.sessions.length} completed sessions in your own history.`
    }
  };
  return {
    id: uid(), type, date: todayISO(), at: new Date().toISOString(), preview,
    outcome: null, needed: null, evidence: [map[type].why], ...map[type]
  };
}

function actionCard(decision) {
  const silent = decision.type === "SAY_NOTHING";
  return `
    <article class="card hero-card" data-decision="${decision.id}">
      <div class="hero-top">
        <div class="hero-copy">
          <div class="kicker">${silent ? "CALM COACHING" : "EARNED COACH ACTION"}</div>
          <h3>${esc(decision.title)}</h3>
          <p>${esc(decision.copy)}</p>
        </div>
        <div class="coach-presence"><span class="presence-ring"></span><span class="presence-core"></span></div>
      </div>
      <div class="meta"><span class="tag blue">${decision.type.replaceAll("_", " ")}</span><span class="tag">Context verified</span></div>
      <div class="hero-actions">
        <button class="primary" data-decision-primary="${decision.id}">${esc(decision.primary)}</button>
        ${decision.secondary ? `<button class="secondary" data-decision-secondary="${decision.id}">${esc(decision.secondary)}</button>` : ""}
        <button class="out" data-decision-out="${decision.id}">${esc(decision.out)}</button>
      </div>
      <button class="why" data-decision-why="${decision.id}">Why this?</button>
      <div class="receipt">Decision ${decision.id.slice(0, 8)} · ${fmtTime(decision.at)} · deterministic action layer</div>
    </article>`;
}

