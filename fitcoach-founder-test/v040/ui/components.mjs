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
  return `<figure class="exercise-motion ${escapeHtml(className)}">
    <video data-media-video data-motion-id="${escapeHtml(motion.id || motion.exerciseId || name)}" src="${escapeHtml(motion.path)}" ${poster?.path ? `poster="${escapeHtml(poster.path)}"` : ""} width="${motion.width || 720}" height="${motion.height || 720}" ${eager ? 'preload="auto"' : 'preload="metadata"'} muted loop playsinline ${paused ? "" : "autoplay"} aria-label="${escapeHtml(motion.alt || `${name} movement demonstration`)}"></video>
    <button class="motion-toggle" data-action="toggle-exercise-motion" aria-label="${paused ? "Play" : "Pause"} ${escapeHtml(name)} movement guide" aria-pressed="${!paused}">${icon(paused ? "play" : "pause")}<span>${paused ? "Play motion" : "Pause motion"}</span></button>
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

export function muscleMap(exercise) {
  const group = activeMuscleGroups(exercise);
  return `<div class="muscle-map" role="img" aria-label="Muscle target map for ${escapeHtml(exercise?.name || "exercise")}">
    <div class="muscle-map-heading"><span>FRONT</span><span>BACK</span></div>
    <svg viewBox="0 0 520 330" aria-hidden="true">
      <g class="anatomy-figure front" transform="translate(18 18)">
        <circle class="anatomy-base anatomy-head" cx="104" cy="20" r="17"/>
        <path class="anatomy-base anatomy-neck" d="M94 35h20l5 15-15 12-15-12z"/>
        <path class="anatomy-base anatomy-torso" d="M78 48q26-12 52 0l17 62-18 40-12 12H95l-12-12-18-40z"/>
        <path class="anatomy-base anatomy-shoulder" d="M79 50q-16 1-24 15l9 21 18-15zm50 0q16 1 24 15l-9 21-18-15z"/>
        <path class="anatomy-base anatomy-arm" d="M62 67 39 117l12 9 30-41zm84 0 23 50-12 9-30-41z"/>
        <path class="anatomy-base anatomy-forearm" d="m39 117-20 43 13 7 19-41zm107 0 20 43-13 7-19-41z"/>
        <path class="anatomy-base anatomy-pelvis" d="M84 144h36l12 24-17 19H89l-17-19z"/>
        <path class="anatomy-base anatomy-thigh" d="M78 164h22l-1 73-17 2-10-65zm28 0h22l7 10-10 65-17-2z"/>
        <path class="anatomy-base anatomy-shin" d="m82 237 17 2-4 66-15-1zm27 2 17-2 8 67-15 1z"/>
        <path class="anatomy-base anatomy-foot" d="m80 302 16 1 8 8-30 1zm41 1 16-1 10 10-29-1z"/>
        <path class="anatomy-muscle ${group.shoulders}" d="M78 52q-11 1-17 12l7 15 17-12zM130 52q11 1 17 12l-7 15-17-12z"/>
        <path class="anatomy-muscle ${group.chest}" d="M83 67q21-12 42 0l-2 26q-19 9-38 0z"/>
        <path class="anatomy-muscle ${group.arms}" d="m70 79-17 35 10 5 19-31zm68 0 17 35-10 5-19-31z"/>
        <path class="anatomy-muscle ${group.core}" d="M88 96h32l4 50-20 18-20-18z"/>
        <path class="anatomy-muscle ${group.quads}" d="M76 166h23l-3 68-15 1-9-60zm31 0h22l9 9-9 60-15-1z"/>
        <path class="anatomy-muscle ${group.calves}" d="m82 239 16 2-3 59-14-1zm28 2 16-2 8 60-14 1z"/>
        <path class="anatomy-detail" d="M104 94v67M87 113h34M84 166h39M104 241v59"/>
      </g>
      <g class="anatomy-figure back" transform="translate(278 18)">
        <circle class="anatomy-base anatomy-head" cx="104" cy="20" r="17"/>
        <path class="anatomy-base anatomy-neck" d="M94 35h20l5 15-15 12-15-12z"/>
        <path class="anatomy-base anatomy-torso" d="M78 48q26-12 52 0l17 62-18 40-12 12H95l-12-12-18-40z"/>
        <path class="anatomy-base anatomy-shoulder" d="M79 50q-16 1-24 15l9 21 18-15zm50 0q16 1 24 15l-9 21-18-15z"/>
        <path class="anatomy-base anatomy-arm" d="M62 67 39 117l12 9 30-41zm84 0 23 50-12 9-30-41z"/>
        <path class="anatomy-base anatomy-forearm" d="m39 117-20 43 13 7 19-41zm107 0 20 43-13 7-19-41z"/>
        <path class="anatomy-base anatomy-pelvis" d="M84 144h36l12 24-17 19H89l-17-19z"/>
        <path class="anatomy-base anatomy-thigh" d="M78 164h22l-1 73-17 2-10-65zm28 0h22l7 10-10 65-17-2z"/>
        <path class="anatomy-base anatomy-shin" d="m82 237 17 2-4 66-15-1zm27 2 17-2 8 67-15 1z"/>
        <path class="anatomy-base anatomy-foot" d="m80 302 16 1 8 8-30 1zm41 1 16-1 10 10-29-1z"/>
        <path class="anatomy-muscle ${group.shoulders}" d="M78 52q-11 1-17 12l7 15 17-12zM130 52q11 1 17 12l-7 15-17-12z"/>
        <path class="anatomy-muscle ${group.back}" d="M84 62q20-13 40 0l15 48-35 35-35-35z"/>
        <path class="anatomy-muscle ${group.arms}" d="m70 79-17 35 10 5 19-31zm68 0 17 35-10 5-19-31z"/>
        <path class="anatomy-muscle ${group.glutes}" d="M77 145q27-12 54 0l3 22-30 18-30-18z"/>
        <path class="anatomy-muscle ${group.hamstrings}" d="M76 168h24l-3 66-15 1-9-60zm31 0h22l9 9-9 60-15-1z"/>
        <path class="anatomy-muscle ${group.calves}" d="m82 239 16 2-3 59-14-1zm28 2 16-2 8 60-14 1z"/>
        <path class="anatomy-detail" d="M104 65v78M88 98l16 16 16-16M104 183v52M84 168h39M104 241v59"/>
      </g>
    </svg><div class="muscle-map-legend"><span><i class="primary"></i>Primary</span><span><i class="secondary"></i>Secondary</span></div>
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
