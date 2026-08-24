import { escapeHtml, formatDate, formatTime, sessionVolume } from "../core/utils.mjs";

const ICONS = Object.freeze({
  today: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  train: '<path d="M4 9v6m3-9v12m10-12v12m3-9v6M7 12h10"/>',
  progress: '<path d="M4 20V10m6 10V4m6 16v-7m4 7V7"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  equipment: '<path d="M3 9v6m4-9v12m10-12v12m4-9v6M7 12h10"/>',
  spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  mic: '<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  send: '<path d="m4 12 16-8-5 16-3-6zM12 14l8-10"/>',
  swap: '<path d="M7 7h12l-3-3m3 3-3 3M17 17H5l3 3m-3-3 3-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
  heart: '<path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  volume: '<path d="M4 10v4h4l5 4V6L8 10zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  barcode: '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M20 5v14M17 5v14"/>',
  flame: '<path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1.4-.6-2.4-1.2-3.3C15.6 8.6 18 10.4 18 14a6 6 0 0 1-12 0c0-4.8 4.6-6.6 6-11z"/>',
});

export function icon(name, className = "") {
  return `<svg class="icon ${escapeHtml(className)}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}

export function button({ label, action, value = "", variant = "secondary", iconName = "", disabled = false, extra = "" }) {
  return `<button class="button button-${escapeHtml(variant)}" data-action="${escapeHtml(action)}" data-value="${escapeHtml(value)}" ${disabled ? "disabled" : ""} ${extra}>${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span></button>`;
}

export function exercisePoster(exercise, { className = "", eager = false, label = true } = {}) {
  const media = exercise?.media?.find?.(entry => entry.type === "poster")
    || exercise?.media?.find?.(entry => ["png-two-position-guide", "svg-two-position-guide"].includes(entry.type));
  const poster = media?.path || exercise?.snapshot?.mediaPoster || "";
  const name = exercise?.name || exercise?.snapshot?.name || "Exercise";
  if (!poster) {
    const pattern = String(exercise?.movementPattern || "movement").replaceAll("-", " ");
    const muscles = (exercise?.primaryMuscles || []).slice(0, 2).join(" · ");
    return `<div class="exercise-poster media-fallback ${escapeHtml(className)}" role="img" aria-label="${escapeHtml(name)} written coaching guide"><span class="guide-abstract" aria-hidden="true"><i></i><i></i><b></b></span><span class="guide-copy"><b>FITCOACH GUIDE</b><strong>${escapeHtml(name)}</strong><small>${escapeHtml(muscles || pattern)} · setup · cues</small></span></div>`;
  }
  return `<figure class="exercise-poster ${escapeHtml(className)}"><img data-media-image src="${escapeHtml(poster)}" width="${media?.width || 320}" height="${media?.height || 240}" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} alt="${label ? escapeHtml(media?.alt || `${name} static two-position guide`) : ""}"><span class="media-fallback-label">Visual unavailable</span></figure>`;
}

export function exerciseMotionMedia(exercise) {
  return exercise?.media?.find?.(entry =>
    ["mp4", "webm"].includes(entry.type)
    && entry.hasAudio === false
    && entry.motionReviewStatus === "approved"
  ) || null;
}

export function exerciseMotionGuide(exercise, { className = "", eager = false, paused = false } = {}) {
  const motion = exerciseMotionMedia(exercise);
  if (!motion) return exercisePoster(exercise, { className, eager });
  const poster = exercise?.media?.find?.(entry => entry.type === "poster")
    || exercise?.media?.find?.(entry => ["png-two-position-guide", "svg-two-position-guide"].includes(entry.type));
  const name = exercise?.name || "Exercise";
  const posterMarkup = poster?.path
    ? `<img class="motion-fallback-poster" src="${escapeHtml(poster.path)}" width="${poster.width || 320}" height="${poster.height || 240}" alt="${escapeHtml(poster.alt || `${name} technique preview`)}">`
    : `<div class="motion-fallback-art" aria-hidden="true"><span>${icon("play")}</span><b>${escapeHtml(name)}</b></div>`;
  return `<figure class="exercise-motion ${escapeHtml(className)}" data-motion-status="loading">
    <video data-media-video data-motion-id="${escapeHtml(motion.id || motion.exerciseId || name)}" src="${escapeHtml(motion.path)}" ${poster?.path ? `poster="${escapeHtml(poster.path)}"` : ""} width="${motion.width || 720}" height="${motion.height || 720}" preload="auto" muted loop playsinline ${paused ? "" : "autoplay"} controls controlslist="nodownload noplaybackrate" disablepictureinpicture aria-label="${escapeHtml(motion.alt || `${name} movement demonstration`)}"></video>
    <button class="motion-toggle" data-action="toggle-exercise-motion" aria-label="${paused ? "Play" : "Pause"} ${escapeHtml(name)} movement guide" aria-pressed="${!paused}">${icon(paused ? "play" : "pause")}<span>${paused ? "Play motion" : "Pause motion"}</span></button>
    <span class="motion-status" data-motion-status-label aria-live="polite">${paused ? "Motion paused" : "Loading motion guide"}</span>
    <span class="media-play-hint">Tap to pause the silent technique loop</span>
    <div class="motion-fallback-card">${posterMarkup}<div class="motion-fallback-copy"><span class="eyebrow">TECHNIQUE PREVIEW</span><strong>${escapeHtml(name)}</strong><small>The visual guide is taking a moment. Use the movement notes below while it loads.</small><button class="button button-secondary" data-action="retry-exercise-motion" data-value="${escapeHtml(motion.id || motion.exerciseId || name)}">Try video again</button></div></div>
  </figure>`;
}

function activeMuscleGroups(exercise) {
  const primary = new Set((exercise?.primaryMuscles || []).map(value => String(value).toLowerCase()));
  const secondary = new Set((exercise?.secondaryMuscles || []).map(value => String(value).toLowerCase()));
  const matches = (set, terms) => [...set].some(value => terms.some(term => value.includes(term)));
  const status = terms => matches(primary, terms) ? "primary" : matches(secondary, terms) ? "secondary" : "muted";
  return {
    chest: status(["chest", "pectoral"]), shoulders: status(["shoulder", "delt"]), arms: status(["biceps", "triceps", "forearm"]),
    back: status(["back", "lat", "trape", "rhomboid", "erector"]), core: status(["core", "ab", "trunk", "oblique"]),
    glutes: status(["glute"]), quads: status(["quad"]), hamstrings: status(["hamstring"]), calves: status(["calf", "calves"]),
  };
}

// AI-generated anatomy is assigned by movement family so every exercise gets
// an art-directed muscle surface instead of the old generic silhouette. The
// labels below still come from the exercise record; the illustrations are a
// visual explainer only and never claim live form or muscle sensing.
const GENERATED_ANATOMY_PATHS = Object.freeze({
  lower: "/fitcoach-founder-test/v040/assets/anatomy/lower-body-v1.png",
  push: "/fitcoach-founder-test/v040/assets/anatomy/push-v1.png",
  pull: "/fitcoach-founder-test/v040/assets/anatomy/pull-v1.png",
  hinge: "/fitcoach-founder-test/v040/assets/anatomy/hinge-v1.png",
  core: "/fitcoach-founder-test/v040/assets/anatomy/core-v1.png",
});

function generatedAnatomyAsset(exercise) {
  const values = [
    ...(exercise?.primaryMuscles || []),
    ...(exercise?.secondaryMuscles || []),
    exercise?.movementPattern || "",
    exercise?.name || "",
  ].map(value => String(value).toLowerCase());
  const has = terms => values.some(value => terms.some(term => value.includes(term)));
  if (has(["deadlift", "hinge", "erector"]) || (has(["hamstring"]) && has(["back", "lat"]))) return { family: "hinge", path: GENERATED_ANATOMY_PATHS.hinge };
  if (has(["core", "ab", "oblique", "trunk"])) return { family: "core", path: GENERATED_ANATOMY_PATHS.core };
  if (has(["press", "push", "chest", "pectoral", "triceps"])) return { family: "push", path: GENERATED_ANATOMY_PATHS.push };
  if (has(["row", "pull", "pulldown", "lat", "back", "biceps"])) return { family: "pull", path: GENERATED_ANATOMY_PATHS.pull };
  if (has(["squat", "lunge", "quad", "glute", "leg", "calf", "hamstring"])) return { family: "lower", path: GENERATED_ANATOMY_PATHS.lower };
  return { family: "lower", path: GENERATED_ANATOMY_PATHS.lower };
}

function bodyFocusGroups(focusAreas = []) {
  const focused = new Set((Array.isArray(focusAreas) ? focusAreas : [focusAreas]).map(value => String(value).toLowerCase()));
  const all = focused.has("full body") || focused.has("full-body") || focused.has("everything");
  const selected = name => all || focused.has(name);
  return {
    chest: selected("chest") ? "primary" : "muted",
    shoulders: selected("shoulders") ? "primary" : "muted",
    arms: selected("arms") ? "primary" : "muted",
    back: selected("back") ? "primary" : "muted",
    core: selected("abs") || selected("core") ? "primary" : "muted",
    glutes: selected("glutes") ? "primary" : "muted",
    quads: selected("legs") || selected("quads") ? "primary" : "muted",
    hamstrings: selected("legs") || selected("hamstrings") ? "primary" : "muted",
    calves: selected("legs") || selected("calves") ? "secondary" : "muted",
  };
}

function legacyAnatomyIllustration(group) {
  const region = name => group?.[name] || "muted";
  return `<svg class="anatomy-illustration" viewBox="0 0 640 440" aria-hidden="true">
    <g class="anatomy-figure anatomy-front" transform="translate(54 16)">
      <ellipse class="anatomy-skin" cx="128" cy="37" rx="28" ry="33"/>
      <path class="anatomy-skin" d="M111 64h34l7 26-24 17-24-17z"/>
      <path class="anatomy-outline" d="M82 91Q128 70 174 91l28 87-20 42-22 9-6 159h-52l-6-159-22-9-20-42z"/>
      <path class="anatomy-region ${region("shoulders")}" d="M87 93q-29 2-40 25l16 32 35-27 5-23zm82 0q29 2 40 25l-16 32-35-27-5-23z"/>
      <path class="anatomy-region ${region("chest")}" d="M90 118q19-17 38-4v43q-25 12-42-8zm76 0q-19-17-38-4v43q25 12 42-8z"/>
      <path class="anatomy-region ${region("arms")}" d="M60 131 28 204l19 12 37-68-12-19zm136 0 32 73-19 12-37-68 12-19z"/>
      <path class="anatomy-region ${region("arms")}" d="m29 205-24 66 18 9 32-60-8-15zm198 0 24 66-18 9-32-60 8-15z"/>
      <path class="anatomy-region ${region("core")}" d="M99 162q14 8 29 0v23q-15 8-29 0zm30 0q15 8 29 0v23q-14 8-29 0zm-30 25q14 8 29 0v23q-15 8-29 0zm30 0q15 8 29 0v23q-14 8-29 0zm-27 49 26-24 26 24-14 30h-24z"/>
      <path class="anatomy-region ${region("core")}" d="M84 159l13 5 1 46-16 16-8-31zm88 0-13 5-1 46 16 16 8-31z"/>
      <path class="anatomy-region ${region("quads")}" d="M93 232h34l-1 76-23 19-15-55zm37 0h34l12 40-15 55-23-19-1-76z"/>
      <path class="anatomy-region ${region("quads")}" d="M105 252h17v57l-17 10zm29 0h17v67l-17-10z"/>
      <path class="anatomy-region ${region("calves")}" d="M104 325l22-14-3 67-18-4zm30-14 22 14-1 49-18 4z"/>
      <path class="anatomy-skin anatomy-foot" d="M101 378h24l7 17-45 1zm30 0h24l14 18-45-1z"/>
      <path class="anatomy-line" d="M128 107v112M78 157l20 11m60-11-20 11M128 230v93"/>
    </g>
    <g class="anatomy-figure anatomy-back" transform="translate(356 16)">
      <ellipse class="anatomy-skin" cx="128" cy="37" rx="28" ry="33"/>
      <path class="anatomy-skin" d="M111 64h34l7 26-24 17-24-17z"/>
      <path class="anatomy-outline" d="M82 91Q128 70 174 91l28 87-20 42-22 9-6 159h-52l-6-159-22-9-20-42z"/>
      <path class="anatomy-region ${region("shoulders")}" d="M87 93q-29 2-40 25l16 32 35-27 5-23zm82 0q29 2 40 25l-16 32-35-27-5-23z"/>
      <path class="anatomy-region ${region("back")}" d="M92 111q36-20 72 0l27 66-63 45-63-45z"/>
      <path class="anatomy-region ${region("back")}" d="M97 113l31 27 31-27 18 50-49 45-49-45zm31 27v67m-39-44 39 26 39-26"/>
      <path class="anatomy-region ${region("arms")}" d="M60 131 28 204l19 12 37-68-12-19zm136 0 32 73-19 12-37-68 12-19z"/>
      <path class="anatomy-region ${region("arms")}" d="m29 205-24 66 18 9 32-60-8-15zm198 0 24 66-18 9-32-60 8-15z"/>
      <path class="anatomy-region ${region("glutes")}" d="M85 215q22-18 43 1v39q-26 16-47-5zm86 0q-22-18-43 1v39q26 16 47-5z"/>
      <path class="anatomy-region ${region("hamstrings")}" d="M91 256h35l-2 73-23 10-13-57zm41 0h35l13 26-13 57-23-10-2-73z"/>
      <path class="anatomy-region ${region("calves")}" d="M102 335l22-11-3 54-18-4zm30-11 22 11-1 39-18 4z"/>
      <path class="anatomy-skin anatomy-foot" d="M101 378h24l7 17-45 1zm30 0h24l14 18-45-1z"/>
      <path class="anatomy-line" d="M128 91v121m-53-49 53 26 53-26m-50 89v78"/>
    </g>
  </svg>`;
}

function anatomyIllustration(group, { profile = "neutral" } = {}) {
  const region = name => group?.[name] || "muted";
  const part = (name, d) => '<path class="anatomy-region ' + region(name) + '" d="' + d + '"/>';
  const base = d => '<path class="anatomy-base" d="' + d + '"/>';
  const line = d => '<path class="anatomy-line" d="' + d + '"/>';
  const profileClass = ["female", "male", "nonbinary"].includes(profile) ? profile : "neutral";

  const front = [
    '<g class="anatomy-figure anatomy-front" transform="translate(20 8) scale(1.18 1.03)">',
    '<ellipse class="anatomy-base anatomy-head" cx="128" cy="34" rx="25" ry="30"/>',
    base('M113 60h30l8 25-23 17-23-17z'),
    base('M95 84C83 87 76 97 73 110L57 169l17 10 20-35-4 73c-1 17 4 29 14 37l-3 109-8 43h28l7-95 7 95h28l-8-43-3-109c10-8 15-20 14-37l-4-73 20 35 17-10-16-59c-3-13-10-23-22-26z'),
    base('M74 109C60 119 54 138 49 160l16 9 25-36-5-22z'),
    base('M51 164 35 220q-4 15 9 22l12-5 17-53-9-20z'),
    base('M34 219q-8 13-2 25l16-5-2-12z'),
    base('M182 109c14 10 20 29 25 51l-16 9-25-36 5-22z'),
    base('m205 164 16 56q4 15-9 22l-12-5-17-53 9-20z'),
    base('m222 219q8 13 2 25l-16-5 2-12z'),
    part("shoulders", 'M96 87c-14 2-23 10-25 23l20 12 22-19-4-16zm64 0c14 2 23 10 25 23l-20 12-22-19 4-16z'),
    part("chest", 'M92 110c9-10 21-12 32-3v35c-14 9-28 4-36-8zm72 0c-9-10-21-12-32-3v35c14 9 28 4 36-8z'),
    part("arms", 'M73 119c-10 11-14 26-18 43l15 8 19-29-5-20zm-21 52-14 48c-2 9 3 15 12 17l9-12 11-44-9-9zm152-52c10 11 14 26 18 43l-15 8-19-29 5-20zm21 52 14 48c2 9-3 15-12 17l-9-12-11-44 9-9z'),
    part("core", 'M101 145l24 3v24l-22 5-8-14zm27 3 24-3 6 18-8 14-22-5zm-27 32 24-3v24l-22 6-8-15zm27-3 24 3 6 15-8 15-22-6zm-25 33 22-5v25l-20 10-7-14zm25-5 22 5 5 20-20 10-7-10z'),
    part("core", 'M88 143l11 6-3 63-14 11-5-28zm80 0-11 6 3 63 14 11 5-28z'),
    part("quads", 'M94 247l28-9 2 67-18 25-12-54zm31-9 15 2 15 61-12 29-16-25zm29 9 18 29-12 54-18-25-2-67z'),
    part("quads", 'M102 260l17-10 1 65-16 15zm38-10 17 10-2 70-15-15z'),
    part("calves", 'M103 330l19-15 1 70-18 4zm32-15 19 15-2 59-18-4z'),
    base('M102 384h22l8 20H89zm30 0h22l21 20h-43z'),
    line('M128 87v145M91 143l31 6m35-6-31 6M105 237l18 7m17-7-18 7M128 241v145'),
    '</g>',
  ];

  const back = [
    '<g class="anatomy-figure anatomy-back" transform="translate(314 8) scale(1.18 1.03)">',
    '<ellipse class="anatomy-base anatomy-head" cx="128" cy="34" rx="25" ry="30"/>',
    base('M113 60h30l8 25-23 17-23-17z'),
    base('M95 84C83 87 76 97 73 110L57 169l17 10 20-35-4 73c-1 17 4 29 14 37l-3 109-8 43h28l7-95 7 95h28l-8-43-3-109c10-8 15-20 14-37l-4-73 20 35 17-10-16-59c-3-13-10-23-22-26z'),
    base('M74 109C60 119 54 138 49 160l16 9 25-36-5-22z'),
    base('M51 164 35 220q-4 15 9 22l12-5 17-53-9-20z'),
    base('M34 219q-8 13-2 25l16-5-2-12z'),
    base('M182 109c14 10 20 29 25 51l-16 9-25-36 5-22z'),
    base('m205 164 16 56q4 15-9 22l-12-5-17-53 9-20z'),
    base('m222 219q8 13 2 25l-16-5 2-12z'),
    part("shoulders", 'M96 87c-14 2-23 10-25 23l20 12 22-19-4-16zm64 0c14 2 23 10 25 23l-20 12-22-19 4-16z'),
    part("back", 'M97 95c9-9 20-11 31-10 11-1 22 1 31 10l13 29-44 31-44-31z'),
    part("back", 'M92 122l34 31-5 58-36-30zm72 0 34 59-36 30-5-58z'),
    part("back", 'M111 151l14 7v58l-14-11zm34 0-14 7v58l14-11z'),
    part("arms", 'M73 119c-10 11-14 26-18 43l15 8 19-29-5-20zm-21 52-14 48c-2 9 3 15 12 17l9-12 11-44-9-9zm152-52c10 11 14 26 18 43l-15 8-19-29 5-20zm21 52 14 48c2 9-3 15-12 17l-9-12-11-44 9-9z'),
    part("glutes", 'M91 211c13-10 27-8 37 7v31c-17 12-35 7-43-7zm74 0c-13-10-27-8-37 7v31c17 12 35 7 43-7z'),
    part("hamstrings", 'M94 251l27-2 2 68-19 21-13-50zm33-2h2l2 68-1 21-2 0-2-21zm7 0 27 2 3 37-13 50-19-21z'),
    part("hamstrings", 'M101 261l16-8 1 65-14 15zm38-8 16 8-3 72-14-15z'),
    part("calves", 'M103 335l18-17 2 67-18 4zm34-17 18 17-2 55-18-4z'),
    base('M102 384h22l8 20H89zm30 0h22l21 20h-43z'),
    line('M128 85v136M84 122l44 33 44-33M128 154v70M95 251l33 7 33-7M128 252v133'),
    '</g>',
  ];

  return ['<svg class="anatomy-illustration" data-profile="' + profileClass + '" viewBox="0 0 640 430" aria-hidden="true">', ...front, ...back, '</svg>'].join("");
}

export function bodyFocusMap(focusAreas = [], { gender = "prefer-not-to-say" } = {}) {
  const focused = new Set((Array.isArray(focusAreas) ? focusAreas : [focusAreas]).map(value => String(value).toLowerCase()));
  const labels = ["back", "arms", "shoulders", "abs", "chest", "legs", "glutes", "full body"];
  return `<div class="body-focus-map" role="img" aria-label="Front and back body focus illustration. Selected areas: ${escapeHtml(labels.filter(label => focused.has(label)).join(", ") || "none")}">
    <div class="body-focus-map-heading"><span>FRONT</span><span>BACK</span></div>
    ${anatomyIllustration(bodyFocusGroups([...focused]), { profile: gender })}
  </div>`;
}

export function muscleMap(exercise) {
  const group = activeMuscleGroups(exercise);
  const generated = generatedAnatomyAsset(exercise);
  const targetText = [...(exercise?.primaryMuscles || []), ...(exercise?.secondaryMuscles || [])].join(", ");
  const dimensions = generated && ["push", "pull", "core"].includes(generated.family)
    ? { width: 1024, height: 1536 }
    : { width: 1536, height: 1024 };
  const visual = generated
    ? `<figure class="generated-anatomy-artwork" data-anatomy-family="${escapeHtml(generated.family)}"><div class="anatomy-illustration"><img src="${escapeHtml(generated.path)}" width="${dimensions.width}" height="${dimensions.height}" loading="eager" decoding="async" alt="AI-generated ${escapeHtml(generated.family)} muscle focus illustration for ${escapeHtml(exercise?.name || "this exercise")}"></div><span class="anatomy-region primary" aria-hidden="true"></span><span class="anatomy-region secondary" aria-hidden="true"></span><figcaption>Illustration focus · ${escapeHtml(targetText || "movement targets")}</figcaption></figure>`
    : anatomyIllustration(group);
  return `<div class="muscle-map" role="img" aria-label="Muscle target map for ${escapeHtml(exercise?.name || "exercise")}">
    <div class="muscle-map-heading"><span>FRONT</span><span>BACK</span></div>
    ${visual}
    <div class="muscle-map-legend"><span><i class="primary"></i>Primary</span><span><i class="secondary"></i>Secondary</span></div>
  </div>`;
}

export function renderExerciseCard(exercise, preferences, { action = "open-exercise", compact = false } = {}) {
  const favorite = (preferences?.favorites || []).includes(exercise.id);
  const motion = exerciseMotionMedia(exercise);
  return `<article class="exercise-card ${compact ? "compact" : ""}" data-exercise-id="${escapeHtml(exercise.id)}">
    <button class="exercise-card-open" data-action="${escapeHtml(action)}" data-value="${escapeHtml(exercise.id)}" aria-label="Open ${escapeHtml(exercise.name)}">
      ${exercisePoster(exercise)}
      <span class="exercise-card-copy"><small>${escapeHtml((exercise.primaryMuscles || []).slice(0, 2).join(" · "))}</small><b>${escapeHtml(exercise.name)}</b><em>${escapeHtml((exercise.equipment || []).join(" · "))}</em><i class="guide-status ${motion ? "visual motion" : exercise.guideStatus === "visual-guide" ? "visual" : "written"}">${motion ? "Motion guide" : exercise.guideStatus === "visual-guide" ? "Visual guide" : "Written guide"}</i></span>
    </button>
    <button class="favorite-button ${favorite ? "active" : ""}" data-action="toggle-favorite" data-value="${escapeHtml(exercise.id)}" aria-label="${favorite ? "Remove from" : "Add to"} favorites" aria-pressed="${favorite}">${icon("heart")}</button>
  </article>`;
}

export function planExerciseRow(item, index, exercise, units = "lb", { editable = true } = {}) {
  const name = item.snapshot?.name || exercise?.name || "Exercise";
  const muscles = item.snapshot?.primaryMuscles || exercise?.primaryMuscles || [];
  const suggested = item.target?.suggestedWeight || 0;
  const motion = exerciseMotionMedia(exercise);
  return `<article class="plan-exercise-row" data-plan-exercise="${index}">
    ${editable ? `<button class="grip-button" data-action="reorder-exercise" data-value="${index}" aria-label="Move ${escapeHtml(name)}">${icon("grip")}</button>` : ""}
    ${exercisePoster(exercise || item, { className: "thumb" })}
    <button class="plan-exercise-copy" data-action="open-exercise" data-value="${escapeHtml(item.exerciseId)}"><small>${escapeHtml(muscles.join(" · ") || "Full body")}</small><b>${escapeHtml(name)}</b><span>${item.target?.sets || 0} × ${item.target?.reps || 0}${suggested ? ` · ${suggested}${escapeHtml(units)}` : ""} · ${item.target?.restSeconds || 90}s rest</span>${motion ? `<i class="guide-status visual motion">Motion guide</i>` : ""}</button>
    ${editable ? `<span class="plan-row-actions"><button class="icon-only" data-action="swap-plan-exercise" data-value="${index}" aria-label="Swap ${escapeHtml(name)}">${icon("swap")}</button><button class="icon-only" data-action="remove-plan-exercise" data-value="${index}" aria-label="Remove ${escapeHtml(name)}">${icon("close")}</button></span>` : ""}
  </article>`;
}

export function renderMessage(message, speakingId = null) {
  const coach = message.role !== "user";
  const meta = coach ? (message.provider === "deterministic-copy" ? "FitCoach" : message.provider ? "Nova" : "Coach") : formatTime(message.at);
  return `<article class="chat-message ${coach ? "coach" : "user"}" data-message-id="${escapeHtml(message.id)}">
    <div>${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
    ${coach && message.action ? `<button class="trainer-action-card" data-action="coach-message-action" data-kind="${escapeHtml(message.action.kind)}" data-value="${escapeHtml(message.action.value)}"><span>${icon(message.action.kind === "open_exercise" ? "play" : message.action.kind === "open_voice" ? "mic" : message.action.kind === "open_progress" ? "progress" : "chevron")}</span><span><b>${escapeHtml(message.action.label)}</b><small>${escapeHtml(message.action.detail || "Open in FitCoach")}</small></span>${icon("chevron")}</button>` : ""}
    <footer><span>${escapeHtml(meta)}</span>${coach && message.speakAllowed !== false ? `<button data-action="speak-message" data-value="${escapeHtml(message.id)}" aria-label="${speakingId === message.id ? "Stop" : "Play"} trainer reply">${icon(speakingId === message.id ? "pause" : "volume")}</button>` : ""}</footer>
  </article>`;
}

export function emptyState(title, copy, action = "", label = "") {
  return `<div class="empty-state"><span>${icon("spark")}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${action ? button({ label, action, variant: "primary" }) : ""}</div>`;
}

export function sessionHistoryRow(session, units) {
  const setCount = session.exercises?.reduce((sum, exercise) => sum + (exercise.sets?.length || 0), 0) || 0;
  return `<article class="history-row"><time>${escapeHtml(formatDate(session.completedAt || session.date))}</time><span><b>${escapeHtml(session.planLabel || "Workout")}</b><small>${session.durationMinutes || 0} min · ${setCount} sets · logged in ${escapeHtml(session.units || units)}</small></span><strong>${Math.round(sessionVolume(session, units)).toLocaleString()}<small>${escapeHtml(units)} volume</small></strong></article>`;
}
