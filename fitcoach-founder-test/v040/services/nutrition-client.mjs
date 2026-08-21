import { BUILD, NUTRITION_API } from "../core/constants.mjs";

const BARCODE_RE = /^[0-9]{6,18}$/;
const QUERY_RE = /^[\p{L}\p{N}\p{Zs}.,'’&()+/-]{2,80}$/u;

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value, max = 160) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const number = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function normalizeBarcode(value) {
  const barcode = clean(value, 32).replace(/\D/g, "");
  return BARCODE_RE.test(barcode) ? barcode : "";
}

export function normalizeRemoteFood(food) {
  if (!isRecord(food) || !isRecord(food.per)) return null;
  const calories = number(food.per.calories);
  const protein = number(food.per.protein);
  const carbs = number(food.per.carbs);
  const fat = number(food.per.fat);
  if ([calories, protein, carbs, fat].some(value => value === null)) return null;
  const name = clean(food.name, 120);
  if (!name) return null;
  return {
    name,
    brand: clean(food.brand, 80),
    barcode: clean(food.barcode, 24),
    servingLabel: clean(food.servingLabel, 80) || "1 serving",
    origin: "barcode",
    confidence: ["high", "medium", "low"].includes(food.confidence) ? food.confidence : "medium",
    provider: clean(food.source, 60) || "open_food_facts",
    licenseNote: clean(food.licenseNote, 200),
    per: {
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      fiber: Math.round((number(food.per.fiber) ?? 0) * 10) / 10,
      sugar: Math.round((number(food.per.sugar) ?? 0) * 10) / 10,
      sodium: Math.round(number(food.per.sodium) ?? 0),
    },
  };
}

export function createNutritionLookupPayload({ action, sessionId, barcode, query, image }) {
  const base = {
    action,
    data_classification: "synthetic_low_sensitivity",
    session_id: clean(sessionId, 120),
  };
  if (action === "barcode_lookup") {
    const normalized = normalizeBarcode(barcode);
    if (!normalized) return null;
    return { ...base, barcode: normalized };
  }
  if (action === "text_search") {
    const normalized = clean(query, 80);
    if (!QUERY_RE.test(normalized)) return null;
    return { ...base, query: normalized };
  }
  if (action === "vision_estimate" && isRecord(image)) {
    return {
      ...base,
      image: {
        name: clean(image.name, 80),
        mime: clean(image.mime, 80),
        size: number(image.size) ?? 0,
      },
    };
  }
  return null;
}

export function createNutritionClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  endpoint = NUTRITION_API,
  timeoutMs = 8_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  async function post(payload, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort("timeout"); }, timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FitCoach-Build": BUILD,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        return { status: "error", reason: body.error || `HTTP_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
      }
      return { status: "ready", body };
    } catch (error) {
      return { status: "error", reason: timedOut ? "timeout" : signal?.aborted ? "aborted" : "network", retryable: !signal?.aborted, error };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
  }

  return {
    async lookupBarcode({ sessionId, barcode, signal }) {
      const payload = createNutritionLookupPayload({ action: "barcode_lookup", sessionId, barcode });
      if (!payload) return { status: "invalid", reason: "invalid_barcode" };
      const result = await post(payload, signal);
      if (result.status !== "ready") return result;
      const food = normalizeRemoteFood(result.body.food);
      return food ? { status: "ready", food, metadata: result.body } : { status: "error", reason: "invalid_food_result", retryable: false };
    },

    async searchFoods({ sessionId, query, signal }) {
      const payload = createNutritionLookupPayload({ action: "text_search", sessionId, query });
      if (!payload) return { status: "invalid", reason: "invalid_query" };
      const result = await post(payload, signal);
      if (result.status !== "ready") return result;
      const foods = (Array.isArray(result.body.foods) ? result.body.foods : []).map(normalizeRemoteFood).filter(Boolean).slice(0, 5);
      return foods.length ? { status: "ready", foods, metadata: result.body } : { status: "error", reason: "no_food_results", retryable: false };
    },
  };
}
