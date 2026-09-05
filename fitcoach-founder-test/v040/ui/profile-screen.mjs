import { BUILD, THEMES, TRAINER_TONES, VOICE_PERSONAS, VOICE_PERSONA_LABELS } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { button, icon } from "./components.mjs";

function renderPlanChoiceField({ iconName, title, detail, action, field, current, options }) {
  return `<section class="profile-plan-field" aria-labelledby="profile-${escapeHtml(field)}-label">
    <header class="profile-plan-field-heading">
      <span class="profile-plan-field-icon">${icon(iconName)}</span>
      <span><b id="profile-${escapeHtml(field)}-label">${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small></span>
    </header>
    <div class="profile-plan-options" role="radiogroup" aria-label="${escapeHtml(title)}">
      ${options.map(option => {
        const value = typeof option === "object" ? option.value : option;
        const label = typeof option === "object" ? option.label : option;
        const selected = current === value;
        return `<button type="button" role="radio" aria-checked="${selected}" class="profile-plan-option ${selected ? "active" : ""}" data-action="${escapeHtml(action)}" data-field="${escapeHtml(field)}" data-value="${escapeHtml(String(value))}"><span>${escapeHtml(String(label))}</span><i aria-hidden="true">${selected ? icon("check") : ""}</i></button>`;
      }).join("")}
    </div>
  </section>`;
}

function planEditor(state) {
  const fields = [
    {
      iconName: "spark",
      title: "Goal",
      detail: "Shapes your training recommendations",
      action: "profile-field",
      field: "goal",
      current: state.profile.goal,
      options: [
        { value: "build muscle", label: "Build muscle" },
        { value: "get stronger", label: "Get stronger" },
        { value: "lose fat", label: "Lose fat" },
        { value: "stay consistent", label: "Stay consistent" },
      ],
    },
    {
      iconName: "progress",
      title: "Experience",
      detail: "Sets the right starting challenge",
      action: "profile-field",
      field: "experience",
      current: state.profile.experience,
      options: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
      ],
    },
    {
      iconName: "clock",
      title: "Session length",
      detail: "Your usual training window",
      action: "profile-number",
      field: "duration",
      current: state.profile.duration,
      options: [20, 30, 45, 60, 75].map(value => ({ value, label: `${value} min` })),
    },
    {
      iconName: "today",
      title: "Weekly target",
      detail: "A repeatable consistency goal",
      action: "profile-number",
      field: "days",
      current: state.profile.days,
      options: [2, 3, 4, 5, 6].map(value => ({ value, label: `${value} days` })),
    },
    {
      iconName: "equipment",
      title: "Equipment",
      detail: "Keeps exercise choices compatible",
      action: "profile-field",
      field: "equipment",
      current: state.profile.equipment,
      options: [
        { value: "full gym", label: "Full gym" },
        { value: "home gym", label: "Home gym" },
        { value: "dumbbells only", label: "Dumbbells" },
        { value: "bodyweight", label: "Bodyweight" },
      ],
    },
    {
      iconName: "today",
      title: "Training location",
      detail: "Where you usually train",
      action: "profile-field",
      field: "location",
      current: state.profile.location,
      options: [
        { value: "gym", label: "Gym" },
        { value: "home", label: "Home" },
        { value: "travel", label: "Travel" },
        { value: "outdoors", label: "Outdoors" },
      ],
    },
    {
      iconName: "progress",
      title: "Units",
      detail: "Used throughout workout logging",
      action: "setting-field",
      field: "units",
      current: state.settings.units,
      options: [
        { value: "lb", label: "Pounds (lb)" },
        { value: "kg", label: "Kilograms (kg)" },
      ],
    },
  ];

  return `<section class="profile-editor settings-card card" id="profile-training-editor"><header class="section-heading"><div><span class="eyebrow">EDIT TRAINING SETUP</span><h2>Plan preferences</h2></div><button class="icon-only" data-action="profile-edit" data-value="training" aria-label="Close training setup">${icon("close")}</button></header><div class="profile-plan-fields">${fields.map(renderPlanChoiceField).join("")}</div></section>`;
}

function coachEditor(state) {
  return `<section class="profile-editor settings-card card"><header class="section-heading"><div><span class="eyebrow">EDIT TRAINER</span><h2>Voice and coaching style</h2></div><button class="icon-only" data-action="profile-edit" data-value="coach" aria-label="Close trainer settings">${icon("close")}</button></header><div class="profile-choice-block"><span>Trainer tone</span><div class="profile-choice-grid" role="radiogroup" aria-label="Trainer tone">${TRAINER_TONES.map(value=>`<button role="radio" aria-checked="${state.profile.tone===value}" class="profile-choice ${state.profile.tone===value?"active":""}" data-action="set-tone" data-value="${value}"><b>${value}</b></button>`).join("")}</div></div><div class="profile-choice-block"><span>Voice</span><div class="profile-choice-grid voice" role="radiogroup" aria-label="Trainer voice">${VOICE_PERSONAS.map(value=>`<button role="radio" aria-checked="${state.settings.voicePersona===value}" class="profile-choice ${state.settings.voicePersona===value?"active":""}" data-action="set-voice-persona" data-value="${value}"><b>${escapeHtml(VOICE_PERSONA_LABELS[value].split(" · ")[0])}</b><small>${escapeHtml(VOICE_PERSONA_LABELS[value].split(" · ")[1] || "trainer")}</small></button>`).join("")}</div></div><div class="settings-list compact"><label><span>${icon("volume")}<b>Read replies aloud<small>Text always stays visible</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="speakReplies" ${state.settings.speakReplies?"checked":""}></label><label><span>${icon("mic")}<b>Workout cues<small>Local timer and set cues</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="workoutCues" ${state.settings.workoutCues?"checked":""}></label><label><span>${icon("today")}<b>Proactive coaching<small>Only inside FitCoach</small></b></span><input type="checkbox" data-action="profile-toggle" data-field="proactive" ${state.profile.proactive?"checked":""}></label></div><p class="style-boundary">Style changes how the trainer speaks—not safety, evidence, or the plan.</p></section>`;
}

function cloudAccountSection(state, ui) {
  const account = ui.account || {};
  const config = account.config || {};
  const session = account.session || null;
  const busy = Boolean(account.busy);
  const cloud = state.integrations?.cloudSync || {};
  const error = account.error ? `<p class="account-inline-error" role="alert">${escapeHtml(account.error)}</p>` : "";
  const syncCopy = cloud.status === "connected"
    ? `Encrypted sync · revision ${Number(cloud.revision) || 0}${cloud.lastSyncedAt ? ` · ${escapeHtml(new Date(cloud.lastSyncedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}` : ""}`
    : cloud.status === "conflict"
      ? "Cloud and device both changed. Choose which copy to keep."
      : "This device remains the source of truth until you enable encrypted sync.";

  let body = "";
  if (account.phase === "checking") {
    body = `<div class="account-loading"><i></i><span><b>Checking secure services</b><small>Your local data stays available.</small></span></div>`;
  } else if (!config.authAvailable) {
    body = `<div class="account-unavailable"><span>${icon("lock")}</span><p><b>Cloud account setup is not live yet</b><small>Your workouts and food log remain safely on this device.</small></p></div>${button({label:"Check again",action:"account-retry",variant:"secondary",disabled:busy})}`;
  } else if (!session) {
    body = `<div class="account-auth-copy"><b>No password required</b><p>Use a one-time email code. Account tokens stay in this browser tab rather than your workout database.</p></div><label class="account-input"><span>Email</span><input id="account-email" type="email" inputmode="email" autocomplete="email" maxlength="320" value="${escapeHtml(account.email || "")}" placeholder="you@example.com"></label>${account.codeSent ? `<label class="account-input"><span>One-time code</span><input id="account-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]*" placeholder="6-digit code"></label>${button({label:busy?"Connecting…":"Connect account",action:"account-verify-code",variant:"primary",disabled:busy})}${button({label:"Send a new code",action:"account-request-code",variant:"quiet",disabled:busy})}` : button({label:busy?"Sending…":"Email me a code",action:"account-request-code",variant:"primary",disabled:busy})}${error}`;
  } else {
    body = `<div class="account-identity"><span>${icon("check")}</span><p><small>SIGNED IN</small><b>${escapeHtml(session.user?.email || "FitCoach account")}</b></p><em>Protected</em></div><div class="account-sync-status ${cloud.status}"><span>${icon(cloud.status === "connected" ? "sync" : cloud.status === "conflict" ? "info" : "lock")}</span><p><b>${cloud.status === "connected" ? "Cloud sync on" : cloud.status === "conflict" ? "Sync needs your choice" : "Cloud sync off"}</b><small>${syncCopy}</small></p></div>${cloud.status === "conflict" ? `<div class="account-conflict-actions">${button({label:"Use cloud copy",action:"account-resolve-cloud",variant:"secondary",disabled:busy})}${button({label:"Keep this device",action:"account-resolve-device",variant:"primary",disabled:busy})}</div>` : `<div class="account-primary-actions">${button({label:busy?"Syncing…":cloud.status === "connected"?"Sync now":"Enable encrypted sync",action:"account-sync",variant:"primary",disabled:busy || !config.capabilities?.sync})}${button({label:"Export cloud copy",action:"account-export-cloud",variant:"secondary",disabled:busy || !config.capabilities?.accountExport})}</div>`}<div class="account-secondary-actions">${button({label:"Sign out",action:"account-sign-out",variant:"quiet",disabled:busy})}${button({label:"Delete account",action:"account-delete-start",variant:"danger",disabled:busy || !config.capabilities?.accountDeletion})}</div>${account.confirmDelete ? `<div class="account-delete-confirm"><b>Delete cloud account and local FitCoach data?</b><p>This cannot be undone. Type <strong>DELETE MY FITCOACH ACCOUNT</strong> exactly.</p><label class="account-input"><span>Confirmation phrase</span><input id="account-delete-confirmation" autocomplete="off" spellcheck="false" placeholder="DELETE MY FITCOACH ACCOUNT"></label><div>${button({label:"Cancel",action:"account-delete-cancel",variant:"quiet",disabled:busy})}${button({label:"Delete permanently",action:"account-delete-confirm",variant:"danger",disabled:busy})}</div></div>` : ""}${error}`;
  }

  const status = account.phase === "checking" ? "Checking availability"
    : !config.authAvailable ? "Local only · account setup unavailable"
      : session ? cloud.status === "connected" ? "Signed in · encrypted sync on" : cloud.status === "conflict" ? "Signed in · sync needs your choice" : "Signed in · sync off"
        : "Sign in with an email code";
  const open = Boolean(ui.disclosures?.["profile-account"] || account.confirmDelete || account.codeSent || account.error || cloud.status === "conflict");
  return `<details class="cloud-account-card card space-panel" data-disclosure="profile-account" ${open ? "open" : ""}><summary><span class="space-panel-icon">${icon("sync")}</span><span class="space-panel-label"><b>Account & sync</b><small>${escapeHtml(status)}</small></span>${icon("chevron")}</summary><div class="space-panel-content"><p class="account-lede">When enabled, sync is encrypted before database storage. Coach chat, coach memory, API metadata, and local progress-photo drafts are excluded.</p>${body}</div></details>`;
}

function membershipSection(state, ui) {
  const account = ui.account || {};
  const entitlement = account.entitlement || {};
  const native = ui.native || {};
  const active = entitlement.premium === true;
  const storeConfigured = account.config?.capabilities?.subscriptions === true && account.config?.capabilities?.entitlements === true && native.billingAvailable === true && Array.isArray(native.offerings) && native.offerings.length > 0;
  const storeReady = storeConfigured && Boolean(account.session);
  const gateTitle = storeConfigured ? "Sign in before purchasing" : "Native store setup required";
  const gateCopy = storeConfigured
    ? "Your store purchase must be linked to a verified FitCoach account before checkout."
    : "Purchases stay unavailable on the web preview and until App Store / Play Console products and server verification are live.";
  const status = active ? "Premium active · server verified" : storeReady ? "View plans from your app store" : storeConfigured ? "Sign in before purchasing" : "Purchases unavailable here";
  return `<details class="membership-card card space-panel ${active ? "active" : ""}" data-disclosure="profile-membership" ${ui.disclosures?.["profile-membership"] ? "open" : ""}><summary><span class="space-panel-icon">${icon("spark")}</span><span class="space-panel-label"><b>Membership</b><small>${escapeHtml(status)}</small></span>${icon("chevron")}</summary><div class="space-panel-content"><header><div><small>FITCOACH PREMIUM</small><h2>${active ? "Premium is active" : "One membership. Every platform."}</h2></div></header><p>${active ? "Your entitlement was verified by the FitCoach server." : "Prices and purchase status come directly from Apple or Google. A client receipt alone never unlocks Premium."}</p>${storeReady ? `<div class="membership-offers">${native.offerings.map(offer => `<button data-action="subscription-purchase" data-value="${escapeHtml(offer.logicalId || "")}"><span><b>${escapeHtml(offer.displayName || offer.title || "Premium")}</b><small>${escapeHtml(offer.periodLabel || "")}</small></span><strong>${escapeHtml(offer.localizedPrice || "")}</strong></button>`).join("")}</div><div class="membership-actions">${button({label:"Restore purchases",action:"subscription-restore",variant:"secondary"})}${button({label:"Manage subscription",action:"subscription-manage",variant:"quiet"})}</div>` : `<div class="membership-gate"><span>${icon("info")}</span><p><b>${gateTitle}</b><small>${gateCopy}</small></p></div>`}${account.session ? button({label:"Refresh membership",action:"account-refresh-entitlement",variant:"quiet",disabled:account.busy}) : ""}</div></details>`;
}

export function renderProfileScreen({state,ui={}}) {
  const prefs = state.exercisePreferences;
  const voice = VOICE_PERSONA_LABELS[state.settings.voicePersona] || "Selected trainer";
  const equipmentCount = state.gymProfile?.equipment?.length || 0;
  const editing = ui.profileEditing || null;
  const healthSource = ui.native?.health?.source === "health_connect" ? "Health Connect" : "Apple Health";
  const healthSummary = ui.native?.healthSummary;
  const healthPermissionRequested = state.integrations?.appleHealth?.status === "permission_requested";
  const healthCopy = healthSummary
    ? `${Number(healthSummary.steps || 0).toLocaleString()} steps · ${Math.round(Number(healthSummary.activeEnergyKcal) || 0)} active kcal made available today`
    : healthPermissionRequested
      ? `${healthSource} access requested · no daily totals available yet`
    : ui.native?.health?.available === true
      ? `Connect aggregate activity from ${healthSource}`
      : "Available in the native iPhone and Android apps";
  return `<div class="page profile-page space-page">
    <header class="space-heading"><span class="space-eyebrow">YOUR FITCOACH</span><h1>Your space.</h1><div class="space-identity"><span aria-hidden="true">${icon("profile")}</span><p><b>${escapeHtml(state.profile.goal)}</b><small>${escapeHtml(state.profile.experience)} · ${escapeHtml(state.profile.location)}</small></p><small class="space-version">v${BUILD}</small></div></header>
    <section class="space-settings" aria-label="Your training and coach settings"><button class="space-settings-row" data-action="profile-edit" data-value="training" aria-expanded="${editing === "training"}"><span class="space-panel-icon">${icon("train")}</span><span class="space-panel-label"><b>Training setup</b><small>${state.profile.days} days / week · ${state.profile.duration} min · ${escapeHtml(state.settings.units)}</small></span>${icon("chevron")}</button><button class="space-settings-row" data-action="profile-edit" data-value="coach" aria-expanded="${editing === "coach"}"><span class="space-panel-icon">${icon("spark")}</span><span class="space-panel-label"><b>Your coach</b><small>${escapeHtml(voice.split(" · ")[0])} · ${escapeHtml(state.profile.tone)} · voice ${state.settings.speakReplies ? "on" : "off"}</small></span>${icon("chevron")}</button></section>
    ${editing==="training"?planEditor(state):""}
    ${editing==="coach"?coachEditor(state):""}

    <section class="space-appearance" aria-label="Appearance"><header class="space-section-heading"><h2>Make it yours</h2><small>Appearance</small></header><div class="theme-picker" role="radiogroup" aria-label="App theme">${THEMES.map(value => `<button role="radio" aria-checked="${state.settings.theme === value}" class="${state.settings.theme === value ? "active" : ""}" data-action="set-theme" data-value="${value}"><i aria-hidden="true"></i><b>${value[0].toUpperCase()+value.slice(1)}</b><small>${value === "system" ? "Follow device" : `${value} surfaces`}</small></button>`).join("")}</div></section>

    <section class="profile-platform-grid space-platform" aria-label="Account and membership">${cloudAccountSection(state, ui)}${membershipSection(state, ui)}</section>

    <section class="profile-hub card"><header class="space-section-heading"><h2>Keep exploring</h2></header><div class="profile-hub-list"><button data-action="open-library"><span>${icon("play")}</span><b>Exercise library<small>${prefs.favorites.length} favorites · ${prefs.excluded.length} excluded</small></b>${icon("chevron")}</button><button data-action="open-gym-setup"><span>${icon("equipment")}</span><b>Gym and equipment<small>${equipmentCount} equipment types saved</small></b>${icon("chevron")}</button><button data-action="open-community-draft"><span>${icon("camera")}</span><b>Progress photo drafts<small>Private local drafts only</small></b>${icon("chevron")}</button><button data-action="open-apple-health-plan"><span>${icon("heart")}</span><b>Health activity<small>${escapeHtml(healthCopy)}</small></b>${icon("chevron")}</button></div>${ui.native?.healthError ? `<p class="account-inline-error" role="alert">${escapeHtml(ui.native.healthError)}</p>` : ""}</section>

    <section class="privacy-card card space-privacy"><details data-disclosure="profile-privacy" ${ui.disclosures?.["profile-privacy"] ? "open" : ""}><summary><span class="space-panel-icon">${icon("lock")}</span><span class="space-panel-label"><b>Your data & privacy</b><small>You choose what you share</small></span>${icon("chevron")}</summary><div class="space-panel-content"><p>${state.integrations?.cloudSync?.status === "connected" ? "Workout, plan, and confirmed nutrition data can sync only after your consent and is encrypted before database storage. Coach chat and photo drafts stay off the sync payload." : "Workout history, preferences, and profile details stay in this browser while cloud sync is off."} Live Coach sends only the limited text needed for a reply. FitCoach does not persist microphone audio.</p><ul><li>Every plan change needs your approval</li><li>Food estimates count only after you confirm them</li><li>Health data is never used for advertising or marketing</li></ul></div></details><footer class="privacy-links"><a href="./legal/privacy.html" target="_blank" rel="noopener">Privacy</a><a href="./legal/terms.html" target="_blank" rel="noopener">Terms</a><a href="./legal/delete-account.html" target="_blank" rel="noopener">Account deletion</a><a href="./legal/support.html" target="_blank" rel="noopener">Support</a></footer></section>

    <details class="settings-card app-tools-card card space-panel" data-disclosure="profile-tools" ${ui.disclosures?.["profile-tools"] ? "open" : ""}><summary><span class="space-panel-icon">${icon("info")}</span><span class="space-panel-label"><b>Help and local data</b><small>Export, support, and app controls</small></span>${icon("chevron")}</summary><div class="space-panel-content"><div class="app-tools">${button({label:"Show tutorial",action:"open-tutorial",variant:"secondary"})}${button({label:"Export my data",action:"export-data",variant:"secondary"})}${button({label:"Refresh app",action:"force-refresh",variant:"quiet"})}${button({label:"Clear Coach thread",action:"clear-chat",variant:"quiet"})}${button({label:"Reset FitCoach",action:"reset-profile",variant:"danger"})}</div></div></details>
  </div>`;
}
