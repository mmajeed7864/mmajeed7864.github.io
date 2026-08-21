const makeTarget = (category, movementPattern, primaryMuscles, [id, name, equipment, difficulty]) => Object.freeze({
  id,
  name,
  category,
  movementPattern,
  primaryMuscles: Object.freeze(primaryMuscles),
  equipment: Object.freeze(equipment),
  difficulty,
  guideStatus: "premium_motion_needed",
  plannedGuide: "animated-start-finish-plus-cues",
});

const TARGET_GROUPS = Object.freeze([
  Object.freeze({
    category: "Squat",
    movementPattern: "squat",
    primaryMuscles: Object.freeze(["quads", "glutes"]),
    items: Object.freeze([
      ["barbell-back-squat", "Barbell Back Squat", ["barbell", "squat rack", "plates"], "intermediate"],
      ["front-squat", "Front Squat", ["barbell", "squat rack", "plates"], "advanced"],
      ["goblet-squat", "Goblet Squat", ["dumbbell", "kettlebell"], "beginner"],
      ["box-squat", "Box Squat", ["box", "barbell"], "beginner"],
      ["hack-squat", "Hack Squat", ["machine"], "intermediate"],
      ["leg-press", "Leg Press", ["machine"], "beginner"],
      ["heel-elevated-squat", "Heel-Elevated Squat", ["dumbbell", "wedge"], "intermediate"],
      ["tempo-air-squat", "Tempo Air Squat", ["bodyweight"], "beginner"],
      ["wall-sit", "Wall Sit", ["bodyweight"], "beginner"],
      ["step-up", "Step-Up", ["box", "dumbbell"], "beginner"],
    ]),
  }),
  Object.freeze({
    category: "Hinge",
    movementPattern: "hinge",
    primaryMuscles: Object.freeze(["hamstrings", "glutes"]),
    items: Object.freeze([
      ["conventional-deadlift", "Conventional Deadlift", ["barbell", "plates"], "advanced"],
      ["trap-bar-deadlift", "Trap-Bar Deadlift", ["trap bar", "plates"], "intermediate"],
      ["romanian-deadlift", "Romanian Deadlift", ["barbell", "dumbbell"], "intermediate"],
      ["single-leg-romanian-deadlift", "Single-Leg Romanian Deadlift", ["dumbbell"], "intermediate"],
      ["sumo-deadlift", "Sumo Deadlift", ["barbell", "plates"], "advanced"],
      ["kettlebell-swing", "Kettlebell Swing", ["kettlebell"], "intermediate"],
      ["hip-thrust", "Hip Thrust", ["barbell", "bench"], "intermediate"],
      ["cable-pull-through", "Cable Pull-Through", ["cable"], "beginner"],
      ["good-morning", "Good Morning", ["barbell"], "advanced"],
      ["back-extension", "Back Extension", ["machine"], "beginner"],
    ]),
  }),
  Object.freeze({
    category: "Horizontal Push",
    movementPattern: "horizontal-push",
    primaryMuscles: Object.freeze(["chest", "triceps"]),
    items: Object.freeze([
      ["barbell-bench-press", "Barbell Bench Press", ["barbell", "bench", "plates"], "intermediate"],
      ["dumbbell-bench-press", "Dumbbell Bench Press", ["dumbbells", "bench"], "beginner"],
      ["incline-dumbbell-press", "Incline Dumbbell Press", ["dumbbells", "bench"], "intermediate"],
      ["push-up", "Push-Up", ["bodyweight"], "beginner"],
      ["deficit-push-up", "Deficit Push-Up", ["bodyweight", "handles"], "intermediate"],
      ["machine-chest-press", "Machine Chest Press", ["machine"], "beginner"],
      ["cable-chest-fly", "Cable Chest Fly", ["cable"], "intermediate"],
      ["pec-deck", "Pec Deck", ["machine"], "beginner"],
      ["close-grip-bench-press", "Close-Grip Bench Press", ["barbell", "bench"], "advanced"],
      ["parallel-bar-dip", "Parallel-Bar Dip", ["dip station"], "advanced"],
    ]),
  }),
  Object.freeze({
    category: "Horizontal Pull",
    movementPattern: "horizontal-pull",
    primaryMuscles: Object.freeze(["back", "rear delts"]),
    items: Object.freeze([
      ["seated-cable-row", "Seated Cable Row", ["cable"], "beginner"],
      ["chest-supported-row", "Chest-Supported Row", ["dumbbells", "bench"], "beginner"],
      ["bent-over-row", "Bent-Over Row", ["barbell"], "intermediate"],
      ["t-bar-row", "T-Bar Row", ["machine", "barbell"], "intermediate"],
      ["inverted-row", "Inverted Row", ["bar", "rings"], "beginner"],
      ["machine-row", "Machine Row", ["machine"], "beginner"],
      ["cable-face-pull", "Cable Face Pull", ["cable"], "beginner"],
      ["rear-delt-fly", "Rear Delt Fly", ["dumbbells", "machine"], "beginner"],
      ["single-arm-cable-row", "Single-Arm Cable Row", ["cable"], "intermediate"],
      ["seal-row", "Seal Row", ["barbell", "bench"], "advanced"],
    ]),
  }),
  Object.freeze({
    category: "Vertical Push",
    movementPattern: "vertical-push",
    primaryMuscles: Object.freeze(["shoulders", "triceps"]),
    items: Object.freeze([
      ["standing-overhead-press", "Standing Overhead Press", ["barbell"], "intermediate"],
      ["dumbbell-shoulder-press", "Dumbbell Shoulder Press", ["dumbbells", "bench"], "beginner"],
      ["landmine-press", "Landmine Press", ["barbell", "landmine"], "beginner"],
      ["arnold-press", "Arnold Press", ["dumbbells"], "intermediate"],
      ["machine-shoulder-press", "Machine Shoulder Press", ["machine"], "beginner"],
      ["push-press", "Push Press", ["barbell"], "advanced"],
      ["pike-push-up", "Pike Push-Up", ["bodyweight"], "intermediate"],
      ["handstand-hold", "Handstand Hold", ["wall", "bodyweight"], "advanced"],
      ["cable-lateral-raise", "Cable Lateral Raise", ["cable"], "beginner"],
      ["upright-row", "Upright Row", ["barbell", "dumbbell"], "intermediate"],
    ]),
  }),
  Object.freeze({
    category: "Vertical Pull",
    movementPattern: "vertical-pull",
    primaryMuscles: Object.freeze(["lats", "biceps"]),
    items: Object.freeze([
      ["pull-up", "Pull-Up", ["pull-up bar"], "advanced"],
      ["chin-up", "Chin-Up", ["pull-up bar"], "advanced"],
      ["assisted-pull-up", "Assisted Pull-Up", ["machine"], "beginner"],
      ["lat-pulldown", "Lat Pulldown", ["cable"], "beginner"],
      ["neutral-grip-pulldown", "Neutral-Grip Pulldown", ["cable"], "beginner"],
      ["straight-arm-pulldown", "Straight-Arm Pulldown", ["cable"], "intermediate"],
      ["cable-pullover", "Cable Pullover", ["cable"], "intermediate"],
      ["band-pulldown", "Band Pulldown", ["resistance band"], "beginner"],
      ["machine-pulldown", "Machine Pulldown", ["machine"], "beginner"],
      ["scapular-pull-up", "Scapular Pull-Up", ["pull-up bar"], "intermediate"],
    ]),
  }),
  Object.freeze({
    category: "Single-Leg",
    movementPattern: "lunge",
    primaryMuscles: Object.freeze(["quads", "glutes"]),
    items: Object.freeze([
      ["reverse-lunge", "Reverse Lunge", ["bodyweight", "dumbbells"], "beginner"],
      ["walking-lunge", "Walking Lunge", ["bodyweight", "dumbbells"], "beginner"],
      ["lateral-lunge", "Lateral Lunge", ["bodyweight", "dumbbells"], "intermediate"],
      ["curtsy-lunge", "Curtsy Lunge", ["bodyweight"], "beginner"],
      ["step-down", "Step-Down", ["box"], "beginner"],
      ["bulgarian-split-squat", "Bulgarian Split Squat", ["bench", "dumbbells"], "intermediate"],
      ["front-foot-elevated-split-squat", "Front-Foot-Elevated Split Squat", ["box", "dumbbells"], "intermediate"],
      ["cossack-squat", "Cossack Squat", ["bodyweight"], "advanced"],
      ["sled-push", "Sled Push", ["sled"], "intermediate"],
      ["sled-pull", "Sled Pull", ["sled"], "intermediate"],
    ]),
  }),
  Object.freeze({
    category: "Core",
    movementPattern: "core",
    primaryMuscles: Object.freeze(["core"]),
    items: Object.freeze([
      ["front-plank", "Front Plank", ["bodyweight"], "beginner"],
      ["side-plank", "Side Plank", ["bodyweight"], "beginner"],
      ["dead-bug", "Dead Bug", ["bodyweight"], "beginner"],
      ["bird-dog", "Bird Dog", ["bodyweight"], "beginner"],
      ["pallof-press", "Pallof Press", ["cable", "resistance band"], "beginner"],
      ["hanging-knee-raise", "Hanging Knee Raise", ["pull-up bar"], "intermediate"],
      ["cable-crunch", "Cable Crunch", ["cable"], "intermediate"],
      ["ab-wheel-rollout", "Ab Wheel Rollout", ["ab wheel"], "advanced"],
      ["mountain-climber", "Mountain Climber", ["bodyweight"], "beginner"],
      ["hollow-body-hold", "Hollow Body Hold", ["bodyweight"], "intermediate"],
    ]),
  }),
  Object.freeze({
    category: "Arms and Delts",
    movementPattern: "accessory",
    primaryMuscles: Object.freeze(["arms", "shoulders"]),
    items: Object.freeze([
      ["dumbbell-curl", "Dumbbell Curl", ["dumbbells"], "beginner"],
      ["hammer-curl", "Hammer Curl", ["dumbbells"], "beginner"],
      ["preacher-curl", "Preacher Curl", ["bench", "barbell"], "intermediate"],
      ["cable-curl", "Cable Curl", ["cable"], "beginner"],
      ["triceps-pushdown", "Triceps Pushdown", ["cable"], "beginner"],
      ["overhead-triceps-extension", "Overhead Triceps Extension", ["dumbbell", "cable"], "beginner"],
      ["skull-crusher", "Skull Crusher", ["barbell", "bench"], "intermediate"],
      ["dumbbell-lateral-raise", "Dumbbell Lateral Raise", ["dumbbells"], "beginner"],
      ["front-raise", "Front Raise", ["dumbbells", "plate"], "beginner"],
      ["farmer-carry", "Farmer Carry", ["dumbbells", "kettlebells"], "beginner"],
    ]),
  }),
  Object.freeze({
    category: "Conditioning and Mobility",
    movementPattern: "conditioning",
    primaryMuscles: Object.freeze(["full body"]),
    items: Object.freeze([
      ["marching-jacks", "Marching Jacks", ["bodyweight"], "beginner"],
      ["jump-rope", "Jump Rope", ["jump rope"], "intermediate"],
      ["easy-rower", "Easy Rower", ["rower"], "beginner"],
      ["easy-bike", "Easy Bike", ["bike"], "beginner"],
      ["incline-walk", "Incline Walk", ["treadmill"], "beginner"],
      ["battle-ropes", "Battle Ropes", ["battle ropes"], "intermediate"],
      ["bear-crawl", "Bear Crawl", ["bodyweight"], "intermediate"],
      ["medicine-ball-slam", "Medicine Ball Slam", ["medicine ball"], "intermediate"],
      ["hip-flexor-mobilization", "Hip Flexor Mobilization", ["bodyweight"], "beginner"],
      ["thoracic-rotation", "Thoracic Rotation", ["bodyweight"], "beginner"],
    ]),
  }),
]);

export const EXERCISE_EXPANSION_TARGETS = Object.freeze(
  TARGET_GROUPS.flatMap(group => group.items.map(item => makeTarget(group.category, group.movementPattern, group.primaryMuscles, item)))
);

export const EXERCISE_EXPANSION_CATEGORIES = Object.freeze(
  TARGET_GROUPS.map(group => Object.freeze({
    category: group.category,
    movementPattern: group.movementPattern,
    count: group.items.length,
  }))
);

export function validateExerciseExpansionTargets(targets = EXERCISE_EXPANSION_TARGETS) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(targets)) errors.push("targets must be an array");
  for (const target of Array.isArray(targets) ? targets : []) {
    if (!target || typeof target !== "object") {
      errors.push("target must be an object");
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.id || "")) errors.push(`${target.name || "target"} has an invalid id`);
    if (ids.has(target.id)) errors.push(`${target.id} is duplicated`);
    ids.add(target.id);
    if (!target.name || target.name.length > 80) errors.push(`${target.id} needs a readable name`);
    if (!Array.isArray(target.equipment) || !target.equipment.length) errors.push(`${target.id} needs equipment`);
    if (!Array.isArray(target.primaryMuscles) || !target.primaryMuscles.length) errors.push(`${target.id} needs primary muscles`);
    if (target.guideStatus !== "premium_motion_needed") errors.push(`${target.id} must stay out of the live guide library until premium media exists`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
