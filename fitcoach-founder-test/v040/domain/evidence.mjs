import { convertWeight, normalizeUnit } from "../core/utils.mjs";
import { isValidCompletedSet } from "./workouts.mjs";

const MAX_SESSION_MINUTES = 1_440;
const RECORD_TOLERANCE = 0.11;

function validDate(value) {
  const dateOnly = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function weekStart(value) {
  const start = new Date(value);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

function localDateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function boundedDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? Math.min(MAX_SESSION_MINUTES, Math.max(0, duration))
    : 0;
}

function completedAt(session) {
  return validDate(session?.completedAt || session?.date);
}

function sessionsInRange(state, start, end) {
  return (Array.isArray(state?.sessions) ? state.sessions : []).filter(session => {
    const completed = completedAt(session);
    return completed && completed >= start && completed < end;
  });
}

function validSetRows(session) {
  const sessionUnit = normalizeUnit(session?.units, "lb");
  return (Array.isArray(session?.exercises) ? session.exercises : []).flatMap(exercise => {
    const exerciseId = exercise?.exerciseId || exercise?.snapshot?.id || "";
    const exerciseUnit = normalizeUnit(exercise?.units, sessionUnit);
    return (Array.isArray(exercise?.sets) ? exercise.sets : [])
      .filter(isValidCompletedSet)
      .map(set => ({ exerciseId, exerciseUnit, set }));
  });
}

function roundedVolume(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function formatNumber(value) {
  const [whole, fraction] = String(value).split(".");
  const signedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${signedWhole}.${fraction}` : signedWhole;
}

function isVerifiedRecord(record, session, validRows) {
  if (!record || record.kind !== "personal_record" || record.metric !== "estimated_1rm") return false;
  const exerciseId = String(record.exerciseId || "");
  const unit = normalizeUnit(record.unit, normalizeUnit(session?.units, "lb"));
  const weight = Number(record.weight);
  const reps = Number(record.reps);
  const value = Number(record.value);
  const previousValue = Number(record.previousValue);
  if (!exerciseId || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) return false;
  if (!Number.isFinite(value) || !Number.isFinite(previousValue) || value <= previousValue) return false;
  return validRows.some(row => (
    row.exerciseId === exerciseId
    && Number(row.set.reps) === reps
    && Math.abs(convertWeight(row.set.weight, row.set.unit || row.exerciseUnit, unit) - weight) < RECORD_TOLERANCE
  ));
}

function verifiedRecordCount(session, validRows) {
  const seen = new Set();
  return (Array.isArray(session?.personalRecords) ? session.personalRecords : []).reduce((count, record) => {
    if (!isVerifiedRecord(record, session, validRows)) return count;
    const key = `${record.exerciseId}:${record.metric}`;
    if (seen.has(key)) return count;
    seen.add(key);
    return count + 1;
  }, 0);
}

function confirmedNutritionDays(state, startKey, endKey) {
  const days = state?.nutrition?.days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return 0;
  return Object.entries(days).reduce((count, [dateKey, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < startKey || dateKey >= endKey) return count;
    const hasConfirmedEntry = (Array.isArray(day?.entries) ? day.entries : [])
      .some(entry => entry?.status === "confirmed");
    return count + (hasConfirmedEntry ? 1 : 0);
  }, 0);
}

function periodEvidence(state, start, end, nutritionEnd, displayUnit) {
  const sessions = sessionsInRange(state, start, end);
  let validSets = 0;
  let volume = 0;
  let verifiedPersonalRecords = 0;
  for (const session of sessions) {
    const rows = validSetRows(session);
    validSets += rows.length;
    volume += rows.reduce((sum, row) => (
      sum + (convertWeight(
        row.set.weight,
        row.set.unit || row.exerciseUnit || session.units,
        displayUnit,
      ) * Number(row.set.reps))
    ), 0);
    verifiedPersonalRecords += verifiedRecordCount(session, rows);
  }
  const inclusiveEnd = new Date(nutritionEnd);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  return {
    start: localDateKey(start),
    end: localDateKey(inclusiveEnd),
    completedSessions: sessions.length,
    validSets,
    durationMinutes: roundedVolume(sessions.reduce((sum, session) => sum + boundedDuration(session.durationMinutes), 0)),
    volume: roundedVolume(volume),
    verifiedPersonalRecords,
    confirmedNutritionDays: confirmedNutritionDays(
      state,
      localDateKey(start),
      localDateKey(nutritionEnd),
    ),
  };
}

function evidenceCount(period) {
  return period.completedSessions + period.validSets + period.verifiedPersonalRecords + period.confirmedNutritionDays;
}

function hasEvidenceBefore(state, cutoff) {
  const hasCompletedSession = (Array.isArray(state?.sessions) ? state.sessions : [])
    .some(session => {
      const completed = completedAt(session);
      return completed && completed < cutoff;
    });
  if (hasCompletedSession) return true;

  const cutoffKey = localDateKey(cutoff);
  const days = state?.nutrition?.days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return false;
  return Object.entries(days).some(([dateKey, day]) => (
    /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    && dateKey < cutoffKey
    && (Array.isArray(day?.entries) ? day.entries : []).some(entry => entry?.status === "confirmed")
  ));
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function evidenceCopy(current, previous, scheduleTarget, displayUnit, hasEarlierEvidence) {
  const currentEvidence = evidenceCount(current);
  const previousEvidence = evidenceCount(previous);
  if (!currentEvidence && !previousEvidence) {
    if (hasEarlierEvidence) {
      return {
        mode: "lapsed",
        title: "Your history is here. This week is still open",
        body: `No completed workout or confirmed nutrition day is logged in the last two calendar weeks. One approved workout starts a fresh ${scheduleTarget}-session baseline.`,
        comparison: "Older records remain in Progress; there is no recent week to compare honestly.",
      };
    }
    return {
      mode: "empty",
      title: "Your first completed session starts the record",
      body: `Nothing is behind. Complete one approved workout to begin a ${scheduleTarget}-session weekly baseline.`,
      comparison: "There is no earlier week to compare yet.",
    };
  }
  if (!previousEvidence) {
    return {
      mode: "baseline",
      title: "This week is your baseline",
      body: `${current.completedSessions} completed session${current.completedSessions === 1 ? "" : "s"}, ${current.validSets} valid set${current.validSets === 1 ? "" : "s"}, and ${current.confirmedNutritionDays} confirmed nutrition day${current.confirmedNutritionDays === 1 ? "" : "s"} are logged.`,
      comparison: "Keep logging; a full earlier week is not available for an honest comparison yet.",
    };
  }
  return {
    mode: "comparison",
    title: "This week, compared honestly",
    body: current.completedSessions
      ? `${current.completedSessions} of ${scheduleTarget} scheduled sessions are complete with ${current.validSets} valid sets and ${formatNumber(current.volume)} ${displayUnit} of logged volume.`
      : `No completed workout is logged this week yet. ${current.confirmedNutritionDays} confirmed nutrition day${current.confirmedNutritionDays === 1 ? " is" : "s are"} recorded.`,
    comparison: `${signed(current.completedSessions - previous.completedSessions)} sessions, ${signed(current.validSets - previous.validSets)} valid sets, and ${signed(roundedVolume(current.volume - previous.volume))} ${displayUnit} versus last calendar week.`,
  };
}

/**
 * Builds a deterministic, confirmed-evidence-only weekly receipt.
 * The current period runs from local Monday through `now`; the comparison is
 * the complete previous local calendar week. No targets or trends are health,
 * nutrition, or diet advice.
 */
export function buildWeeklyEvidence(state, now = new Date()) {
  const currentNow = validDate(now) || new Date(0);
  const currentStart = weekStart(currentNow);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 7);
  const nextWeekStart = new Date(currentStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const currentEnd = new Date(Math.min(currentNow.getTime() + 1, nextWeekStart.getTime()));
  const todayEnd = new Date(currentNow);
  todayEnd.setHours(0, 0, 0, 0);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const displayUnit = normalizeUnit(state?.settings?.units, "lb");
  const rawTarget = Number(state?.profile?.days);
  const scheduleTarget = Number.isFinite(rawTarget) && rawTarget > 0
    ? Math.min(7, Math.max(1, Math.round(rawTarget)))
    : 3;
  const current = periodEvidence(state, currentStart, currentEnd, todayEnd, displayUnit);
  const previous = periodEvidence(state, previousStart, currentStart, currentStart, displayUnit);
  const hasEarlierEvidence = hasEvidenceBefore(state, previousStart);
  const deltas = {
    completedSessions: current.completedSessions - previous.completedSessions,
    validSets: current.validSets - previous.validSets,
    durationMinutes: roundedVolume(current.durationMinutes - previous.durationMinutes),
    volume: roundedVolume(current.volume - previous.volume),
    verifiedPersonalRecords: current.verifiedPersonalRecords - previous.verifiedPersonalRecords,
    confirmedNutritionDays: current.confirmedNutritionDays - previous.confirmedNutritionDays,
  };
  return {
    generatedAt: currentNow.toISOString(),
    displayUnit,
    scheduleTarget,
    current,
    previous,
    deltas,
    copy: evidenceCopy(current, previous, scheduleTarget, displayUnit, hasEarlierEvidence),
  };
}
