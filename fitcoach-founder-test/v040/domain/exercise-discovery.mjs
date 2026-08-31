/**
 * Pure exercise-discovery helpers shared by the store and training UI.
 *
 * These functions intentionally have no DOM, storage, or exercise-data
 * dependency. They return fresh arrays and never mutate their inputs.
 */

export const RECENT_EXERCISE_LIMIT = 12;
export const EXERCISE_PAGE_SIZE = 20;

function normalizedId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedLimit(value, fallback) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(0, Math.trunc(candidate));
}

/**
 * Normalize a recently-viewed ID list while retaining its first-seen order.
 *
 * @param {unknown} value
 * @param {{ limit?: number }} [options]
 * @returns {string[]}
 */
export function normalizeRecentExerciseIds(value, options = {}) {
  const limit = boundedLimit(options?.limit, RECENT_EXERCISE_LIMIT);
  if (!Array.isArray(value) || limit === 0) return [];

  const normalized = [];
  const seen = new Set();
  for (const valueId of value) {
    const id = normalizedId(valueId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length === limit) break;
  }
  return normalized;
}

/**
 * Return a new recent-ID list with the viewed exercise moved to the front.
 * Invalid IDs leave a normalized copy of the existing list.
 *
 * @param {unknown} recentIds
 * @param {unknown} exerciseId
 * @param {{ limit?: number }} [options]
 * @returns {string[]}
 */
export function recordExerciseView(recentIds, exerciseId, options = {}) {
  const limit = boundedLimit(options?.limit, RECENT_EXERCISE_LIMIT);
  const id = normalizedId(exerciseId);
  if (!id) return normalizeRecentExerciseIds(recentIds, { limit });
  return normalizeRecentExerciseIds([id, ...(Array.isArray(recentIds) ? recentIds : [])], { limit });
}

function exerciseLookup(library) {
  const lookup = new Map();
  if (!Array.isArray(library)) return lookup;
  for (const exercise of library) {
    const id = normalizedId(exercise?.id);
    if (id && !lookup.has(id)) lookup.set(id, exercise);
  }
  return lookup;
}

/**
 * Build a recent-exercise list in most-recent-first ID order.
 * Unknown IDs and duplicate catalogue records are ignored.
 *
 * @param {unknown} library
 * @param {unknown} recentIds
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
export function buildRecentExerciseList(library, recentIds, options = {}) {
  const limit = boundedLimit(options?.limit, RECENT_EXERCISE_LIMIT);
  const lookup = exerciseLookup(library);
  return normalizeRecentExerciseIds(recentIds, { limit })
    .map(id => lookup.get(id))
    .filter(Boolean);
}

/**
 * Build a favorite-exercise list in stable catalogue order.
 *
 * @param {unknown} library
 * @param {unknown} favoriteIds
 * @returns {object[]}
 */
export function buildFavoriteExerciseList(library, favoriteIds) {
  if (!Array.isArray(library) || !Array.isArray(favoriteIds)) return [];
  const favorites = new Set(favoriteIds.map(normalizedId).filter(Boolean));
  const included = new Set();
  const exercises = [];

  for (const exercise of library) {
    const id = normalizedId(exercise?.id);
    if (!id || !favorites.has(id) || included.has(id)) continue;
    included.add(id);
    exercises.push(exercise);
  }
  return exercises;
}

/**
 * Build both personalized discovery rails from a single catalogue.
 *
 * @param {unknown} library
 * @param {{ recent?: unknown, favorites?: unknown }} [preferences]
 * @param {{ recentLimit?: number }} [options]
 * @returns {{ recent: object[], favorites: object[] }}
 */
export function buildPersonalizedExerciseLists(library, preferences = {}, options = {}) {
  return {
    recent: buildRecentExerciseList(library, preferences?.recent, { limit: options?.recentLimit }),
    favorites: buildFavoriteExerciseList(library, preferences?.favorites),
  };
}

/**
 * Paginate a filtered catalogue into fixed 20-exercise pages.
 * The returned page is always at least 1 and is clamped to the last page when
 * items exist. An empty catalogue reports zero total pages and page 1.
 *
 * @param {unknown} exercises
 * @param {unknown} requestedPage
 * @returns {{ items: unknown[], page: number, pageSize: number, totalItems: number, totalPages: number, hasNext: boolean, hasPrevious: boolean }}
 */
export function paginateExercises(exercises, requestedPage = 1) {
  const source = Array.isArray(exercises) ? exercises : [];
  const totalItems = source.length;
  const totalPages = Math.ceil(totalItems / EXERCISE_PAGE_SIZE);
  const numericPage = Number(requestedPage);
  const integerPage = Number.isFinite(numericPage) ? Math.trunc(numericPage) : 1;
  const page = totalPages > 0
    ? Math.min(Math.max(1, integerPage), totalPages)
    : 1;
  const start = (page - 1) * EXERCISE_PAGE_SIZE;

  return {
    items: source.slice(start, start + EXERCISE_PAGE_SIZE),
    page,
    pageSize: EXERCISE_PAGE_SIZE,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: totalPages > 0 && page > 1,
  };
}
