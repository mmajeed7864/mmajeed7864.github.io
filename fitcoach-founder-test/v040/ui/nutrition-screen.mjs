import { escapeHtml, localDateKey } from "../core/utils.mjs";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  NUTRITION_DISCLAIMER,
  dayTotals,
  draftCount,
  isFavoriteFood,
  normalizeTargets,
  remainingTargets,
  searchFoods,
  slotTotals,
} from "../domain/nutrition.mjs";
import { ESTIMATOR_DISCLAIMER } from "../domain/nutrition-estimator.mjs";
import { button, icon } from "./components.mjs";

const SOURCE_LABELS = Object.freeze({
  manual: "Manual entry",
  recent: "Re-logged",
  favorite: "Favorite",
  barcode: "Barcode",
  provider: "Provider record",
  photo_estimate: "Photo estimate · preview",
  text_estimate: "Text estimate · preview",
});

const kcalRound = value => Math.round(value).toLocaleString();
const fmtRange = (range, unit = "") => `${Math.round(range[0])}–${Math.round(range[1])}${unit}`;
const fmtMultiplier = value => (Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100));

function dateLabel(dateKey, now = new Date()) {
  const todayKey = localDateKey(now);
  if (dateKey === todayKey) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey === localDateKey(yesterday)) return "Yesterday";
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? dateKey : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function macroBar(label, value, target, unit = "g") {
  const percent = Math.max(0, Math.min(100, target ? Math.round((value / target) * 100) : 0));
  return `<div class="macro-bar fuel-macro" data-macro="${escapeHtml(label.toLowerCase())}"><span class="macro-name">${escapeHtml(label)}</span><span class="fuel-macro-value"><b>${Math.round(value)}</b><small> / ${Math.round(target)} ${escapeHtml(unit)}</small></span><i class="macro-track" aria-hidden="true"><em style="width:${percent}%"></em></i></div>`;
}

function calorieLedger(totals, targets) {
  const percent = Math.max(0, Math.min(100, targets.calories ? (totals.calories / targets.calories) * 100 : 0));
  return `<div class="fuel-ledger" role="img" aria-label="${kcalRound(totals.calories)} of ${kcalRound(targets.calories)} target calories confirmed">
    <div class="fuel-ledger-label" aria-hidden="true"><span>CONFIRMED ENERGY</span><span>kcal</span></div>
    <b class="fuel-ledger-number" aria-hidden="true">${kcalRound(totals.calories)}</b>
    <div class="fuel-ledger-meter" aria-hidden="true"><span style="width:${percent.toFixed(2)}%"></span></div>
  </div>`;
}

function mealIllustration(slot) {
  const drawings = {
    breakfast: '<circle cx="32" cy="23" r="10" fill="currentColor" opacity=".2"/><path d="M32 8v4M15 14l3 3M49 14l-3 3M11 27h5M48 27h5"/><path d="M13 33h38c-2 14-8 19-19 19S15 47 13 33Z" fill="currentColor" opacity=".17"/><path d="M13 33h38c-2 14-8 19-19 19S15 47 13 33Zm7 20h24"/>',
    lunch: '<path d="M14 30h36c-2 15-8 22-18 22S16 45 14 30Z" fill="currentColor" opacity=".16"/><path d="M14 30h36c-2 15-8 22-18 22S16 45 14 30Z"/><path d="M22 30c-7-10-3-19 7-17 2 8 0 13-4 17m6 0c-3-9 1-18 11-17 1 8-3 13-7 17m8-1 8-10"/>',
    dinner: '<circle cx="32" cy="33" r="21" fill="currentColor" opacity=".13"/><circle cx="32" cy="33" r="14"/><path d="M32 19a14 14 0 0 1 14 14H32Z" fill="currentColor" opacity=".32"/><path d="M5 14v16m5-16v16M5 23h5M7.5 30v23M57 14v39m-3-39v18h3"/>',
    snacks: '<path d="M32 23c-18-12-24 6-14 25 4 7 10 3 14 3s10 4 14-3c10-19 4-37-14-25Z" fill="currentColor" opacity=".17"/><path d="M32 23c-18-12-24 6-14 25 4 7 10 3 14 3s10 4 14-3c10-19 4-37-14-25Zm0 0c-1-8 1-12 5-15m-3 8c2-6 8-6 12-5-1 6-7 8-12 5"/>',
  };
  return `<svg class="fuel-meal-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[slot] || drawings.snacks}</svg>`;
}

function foodRow(entry, dateKey) {
  const draft = entry.status === "draft";
  const sub = `${fmtMultiplier(entry.multiplier)} × ${entry.servingLabel} · ${SOURCE_LABELS[entry.source] || entry.source}`;
  const amount = draft
    ? `<span class="food-kcal draft"><b>${fmtRange(entry.estimate?.kcalRange || [0, 0])}</b><small>kcal est.</small><em>DRAFT · counts 0</em></span>`
    : `<span class="food-kcal"><b>${kcalRound(entry.nutrients.calories)}</b><small>kcal</small></span>`;
  return `<button class="food-row ${draft ? "draft" : ""}" data-action="${draft ? "nutrition-open-review" : "nutrition-open-entry"}" data-value="${escapeHtml(entry.id)}" data-date="${escapeHtml(dateKey)}" aria-label="${draft ? "Review draft" : "Edit"} ${escapeHtml(entry.name)}">
    <span class="food-copy"><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(sub)}</small></span>${amount}
  </button>`;
}

function mealSlotCard(slot, day, dateKey, { yesterdayHasSlot }) {
  const entries = (day?.entries || []).filter(entry => entry.slot === slot);
  const totals = slotTotals(day, slot);
  const confirmedCount = entries.filter(entry => entry.status === "confirmed").length;
  return `<article class="fuel-meal" data-slot="${escapeHtml(slot)}">
    <header class="fuel-meal-head"><span class="fuel-meal-number" aria-hidden="true">${String(MEAL_SLOTS.indexOf(slot) + 1).padStart(2, "0")}</span><span class="fuel-meal-visual fuel-meal-${escapeHtml(slot)}">${mealIllustration(slot)}</span><span class="fuel-meal-copy"><small class="sr-only">${escapeHtml(MEAL_SLOT_LABELS[slot].toUpperCase())}</small><h3>${escapeHtml(MEAL_SLOT_LABELS[slot])}</h3><small>${confirmedCount ? `${confirmedCount} food${confirmedCount === 1 ? "" : "s"} · ${kcalRound(totals.calories)} kcal` : entries.length ? "A draft is ready to review" : "Ready when you are"}</small></span>
      <button class="fuel-meal-add" data-action="nutrition-open-add" data-value="${escapeHtml(slot)}" aria-label="Add food to ${escapeHtml(MEAL_SLOT_LABELS[slot])}">${icon("plus")}</button>
    </header>
    ${entries.length ? `<div class="food-rows fuel-food-rows">${entries.map(entry => foodRow(entry, dateKey)).join("")}</div>` : ""}
    ${!entries.length && yesterdayHasSlot ? `<button class="fuel-copy-meal" data-action="nutrition-copy-yesterday" data-value="${escapeHtml(slot)}">${icon("sync")}<span>Repeat yesterday’s ${escapeHtml(MEAL_SLOT_LABELS[slot].toLowerCase())}</span></button>` : ""}
  </article>`;
}

function quickFoodRail(nutrition) {
  const favorites = (nutrition?.favorites || []).slice(0, 5).map((item, index) => ({ ...item, kind: "favorite", index }));
  const favoriteNames = new Set(favorites.map(item => item.name.toLowerCase()));
  const recents = (nutrition?.recents || []).filter(item => !favoriteNames.has(item.name.toLowerCase())).slice(0, 5).map((item, index) => ({ ...item, kind: "recent", index: (nutrition.recents || []).indexOf(item) }));
  const foods = [...favorites, ...recents];
  if (!foods.length) return "";
  return `<section class="fuel-repeat" aria-labelledby="fuel-repeat-title"><header class="fuel-section-heading"><h2 id="fuel-repeat-title">Your regulars</h2><small>Review, then add</small></header><div class="fuel-repeat-rail">${foods.map(item => `<button class="fuel-repeat-food" data-action="nutrition-quick-food" data-kind="${escapeHtml(item.kind)}" data-value="${item.index}"><span class="fuel-repeat-symbol">${item.kind === "favorite" ? icon("heart") : icon("clock")}</span><span class="fuel-repeat-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.servingLabel)} · ${Math.round(item.per.calories * (item.multiplier || 1))} kcal</small></span><span class="fuel-repeat-plus">${icon("plus")}</span></button>`).join("")}</div></section>`;
}

export function renderNutritionScreen({ state, ui, now = new Date() }) {
  const nutrition = state.nutrition;
  const dateKey = ui.nutritionDate || localDateKey(now);
  const todayKey = localDateKey(now);
  const day = nutrition.days[dateKey];
  const totals = dayTotals(day);
  const targets = normalizeTargets(nutrition.targets);
  const remaining = remainingTargets(targets, totals);
  const drafts = draftCount(day);
  const confirmedFoods = (day?.entries || []).filter(entry => entry.status === "confirmed").length;
  const yesterday = new Date(`${dateKey}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const yesterdayDay = nutrition.days[yesterdayKey];
  const overTarget = remaining.calories < 0;
  return `<div class="page nutrition-page fuel-page fuel-v070">
    <header class="fuel-page-heading"><div><span class="fuel-eyebrow">FOOD / NUTRITION DIARY</span><h1>Fuel your day.</h1></div><span class="fuel-editorial-mark" aria-hidden="true">${mealIllustration("dinner")}</span><p>Eat. Train. Repeat.<br><span>Your food, with a little more clarity.</span></p></header>
    <div class="fuel-date-row"><div class="fuel-date-nav" role="group" aria-label="Diary date"><button data-action="nutrition-day" data-value="-1" aria-label="Previous day">${icon("chevron", "flip")}</button><b>${escapeHtml(dateLabel(dateKey, now))}</b><button data-action="nutrition-day" data-value="1" aria-label="Next day" ${dateKey >= todayKey ? "disabled" : ""}>${icon("chevron")}</button></div><button class="fuel-target-button" data-action="nutrition-open-targets">Edit targets</button></div>
    <div class="fuel-editorial-layout"><div class="fuel-dashboard">
    <div class="fuel-add-actions"><button class="fuel-search-food" data-action="nutrition-open-add" data-value="">${icon("search")}<span>Find & add food</span>${icon("plus")}</button><button class="fuel-barcode" data-action="nutrition-open-add" data-value="" data-focus="barcode" aria-label="Look up a food barcode">${icon("barcode")}<span>Barcode</span></button></div>
    <section class="fuel-summary" aria-label="Daily nutrition summary">
      <div class="fuel-energy">
        ${calorieLedger(totals, targets)}
        <div class="fuel-energy-copy"><p><b>${kcalRound(Math.abs(remaining.calories))}</b><span>kcal ${overTarget ? "above target" : "remaining"}</span></p><span class="fuel-energy-target">${kcalRound(targets.calories)} kcal<br>${targets.userSet ? "daily target" : "starting target"}</span></div>${overTarget ? '<small class="fuel-energy-note">One day is part of a bigger picture.</small>' : ""}
      </div>
      <div class="fuel-macros" aria-label="Confirmed macronutrients">${macroBar("Protein", totals.protein, targets.protein)}${macroBar("Carbs", totals.carbs, targets.carbs)}${macroBar("Fat", totals.fat, targets.fat)}</div>
      <p class="fuel-counting-note">${targets.userSet ? "Confirmed food only" : "Starting targets · yours to edit"}</p>
    </section>
    ${drafts ? `<button class="draft-chip fuel-draft-review" data-action="nutrition-first-draft"><span class="fuel-draft-icon">${icon("info")}</span><span><b>${drafts} draft${drafts === 1 ? "" : "s"} to review</b><small>Not counted until you confirm</small></span>${icon("chevron")}</button>` : ""}
    ${quickFoodRail(nutrition)}
    </div><div class="fuel-journal">
    <section class="fuel-diary" aria-labelledby="fuel-diary-title"><header class="fuel-section-heading"><h2 id="fuel-diary-title">The food journal</h2><small>${confirmedFoods} food${confirmedFoods === 1 ? "" : "s"} logged</small></header><div class="fuel-meals">${MEAL_SLOTS.map(slot => mealSlotCard(slot, day, dateKey, {
      yesterdayHasSlot: Boolean((yesterdayDay?.entries || []).some(entry => entry.slot === slot && entry.status === "confirmed")),
    })).join("")}</div></section>
    <details class="fuel-notes"><summary><span>${icon("info")}About your food data</span>${icon("chevron")}</summary><div class="fuel-notes-content">
      <p>${escapeHtml(NUTRITION_DISCLAIMER)}</p>
      <ul><li>Totals count confirmed entries only — drafts always count zero</li><li>Photo and text estimates are early previews and always require your review</li><li>Targets are yours to set; FitCoach never prescribes a diet</li><li>Photos never leave this device and are never stored — only name and size metadata</li></ul>
      <button class="fuel-preview-button" data-action="nutrition-open-capture" data-value="">${icon("camera")}<span>Try photo draft preview</span></button><small>Photo recognition is not active. This creates an editable example.</small>
    </div></details></div></div>
  </div>`;
}

// ── Modals ─────────────────────────────────────────────────────────────────

function reviewSheet(modal, context) {
  const { state, previewUrl } = context;
  const entry = (state.nutrition.days[modal.dateKey]?.entries || []).find(item => item.id === modal.entryId);
  if (!entry) return null;
  const estimate = entry.estimate;
  return {
    eyebrow: "REVIEW BEFORE IT COUNTS",
    title: "Check this estimate",
    body: `
      <div class="preview-banner">${icon("info")}<p><b>Preview estimate.</b> ${escapeHtml(ESTIMATOR_DISCLAIMER)}</p></div>
      ${previewUrl ? `<img class="review-photo" src="${escapeHtml(previewUrl)}" alt="Your meal photo (kept on this device only)">` : ""}
      <label class="field"><span>Food name</span><input id="review-name" maxlength="120" value="${escapeHtml(entry.name)}"></label>
      ${estimate?.candidates?.length > 1 ? `<div class="candidate-row" role="group" aria-label="Other guesses"><span>Other guesses</span>${estimate.candidates.slice(1).map(name => `<button class="choice-chip" data-action="nutrition-review-candidate" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}</div>` : ""}
      <div class="portion-stepper" role="group" aria-label="Portion size"><span>Portion</span><button class="icon-only" data-action="nutrition-review-portion" data-value="-0.25" aria-label="Smaller portion">−</button><b>${fmtMultiplier(entry.multiplier)} ×</b><button class="icon-only" data-action="nutrition-review-portion" data-value="0.25" aria-label="Larger portion">+</button><small>${escapeHtml(entry.servingLabel)}</small></div>
      ${estimate ? `<div class="estimate-ranges"><span><small>CALORIES</small><b>${fmtRange(estimate.kcalRange)}</b></span><span><small>PROTEIN</small><b>${fmtRange(estimate.proteinRange, " g")}</b></span><span><small>CARBS</small><b>${fmtRange(estimate.carbsRange, " g")}</b></span><span><small>FAT</small><b>${fmtRange(estimate.fatRange, " g")}</b></span></div><p class="confidence-line"><span class="soft-badge">${escapeHtml(estimate.confidence)} confidence</span> If you confirm, the editable values below are counted — not the range.</p>` : ""}
      <div class="per-serving-grid"><label><span>kcal / serving</span><input id="review-kcal" type="number" inputmode="numeric" min="0" max="5000" value="${entry.per.calories}"></label><label><span>Protein g</span><input id="review-protein" type="number" inputmode="decimal" min="0" max="500" value="${entry.per.protein}"></label><label><span>Carbs g</span><input id="review-carbs" type="number" inputmode="decimal" min="0" max="800" value="${entry.per.carbs}"></label><label><span>Fat g</span><input id="review-fat" type="number" inputmode="decimal" min="0" max="500" value="${entry.per.fat}"></label></div>
      <p class="counted-preview">Will count as <b>${kcalRound(entry.nutrients.calories)} kcal</b> · ${entry.nutrients.protein} P / ${entry.nutrients.carbs} C / ${entry.nutrients.fat} F at the current portion.</p>
      ${estimate?.assumptions?.length ? `<details class="assumption-box"><summary>What this estimate assumes</summary><ul>${estimate.assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
    `,
    actions: button({ label: "Discard draft", action: "nutrition-discard-entry", value: entry.id, variant: "quiet" })
      + button({ label: "Confirm & count it", action: "nutrition-confirm-entry", value: entry.id, variant: "primary" }),
  };
}

function captureSheet(modal) {
  const slot = MEAL_SLOTS.includes(modal.slot) ? modal.slot : "";
  return {
    eyebrow: "PHOTO ESTIMATE · EARLY PREVIEW",
    title: "Scan your food",
    body: `
      <div class="preview-banner">${icon("info")}<p><b>Photo recognition is not active yet.</b> This preview creates an editable example draft; it does not analyze the pixels in your image.</p></div>
      <p class="capture-copy">Take or choose a photo and describe the meal. The image stays on this device, is never uploaded or stored, and the draft counts zero until you confirm it.</p>
      <div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip ${value === slot ? "active" : ""}" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}" aria-pressed="${value === slot}">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>
      <label class="field"><span>Optional context (what is this? portion size?)</span><input id="nutrition-context" maxlength="200" placeholder="e.g. chicken salad, big bowl" value="${escapeHtml(modal.context || "")}"></label>
      <label class="photo-input-button">${icon("camera")}<span>Open camera or photo library</span><input id="nutrition-photo" type="file" accept="image/*" capture="environment" data-action="nutrition-photo" class="sr-only"></label>
    `,
    actions: button({ label: "Cancel", action: "close-modal", variant: "quiet" }),
  };
}

function addSheet(modal, context) {
  const { state } = context;
  const nutrition = state.nutrition;
  const slot = MEAL_SLOTS.includes(modal.slot) ? modal.slot : "";
  if (modal.selected) {
    const selected = modal.selected;
    const multiplier = modal.multiplier || selected.multiplier || 1;
    const preview = Math.round(selected.per.calories * multiplier);
    return {
      eyebrow: "PORTION",
      title: selected.name,
      body: `
        <div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip ${value === slot ? "active" : ""}" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}" aria-pressed="${value === slot}">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>
        <div class="portion-stepper" role="group" aria-label="Portion size"><span>Portion</span><button class="icon-only" data-action="nutrition-add-portion" data-value="-0.25" aria-label="Smaller portion">−</button><b>${fmtMultiplier(multiplier)} ×</b><button class="icon-only" data-action="nutrition-add-portion" data-value="0.25" aria-label="Larger portion">+</button><small>${escapeHtml(selected.servingLabel)}</small></div>
        <p class="counted-preview">Adds <b>${preview.toLocaleString()} kcal</b> · ${Math.round(selected.per.protein * multiplier)} P / ${Math.round(selected.per.carbs * multiplier)} C / ${Math.round(selected.per.fat * multiplier)} F</p>
        ${selected.provenance ? `<div class="receipt-box">${icon(selected.origin === "barcode" ? "barcode" : "search")}<p><b>${escapeHtml(selected.provenance.accuracyLabel || "Provider record")} · ${escapeHtml(selected.confidence || "medium")} match confidence</b><small>${escapeHtml(`${selected.provenance.providerLabel} record ${selected.provenance.recordId}${selected.brand ? ` · ${selected.brand}` : ""}`)}</small><small>${escapeHtml(selected.provenance.warning || "Review the source, serving, and portion before relying on it.")}</small></p></div>` : ""}
      `,
      actions: button({ label: "Back", action: "nutrition-add-back", variant: "quiet" })
        + button({ label: `Add to ${MEAL_SLOT_LABELS[slot] || "meal"}`, action: "nutrition-add-confirm", variant: "primary", disabled: !slot }),
    };
  }
  const results = searchFoods(nutrition, modal.query || "");
  const providerResults = Array.isArray(modal.providerResults) ? modal.providerResults : [];
  const providerQueryReady = String(modal.query || "").trim().length >= 2;
  const showCustom = Boolean(modal.custom);
  return {
    eyebrow: "ADD FOOD",
    title: slot ? `Add to ${MEAL_SLOT_LABELS[slot]}` : "Add food",
    body: `<div class="fuel-add-sheet">
      ${slot ? "" : `<div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}" aria-pressed="false">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>`}
      <div class="provider-search-block" aria-live="polite">
        <div class="provider-search-controls"><label class="field search-field"><span class="sr-only">Search nutrition providers, saved foods, and starter foods</span>${icon("search")}<input id="nutrition-search" maxlength="80" placeholder="Food, brand, or ingredient" value="${escapeHtml(modal.query || "")}"></label>${button({ label: modal.providerSearchBusy ? "Searching…" : "Search", action: "nutrition-provider-search", variant: "primary", disabled: Boolean(modal.providerSearchBusy) || !providerQueryReady })}</div>
        ${modal.providerSearchError ? `<p class="form-error" role="alert">${escapeHtml(modal.providerSearchError)}</p>` : ""}
        ${providerResults.length ? `<div class="food-results provider-food-results"><span class="result-group-label">PROVIDER RESULTS</span>${providerResults.map((item, index) => `<button class="food-row" data-action="nutrition-pick-provider-food" data-value="${index}" aria-label="Review ${escapeHtml(item.name)} from ${escapeHtml(item.provenance?.providerLabel || "nutrition provider")}"><span class="food-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.servingLabel)} · ${escapeHtml(item.provenance?.accuracyLabel || "Provider record")}</small><em>${escapeHtml(item.provenance?.providerLabel || "Nutrition provider")}${item.brand ? ` · ${escapeHtml(item.brand)}` : ""}</em></span><span class="food-kcal"><b>${Math.round(item.per.calories)}</b><small>kcal</small></span></button>`).join("")}</div>` : ""}
      </div>
      <div class="barcode-lookup fuel-barcode-lookup">
        <label class="field"><span>Have the package?</span><input id="nutrition-barcode" inputmode="numeric" pattern="[0-9]*" maxlength="18" placeholder="Enter barcode digits" value="${escapeHtml(modal.barcode || "")}"></label>
        ${button({ label: modal.lookupBusy ? "Looking up…" : "Barcode", action: "nutrition-barcode-search", variant: "secondary", iconName: "barcode", disabled: Boolean(modal.lookupBusy) })}
        ${modal.lookupError ? `<p class="form-error" role="alert">${escapeHtml(modal.lookupError)}</p>` : ""}
      </div>
      ${showCustom ? `
      <div class="per-serving-grid custom-food-grid"><label><span>Name</span><input id="custom-name" maxlength="120" placeholder="e.g. Mom’s dal"></label><label><span>Serving label</span><input id="custom-serving" maxlength="80" placeholder="1 bowl"></label><label><span>kcal / serving</span><input id="custom-kcal" type="number" inputmode="numeric" min="0" max="5000"></label><label><span>Protein g</span><input id="custom-protein" type="number" inputmode="decimal" min="0" max="500" value="0"></label><label><span>Carbs g</span><input id="custom-carbs" type="number" inputmode="decimal" min="0" max="800" value="0"></label><label><span>Fat g</span><input id="custom-fat" type="number" inputmode="decimal" min="0" max="500" value="0"></label></div>
      ${button({ label: "Add custom food", action: "nutrition-add-custom", variant: "primary" })}` : `
      <div class="food-results local-food-results"><span class="result-group-label">SAVED + STARTER FOODS</span>${results.length ? results.map((item, index) => `<button class="food-row" data-action="nutrition-pick-food" data-value="${index}"><span class="food-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.servingLabel)} · ${escapeHtml(item.origin === "library" ? "starter food · verify values" : item.origin)}${item.origin !== "library" ? ` · last ${fmtMultiplier(item.multiplier)}×` : ""}</small></span><span class="food-kcal"><b>${Math.round(item.per.calories)}</b><small>kcal</small></span></button>`).join("") : `<p class="meal-slot-empty">No local match. Search providers or create a custom food from the package label.</p>`}</div>
      <button class="text-button" data-action="nutrition-toggle-custom">Create a custom food</button>`}
      <details class="fuel-search-notes"><summary>About search results</summary><p>Uses provider-backed product records when available. The source and reliability label are shown; verify the package label. You still choose the portion before it counts.</p><p class="provider-search-disclosure">Provider results identify their source and reliability. USDA records are reference data; community records are labeled. Nothing is added until you choose a result, review its portion, and tap Add.</p></details>
    </div>`,
    actions: button({ label: "Close", action: "close-modal", variant: "quiet" }),
  };
}

function entrySheet(modal, context) {
  const { state } = context;
  const entry = (state.nutrition.days[modal.dateKey]?.entries || []).find(item => item.id === modal.entryId);
  if (!entry) return null;
  const favorite = isFavoriteFood(state.nutrition, entry.name);
  const loggedLabel = entry.confirmedAt ? `Confirmed ${entry.confirmedAt.slice(0, 10)}` : `Logged ${entry.createdAt.slice(0, 10)}`;
  const provenanceLabel = entry.provenance ? ` · ${entry.provenance.providerLabel} record ${entry.provenance.recordId}` : "";
  const photoLabel = entry.photo ? ` · photo metadata ${entry.photo.hash} (image not stored)` : "";
  return {
    eyebrow: "CONFIRMED ENTRY",
    title: entry.name,
    body: `
      <div class="portion-stepper" role="group" aria-label="Portion size"><span>Portion</span><button class="icon-only" data-action="nutrition-entry-portion" data-value="-0.25" aria-label="Smaller portion">−</button><b>${fmtMultiplier(entry.multiplier)} ×</b><button class="icon-only" data-action="nutrition-entry-portion" data-value="0.25" aria-label="Larger portion">+</button><small>${escapeHtml(entry.servingLabel)}</small></div>
      <p class="counted-preview">Counting <b>${kcalRound(entry.nutrients.calories)} kcal</b> · ${entry.nutrients.protein} P / ${entry.nutrients.carbs} C / ${entry.nutrients.fat} F</p>
      <div class="receipt-box"><span>${icon("check")}</span><p><b>${escapeHtml(entry.provenance?.accuracyLabel || SOURCE_LABELS[entry.source] || entry.source)}</b><small>${escapeHtml(`${loggedLabel}${provenanceLabel}${photoLabel}`)}</small></p></div>
      ${entry.provenance ? `<div class="entry-source-details"><p><b>${escapeHtml(entry.provenance.providerLabel)}</b><small>${escapeHtml(entry.provenance.license)}</small><small>${escapeHtml(entry.provenance.warning)}</small></p>${entry.provenance.sourceUrl ? `<a href="${escapeHtml(entry.provenance.sourceUrl)}" target="_blank" rel="noopener noreferrer">View source record ${icon("external-link")}</a>` : ""}</div>` : ""}
      ${entry.estimate ? `<details class="assumption-box"><summary>Estimate details · ${escapeHtml(entry.estimate.confidence)} confidence</summary><ul><li>Calorie range shown: ${fmtRange(entry.estimate.kcalRange)}</li>${entry.estimate.assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
      ${entry.history?.length ? `<details class="assumption-box"><summary>Edit history</summary><ul>${entry.history.map(item => `<li>${escapeHtml(item.change)} · ${escapeHtml(item.at.slice(0, 16).replace("T", " "))}</li>`).join("")}</ul></details>` : ""}
    `,
    actions: `<button class="button button-quiet" data-action="nutrition-favorite" data-value="${escapeHtml(entry.id)}">${icon("heart")}<span>${favorite ? "Unfavorite" : "Favorite"}</span></button>`
      + button({ label: "Remove", action: "nutrition-remove-entry", value: entry.id, variant: "danger" })
      + button({ label: "Done", action: "close-modal", variant: "primary" }),
  };
}

function targetsSheet(context) {
  const targets = normalizeTargets(context.state.nutrition.targets);
  return {
    eyebrow: "YOUR TARGETS",
    title: "Set your own daily targets",
    body: `
      <p>FitCoach does not calculate a calorie prescription from body data and never adjusts these on its own. ${targets.userSet ? "These are your saved values." : "These are neutral starting defaults — edit them to match the plan you already trust."}</p>
      <div class="per-serving-grid"><label><span>Calories</span><input id="target-kcal" type="number" inputmode="numeric" min="1000" max="6000" value="${targets.calories}"></label><label><span>Protein g</span><input id="target-protein" type="number" inputmode="numeric" min="30" max="400" value="${targets.protein}"></label><label><span>Carbs g</span><input id="target-carbs" type="number" inputmode="numeric" min="30" max="700" value="${targets.carbs}"></label><label><span>Fat g</span><input id="target-fat" type="number" inputmode="numeric" min="20" max="250" value="${targets.fat}"></label></div>
      <div class="approval-boundary">${icon("info")}<p>Not medical or dietetic advice. If you are managing a health condition, set these with a qualified professional.</p></div>
    `,
    actions: button({ label: "Cancel", action: "close-modal", variant: "quiet" }) + button({ label: "Save targets", action: "nutrition-save-targets", variant: "primary" }),
  };
}

export function renderNutritionModalContent(modal, context) {
  if (modal.type === "nutrition-review") return reviewSheet(modal, context);
  if (modal.type === "nutrition-capture") return captureSheet(modal);
  if (modal.type === "nutrition-add") return addSheet(modal, context);
  if (modal.type === "nutrition-entry") return entrySheet(modal, context);
  if (modal.type === "nutrition-targets") return targetsSheet(context);
  return null;
}
