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

  return `<section class="profile-editor settings-card card"><header class="section-heading"><div><span class="eyebrow">EDIT TRAINING SETUP</span><h2>Plan preferences</h2></div><button class="icon-only" data-action="profile-edit" data-value="training" aria-label="Close training setup">${icon("close")}</button></header><div class="profile-plan-fields">${fields.map(renderPlanChoiceField).join("")}</div></section>`;
}

function coachEditor(state) {
  return `<section class="profile-editor settings-card card"><header class="section-heading"><div><span class="eyebrow">EDIT TRAINER</span><h2>Voice and coaching style</h2></div><button class="icon-only" data-action="profile-edit" data-value="coach" aria-label="Close trainer settings">${icon("close")}</button></header><div class="profile-choice-block"><span>Trainer tone</span><div class="profile-choice-grid" role="radiogroup" aria-label="Trainer tone">${TRAINER_TONES.map(value=>`<button role="radio" aria-checked="${state.profile.tone===value}" class="profile-choice ${state.profile.tone===value?"active":""}" data-action="set-tone" data-value="${value}"><b>${value}</b></button>`).join("")}</div></div><div class="profile-choice-block"><span>Voice</span><div class="profile-choice-grid voice" role="radiogroup" aria-label="Trainer voice">${VOICE_PERSONAS.map(value=>`<button role="radio" aria-checked="${state.settings.voicePersona===value}" class="profile-choice ${state.settings.voicePersona===value?"active":""}" data-action="set-voice-persona" data-value="${value}"><b>${escapeHtml(VOICE_PERSONA_LABELS[value].split(" · ")[0])}</b><small>${escapeHtml(VOICE_PERSONA_LABELS[value].split(" · ")[1] || "trainer")}</small></button>`).join("")}</div></div><div class="settings-list compact"><label><span>${icon("volume")}<b>Read replies aloud<small>Text always stays visible</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="speakReplies" ${state.settings.speakReplies?"checked":""}></label><label><span>${icon("mic")}<b>Workout cues<small>Local timer and set cues</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="workoutCues" ${state.settings.workoutCues?"checked":""}></label><label><span>${icon("today")}<b>Proactive coaching<small>Only inside FitCoach</small></b></span><input type="checkbox" data-action="profile-toggle" data-field="proactive" ${state.profile.proactive?"checked":""}></label></div><p class="style-boundary">Style changes how the trainer speaks—not safety, evidence, or the plan.</p></section>`;
}

export function renderProfileScreen({state,ui={}}) {
  const prefs = state.exercisePreferences;
  const voice = VOICE_PERSONA_LABELS[state.settings.voicePersona] || "Selected trainer";
  const equipmentCount = state.gymProfile?.equipment?.length || 0;
  const editing = ui.profileEditing || null;
  return `<div class="page profile-page">
    <section class="profile-hero teal-panel"><div class="profile-avatar">${icon("profile")}</div><div><span class="eyebrow">YOUR FITCOACH</span><h1>${escapeHtml(state.profile.goal)}</h1><p>${state.profile.days} days/week · ${state.profile.duration} min · ${escapeHtml(state.profile.location)}</p></div><span class="version-chip">v${BUILD}</span></section>

    <section class="profile-summary-grid">
      <article class="profile-summary-card card"><header><span>${icon("train")}</span><div><small>TRAINING PLAN</small><h2>${escapeHtml(state.profile.experience)} · ${escapeHtml(state.profile.equipment)}</h2></div></header><div class="profile-summary-list"><span><b>${state.profile.days}</b><small>days</small></span><span><b>${state.profile.duration}</b><small>minutes</small></span><span><b>${escapeHtml(state.settings.units)}</b><small>units</small></span></div>${button({label:editing==="training"?"Close setup":"Edit setup",action:"profile-edit",value:"training",variant:"secondary"})}</article>
      <article class="profile-summary-card card"><header><span>${icon("spark")}</span><div><small>AI TRAINER</small><h2>${escapeHtml(state.profile.tone)} · ${escapeHtml(voice.split(" · ")[0])}</h2></div></header><p>${state.settings.speakReplies?"Spoken replies are on":"Spoken replies are off"} · ${state.profile.proactive?"proactive coaching on":"proactive coaching off"}</p>${button({label:editing==="coach"?"Close trainer settings":"Edit trainer",action:"profile-edit",value:"coach",variant:"secondary"})}</article>
    </section>

    ${editing==="training"?planEditor(state):""}
    ${editing==="coach"?coachEditor(state):""}

    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">APPEARANCE</span><h2>Choose your finish</h2></div></header><div class="theme-picker" role="radiogroup" aria-label="App theme">${THEMES.map(value => `<button role="radio" aria-checked="${state.settings.theme === value}" class="${state.settings.theme === value ? "active" : ""}" data-action="set-theme" data-value="${value}"><i></i><b>${value[0].toUpperCase()+value.slice(1)}</b><small>${value === "system" ? "Follow device" : `${value} surfaces`}</small></button>`).join("")}</div></section>

    <section class="profile-hub card"><header class="section-heading"><div><span class="eyebrow">YOUR FITNESS SETUP</span><h2>Movements, equipment, and photos</h2></div></header><div class="profile-hub-list"><button data-action="open-library"><span>${icon("play")}</span><b>Exercise library<small>${prefs.favorites.length} favorites · ${prefs.excluded.length} excluded</small></b>${icon("chevron")}</button><button data-action="open-gym-setup"><span>${icon("equipment")}</span><b>Gym and equipment<small>${equipmentCount} equipment types saved</small></b>${icon("chevron")}</button><button data-action="open-community-draft"><span>${icon("camera")}</span><b>Progress photo drafts<small>Private local drafts only</small></b>${icon("chevron")}</button><button data-action="open-apple-health-plan"><span>${icon("heart")}</span><b>Apple Health<small>Requires the native iPhone app</small></b>${icon("chevron")}</button></div></section>

    <section class="privacy-card card"><header>${icon("info")}<span><small>PRIVACY</small><h2>Your data, explained plainly</h2></span></header><p>Workout history, preferences, and profile details stay in this browser. Live Coach sends only the limited text needed for a reply. FitCoach never uploads microphone audio.</p><ul><li>Every plan change needs your approval</li><li>Food estimates count only after you confirm them</li><li>Avoid entering medical records or account secrets</li></ul></section>

    <section class="settings-card app-tools-card card"><header class="section-heading"><div><span class="eyebrow">APP</span><h2>Help and local data</h2></div><span class="soft-badge">v${BUILD}</span></header><div class="app-tools">${button({label:"Show tutorial",action:"open-tutorial",variant:"secondary"})}${button({label:"Export my data",action:"export-data",variant:"secondary"})}${button({label:"Refresh app",action:"force-refresh",variant:"quiet"})}${button({label:"Clear Coach thread",action:"clear-chat",variant:"quiet"})}${button({label:"Reset FitCoach",action:"reset-profile",variant:"danger"})}</div></section>
  </div>`;
}
