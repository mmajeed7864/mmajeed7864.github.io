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
  photo_estimate: "Photo estimate · demo",
  text_estimate: "Text estimate · demo",
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
  return `<div class="macro-bar" data-macro="${escapeHtml(label.toLowerCase())}"><span class="macro-name">${escapeHtml(label)}</span><i class="macro-track"><em style="width:${percent}%"></em></i><small>${Math.round(value)} / ${Math.round(target)} ${escapeHtml(unit)}</small></div>`;
}

function calorieRing(totals, targets) {
  const percent = Math.max(0, Math.min(100, targets.calories ? (totals.calories / targets.calories) * 100 : 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return `<div class="calorie-ring" role="img" aria-label="${kcalRound(totals.calories)} of ${kcalRound(targets.calories)} target calories confirmed">
    <svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="${radius}"/><circle class="ring-value" cx="60" cy="60" r="${radius}" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/></svg>
    <span><b>${kcalRound(totals.calories)}</b><small>of ${kcalRound(targets.calories)} kcal</small></span>
  </div>`;
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
  return `<article class="card meal-slot-card" data-slot="${escapeHtml(slot)}">
    <header class="meal-slot-head"><span class="meal-slot-copy"><small>${escapeHtml(MEAL_SLOT_LABELS[slot].toUpperCase())}</small><b>${confirmedCount ? `${kcalRound(totals.calories)} kcal confirmed` : "Nothing confirmed yet"}</b></span>
      <span class="meal-slot-actions"><button class="icon-only" data-action="nutrition-open-capture" data-value="${escapeHtml(slot)}" aria-label="Scan food photo for ${escapeHtml(MEAL_SLOT_LABELS[slot])}">${icon("camera")}</button><button class="icon-only" data-action="nutrition-open-add" data-value="${escapeHtml(slot)}" aria-label="Add food to ${escapeHtml(MEAL_SLOT_LABELS[slot])}">${icon("plus")}</button></span>
    </header>
    ${entries.length ? `<div class="food-rows">${entries.map(entry => foodRow(entry, dateKey)).join("")}</div>` : `<p class="meal-slot-empty">Only what you confirm is counted.${yesterdayHasSlot ? "" : ""}</p>`}
    ${!entries.length && yesterdayHasSlot ? `<button class="text-button" data-action="nutrition-copy-yesterday" data-value="${escapeHtml(slot)}">Copy yesterday’s ${escapeHtml(MEAL_SLOT_LABELS[slot].toLowerCase())}</button>` : ""}
  </article>`;
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
  const yesterday = new Date(`${dateKey}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const yesterdayDay = nutrition.days[yesterdayKey];
  const overTarget = remaining.calories < 0;
  return `<div class="page nutrition-page">
    <section class="nutrition-hero teal-panel">
      <div class="nutrition-day-nav"><button class="icon-only" data-action="nutrition-day" data-value="-1" aria-label="Previous day">${icon("chevron", "flip")}</button><span><small>NUTRITION DIARY</small><b>${escapeHtml(dateLabel(dateKey, now))}</b></span><button class="icon-only" data-action="nutrition-day" data-value="1" aria-label="Next day" ${dateKey >= todayKey ? "disabled" : ""}>${icon("chevron")}</button></div>
      <div class="nutrition-dash">
        ${calorieRing(totals, targets)}
        <div class="nutrition-remaining">
          <span class="eyebrow">${overTarget ? "PAST TARGET BY" : "REMAINING TODAY"}</span>
          <b>${kcalRound(Math.abs(remaining.calories))}</b><small>kcal ${overTarget ? "over — data, not a verdict" : "left in your target"}</small>
          <div class="macro-bars">${macroBar("Protein", totals.protein, targets.protein)}${macroBar("Carbs", totals.carbs, targets.carbs)}${macroBar("Fat", totals.fat, targets.fat)}</div>
        </div>
      </div>
      ${drafts ? `<button class="draft-chip" data-action="nutrition-first-draft"><b>${drafts} draft${drafts === 1 ? "" : "s"} waiting for review</b><small>Drafts count zero until you confirm them</small>${icon("chevron")}</button>` : ""}
      <div class="nutrition-hero-actions">${button({ label: "Scan food", action: "nutrition-open-capture", value: "", variant: "primary", iconName: "camera" })}${button({ label: "Quick add", action: "nutrition-open-add", value: "", variant: "secondary", iconName: "plus" })}<button class="text-button" data-action="nutrition-open-targets">Edit targets</button></div>
    </section>

    <div class="meal-slots">${MEAL_SLOTS.map(slot => mealSlotCard(slot, day, dateKey, {
      yesterdayHasSlot: Boolean((yesterdayDay?.entries || []).some(entry => entry.slot === slot && entry.status === "confirmed")),
    })).join("")}</div>

    <section class="card nutrition-honesty"><header>${icon("info")}<span><small>HOW THESE NUMBERS WORK</small><h2>Estimates, honestly labeled</h2></span></header>
      <p>${escapeHtml(NUTRITION_DISCLAIMER)}</p>
      <ul><li>Totals count confirmed entries only — drafts always count zero</li><li>Photo and text estimates are a deterministic founder demo, not computer vision</li><li>Targets are yours to set; FitCoach never prescribes a diet</li><li>Photos never leave this device and are never stored — only name and size metadata</li></ul>
    </section>
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
      <div class="demo-banner">${icon("info")}<p><b>Founder prototype estimate.</b> ${escapeHtml(ESTIMATOR_DISCLAIMER)}</p></div>
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
    eyebrow: "PHOTO ESTIMATE · FOUNDER DEMO",
    title: "Scan your food",
    body: `
      <div class="demo-banner">${icon("info")}<p><b>No vision provider is connected in this build.</b> ${escapeHtml(ESTIMATOR_DISCLAIMER)}</p></div>
      <p class="capture-copy">Take or choose a photo. It stays on this device, is never uploaded or stored, and the draft it creates counts zero until you confirm it.</p>
      <div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip ${value === slot ? "active" : ""}" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>
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
        <div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip ${value === slot ? "active" : ""}" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>
        <div class="portion-stepper" role="group" aria-label="Portion size"><span>Portion</span><button class="icon-only" data-action="nutrition-add-portion" data-value="-0.25" aria-label="Smaller portion">−</button><b>${fmtMultiplier(multiplier)} ×</b><button class="icon-only" data-action="nutrition-add-portion" data-value="0.25" aria-label="Larger portion">+</button><small>${escapeHtml(selected.servingLabel)}</small></div>
        <p class="counted-preview">Adds <b>${preview.toLocaleString()} kcal</b> · ${Math.round(selected.per.protein * multiplier)} P / ${Math.round(selected.per.carbs * multiplier)} C / ${Math.round(selected.per.fat * multiplier)} F</p>
      `,
      actions: button({ label: "Back", action: "nutrition-add-back", variant: "quiet" })
        + button({ label: `Add to ${MEAL_SLOT_LABELS[slot] || "meal"}`, action: "nutrition-add-confirm", variant: "primary", disabled: !slot }),
    };
  }
  const results = searchFoods(nutrition, modal.query || "");
  const showCustom = Boolean(modal.custom);
  return {
    eyebrow: "ADD FOOD",
    title: slot ? `Add to ${MEAL_SLOT_LABELS[slot]}` : "Add food",
    body: `
      ${slot ? "" : `<div class="candidate-row" role="group" aria-label="Meal slot"><span>Log to</span>${MEAL_SLOTS.map(value => `<button class="choice-chip" data-action="nutrition-capture-slot" data-value="${escapeHtml(value)}">${escapeHtml(MEAL_SLOT_LABELS[value])}</button>`).join("")}</div>`}
      <label class="field search-field"><span class="sr-only">Search foods</span>${icon("search")}<input id="nutrition-search" maxlength="80" placeholder="Search demo foods, recents, favorites…" value="${escapeHtml(modal.query || "")}"></label>
      ${showCustom ? `
      <div class="per-serving-grid custom-food-grid"><label><span>Name</span><input id="custom-name" maxlength="120" placeholder="e.g. Mom’s dal"></label><label><span>Serving label</span><input id="custom-serving" maxlength="80" placeholder="1 bowl"></label><label><span>kcal / serving</span><input id="custom-kcal" type="number" inputmode="numeric" min="0" max="5000"></label><label><span>Protein g</span><input id="custom-protein" type="number" inputmode="decimal" min="0" max="500" value="0"></label><label><span>Carbs g</span><input id="custom-carbs" type="number" inputmode="decimal" min="0" max="800" value="0"></label><label><span>Fat g</span><input id="custom-fat" type="number" inputmode="decimal" min="0" max="500" value="0"></label></div>
      ${button({ label: "Add custom food", action: "nutrition-add-custom", variant: "primary" })}` : `
      <div class="food-results">${results.length ? results.map((item, index) => `<button class="food-row" data-action="nutrition-pick-food" data-value="${index}"><span class="food-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.servingLabel)} · ${escapeHtml(item.origin === "library" ? "demo list" : item.origin)}${item.origin !== "library" ? ` · last ${fmtMultiplier(item.multiplier)}×` : ""}</small></span><span class="food-kcal"><b>${Math.round(item.per.calories)}</b><small>kcal</small></span></button>`).join("") : `<p class="meal-slot-empty">No match in the demo list. Create it as a custom food instead.</p>`}</div>
      <button class="text-button" data-action="nutrition-toggle-custom">Create a custom food</button>`}
    `,
    actions: button({ label: "Close", action: "close-modal", variant: "quiet" }),
  };
}

function entrySheet(modal, context) {
  const { state } = context;
  const entry = (state.nutrition.days[modal.dateKey]?.entries || []).find(item => item.id === modal.entryId);
  if (!entry) return null;
  const favorite = isFavoriteFood(state.nutrition, entry.name);
  return {
    eyebrow: "CONFIRMED ENTRY",
    title: entry.name,
    body: `
      <div class="portion-stepper" role="group" aria-label="Portion size"><span>Portion</span><button class="icon-only" data-action="nutrition-entry-portion" data-value="-0.25" aria-label="Smaller portion">−</button><b>${fmtMultiplier(entry.multiplier)} ×</b><button class="icon-only" data-action="nutrition-entry-portion" data-value="0.25" aria-label="Larger portion">+</button><small>${escapeHtml(entry.servingLabel)}</small></div>
      <p class="counted-preview">Counting <b>${kcalRound(entry.nutrients.calories)} kcal</b> · ${entry.nutrients.protein} P / ${entry.nutrients.carbs} C / ${entry.nutrients.fat} F</p>
      <div class="receipt-box"><span>${icon("check")}</span><p><b>${escapeHtml(SOURCE_LABELS[entry.source] || entry.source)}</b><small>${escapeHtml(entry.confirmedAt ? `Confirmed ${entry.confirmedAt.slice(0, 10)}` : `Logged ${entry.createdAt.slice(0, 10)}`)}${entry.photo ? ` · photo metadata ${escapeHtml(entry.photo.hash)} (image not stored)` : ""}</small></p></div>
      ${entry.estimate ? `<details class="assumption-box"><summary>Estimate receipt (${escapeHtml(entry.estimate.confidence)} confidence demo)</summary><ul><li>Provider: ${escapeHtml(entry.estimate.provider)}</li><li>Calorie range shown: ${fmtRange(entry.estimate.kcalRange)}</li>${entry.estimate.assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
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
