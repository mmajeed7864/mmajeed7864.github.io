import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInitialState } from "../v040/core/store.mjs";
import { buildPlan } from "../v040/domain/workouts.mjs";
import { EXERCISES, getExerciseById } from "../v040/data/exercise-library.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";

const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
const helperSource = app.slice(app.indexOf("function choiceGroups(root) {"), app.indexOf("function trapDialogFocus(event) {"));

// A small DOM adapter executes the production helpers without bootstrapping
// network clients, timers, storage, or a browser process in the unit suite.
class Element {
  constructor(tag, attributes = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5), value]));
    this.tabIndex = this.tagName === "BUTTON" ? 0 : -1;
    this.children = children;
    for (const child of children) child.parent = this;
  }
  get id() { return this.getAttribute("id") || ""; }
  get disabled() { return this.hasAttribute("disabled"); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  matches(selector) {
    return selector.split(",").some(part => {
      const value = part.trim();
      if (value === ":disabled") return this.disabled || Boolean(this.closest("fieldset[disabled]"));
      const tag = value.match(/^[a-z]+/iu)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      return [...value.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/gu)].every(([, name, expected]) => expected === undefined ? this.hasAttribute(name) : this.getAttribute(name) === expected);
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.matches(selector)) return node;
    return null;
  }
  contains(node) {
    for (let current = node; current; current = current.parent) if (current === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  focus(options) { this.document.activeElement = this; this.focusOptions = options; }
  click() { this.onClick?.(this); }
}

function choiceGroup({ role = "radiogroup", label = "Energy right now", action = "set-energy", field, selected = 1, disabled = [], hidden = [], count = 3, ...attributes } = {}) {
  return new Element("div", { role, "aria-label": label, ...attributes }, Array.from({ length: count }, (_, index) => new Element("button", {
    role: role === "tablist" ? "tab" : "radio",
    [role === "tablist" ? "aria-selected" : "aria-checked"]: String(index === selected),
    "data-action": action, "data-value": String(index), ...(field ? { "data-field": field } : {}),
    ...(disabled.includes(index) ? { disabled: "" } : {}), ...(hidden.includes(index) ? { hidden: "" } : {}),
  })));
}

function harness(groups = [choiceGroup()]) {
  const root = new Element("main", {}, groups);
  const document = { activeElement: null };
  const clicks = [];
  function attach(node) {
    node.document = document;
    node.onClick = button => {
      clicks.push([button.dataset.action, button.dataset.value]);
      const group = button.closest('[role="radiogroup"], [role="tablist"]');
      const attribute = group.getAttribute("role") === "tablist" ? "aria-selected" : "aria-checked";
      for (const peer of group.children) peer.setAttribute(attribute, String(peer === button));
    };
    node.children.forEach(attach);
  }
  attach(root);
  const sandbox = { document, getComputedStyle: group => ({ direction: group.getAttribute("dir") || "ltr" }) };
  runInNewContext(helperSource, sandbox);
  sandbox.syncChoiceTabStops(root);
  return {
    root, document, clicks, sandbox, attach,
    key(target, key, extra = {}) {
      const event = { target, key, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
      return { handled: sandbox.handleChoiceKeydown(event), event };
    },
  };
}

test("Home, Coach, Profile and onboarding radios expose one selected Tab stop", () => {
  const groups = [
    choiceGroup(),
    choiceGroup({ label: "Trainer tone", action: "set-tone", selected: 2 }),
    choiceGroup({ label: "Training days", action: "profile-number", field: "days", selected: 0 }),
    choiceGroup({ label: "Training goal", action: "onboarding-choice", field: "goal", selected: 2 }),
  ];
  harness(groups);
  for (const group of groups) {
    assert.equal(group.children.filter(button => button.tabIndex === 0).length, 1);
    assert.equal(group.children.find(button => button.tabIndex === 0).getAttribute("aria-checked"), "true");
    assert.ok(group.children.every(button => button.getAttribute("type") === "button"));
  }
});

test("unchecked groups start on the first enabled choice and Home activates it", () => {
  const group = choiceGroup({ selected: -1, disabled: [0] });
  const h = harness([group]);
  assert.deepEqual(group.children.map(button => button.tabIndex), [-1, 0, -1]);
  assert.equal(h.key(group.children[1], "Home").handled, true);
  assert.deepEqual(h.clicks, [["set-energy", "1"]]);
  assert.equal(group.children[1].getAttribute("aria-checked"), "true");
});

test("radio arrows wrap, Home and End jump, and all use existing action hooks", () => {
  const group = choiceGroup({ selected: 0 });
  const h = harness([group]);
  for (const [key, next] of [["ArrowRight", 1], ["ArrowDown", 2], ["ArrowRight", 0], ["ArrowLeft", 2], ["Home", 0], ["End", 2], ["ArrowUp", 1]]) {
    const current = h.document.activeElement || group.children[0];
    const result = h.key(current, key);
    assert.equal(result.event.prevented, true);
    assert.equal(h.document.activeElement, group.children[next]);
    assert.equal(group.children[next].getAttribute("aria-checked"), "true");
    assert.deepEqual(group.children.map(button => button.tabIndex), group.children.map((_, index) => index === next ? 0 : -1));
  }
  assert.equal(h.clicks.length, 7);
});

test("disabled, aria-disabled, hidden, and disabled-fieldset choices are skipped", () => {
  const group = choiceGroup({ selected: 0, disabled: [1], hidden: [2], count: 5 });
  group.children[3].setAttribute("aria-disabled", "true");
  const h = harness([group]);
  h.key(group.children[0], "ArrowRight");
  assert.equal(h.document.activeElement, group.children[4]);
  assert.deepEqual(h.clicks, [["set-energy", "4"]]);
  const fieldset = new Element("fieldset", { disabled: "" }, [group]);
  assert.equal(h.key(group.children[4], "Home").handled, false);
  assert.equal(fieldset.children[0], group);
});

test("native inputs, Enter, Space, Tab, Escape and modified keys retain browser behavior", () => {
  const group = choiceGroup();
  const input = new Element("input", { type: "number" });
  group.children.push(input); input.parent = group;
  const h = harness([group]);
  for (const key of ["Enter", " ", "Tab", "Escape"]) assert.equal(h.key(group.children[1], key).handled, false);
  for (const extra of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
    assert.equal(h.key(group.children[1], "ArrowRight", extra).handled, false);
  }
  assert.equal(h.key(input, "ArrowUp").handled, false);
  assert.equal(h.clicks.length, 0);
});

test("horizontal tabs preserve vertical scrolling, vertical tabs preserve horizontal keys", () => {
  const group = choiceGroup({ role: "tablist", label: "Train sections", action: "train-segment", selected: 0 });
  const h = harness([group]);
  assert.equal(h.key(group.children[0], "ArrowDown").handled, false);
  h.key(group.children[0], "ArrowRight");
  assert.equal(group.children[1].getAttribute("aria-selected"), "true");
  h.key(group.children[1], "End");
  assert.equal(h.document.activeElement, group.children[2]);
  group.setAttribute("aria-orientation", "vertical");
  assert.equal(h.key(group.children[2], "ArrowLeft").handled, false);
  h.key(group.children[2], "ArrowDown");
  assert.equal(h.document.activeElement, group.children[0]);
});

test("horizontal arrows respect right-to-left layouts", () => {
  const group = choiceGroup({ selected: 1, dir: "rtl" });
  const h = harness([group]);
  h.key(group.children[1], "ArrowRight");
  assert.equal(h.document.activeElement, group.children[0]);
  h.key(group.children[0], "ArrowLeft");
  assert.equal(h.document.activeElement, group.children[1]);
});

test("selection retains focus on the replacement control after synchronous rerender", () => {
  for (const [label, action, field] of [["Energy right now", "set-energy"], ["Trainer tone", "set-tone"], ["Training days", "profile-number", "days"], ["Training goal", "onboarding-choice", "goal"]]) {
    const group = choiceGroup({ label, action, field, selected: 0 });
    const h = harness([group]);
    const originalTarget = group.children[1];
    originalTarget.onClick = button => {
      const saved = h.sandbox.captureChoiceFocus(h.root);
      const replacement = choiceGroup({ label, action, field, selected: Number(button.dataset.value) });
      group.parent = null;
      h.root.children = [replacement]; replacement.parent = h.root; h.attach(replacement);
      h.document.activeElement = null;
      h.sandbox.syncChoiceTabStops(h.root);
      assert.equal(h.sandbox.restoreChoiceFocus(h.root, saved), true);
    };
    h.key(group.children[0], "ArrowRight");
    assert.notEqual(h.document.activeElement, originalTarget);
    assert.equal(h.document.activeElement, h.root.children[0].children[1]);
    assert.equal(h.document.activeElement.tabIndex, 0);
    assert.equal(h.document.activeElement.focusOptions.preventScroll, true);
  }
});

test("focus restoration cannot escape a modal into an inert or removed group", () => {
  const group = choiceGroup();
  const h = harness([group]);
  group.children[1].focus();
  const saved = h.sandbox.captureChoiceFocus(h.root);
  h.root.setAttribute("inert", "");
  assert.equal(h.sandbox.restoreChoiceFocus(h.root, saved), false);
  assert.equal(h.key(group.children[1], "ArrowRight").handled, false);
  h.root.children = [];
  assert.equal(h.sandbox.restoreChoiceFocus(h.root, saved), false);
});

test("every training tab controls a uniquely labelled panel with one active Tab stop", () => {
  const state = createInitialState("mo");
  const plan = buildPlan(state, EXERCISES);
  for (const selected of ["workout", "schedule", "exercises"]) {
    const html = renderTrainScreen({ state, plan, exerciseById: getExerciseById, exerciseLibrary: EXERCISES, filteredExercises: EXERCISES,
      ui: { trainSegment: selected, exerciseFilters: { query: "", muscle: "all", equipment: "all", favorites: false, page: 1 } } });
    assert.equal((html.match(/role="tab"/gu) || []).length, 3);
    assert.equal((html.match(/role="tabpanel"/gu) || []).length, 3);
    for (const value of ["workout", "schedule", "exercises"]) {
      assert.match(html, new RegExp(`id="train-tab-${value}" aria-controls="train-panel-${value}" aria-selected="${value === selected}" tabindex="${value === selected ? 0 : -1}"`, "u"));
      assert.match(html, new RegExp(`role="tabpanel" id="train-panel-${value}" aria-labelledby="train-tab-${value}" ${value === selected ? 'tabindex="0"' : "hidden"}`, "u"));
    }
  }
});

test("all render paths initialize roving focus and modal trapping excludes negative Tab stops", () => {
  assert.match(app, /function renderAppScreen\(\) \{\s*const choiceFocus = captureChoiceFocus\(dom\.stage\);/u);
  assert.match(app, /renderOnboarding\([\s\S]*?syncChoiceTabStops\(dom\.stage\);\s*restoreChoiceFocus\(dom\.stage, choiceFocus\);/u);
  assert.match(app, /function renderModalRoot\(\) \{\s*const choiceFocus = captureChoiceFocus\(dom\.modal\);/u);
  assert.match(app, /if \(handleChoiceKeydown\(event\)\) return;/u);
  assert.match(app, /node\.tabIndex >= 0/u);
});
