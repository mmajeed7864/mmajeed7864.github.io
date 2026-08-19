"use strict";

/**
 * FitCoach v0.3.3 legacy global override contract.
 *
 * The founder build still loads classic scripts in sequence. Earlier scripts define these
 * application entry points and v033-pages.js intentionally replaces them. Declaring the names
 * here makes those replacements valid even if v033-pages.js later enables strict mode; without
 * this contract, its bare assignments depend on sloppy-mode implicit globals and one seemingly
 * harmless strict-mode edit can take the app down during startup.
 *
 * `var` redeclaration is intentionally used because it does not overwrite functions already
 * installed by earlier classic scripts. It only guarantees that the global bindings exist.
 */
var renderToday;
var renderTrain;
var startWorkout;
var renderProgress;
var renderProfile;
var render;
var navigate;
