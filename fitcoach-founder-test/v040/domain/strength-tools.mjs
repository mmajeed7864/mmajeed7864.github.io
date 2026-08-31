const SUPPORTED_UNITS = new Set(["lb", "kg"]);
const MAX_WEIGHT = 5_000;
const MAX_ESTIMATE_REPS = 30;
const SCALE = 100;

export const STANDARD_PLATE_INVENTORY = Object.freeze({
  lb: Object.freeze({
    barWeight: 45,
    plates: Object.freeze([45, 35, 25, 10, 5, 2.5]),
  }),
  kg: Object.freeze({
    barWeight: 20,
    plates: Object.freeze([25, 20, 15, 10, 5, 2.5, 1.25]),
  }),
});

function positiveNumber(value, maximum = MAX_WEIGHT) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * SCALE) / SCALE;
}

function normalizeConfiguration(unit, options = {}) {
  if (!SUPPORTED_UNITS.has(unit)) return null;
  const standard = STANDARD_PLATE_INVENTORY[unit];
  const barWeight = options.barWeight === undefined
    ? standard.barWeight
    : positiveNumber(options.barWeight);
  if (barWeight === null) return null;

  const source = options.plates === undefined ? standard.plates : options.plates;
  if (!Array.isArray(source)) return null;
  const plates = [...new Set(source
    .map(value => positiveNumber(value, MAX_WEIGHT / 2))
    .filter(value => value !== null)
    .map(rounded))]
    .sort((left, right) => right - left);
  if (!plates.length) return null;
  return { unit, barWeight: rounded(barWeight), plates };
}

function bestPerSideLoad(target, plates) {
  const targetUnits = Math.max(0, Math.floor((target + Number.EPSILON) * SCALE));
  const plateUnits = plates.map(value => Math.round(value * SCALE));
  const unreachable = targetUnits + 1;
  const plateCounts = new Int32Array(targetUnits + 1);
  const previousPlate = new Int16Array(targetUnits + 1);
  plateCounts.fill(unreachable);
  previousPlate.fill(-1);
  plateCounts[0] = 0;

  for (let amount = 1; amount <= targetUnits; amount += 1) {
    for (let plateIndex = 0; plateIndex < plateUnits.length; plateIndex += 1) {
      const plate = plateUnits[plateIndex];
      if (plate > amount || plateCounts[amount - plate] === unreachable) continue;
      const candidateCount = plateCounts[amount - plate] + 1;
      if (candidateCount >= plateCounts[amount]) continue;
      plateCounts[amount] = candidateCount;
      previousPlate[amount] = plateIndex;
    }
  }

  let loadedUnits = targetUnits;
  while (loadedUnits > 0 && plateCounts[loadedUnits] === unreachable) loadedUnits -= 1;
  const counts = new Array(plates.length).fill(0);
  let cursor = loadedUnits;
  while (cursor > 0) {
    const plateIndex = previousPlate[cursor];
    if (plateIndex < 0) break;
    counts[plateIndex] += 1;
    cursor -= plateUnits[plateIndex];
  }

  return {
    weight: rounded(loadedUnits / SCALE),
    plates: plates
      .map((weight, index) => ({ weight, count: counts[index] }))
      .filter(item => item.count > 0),
  };
}

/**
 * Returns a two-sided barbell loading receipt. The target includes the bar.
 * If an exact load is unavailable, the receipt uses the nearest load below the
 * target and exposes the difference instead of silently rounding it away.
 */
export function calculatePlateLoading(targetWeight, unit = "lb", options = {}) {
  const target = positiveNumber(targetWeight);
  const configuration = normalizeConfiguration(unit, options);
  if (target === null || configuration === null) return null;

  const { barWeight, plates } = configuration;
  if (target < barWeight) {
    const difference = rounded(barWeight - target);
    return {
      unit,
      targetWeight: rounded(target),
      barWeight,
      perSide: [],
      totalPlates: 0,
      loadedWeight: barWeight,
      exact: false,
      possible: false,
      difference,
      remainder: difference,
      direction: "over",
      reason: "below-bar",
    };
  }

  const desiredPerSide = (target - barWeight) / 2;
  const load = bestPerSideLoad(desiredPerSide, plates);
  const loadedWeight = rounded(barWeight + (load.weight * 2));
  const signedDifference = rounded(loadedWeight - target);
  const exact = Math.abs(signedDifference) < (1 / SCALE);
  return {
    unit,
    targetWeight: rounded(target),
    barWeight,
    perSide: load.plates,
    totalPlates: load.plates.reduce((sum, plate) => sum + (plate.count * 2), 0),
    loadedWeight,
    exact,
    possible: exact,
    difference: exact ? 0 : signedDifference,
    remainder: exact ? 0 : rounded(Math.abs(signedDifference)),
    direction: exact ? "exact" : signedDifference < 0 ? "under" : "over",
    reason: exact ? null : "not-loadable",
  };
}

/**
 * Builds a conservative barbell warm-up ramp from a user-provided working
 * weight. Every suggested weight is loadable with the selected inventory,
 * below the working weight, and deduplicated after plate rounding.
 */
export function buildWarmupRamp(workingWeight, unit = "lb", options = {}) {
  const working = positiveNumber(workingWeight);
  const configuration = normalizeConfiguration(unit, options);
  if (working === null || configuration === null || working <= configuration.barWeight) return [];

  const stages = [
    { key: "empty-bar", targetRatio: configuration.barWeight / working, reps: 10 },
    { key: "primer", targetRatio: 0.5, reps: 8 },
    { key: "build", targetRatio: 0.7, reps: 5 },
    { key: "ready", targetRatio: 0.85, reps: 3 },
  ];
  const suggestions = [];
  const seenWeights = new Set();

  for (const stage of stages) {
    const target = stage.key === "empty-bar"
      ? configuration.barWeight
      : working * stage.targetRatio;
    const roundedLoading = calculatePlateLoading(Math.max(configuration.barWeight, target), unit, options);
    if (!roundedLoading || roundedLoading.loadedWeight >= working || seenWeights.has(roundedLoading.loadedWeight)) continue;
    const loading = calculatePlateLoading(roundedLoading.loadedWeight, unit, options);
    if (!loading) continue;
    seenWeights.add(loading.loadedWeight);
    suggestions.push({
      key: stage.key,
      weight: loading.loadedWeight,
      unit,
      reps: stage.reps,
      targetPercent: Math.round(stage.targetRatio * 100),
      actualPercent: Math.round((loading.loadedWeight / working) * 100),
      loading,
    });
  }

  return suggestions.sort((left, right) => left.weight - right.weight);
}

/**
 * Epley estimate for a completed weighted set. High-repetition sets are
 * intentionally rejected because this helper should not imply false precision.
 */
export function estimateOneRepMax(weight, reps, options = {}) {
  const load = positiveNumber(weight);
  const repetitions = Number(reps);
  const requestedMaximum = Number(options.maxReps);
  const maxReps = Number.isInteger(requestedMaximum) && requestedMaximum > 0
    ? Math.min(requestedMaximum, MAX_ESTIMATE_REPS)
    : MAX_ESTIMATE_REPS;
  if (load === null || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > maxReps) return null;
  if (repetitions === 1) return rounded(load);
  return rounded(load * (1 + (repetitions / 30)));
}
