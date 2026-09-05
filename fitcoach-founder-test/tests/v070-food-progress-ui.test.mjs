import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { addEntryToDay, createFoodEntry } from "../v040/domain/nutrition.mjs";
import { renderNutritionScreen, renderNutritionModalContent } from "../v040/ui/nutrition-screen.mjs";
import { renderProgressScreen } from "../v040/ui/progress-screen.mjs";

const NOW = new Date("2026-09-04T15:00:00Z");
const DATE = "2026-09-04";
const food = { name: "Oats & berries", servingLabel: "1 bowl", per: { calories: 300, protein: 20, carbs: 40, fat: 8 }, multiplier: 1 };
const nutrition = state => renderNutritionScreen({state, ui:{nutritionDate:DATE}, now:NOW});
const workout = { id:"session-1", completedAt:DATE, durationMinutes:30, planLabel:"Strength A", units:"lb", exercises:[{exerciseId:"goblet-squat",snapshot:{name:"Goblet Squat",primaryMuscles:["quads"]},sets:[{done:true,weight:30,reps:10,unit:"lb",rpe:8}]}] };

test("editorial food ledger replaces the ring without changing confirmed counts or review boundaries", () => {
  const state=createInitialState("mo",NOW);
  addEntryToDay(state.nutrition,DATE,createFoodEntry({slot:"breakfast",source:"manual",food,now:NOW}));
  state.nutrition.days[DATE].entries.push({id:"draft-1",slot:"lunch",name:"Unreviewed lunch",status:"draft",source:"text_estimate",servingLabel:"1 plate",multiplier:1,nutrients:{calories:9999},estimate:{kcalRange:[450,650]}});
  const before=JSON.stringify(state);
  const html=nutrition(state);
  assert.match(html,/fuel-v070/u);
  assert.match(html,/class="fuel-ledger" role="img" aria-label="300 of 2,200 target calories confirmed"/u);
  assert.match(html,/class="fuel-ledger-meter" aria-hidden="true"><span style="width:13\.64%"/u);
  assert.doesNotMatch(html,/calorie-ring|fuel-ring|9,999/u);
  assert.match(html,/1,900/u);
  assert.match(html,/data-action="nutrition-first-draft"/u);
  assert.match(html,/DRAFT · counts 0/u);
  assert.match(html,/>1 food logged</u);
  assert.equal(JSON.stringify(state),before);
});

test("food journal keeps each meal, quick-repeat index, and source/portion review action", () => {
  const state=createInitialState("mo",NOW);
  state.nutrition.favorites=[food];state.nutrition.recents=[food,{...food,name:"Rice bowl"}];
  const html=nutrition(state);
  assert.equal((html.match(/class="fuel-meal-number"/gu)||[]).length,4);
  for(const slot of ["breakfast","lunch","dinner","snacks"])assert.ok(html.includes(`data-action="nutrition-open-add" data-value="${slot}"`));
  assert.match(html,/data-focus="barcode"/u);
  assert.match(html,/data-kind="favorite" data-value="0"/u);
  assert.match(html,/data-kind="recent" data-value="1"/u);
  assert.ok(html.indexOf("nutrition-open-capture")>html.indexOf('<details class="fuel-notes">'));
  const sheet=renderNutritionModalContent({type:"nutrition-add",slot:"lunch",selected:food},{state});
  assert.match(sheet.body,/data-action="nutrition-add-portion"/u);
  assert.match(sheet.actions,/data-action="nutrition-add-confirm"/u);
  assert.doesNotMatch(sheet.actions,/disabled/u);
});

test("food logging is the first dashboard action, before its energy ledger", () => {
  const html=nutrition(createInitialState("mo",NOW));
  const date=html.indexOf('class="fuel-date-row"');
  const actions=html.indexOf('class="fuel-add-actions"');
  const ledger=html.indexOf('class="fuel-ledger"');
  assert.ok(date>=0 && actions>date && ledger>actions);
  assert.equal((html.match(/class="fuel-add-actions"/gu)||[]).length,1);
  const controls=html.slice(actions,ledger);
  assert.match(controls,/class="fuel-search-food" data-action="nutrition-open-add" data-value=""/u);
  assert.match(controls,/class="fuel-barcode" data-action="nutrition-open-add" data-value="" data-focus="barcode"/u);
});

test("energy ledger remains bounded without pretending an over-target day is a failure", () => {
  const state=createInitialState("mo",NOW);
  addEntryToDay(state.nutrition,DATE,createFoodEntry({slot:"dinner",source:"manual",food:{...food,per:{...food.per,calories:2500}},now:NOW}));
  const html=nutrition(state);
  assert.match(html,/style="width:100\.00%"/u);
  assert.match(html,/kcal above target/u);
  assert.match(html,/One day is part of a bigger picture\./u);
  assert.doesNotMatch(html,/failed|cheat day|bad food/iu);
});

test("experienced training journal links to real calendar, strength, history and private photos", () => {
  const state=createInitialState("mo",NOW);state.sessions=[workout];
  state.socialDrafts=[{id:"private-1",createdAt:NOW.toISOString(),caption:"My own <story>"}];
  const before=JSON.stringify(state);
  const html=renderProgressScreen({state,now:NOW});
  assert.match(html,/progress-v070/u);
  assert.match(html,/The work\.<br>The progress\./u);
  for(const section of ["calendar","strength","history","studio"]){assert.ok(html.includes(`href="#journal-${section}"`));assert.equal((html.match(new RegExp(`id="journal-${section}"`,"gu"))||[]).length,1);}
  assert.match(html,/aria-label="1 of 3 planned weekly workouts completed"/u);
  assert.doesNotMatch(html,/goal-ring/u);
  assert.match(html,/1 completed session overall/u);
  assert.match(html,/<h3>Strength A<\/h3>/u);
  assert.match(html,/data-action="delete-community-draft" data-value="private-1"/u);
  assert.match(html,/My own &lt;story&gt;/u);
  assert.match(html,/are not published to a public feed/u);
  assert.equal(JSON.stringify(state),before);
});

test("first-day journal treats its session-one graphic as decoration, not an earned result", () => {
  const html=renderProgressScreen({state:createInitialState("mo",NOW),now:NOW});
  assert.match(html,/class="progress-v7-first-marker" aria-hidden="true"/u);
  assert.match(html,/Your baseline starts with one session\./u);
  assert.match(html,/data-action="route" data-value="train"/u);
  assert.match(html,/data-action="open-community-draft"/u);
  assert.doesNotMatch(html,/is-earned|workouts this week|planned weekly workouts completed|href="#journal-history"/u);
});

test("editorial route styles supply both themes, flat panels, usable controls and mobile input sizes", () => {
  const foodCss=readFileSync(new URL("../v040/ui/nutrition-v070.css",import.meta.url),"utf8");
  const progressCss=readFileSync(new URL("../v040/ui/progress-v070.css",import.meta.url),"utf8");
  for(const css of [foodCss,progressCss]){
    assert.match(css,/var\(--font-display/u);
    assert.match(css,/html\[data-theme="dark"\]/u);
    assert.match(css,/@media \(prefers-reduced-motion:reduce\)/u);
    assert.match(css,/min-height:44px/u);
  }
  assert.match(foodCss,/\.fuel-v070 \.fuel-meal \{[^}]*border-radius:0;[^}]*background:transparent;/u);
  assert.match(foodCss,/\.fuel-add-sheet \.provider-search-controls input \{[^}]*font-size:16px;/u);
  assert.match(foodCss,/\.fuel-add-sheet \.fuel-barcode-lookup input \{[^}]*font-size:16px;/u);
  assert.match(foodCss,/@media \(max-width:359px\) \{[^\n]*\.fuel-v070 \.fuel-page-heading h1 \{ font-size:56px;/u);
  assert.match(progressCss,/\.progress-v070 \.progress-v6-panel \{[^}]*border-radius:0;[^}]*background:transparent;/u);
});
