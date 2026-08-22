import { EXERCISE_SCHEMA_VERSION } from "./exercise-schema.mjs";
import { getExerciseMedia } from "./exercise-media-manifest.mjs";
import { EXERCISE_EXPANSION_TARGETS } from "./exercise-expansion-targets.mjs";

const DATA_LICENSE = "FitCoach project-authored exercise copy; all rights reserved by the FitCoach project owner.";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exercise(definition) {
  const { media = getExerciseMedia(definition.id), guideStatus = "visual-guide", ...record } = definition;
  return deepFreeze({
    schemaVersion: EXERCISE_SCHEMA_VERSION,
    ...record,
    guideStatus,
    media,
    license: DATA_LICENSE,
    attribution: null,
  });
}
/**
 * A conservative starter catalogue for ordinary healthy adults. The records
 * describe exercise presentation and logging metadata; they do not diagnose,
 * evaluate technique, or authorize an automatic plan change.
 */
const PREMIUM_GUIDE_EXERCISES = Object.freeze([
  exercise({
    id: "air-squat",
    name: "Air Squat",
    aliases: ["bodyweight squat", "unweighted squat"],
    movementPattern: "squat",
    equipment: ["none"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings", "calves", "trunk"],
    difficulty: "beginner",
    instructions: "Sit the hips down between the feet, then stand tall without adding external load.",
    setupSteps: ["Stand with a comfortable foot width.", "Keep the whole foot in contact with the floor."],
    executionSteps: ["Bend the knees and hips together.", "Lower only as far as you can control.", "Press through the floor to stand."],
    breathing: "Breathe in before lowering and breathe out as you stand.",
    keyCues: ["Keep the feet planted.", "Let the knees travel in the same general direction as the toes."],
    commonMistakes: ["Rushing the change of direction.", "Shifting onto only the toes or heels."],
    safetyNotes: ["Use a stable stance and stop the set if the movement is painful or you feel unwell."],
    alternatives: ["goblet-squat", "reverse-lunge"],
    progressions: ["Add a pause near the bottom.", "Use the goblet-squat variation."],
    regressions: ["Use a higher chair as a depth guide.", "Reduce the range of motion."],
    equipmentSubstitutions: [{ insteadOf: "none", use: "stable chair", adjustment: "Use it only as a light depth or balance reference." }],
  }),
  exercise({
    id: "goblet-squat",
    name: "Goblet Squat",
    aliases: ["front-held squat", "dumbbell goblet squat"],
    movementPattern: "squat",
    equipment: ["dumbbell", "kettlebell"],
    location: ["home", "gym"],
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings", "trunk", "upper back"],
    difficulty: "beginner",
    instructions: "Hold one weight close to the chest while squatting through a controlled range.",
    setupSteps: ["Hold one weight securely at chest height.", "Choose a stance that lets both feet remain planted."],
    executionSteps: ["Lower by bending the knees and hips.", "Keep the weight close to the torso.", "Stand without bouncing at the bottom."],
    breathing: "Breathe in before lowering and breathe out through the standing effort.",
    keyCues: ["Keep the load close.", "Move at a pace you can stop at any point."],
    commonMistakes: ["Letting the weight drift away from the chest.", "Choosing a load that changes the intended range."],
    safetyNotes: ["Use a weight you can pick up and return to the floor securely."],
    alternatives: ["air-squat", "reverse-lunge"],
    progressions: ["Add load in small steps.", "Add a controlled pause."],
    regressions: ["Use the air squat.", "Use a lighter object."],
    equipmentSubstitutions: [{ insteadOf: "dumbbell", use: "kettlebell or securely held household object", adjustment: "Keep the object close and verify the grip before starting." }],
  }),
  exercise({
    id: "hip-hinge",
    name: "Bodyweight Hip Hinge",
    aliases: ["hip hinge drill", "bodyweight good morning"],
    movementPattern: "hinge",
    equipment: ["none"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["back extensors", "trunk"],
    difficulty: "beginner",
    instructions: "Send the hips backward while the torso inclines, then return to a tall stance.",
    setupSteps: ["Stand tall with softly bent knees.", "Leave clear space behind you."],
    executionSteps: ["Reach the hips back without turning it into a deep squat.", "Pause at a controllable range.", "Bring the hips forward to stand."],
    breathing: "Breathe in before hinging and breathe out as you return to standing.",
    keyCues: ["Move the hips backward.", "Keep the neck comfortable and the movement controlled."],
    commonMistakes: ["Bending the knees until the exercise becomes a squat.", "Moving faster than the available control."],
    safetyNotes: ["Use a smaller range if you cannot hold a steady position; stop if the movement is painful."],
    alternatives: ["glute-bridge", "air-squat"],
    progressions: ["Hold a light weight close to the body.", "Slow the lowering phase."],
    regressions: ["Practice the hips-back motion toward a wall.", "Shorten the range."],
    equipmentSubstitutions: [{ insteadOf: "none", use: "wall", adjustment: "Use the wall as a light target for the hips, not as support." }],
  }),
  exercise({
    id: "glute-bridge",
    name: "Glute Bridge",
    aliases: ["floor bridge", "hip bridge"],
    movementPattern: "hinge",
    equipment: ["exercise mat", "none"],
    location: ["home", "gym"],
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "trunk"],
    difficulty: "beginner",
    instructions: "From a face-up position with bent knees, lift and lower the hips under control.",
    setupSteps: ["Lie on a clear floor space with knees bent.", "Place the feet where they feel stable and the hands at the sides."],
    executionSteps: ["Press the feet into the floor.", "Lift the hips to a comfortable height.", "Lower until the hips return gently to the floor."],
    breathing: "Breathe out during the lift and in during the controlled lower.",
    keyCues: ["Keep both feet steady.", "Finish each repetition without bouncing."],
    commonMistakes: ["Driving the hips higher than a comfortable range.", "Letting one foot shift between repetitions."],
    safetyNotes: ["Use a clear, non-slip surface and return to the floor if you feel unsteady."],
    alternatives: ["hip-hinge", "dead-bug"],
    progressions: ["Add a short hold at the top.", "Slow the lowering phase."],
    regressions: ["Use a smaller lift.", "Reset the feet between repetitions."],
    equipmentSubstitutions: [{ insteadOf: "exercise mat", use: "firm folded towel", adjustment: "Use only enough padding to stay stable on the floor." }],
  }),
  exercise({
    id: "incline-push-up",
    name: "Incline Push-Up",
    aliases: ["raised push-up", "bench push-up"],
    movementPattern: "horizontal-push",
    equipment: ["stable bench", "counter"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front shoulders", "trunk"],
    difficulty: "beginner",
    instructions: "Lower toward a stable raised surface and press away while keeping a long body position.",
    setupSteps: ["Confirm the surface cannot slide or tip.", "Place the hands comfortably apart and walk the feet back."],
    executionSteps: ["Bend the elbows and move the chest toward the surface.", "Pause before contact.", "Press the surface away to return."],
    breathing: "Breathe in while lowering and out while pressing away.",
    keyCues: ["Use a securely fixed surface.", "Move the shoulders and hips together."],
    commonMistakes: ["Using furniture that can move.", "Letting the hips arrive well before the shoulders."],
    safetyNotes: ["Do not use an unstable table, rolling chair, or loose object as the support."],
    alternatives: ["dumbbell-floor-press", "half-kneeling-press"],
    progressions: ["Use a lower stable surface.", "Add a slower lowering phase."],
    regressions: ["Use a higher stable surface.", "Reduce the number of repetitions."],
    equipmentSubstitutions: [{ insteadOf: "stable bench", use: "fixed counter or wall", adjustment: "A higher surface reduces the amount of body weight supported by the arms." }],
  }),
  exercise({
    id: "dumbbell-floor-press",
    name: "Dumbbell Floor Press",
    aliases: ["floor chest press", "db floor press"],
    movementPattern: "horizontal-push",
    equipment: ["dumbbells", "exercise mat"],
    location: ["home", "gym"],
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front shoulders"],
    difficulty: "beginner",
    instructions: "Press two dumbbells from a controlled floor position until the arms are extended, then lower.",
    setupSteps: ["Sit with the dumbbells close before lying back.", "Set the feet and upper arms securely on the floor."],
    executionSteps: ["Press both weights upward.", "Stop without forcefully locking the elbows.", "Lower until the upper arms return gently to the floor."],
    breathing: "Breathe out during the press and in during the lower.",
    keyCues: ["Keep the wrists stacked over the forearms.", "Touch the upper arms down softly."],
    commonMistakes: ["Dropping the upper arms into the floor.", "Starting with weights that are hard to position safely."],
    safetyNotes: ["Choose weights you can move into and out of the floor position without assistance."],
    alternatives: ["incline-push-up", "half-kneeling-press"],
    progressions: ["Add load in small steps.", "Add a brief pause with the upper arms on the floor."],
    regressions: ["Use lighter weights.", "Use the incline push-up."],
    equipmentSubstitutions: [{ insteadOf: "dumbbells", use: "resistance band secured behind the upper back", adjustment: "Keep the band away from the face and verify it is undamaged before use." }],
  }),
  exercise({
    id: "band-row",
    name: "Seated Resistance Band Row",
    aliases: ["band row", "seated band pull"],
    movementPattern: "horizontal-pull",
    equipment: ["resistance band"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["mid back", "lats"],
    secondaryMuscles: ["rear shoulders", "biceps"],
    difficulty: "beginner",
    instructions: "Draw a resistance band toward the torso, then return the arms forward under control.",
    setupSteps: ["Inspect the band and its anchor before each set.", "Sit tall with room to extend the arms."],
    executionSteps: ["Begin with light tension and arms forward.", "Pull the hands toward the lower ribs.", "Return slowly without letting the band snap back."],
    breathing: "Breathe out during the pull and in during the return.",
    keyCues: ["Keep the band path clear of the face.", "Finish the pull without leaning far backward."],
    commonMistakes: ["Using a questionable anchor point.", "Releasing tension abruptly."],
    safetyNotes: ["Replace a cracked or frayed band and use only an anchor intended for resistance-band exercise."],
    alternatives: ["one-arm-dumbbell-row", "band-lat-pulldown"],
    progressions: ["Use a slightly stronger band.", "Pause briefly with the hands near the torso."],
    regressions: ["Move closer to the anchor.", "Use a lighter band."],
    equipmentSubstitutions: [{ insteadOf: "resistance band", use: "one dumbbell", adjustment: "Use the supported one-arm dumbbell row instead of copying the band path." }],
  }),
  exercise({
    id: "one-arm-dumbbell-row",
    name: "Supported One-Arm Dumbbell Row",
    aliases: ["single-arm row", "one-arm db row"],
    movementPattern: "horizontal-pull",
    equipment: ["dumbbell", "stable bench"],
    location: ["home", "gym"],
    primaryMuscles: ["lats", "mid back"],
    secondaryMuscles: ["rear shoulders", "biceps", "forearms"],
    difficulty: "beginner",
    instructions: "Use one hand for support while drawing a dumbbell toward the torso and lowering it smoothly.",
    setupSteps: ["Place the support hand on a stable surface.", "Create a balanced stance with clear space for the dumbbell."],
    executionSteps: ["Let the working arm begin long.", "Draw the dumbbell toward the side of the torso.", "Lower until the arm is long again without swinging."],
    breathing: "Breathe out as the weight rises and in as it lowers.",
    keyCues: ["Keep pressure through the support hand.", "Move the weight without twisting to create momentum."],
    commonMistakes: ["Pulling by rapidly rotating the torso.", "Using a support surface that can move."],
    safetyNotes: ["Set the dumbbell down before changing sides if the stance becomes unstable."],
    alternatives: ["band-row", "band-lat-pulldown"],
    progressions: ["Add load in small steps.", "Slow the lowering phase."],
    regressions: ["Use a lighter weight.", "Use the seated band row."],
    equipmentSubstitutions: [{ insteadOf: "dumbbell", use: "loaded backpack with a secure handle", adjustment: "Confirm the contents cannot shift or fall out during the set." }],
  }),
  exercise({
    id: "half-kneeling-press",
    name: "Half-Kneeling One-Arm Press",
    aliases: ["kneeling shoulder press", "half-kneeling dumbbell press"],
    movementPattern: "vertical-push",
    equipment: ["dumbbell", "exercise mat"],
    location: ["home", "gym"],
    primaryMuscles: ["shoulders", "triceps"],
    secondaryMuscles: ["trunk", "upper chest"],
    difficulty: "intermediate",
    instructions: "From a steady half-kneeling stance, press one dumbbell overhead and return it to the shoulder.",
    setupSteps: ["Use padding under the down knee if wanted.", "Bring the weight to the shoulder before settling into position."],
    executionSteps: ["Press the dumbbell overhead without rushing.", "Pause in a controllable top position.", "Lower it to the shoulder before the next repetition."],
    breathing: "Breathe out during the press and in during the lower.",
    keyCues: ["Stay tall through the torso.", "Keep the movement path clear of the head."],
    commonMistakes: ["Leaning far away from the working arm.", "Starting with a weight that is difficult to position."],
    safetyNotes: ["Use a weight you can return to the shoulder and floor without losing balance."],
    alternatives: ["dumbbell-floor-press", "lateral-raise"],
    progressions: ["Add load in small steps.", "Use a slower lowering phase."],
    regressions: ["Use a lighter dumbbell.", "Perform the press seated with stable back support."],
    equipmentSubstitutions: [{ insteadOf: "dumbbell", use: "kettlebell", adjustment: "Use a secure grip and keep the bell in a comfortable rack position." }],
  }),
  exercise({
    id: "band-lat-pulldown",
    name: "Tall-Kneeling Band Pulldown",
    aliases: ["band lat pulldown", "kneeling pulldown"],
    movementPattern: "vertical-pull",
    equipment: ["resistance band", "overhead band anchor"],
    location: ["home", "gym"],
    primaryMuscles: ["lats", "upper back"],
    secondaryMuscles: ["biceps", "rear shoulders"],
    difficulty: "beginner",
    instructions: "Draw an overhead resistance band toward the upper chest, then let the arms rise under control.",
    setupSteps: ["Inspect the band and overhead anchor.", "Kneel far enough away to begin with light tension."],
    executionSteps: ["Start with arms reaching overhead.", "Pull the elbows down toward the sides.", "Return overhead slowly without releasing the band."],
    breathing: "Breathe out during the pull and in during the return.",
    keyCues: ["Keep the band clear of the face.", "Finish with the hands around upper-chest height, not behind the neck."],
    commonMistakes: ["Using an anchor that is not rated for exercise.", "Letting the band snap upward."],
    safetyNotes: ["Do not continue with a damaged band or uncertain anchor."],
    alternatives: ["band-row", "one-arm-dumbbell-row"],
    progressions: ["Use a slightly stronger band.", "Pause at the bottom of the pull."],
    regressions: ["Use a lighter band.", "Move closer to the anchor."],
    equipmentSubstitutions: [{ insteadOf: "overhead band anchor", use: "gym cable pulldown station", adjustment: "Use the station as designed and select a manageable starting load." }],
  }),
  exercise({
    id: "reverse-lunge",
    name: "Reverse Lunge",
    aliases: ["backward lunge", "step-back lunge"],
    movementPattern: "lunge",
    equipment: ["none"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["hamstrings", "calves", "trunk"],
    difficulty: "beginner",
    instructions: "Step one foot backward, lower through a controlled split stance, then return to standing.",
    setupSteps: ["Stand with space behind you.", "Use a stable support nearby if balance assistance is needed."],
    executionSteps: ["Step one foot backward.", "Lower both knees through a comfortable range.", "Push through the front foot to return and then change sides."],
    breathing: "Breathe in as you step and lower, then breathe out as you return.",
    keyCues: ["Land the back foot quietly.", "Keep the front foot planted throughout the repetition."],
    commonMistakes: ["Stepping onto an obstacle behind you.", "Moving faster than balance allows."],
    safetyNotes: ["Clear the floor first and use light fingertip support if needed."],
    alternatives: ["air-squat", "goblet-squat"],
    progressions: ["Hold light weights at the sides.", "Add a controlled pause near the bottom."],
    regressions: ["Reduce the step length and depth.", "Use the air squat."],
    equipmentSubstitutions: [{ insteadOf: "none", use: "stable rail or rack", adjustment: "Use it for light balance support without pulling the body through the repetition." }],
  }),
  exercise({
    id: "dumbbell-curl",
    name: "Standing Dumbbell Curl",
    aliases: ["biceps curl", "db curl"],
    movementPattern: "curl",
    equipment: ["dumbbells"],
    location: ["home", "gym"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    difficulty: "beginner",
    instructions: "Bend the elbows to raise two dumbbells, then lower them until the arms are long.",
    setupSteps: ["Stand with one dumbbell in each hand.", "Leave room beside the body for both weights."],
    executionSteps: ["Raise the weights by bending the elbows.", "Pause before the dumbbells reach the shoulders.", "Lower them under control."],
    breathing: "Breathe out while raising and in while lowering.",
    keyCues: ["Keep the elbows near the sides.", "Use a range that does not require swinging."],
    commonMistakes: ["Rocking the torso to move the weights.", "Dropping the weights through the lowering phase."],
    safetyNotes: ["Keep the floor around the feet clear and set both weights down securely after the set."],
    alternatives: ["band-row", "one-arm-dumbbell-row"],
    progressions: ["Add load in small steps.", "Alternate arms while keeping the same controlled pace."],
    regressions: ["Use lighter weights.", "Perform one arm at a time."],
    equipmentSubstitutions: [{ insteadOf: "dumbbells", use: "resistance band", adjustment: "Stand on the center of an intact band and keep the path clear of the face." }],
  }),
  exercise({
    id: "overhead-triceps-extension",
    name: "Overhead Dumbbell Triceps Extension",
    aliases: ["overhead extension", "two-hand triceps extension"],
    movementPattern: "triceps-extension",
    equipment: ["dumbbell"],
    location: ["home", "gym"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["shoulders", "forearms"],
    difficulty: "intermediate",
    instructions: "Hold one dumbbell securely, bend the elbows to lower it behind the head, then extend overhead.",
    setupSteps: ["Grip one end of the dumbbell with both hands.", "Bring it overhead only after confirming the grip."],
    executionSteps: ["Bend the elbows to lower the weight behind the head.", "Stop at a comfortable controllable range.", "Extend the elbows to raise the weight."],
    breathing: "Breathe in while lowering and out while extending.",
    keyCues: ["Keep a secure two-hand grip.", "Move slowly while the weight is outside your field of view."],
    commonMistakes: ["Using a loose grip.", "Choosing a load that cannot be returned overhead smoothly."],
    safetyNotes: ["Use a lighter option if you cannot position or lower the dumbbell securely."],
    alternatives: ["incline-push-up", "dumbbell-floor-press"],
    progressions: ["Add load in small steps.", "Slow the lowering phase."],
    regressions: ["Use a lighter weight.", "Use an intact resistance band anchored below the hands."],
    equipmentSubstitutions: [{ insteadOf: "dumbbell", use: "resistance band", adjustment: "Keep the band undamaged, securely positioned, and away from the face." }],
  }),
  exercise({
    id: "lateral-raise",
    name: "Dumbbell Lateral Raise",
    aliases: ["side raise", "shoulder lateral raise"],
    movementPattern: "lateral-raise",
    equipment: ["dumbbells"],
    location: ["home", "gym"],
    primaryMuscles: ["side shoulders"],
    secondaryMuscles: ["upper back", "forearms"],
    difficulty: "beginner",
    instructions: "Raise two light dumbbells out to the sides, then lower them at a steady pace.",
    setupSteps: ["Stand with one light dumbbell in each hand.", "Leave clear space to both sides."],
    executionSteps: ["Raise the arms out to the sides.", "Stop around shoulder height or earlier.", "Lower without dropping the weights."],
    breathing: "Breathe out while raising and in while lowering.",
    keyCues: ["Use light weights and a steady tempo.", "Lead the movement with the arms without shrugging rapidly."],
    commonMistakes: ["Using momentum to throw the weights upward.", "Lifting into another person or object nearby."],
    safetyNotes: ["Check the full arm span for clearance before starting."],
    alternatives: ["half-kneeling-press", "dumbbell-floor-press"],
    progressions: ["Add a brief pause near the top.", "Add load only in small steps."],
    regressions: ["Use lighter weights.", "Raise one arm at a time."],
    equipmentSubstitutions: [{ insteadOf: "dumbbells", use: "light resistance band", adjustment: "Stand securely on the band and use a tension that allows a smooth path." }],
  }),
  exercise({
    id: "dead-bug",
    name: "Dead Bug",
    aliases: ["opposite arm leg lower", "supine dead bug"],
    movementPattern: "core",
    equipment: ["exercise mat", "none"],
    location: ["home", "gym"],
    primaryMuscles: ["trunk"],
    secondaryMuscles: ["hip flexors", "shoulders"],
    difficulty: "beginner",
    instructions: "From a face-up tabletop position, extend one arm and the opposite leg, then return and switch sides.",
    setupSteps: ["Lie on a clear floor space.", "Bring the arms up and bend the hips and knees to a comfortable tabletop position."],
    executionSteps: ["Slowly extend one arm and the opposite leg.", "Stop before losing a steady torso position.", "Return to the start and alternate sides."],
    breathing: "Breathe out during each extension and in as the limbs return.",
    keyCues: ["Use a range you can control.", "Move opposite arm and leg together."],
    commonMistakes: ["Extending farther than the available control.", "Rushing the switch between sides."],
    safetyNotes: ["Shorten the reach or return to the start if the position becomes uncomfortable."],
    alternatives: ["glute-bridge", "marching-jacks"],
    progressions: ["Extend closer to the floor without touching down.", "Slow each extension."],
    regressions: ["Move only the legs or only the arms.", "Keep the heel closer to the body."],
    equipmentSubstitutions: [{ insteadOf: "exercise mat", use: "firm folded towel", adjustment: "Use minimal padding so the floor position stays stable." }],
  }),
  exercise({
    id: "marching-jacks",
    name: "Marching Jacks",
    aliases: ["low-impact jumping jack", "marching jack warm-up"],
    movementPattern: "cardio-warm-up",
    equipment: ["none"],
    location: ["home", "gym", "outdoors"],
    primaryMuscles: ["hip flexors", "shoulders"],
    secondaryMuscles: ["quadriceps", "calves", "trunk"],
    difficulty: "beginner",
    instructions: "Alternate a gentle knee lift while both arms travel overhead and back to the sides.",
    setupSteps: ["Stand in a clear area with room overhead.", "Begin with the feet under the hips and arms at the sides."],
    executionSteps: ["Lift one knee while raising both arms.", "Return the foot and arms quietly.", "Alternate sides at a conversational pace."],
    breathing: "Breathe continuously; avoid holding the breath during the sequence.",
    keyCues: ["Land each step quietly.", "Choose an arm height and knee height that feel controllable."],
    commonMistakes: ["Moving too fast for the available space.", "Reaching into a low ceiling or nearby object."],
    safetyNotes: ["Use a clear, non-slip area and pause if you feel unsteady or unwell."],
    alternatives: ["air-squat", "reverse-lunge"],
    progressions: ["Increase the pace gradually.", "Use a larger but still controlled arm path."],
    regressions: ["Keep the arms below shoulder height.", "Tap one foot sideways instead of lifting the knee."],
    equipmentSubstitutions: [{ insteadOf: "none", use: "stable wall", adjustment: "Use light fingertip contact if balance support is useful." }],
  }),
]);

const STRUCTURED_GYM_EXCLUSIONS = new Set([
  "tempo-air-squat",
  "wall-sit",
  "pike-push-up",
  "handstand-hold",
  "band-pulldown",
  "curtsy-lunge",
  "cossack-squat",
  "front-plank",
  "side-plank",
  "mountain-climber",
]);

const PATTERN_GUIDE = Object.freeze({
  squat: Object.freeze({
    setup: "Set the load and support points so the whole repetition can stay controlled.",
    execution: "Lower and stand through a range you can repeat without rushing the change of direction.",
    cue: "Keep pressure balanced through the feet and keep the load path predictable.",
  }),
  hinge: Object.freeze({
    setup: "Set the load close to the body and make sure the floor space is clear before the first rep.",
    execution: "Move from the hips with a steady torso position, then return the load under control.",
    cue: "Keep the load close and stop each repetition before control changes.",
  }),
  "horizontal-push": Object.freeze({
    setup: "Adjust the bench, machine, or handles before loading the movement.",
    execution: "Press through a smooth path, pause briefly in control, then return without dropping the load.",
    cue: "Keep the wrists and elbows in a position you can control throughout the set.",
  }),
  "horizontal-pull": Object.freeze({
    setup: "Set the seat, chest support, or stance so the first pull starts from a stable position.",
    execution: "Draw the handle or load toward the torso, then return it slowly without using momentum.",
    cue: "Let the torso stay steady while the working arm path stays clear.",
  }),
  "vertical-push": Object.freeze({
    setup: "Set the seat, rack height, or stance before bringing the load into the start position.",
    execution: "Press upward with a clear path, then bring the load back to the start under control.",
    cue: "Use a load you can return safely to the rack, shoulder, or support.",
  }),
  "vertical-pull": Object.freeze({
    setup: "Set the cable, assistance, or grip before creating tension.",
    execution: "Pull through a smooth path and return the handle or body position without a sudden release.",
    cue: "Keep the moving handle and cable path clear of the face.",
  }),
  lunge: Object.freeze({
    setup: "Choose a clear lane and a stable support point if balance assistance is useful.",
    execution: "Step or lower into a controllable split stance, then return to a balanced standing position.",
    cue: "Keep each foot planted long enough to control the return.",
  }),
  core: Object.freeze({
    setup: "Set up on a clear surface or machine with a range you can control without rushing.",
    execution: "Move smoothly through the chosen range, reset as needed, and avoid using momentum.",
    cue: "Keep the working range controlled rather than chasing a larger range.",
  }),
  accessory: Object.freeze({
    setup: "Choose a manageable starting load and a stable position before the first repetition.",
    execution: "Use a smooth repetition path, pause in control, and lower without swinging the load.",
    cue: "Keep the target area doing the work instead of adding momentum.",
  }),
  conditioning: Object.freeze({
    setup: "Set the resistance and clear the training area before starting the interval or repetition.",
    execution: "Begin at a pace you can control and adjust or stop if the movement becomes unsteady.",
    cue: "Keep the effort repeatable; the goal is controlled work, not a rushed finish.",
  }),
});

const ALTERNATIVE_BY_PATTERN = Object.freeze({
  squat: "goblet-squat",
  hinge: "hip-hinge",
  "horizontal-push": "dumbbell-floor-press",
  "horizontal-pull": "one-arm-dumbbell-row",
  "vertical-push": "half-kneeling-press",
  "vertical-pull": "band-lat-pulldown",
  lunge: "reverse-lunge",
  core: "dead-bug",
  accessory: "dumbbell-curl",
  conditioning: "marching-jacks",
});

function structuredGymExercise(target) {
  const guide = PATTERN_GUIDE[target.movementPattern] || PATTERN_GUIDE.accessory;
  const alternative = ALTERNATIVE_BY_PATTERN[target.movementPattern] || "air-squat";
  const isHomeCompatible = target.equipment.every(item => ["bodyweight", "dumbbell", "dumbbells", "kettlebell", "kettlebells", "resistance band"].includes(item));
  const equipmentLabel = target.equipment.join(" · ");
  return exercise({
    id: target.id,
    name: target.name,
    aliases: [target.name.toLowerCase(), ...target.name.toLowerCase().split(/[- ]+/).filter(word => word.length > 3)],
    movementPattern: target.movementPattern,
    equipment: [...target.equipment],
    location: isHomeCompatible ? ["gym", "home"] : ["gym"],
    primaryMuscles: [...target.primaryMuscles],
    secondaryMuscles: ["supporting musculature"],
    difficulty: target.difficulty,
    guideStatus: "written-guide",
    media: [],
    instructions: `${target.name} has a structured FitCoach setup and cue guide for use with ${equipmentLabel}.`,
    setupSteps: [guide.setup, `Check that the ${equipmentLabel} setup is stable and ready before adding working load.`],
    executionSteps: [guide.execution, "Finish or stop the set while the movement remains controlled."],
    breathing: "Use a steady breath pattern that does not make the repetition rushed or unstable.",
    keyCues: [guide.cue, "Choose a range and load you can control for every planned repetition."],
    commonMistakes: ["Starting before the equipment setup is stable.", "Adding speed or load after control changes."],
    safetyNotes: ["This guide is educational, not form assessment. Stop the set if the movement is painful or you feel unwell."],
    alternatives: [alternative],
    progressions: ["Add a small amount of load only after repeatable, controlled sets."],
    regressions: [`Use ${alternative.replaceAll("-", " ")} or reduce the load and range.`],
    equipmentSubstitutions: [{ insteadOf: target.equipment[0], use: "the listed exercise alternative", adjustment: "Choose the alternative only if it matches your available equipment and can be done with control." }],
  });
}

const starterIds = new Set(PREMIUM_GUIDE_EXERCISES.map(item => item.id));
const structuredGymExercises = EXERCISE_EXPANSION_TARGETS
  .filter(target => !starterIds.has(target.id) && !STRUCTURED_GYM_EXCLUSIONS.has(target.id))
  .map(structuredGymExercise);

/**
 * One hundred real, filterable movements. Sixteen have project-authored visual
 * guides today; the other gym-focused records deliberately use written setup
 * and cue guides until their commissioned motion media is ready.
 */
export const EXERCISES = Object.freeze([...PREMIUM_GUIDE_EXERCISES, ...structuredGymExercises]);

const EXERCISE_BY_ID = new Map(EXERCISES.map((item) => [item.id, item]));

/** @param {string} id */
export function getExerciseById(id) {
  return EXERCISE_BY_ID.get(id) || null;
}

/**
 * Deterministic catalogue filtering; preference state (favorite, preferred,
 * reduced frequency, excluded) remains in the caller's profile domain.
 *
 * @param {{query?: string, primaryMuscle?: string, secondaryMuscle?: string,
 * equipment?: string, location?: string, movementPattern?: string,
 * difficulty?: string}} [filters]
 */
export function filterExercises(filters = {}) {
  const normalizedQuery = String(filters.query || "").trim().toLocaleLowerCase();
  const normalizedEquipment = String(filters.equipment || "").trim().toLocaleLowerCase()
    .replace(/dumbbells?/g, "dumbbell")
    .replace(/kettlebells?/g, "kettlebell");
  return EXERCISES.filter((item) => {
    const searchText = [item.name, ...item.aliases, ...item.primaryMuscles, ...item.secondaryMuscles]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (!normalizedQuery || searchText.includes(normalizedQuery)) &&
      (!filters.primaryMuscle || item.primaryMuscles.includes(filters.primaryMuscle)) &&
      (!filters.secondaryMuscle || item.secondaryMuscles.includes(filters.secondaryMuscle)) &&
      (!normalizedEquipment || item.equipment.some(equipment => String(equipment).toLocaleLowerCase()
        .replace(/dumbbells?/g, "dumbbell")
        .replace(/kettlebells?/g, "kettlebell") === normalizedEquipment)) &&
      (!filters.location || item.location.includes(filters.location)) &&
      (!filters.movementPattern || item.movementPattern === filters.movementPattern) &&
      (!filters.difficulty || item.difficulty === filters.difficulty)
    );
  });
}
