import { DEFAULT_VOICE_BY_TONE, THEMES, TRAINER_TONES, VOICE_PERSONAS, VOICE_PERSONA_LABELS } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { bodyFocusMap, button, icon } from "./components.mjs";

const GOALS = [
  ["build muscle","Build muscle","Progressive strength and size"],
  ["get stronger","Get stronger","Build measurable performance"],
  ["lose fat","Lose fat","Support training while changing habits"],
  ["stay consistent","Stay consistent","Make the plan survive real life"],
];
const BLOCKERS = [
  ["time","Not enough time","Schedule pressure breaks the plan"],
  ["motivation","Starting is hard","You know what to do but do not begin"],
  ["all-or-nothing","All or nothing","One miss can turn into a lost week"],
  ["uncertainty","Second-guessing","You keep changing the plan"],
];
const PROFILE_GENDERS = [
  { value: "female", label: "Female", copy: "Use this in your profile only" },
  { value: "male", label: "Male", copy: "Use this in your profile only" },
  { value: "nonbinary", label: "Nonbinary", copy: "Use this in your profile only" },
  { value: "prefer-not-to-say", label: "Prefer not to say", copy: "Keep this private" },
];
const BODY_FOCUS = [
  ["back", "Back"],
  ["arms", "Arms"],
  ["shoulders", "Shoulders"],
  ["abs", "Abs"],
  ["chest", "Chest"],
  ["legs", "Legs"],
  ["glutes", "Glutes"],
  ["full body", "Full body"],
];
const GYM_EQUIPMENT = ["dumbbells", "kettlebells", "barbells", "plates", "squat rack", "benches", "cables", "machines", "pull-up bar", "resistance bands", "cardio machines", "smith machine"];

function trainerBubble(title, copy = "") {
  return `<div class="trainer-interview-row"><span class="trainer-setup-orb"><i></i></span><div class="trainer-bubble"><b>${escapeHtml(title)}</b>${copy ? `<small>${escapeHtml(copy)}</small>` : ""}</div></div>`;
}

function chipOption({ value, title, copy, field, active, iconName = "" }) {
  return `<button role="radio" aria-checked="${active}" class="answer-option ${active ? "active" : ""}" data-action="onboarding-choice" data-field="${escapeHtml(field)}" data-value="${escapeHtml(value)}">${iconName ? icon(iconName) : ""}<span><b>${escapeHtml(title)}</b>${copy ? `<small>${escapeHtml(copy)}</small>` : ""}</span></button>`;
}

export const ONBOARDING_STEP_COUNT = 17;

function choiceBubbleGroup({ label, field, action, options, selected, hint = "" }) {
  return `<div class="single-answer answer-choice-group" role="radiogroup" aria-label="${escapeHtml(label)}">${options.map(option => {
    const value = typeof option === "object" ? option.value : option;
    const title = typeof option === "object" ? option.label : option;
    const copy = typeof option === "object" ? option.copy : "";
    const active = String(selected) === String(value);
    return `<button role="radio" aria-checked="${active}" class="answer-option ${active ? "active" : ""}" data-action="${action}" data-field="${escapeHtml(field)}" data-value="${escapeHtml(String(value))}"><span><b>${escapeHtml(String(title))}</b>${copy ? `<small>${escapeHtml(copy)}</small>` : ""}</span></button>`;
  }).join("")}${hint ? `<small class="answer-choice-hint">${escapeHtml(hint)}</small>` : ""}</div>`;
}

function toggleBubble({ title, copy, offTitle = "Keep it off for now", offCopy = "You can change this later.", action, field, checked }) {
  return `<div class="single-answer answer-choice-group boolean-answer" role="radiogroup" aria-label="${escapeHtml(title)}"><button role="radio" aria-checked="${checked}" class="answer-option ${checked ? "active" : ""}" data-action="${action}" data-field="${escapeHtml(field)}" data-value="true"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(copy)}</small></span></button><button role="radio" aria-checked="${!checked}" class="answer-option ${!checked ? "active" : ""}" data-action="${action}" data-field="${escapeHtml(field)}" data-value="false"><span><b>${escapeHtml(offTitle)}</b><small>${escapeHtml(offCopy)}</small></span></button></div>`;
}

function questionStep({ eyebrow, title, copy, question, answer }) {
  return `<div class="onboarding-step trainer-interview single-question"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1>${copy ? `<p>${escapeHtml(copy)}</p>` : ""}${trainerBubble(question)}<div class="single-question-answer">${answer}</div></div>`;
}

function goalStep(draft) {
  return questionStep({ eyebrow: "AI TRAINER SETUP", title: "Let’s build your starting plan.", copy: "Nova will ask one useful question at a time. You can change anything later.", question: "What are we building toward?", answer: `<div class="single-answer answer-choice-group" role="radiogroup" aria-label="Training goal">${GOALS.map(([value,title,copy]) => chipOption({ value, title, copy, field: "goal", active: draft.profile.goal === value, iconName: value === "get stronger" ? "train" : value === "stay consistent" ? "today" : "progress" })).join("")}</div>` });
}

function genderStep(draft) {
  return questionStep({ eyebrow: "YOUR PROFILE", title: "Keep your plan personal.", copy: "This is optional profile context. You can change or remove it later.", question: "Which profile should I use?", answer: choiceBubbleGroup({ label: "Profile choice", field: "gender", action: "onboarding-profile-field", options: PROFILE_GENDERS, selected: draft.profile.gender }) });
}

function bodyFocusStep(draft) {
  const selected = new Set(Array.isArray(draft.profile.focusAreas) ? draft.profile.focusAreas : []);
  const fullBody = selected.has("full body");
  const regionOptions = BODY_FOCUS.filter(([value]) => value !== "full body");
  const regionButton = ([value, label]) => {
    const active = selected.has(value);
    return `<button class="body-focus-chip ${active ? "active" : ""}" aria-pressed="${active}" data-action="onboarding-toggle-focus" data-value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span><em aria-hidden="true">${active ? "✓" : ""}</em></button>`;
  };
  const status = fullBody
    ? "Balanced full-body plan"
    : selected.size
      ? `${selected.size} of 3 selected`
      : "Choose up to 3 areas";
  const fullBodyActive = selected.has("full body");
  return `<div class="onboarding-step trainer-interview single-question body-focus-step"><span class="eyebrow">BODY FOCUS</span><h1>Choose your focus.</h1>${trainerBubble("Where should I place extra emphasis?")}<div class="single-question-answer"><div class="single-answer body-focus-answer"><div class="body-focus-stage">${bodyFocusMap([...selected], { gender: draft.profile.gender })}</div><section class="body-focus-selection-panel" aria-labelledby="body-focus-selection-title"><div class="body-focus-selection-head"><span><small id="body-focus-selection-title">SELECT AREAS</small><strong id="body-focus-selection-status" aria-live="polite" aria-atomic="true">${escapeHtml(status)}</strong></span><b>${fullBody ? "BALANCED" : `${selected.size}/3`}</b></div><div class="body-focus-chip-grid" role="group" aria-label="Body focus areas" aria-describedby="body-focus-selection-status body-focus-help">${regionOptions.map(regionButton).join("")}</div><button class="body-focus-chip body-focus-balance-chip ${fullBodyActive ? "active" : ""}" aria-pressed="${fullBodyActive}" data-action="onboarding-toggle-focus" data-value="full body"><span><b>Full body</b><small>Train every movement pattern evenly</small></span><em aria-hidden="true">${fullBodyActive ? "✓" : ""}</em></button><small id="body-focus-help" class="body-focus-note">This changes exercise emphasis—not medical guidance.</small></section></div></div></div>`;
}

function themeStep(draft) {
  return questionStep({ eyebrow: "YOUR SPACE", title: "Make FitCoach feel like yours.", copy: "Choose a starting look. You can change it any time in Profile.", question: "Which look should we start with?", answer: choiceBubbleGroup({ label: "Starting theme", field: "theme", action: "onboarding-setting", options: THEMES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), copy: value === "light" ? "Bright and clean" : value === "dark" ? "Focused night mode" : "Follow your device" })), selected: draft.settings.theme }) });
}

function scheduleQuestion(draft, config) {
  return questionStep({ eyebrow: "REAL AVAILABILITY", title: config.title, copy: config.copy || "The best plan is the one you can repeat.", question: config.question, answer: choiceBubbleGroup(config.field === "experience" ? { label: "Experience", field: "experience", action: "onboarding-profile-field", options: [
    { value: "beginner", label: "Beginner", copy: "New, returning, or rebuilding the habit" },
    { value: "intermediate", label: "Intermediate", copy: "You train consistently and know the basics" },
    { value: "advanced", label: "Advanced", copy: "Experienced with harder progressions" },
  ], selected: draft.profile.experience } : config.field === "days" ? { label: "Training days", field: "days", action: "onboarding-number", options: [2,3,4,5,6].map(value => ({ value, label: `${value} days/week`, copy: value <= 3 ? "Easier to repeat" : value === 4 ? "Balanced progression" : "Higher commitment" })), selected: draft.profile.days } : config.field === "duration" ? { label: "Typical session", field: "duration", action: "onboarding-number", options: [20,30,45,60,75].map(value => ({ value, label: `${value} minutes`, copy: value <= 30 ? "Compact and repeatable" : value === 45 ? "Strong default" : "Full training block" })), selected: draft.profile.duration } : config.field === "equipment" ? { label: "Equipment", field: "equipment", action: "onboarding-profile-field", options: [
    { value: "full gym", label: "Full gym", copy: "Machines, cables, racks, and free weights" },
    { value: "home gym", label: "Home gym", copy: "Flexible setup with limited equipment" },
    { value: "dumbbells only", label: "Dumbbells only", copy: "Simple strength work anywhere" },
    { value: "bodyweight", label: "Bodyweight", copy: "No equipment needed" },
  ], selected: draft.profile.equipment } : { label: "Usual location", field: "location", action: "onboarding-profile-field", options: [
    { value: "gym", label: "Gym", copy: "Best for full programs and substitutions" },
    { value: "home", label: "Home", copy: "Built around your own space" },
    { value: "travel", label: "Travel", copy: "Hotel and limited-equipment friendly" },
    { value: "outdoors", label: "Outdoors", copy: "Movement-focused and flexible" },
  ], selected: draft.profile.location }) });
}

function scheduleSummaryStep(draft) {
  return questionStep({ eyebrow: "YOUR FIRST PLAN", title: "Here’s the rhythm I’ll build around.", copy: "Full, reduced, and minimum versions will share one plan thread.", question: "Does this starting rhythm look right?", answer: `<div class="schedule-preview premium-summary answer-bubble single-answer"><span>${icon("clock")}</span><p><b>${draft.profile.days} sessions · ${draft.profile.duration} minutes</b><small>${escapeHtml(draft.profile.experience)} · ${escapeHtml(draft.profile.equipment)} · ${escapeHtml(draft.profile.location)}</small></p></div>` });
}

function gymNameStep(draft) {
  const value = draft.gymProfile?.selectedGymName || "";
  return questionStep({ eyebrow: "YOUR TRAINING SPACE", title: "Make every workout fit the room.", copy: "A gym name is optional. It helps your trainer remember which equipment profile to use.", question: "Where do you train most often?", answer: `<label class="single-answer onboarding-text-answer"><span>Gym or setup name</span><input data-action="onboarding-gym-name" maxlength="120" value="${escapeHtml(value)}" placeholder="Example: Planet Fitness or home garage"><small>Stored only on this device in this web build.</small></label>` });
}

function gymEquipmentStep(draft) {
  const selected = new Set(draft.gymProfile?.equipment || []);
  return questionStep({ eyebrow: "QUICK EQUIPMENT SCAN", title: "Tell Nova what is actually available.", copy: "Tap everything you can use. The plan and substitutions can then avoid equipment you do not have.", question: "What does this training space have?", answer: `<div class="single-answer equipment-scan-grid" role="group" aria-label="Available gym equipment">${GYM_EQUIPMENT.map(value => `<button class="equipment-scan-option ${selected.has(value) ? "active" : ""}" aria-pressed="${selected.has(value)}" data-action="onboarding-gym-equipment" data-value="${escapeHtml(value)}"><span>${icon(value.includes("cardio") ? "progress" : "equipment")}</span><b>${escapeHtml(value)}</b></button>`).join("")}</div>` });
}

function blockerStep(draft) {
  return questionStep({ eyebrow: "THE TRAINER RELATIONSHIP", title: "Make the plan honest about real life.", copy: "This helps the trainer choose a useful fallback instead of giving you a speech.", question: "What gets in the way most often?", answer: `<div class="single-answer answer-choice-group" role="radiogroup" aria-label="Training blocker">${BLOCKERS.map(([value,title,copy])=>chipOption({ value, title, copy, field: "blocker", active: draft.profile.blocker===value })).join("")}</div>` });
}

function toneStep(draft) {
  const recommendedVoice = VOICE_PERSONA_LABELS[DEFAULT_VOICE_BY_TONE[draft.profile.tone] || draft.settings.voicePersona];
  const toneCopy = {
    Supportive: "Warm, calm, and honest",
    Direct: "Clear and concise",
    Strict: "Firm standards, no humiliation",
    Competitive: "High-energy pressure, still safe",
    Rude: "Playful roast, then a firm next move",
  };
  return questionStep({ eyebrow: "THE TRAINER RELATIONSHIP", title: "Choose how I should coach you.", copy: "Tone changes presentation only. Safety, evidence, and plan decisions stay exactly the same.", question: "How should I sound when I coach you?", answer: choiceBubbleGroup({ label: "Trainer tone", field: "tone", action: "onboarding-profile-field", options: TRAINER_TONES.map(value => ({ value, label: value, copy: toneCopy[value] || "" })), selected: draft.profile.tone, hint: `Recommended voice: ${recommendedVoice || "your current voice"}` }) });
}

function voiceStep(draft) {
  const recommendedVoice = VOICE_PERSONA_LABELS[DEFAULT_VOICE_BY_TONE[draft.profile.tone] || draft.settings.voicePersona];
  const voiceCopy = {
    nova: "Best for supportive coaching",
    atlas: "Best for strict and competitive modes",
    bennett: "Modern London voice for direct or roast coaching",
    mira: "Calm, steady, and low-pressure",
  };
  return questionStep({ eyebrow: "PREMIUM VOICE", title: "Give your trainer a voice you’ll want to hear.", copy: "Text always stays visible. Voice is optional and can be changed later.", question: "Which voice fits this trainer?", answer: choiceBubbleGroup({ label: "Premium voice", field: "voicePersona", action: "onboarding-setting", options: VOICE_PERSONAS.map(value => ({ value, label: VOICE_PERSONA_LABELS[value], copy: voiceCopy[value] || "" })), selected: draft.settings.voicePersona, hint: `Recommended for ${draft.profile.tone}: ${recommendedVoice || "your current voice"}` }) });
}

function speakRepliesStep(draft) {
  return questionStep({ eyebrow: "PREMIUM VOICE", title: "Want Nova to read replies aloud?", copy: "You’ll still see every trainer message as text. Turn this off whenever you prefer quiet coaching.", question: "Should spoken replies be on by default?", answer: toggleBubble({ title: "Read trainer replies aloud", copy: `Uses ${VOICE_PERSONA_LABELS[draft.settings.voicePersona] || "your selected voice"} when available.`, offTitle: "Text only for now", offCopy: "Replies stay visible; voice can be enabled later.", action: "onboarding-setting-toggle", field: "speakReplies", checked: draft.settings.speakReplies }) });
}

function proactiveStep(draft) {
  return questionStep({ eyebrow: "COACHING CADENCE", title: "Let the trainer know when to step in.", copy: "This build keeps coaching inside the app. You stay in control.", question: "Should I offer an earned check-in when the evidence says it may help?", answer: toggleBubble({ title: "Allow earned coaching inside the app", copy: "No operating-system notifications in this build.", offTitle: "Only when I open the app", offCopy: "The trainer stays quiet unless you ask.", action: "onboarding-toggle", field: "proactive", checked: draft.profile.proactive }) });
}

function boundaryStep(draft) {
  return `<div class="onboarding-step trainer-interview single-question boundary-step"><span class="eyebrow">CLEAR BOUNDARIES</span><h1>Useful, honest, and still in your control.</h1><p>One last check before we train.</p>${trainerBubble("You stay in control of every plan change.")}<div class="boundary-list premium-boundaries"><article>${icon("check")}<span><b>Your workout history stays on this device</b><small>Plans, sets, preferences, and progress remain local.</small></span></article><article>${icon("check")}<span><b>You approve every plan change</b><small>The trainer can explain or prepare an option—never activate it alone.</small></span></article><article>${icon("close")}<span><b>FitCoach is not medical care</b><small>No diagnosis, rehabilitation, medication, emergency care, or camera-based form assessment.</small></span></article></div><label class="consent-row premium-consent"><input type="checkbox" data-action="onboarding-consent" ${draft.consent?"checked":""}><span><b>I understand FitCoach is a fitness tool, not medical care.</b><small>I will not enter medical records, account secrets, or other highly sensitive information.</small></span></label></div>`;
}

export function renderOnboarding({step,draft}) {
  const pages = [goalStep, genderStep, bodyFocusStep, themeStep, d => scheduleQuestion(d, { field: "experience", title: "Start with the right challenge.", question: "How would you describe your training experience?" }), d => scheduleQuestion(d, { field: "days", title: "Build a week you can repeat.", question: "How many days can you realistically train?" }), d => scheduleQuestion(d, { field: "duration", title: "Make the sessions fit your life.", question: "How long do you usually have?" }), d => scheduleQuestion(d, { field: "equipment", title: "Use what you actually have.", question: "What equipment can I plan around?" }), d => scheduleQuestion(d, { field: "location", title: "Make the plan work where you are.", question: "Where do you usually train?" }), gymNameStep, gymEquipmentStep, blockerStep, toneStep, voiceStep, speakRepliesStep, proactiveStep, boundaryStep];
  const safeStep = Math.min(Math.max(Number(step) || 0, 0), pages.length - 1);
  const focusAreas = Array.isArray(draft.profile.focusAreas) ? draft.profile.focusAreas : [];
  const nextLabel = safeStep === ONBOARDING_STEP_COUNT - 1
    ? "Enter FitCoach"
    : safeStep === 2 && focusAreas.includes("full body")
      ? "Use balanced plan"
      : safeStep === 2 && focusAreas.length
        ? `Continue with ${focusAreas.length} ${focusAreas.length === 1 ? "area" : "areas"}`
        : "Continue";
  return `<section class="onboarding-screen ai-setup-screen"><header><button class="icon-only" data-action="exit-onboarding" aria-label="Exit onboarding">${icon("chevron")}</button><div><b>Let’s get started</b><div class="onboarding-progress segmented">${Array.from({length: ONBOARDING_STEP_COUNT}, (_, index) => `<span class="${index < safeStep + 1 ? "active" : ""}"></span>`).join("")}</div></div><small>Step ${safeStep+1} of ${ONBOARDING_STEP_COUNT}</small></header><main>${pages[safeStep](draft)}</main><footer>${button({label:"Back",action:"onboarding-back",variant:"quiet",disabled:safeStep===0})}${button({label:nextLabel,action:"onboarding-next",variant:"primary",disabled:safeStep===ONBOARDING_STEP_COUNT-1&&!draft.consent})}</footer></section>`;
}
