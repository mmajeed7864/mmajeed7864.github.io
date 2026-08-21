import { BUILD, THEMES, TRAINER_TONES, VOICE_PERSONAS, VOICE_PERSONA_LABELS } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { EXERCISE_EXPANSION_CATEGORIES, EXERCISE_EXPANSION_TARGETS } from "../data/exercise-expansion-targets.mjs";
import { button, icon } from "./components.mjs";

function renderLaunchReadiness(state) {
  const liveDrafts = state.socialDrafts?.length || 0;
  const equipmentCount = state.gymProfile?.equipment?.length || 0;
  const healthStatus = state.integrations?.appleHealth?.status === "planned" ? "Queued for native build" : "Needs iOS HealthKit";
  return `<section class="settings-card launch-readiness-card card">
    <header class="section-heading">
      <div><span class="eyebrow">APP STORE ROADMAP</span><h2>Launch features we need to beat the category</h2></div>
      <span class="soft-badge">Honest founder build</span>
    </header>
    <div class="launch-metrics" aria-label="Launch readiness">
      <span><b>16</b><small>premium guides live</small></span>
      <span><b>${EXERCISE_EXPANSION_TARGETS.length}</b><small>popular exercises mapped</small></span>
      <span><b>${equipmentCount}</b><small>equipment types</small></span>
      <span><b>${liveDrafts}</b><small>photo drafts</small></span>
    </div>
    <div class="launch-grid">
      <article class="launch-card health">
        <span>${icon("heart")}</span>
        <div><b>Apple Health sync</b><small>${escapeHtml(healthStatus)} · workouts, calories, weight only after native permission</small></div>
        ${button({ label: "Review sync plan", action: "open-apple-health-plan", variant: "secondary" })}
      </article>
      <article class="launch-card pro">
        <span>${icon("spark")}</span>
        <div><b>FitCoach Pro</b><small>Free download, 7-day trial, premium voice, smarter progression, camera nutrition drafts</small></div>
        ${button({ label: "Preview Pro screen", action: "open-pro-preview", variant: "secondary" })}
      </article>
      <article class="launch-card library">
        <span>${icon("play")}</span>
        <div><b>100-exercise motion library</b><small>${EXERCISE_EXPANSION_CATEGORIES.length} categories mapped; add assets before claiming live animation</small></div>
        ${button({ label: "View roadmap", action: "open-exercise-roadmap", variant: "secondary" })}
      </article>
      <article class="launch-card gym">
        <span>${icon("equipment")}</span>
        <div><b>Gym and equipment profile</b><small>Use the user’s real equipment to build better day plans</small></div>
        ${button({ label: "Review equipment", action: "open-gym-setup", variant: "secondary" })}
      </article>
      <article class="launch-card community">
        <span>${icon("camera")}</span>
        <div><b>Progress photo drafts</b><small>Local caption drafts now; upload/community feed requires privacy review</small></div>
        ${button({ label: "Create local draft", action: "open-community-draft", variant: "secondary" })}
      </article>
    </div>
  </section>`;
}

export function renderProfileScreen({state,founderName}) {
  const prefs = state.exercisePreferences;
  return `<div class="page profile-page">
    <section class="profile-hero teal-panel"><div class="profile-avatar">${escapeHtml(founderName.slice(0,1))}</div><div><span class="eyebrow">PRIVATE FOUNDER PROFILE</span><h1>${escapeHtml(founderName)}</h1><p>${escapeHtml(state.profile.goal)} · ${state.profile.days} days/week · ${state.profile.duration} min · ${escapeHtml(state.profile.location)}</p></div><span class="founder-chip">v${BUILD}</span></section>
    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">APPEARANCE</span><h2>Bright Performance</h2></div><span class="soft-badge">New profiles start Light</span></header><div class="theme-picker" role="radiogroup" aria-label="App theme">${THEMES.map(value => `<button role="radio" aria-checked="${state.settings.theme === value}" class="${state.settings.theme === value ? "active" : ""}" data-action="set-theme" data-value="${value}"><i></i><b>${value[0].toUpperCase()+value.slice(1)}</b><small>${value === "system" ? "Follow device" : `${value} surfaces`}</small></button>`).join("")}</div></section>
    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">TRAINING SETUP</span><h2>Your plan inputs</h2></div><span class="soft-badge">Local</span></header><div class="settings-list"><label><span>${icon("spark")}<b>Goal<small>Shapes the deterministic plan</small></b></span><select data-action="profile-field" data-field="goal">${["build muscle","get stronger","lose fat","stay consistent"].map(value=>`<option ${state.profile.goal===value?"selected":""}>${escapeHtml(value)}</option>`).join("")}</select></label><label><span>${icon("progress")}<b>Experience<small>Controls presentation and volume defaults</small></b></span><select data-action="profile-field" data-field="experience">${["beginner","intermediate","advanced"].map(value=>`<option ${state.profile.experience===value?"selected":""}>${escapeHtml(value)}</option>`).join("")}</select></label><label><span>${icon("clock")}<b>Session duration<small>10–120 minute preference</small></b></span><select data-action="profile-number" data-field="duration">${[20,30,45,60,75].map(value=>`<option value="${value}" ${state.profile.duration===value?"selected":""}>${value} minutes</option>`).join("")}</select></label><label><span>${icon("equipment")}<b>Equipment<small>Used for compatible exercise choices</small></b></span><select data-action="profile-field" data-field="equipment">${["full gym","home gym","dumbbells only","bodyweight"].map(value=>`<option ${state.profile.equipment===value?"selected":""}>${escapeHtml(value)}</option>`).join("")}</select></label><label><span>${icon("today")}<b>Training location<small>Gym, home, travel, or outdoors</small></b></span><select data-action="profile-field" data-field="location">${["gym","home","travel","outdoors"].map(value=>`<option ${state.profile.location===value?"selected":""}>${escapeHtml(value)}</option>`).join("")}</select></label><label><span>${icon("progress")}<b>Weekly target<small>Ordinary consistency goal</small></b></span><select data-action="profile-number" data-field="days">${[2,3,4,5,6].map(value=>`<option value="${value}" ${state.profile.days===value?"selected":""}>${value} days</option>`).join("")}</select></label><label><span>${icon("equipment")}<b>Units<small>Logger display only</small></b></span><select data-action="setting-field" data-field="units"><option ${state.settings.units==="lb"?"selected":""}>lb</option><option ${state.settings.units==="kg"?"selected":""}>kg</option></select></label></div></section>
    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">COACH PRESENCE</span><h2>How your trainer communicates</h2></div><span class="soft-badge">Presentation only</span></header><div class="settings-list"><label><span>${icon("spark")}<b>Trainer tone<small>Changes delivery, never safety or the plan</small></b></span><select data-action="set-tone">${TRAINER_TONES.map(value=>`<option ${state.profile.tone===value?"selected":""}>${value}</option>`).join("")}</select></label><label><span>${icon("volume")}<b>Premium voice<small>ElevenLabs when available · device fallback</small></b></span><select data-action="set-voice-persona">${VOICE_PERSONAS.map(value=>`<option value="${value}" ${state.settings.voicePersona===value?"selected":""}>${escapeHtml(VOICE_PERSONA_LABELS[value])}</option>`).join("")}</select></label><label><span>${icon("volume")}<b>Speak replies<small>Text remains available when speech fails</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="speakReplies" ${state.settings.speakReplies?"checked":""}></label><label><span>${icon("mic")}<b>Workout cues<small>Local timer/set cues where supported</small></b></span><input type="checkbox" data-action="setting-toggle" data-field="workoutCues" ${state.settings.workoutCues?"checked":""}></label><label><span>${icon("today")}<b>Earned proactive coaching<small>Founder research only; no OS notifications</small></b></span><input type="checkbox" data-action="profile-toggle" data-field="proactive" ${state.profile.proactive?"checked":""}></label></div></section>
    ${renderLaunchReadiness(state)}
    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">EXERCISE PREFERENCES</span><h2>Your movement choices</h2></div>${button({label:"Open library",action:"open-library",variant:"secondary"})}</header><div class="preference-summary"><span><b>${prefs.favorites.length}</b><small>Favorites</small></span><span><b>${prefs.preferred.length}</b><small>More often</small></span><span><b>${prefs.reduced.length}</b><small>Less often</small></span><span><b>${prefs.excluded.length}</b><small>Excluded</small></span></div><p>These local preferences affect deterministic selection only after a visible plan preview.</p></section>
    <section class="privacy-card card"><header>${icon("info")}<span><small>DATA + PRIVACY</small><h2>Know what leaves the device</h2></span></header><p>Workout logs, exercise preferences, theme, and founder profile stay in this browser in v0.4. Ordinary low-sensitivity Coach text may be sent through Symbio’s server to DeepSeek or the configured Qwen backup. Bounded coach reply text may use ElevenLabs for speech. FitCoach does not upload microphone audio. Do not enter diagnoses, medications, measurements, credentials, identifiers, or private records.</p><ul><li>Convenience founder code—not production authentication</li><li>Provider keys remain server-side</li><li>Plan changes always require visible approval</li><li>Exercise visuals are original local temporary diagrams</li></ul></section>
    <section class="settings-card card"><header class="section-heading"><div><span class="eyebrow">FOUNDER TOOLS</span><h2>Data and recovery</h2></div><span class="soft-badge">Build ${BUILD}</span></header><div class="founder-tools">${button({label:"Show tutorial",action:"open-tutorial",variant:"secondary"})}${button({label:"Export local data",action:"export-data",variant:"secondary"})}${button({label:"Refresh app assets",action:"force-refresh",variant:"secondary"})}${button({label:"Clear Coach thread",action:"clear-chat",variant:"quiet"})}${button({label:"Reset founder profile",action:"reset-profile",variant:"danger"})}</div><p>Migration preserves an exact backup of the v0.3.6 payload. Sessions created only in v0.4 do not appear if you manually roll back to v0.3.6.</p></section>
    <section class="connection-card"><span class="status-dot ${navigator.onLine?"":"offline"}"></span><div><b>${navigator.onLine?"Browser online":"Browser offline"}</b><small>Offline logging remains local. Live Coach text needs a network connection.</small></div></section>
  </div>`;
}
