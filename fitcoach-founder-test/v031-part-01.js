"use strict";

const BUILD = "0.3.1-symbio";
const ACCESS_CODE = "LIFT26";
const ROUTES = ["today", "train", "coach", "progress", "profile"];
const ACTIONS = [
  "SAY_NOTHING", "CHECK_IN", "RECOVER_MISSED_SESSION", "OFFER_PLAN_B",
  "OFFER_MINIMUM_DOSE", "MOVE_SESSION", "RECOMMEND_REST", "ASK_FOR_BLOCKER", "CELEBRATE"
];
const MODEL_MODES = {
  fast: {
    label: "Quick",
    detail: "Concise answer · same safety rules",
    sequence: []
  },
  smart: {
    label: "Balanced",
    detail: "Useful context · one clear next move",
    sequence: []
  },
  deep: {
    label: "Deep",
    detail: "More explanation · no extra authority",
    sequence: []
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[char]));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const todayISO = () => new Date().toLocaleDateString("en-CA");
const fmtTime = value => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const fmtDate = value => new Intl.DateTimeFormat([], { month: "short", day: "numeric" }).format(new Date(value));

const app = {
  founder: "mo",
  route: "today",
  onboardingStep: 0,
  deferredInstall: null,
  restInterval: null,
  chatBusy: false,
  voiceRecorder: null,
  voiceStream: null,
  voiceChunks: [],
  voiceStartedAt: 0,
  voiceFallbackRecognition: null,
  apiStatus: "ready",
  feedbackChoice: ""
};

const founders = {
  mo: { name: "Mohammed", initial: "M" },
  ravi: { name: "Ravi", initial: "R" }
};

function initialData(founder) {
  return {
    founder,
    version: BUILD,
    profile: {
      onboarded: false,
      goal: "build muscle",
      experience: "intermediate",
      days: 3,
      duration: 45,
      equipment: "full gym",
      blocker: "time",
      tone: founder === "ravi" ? "Direct" : "Strict",
      quietStart: "21:30",
      quietEnd: "08:00",
      proactive: true,
      feedbackOptIn: true,
      energy: 3,
      preferredDays: [1, 3, 5]
    },
    sessions: [],
    chat: [],
    feedback: [],
    decisions: [],
    memories: [],
    interventionOutcomes: [],
    activeWorkout: null,
    settings: {
      units: "lb",
      coachMode: "smart",
      speakReplies: true
    },
    planProposals: [],
    acceptedPlanNotes: [],
    lastApi: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function storageKey(founder = app.founder) {
  return `fitcoach-v031:${founder}`;
}

function normalizeLegacy(raw, founder) {
  const base = initialData(founder);
  if (!raw || typeof raw !== "object") return base;

  const legacyProfile = raw.profile || {};
  const normalizedProfile = {
    ...base.profile,
    ...legacyProfile,
    onboarded: Boolean(legacyProfile.onboarded ?? raw.onboarded),
    tone: legacyProfile.tone || legacyProfile.style || base.profile.tone,
    days: Number(legacyProfile.days || legacyProfile.days_per_week || base.profile.days),
    duration: Number(legacyProfile.duration || base.profile.duration),
    equipment: legacyProfile.equipment || base.profile.equipment,
    goal: legacyProfile.goal || base.profile.goal
  };

  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  const sessions = rawSessions.map(session => {
    if (Array.isArray(session.exercises)) return session;
    if (session.exercise) {
      return {
        id: session.id || uid(),
        date: session.date || todayISO(),
        completedAt: session.completedAt || `${session.date || todayISO()}T12:00:00`,
        planId: session.plan || "A",
        planLabel: session.plan === "MIN" ? "Minimum Dose" : session.plan === "B" ? "Plan B" : "Plan A",
        durationMinutes: 0,
        exercises: [{
          name: session.exercise,
          sets: Array.from({ length: Number(session.sets) || 1 }, (_, index) => ({
            id: uid(), index: index + 1, weight: Number(session.weight) || 0,
            reps: Number(session.reps) || 0, done: true
          }))
        }],
        markedPR: Boolean(session.pr)
      };
    }
    return session;
  });

  const rawChat = raw.chat || raw.chats || [];
  const chat = rawChat.map(message => ({
    id: message.id || uid(),
    role: message.role === "assistant" ? "coach" : message.role,
    text: message.text || message.content || "",
    at: message.at || new Date().toISOString(),
    provider: message.provider || "legacy",
    model: message.model || null
  })).filter(message => message.text);

  return {
    ...base,
    ...raw,
    version: BUILD,
    profile: normalizedProfile,
    sessions,
    chat,
    feedback: raw.feedback || [],
    decisions: raw.decisions || [],
    memories: raw.memories || [],
    interventionOutcomes: raw.interventionOutcomes || [],
    activeWorkout: raw.activeWorkout || null,
    settings: { ...base.settings, ...(raw.settings || {}) },
    planProposals: raw.planProposals || [],
    acceptedPlanNotes: raw.acceptedPlanNotes || []
  };
}

function migrateFounder(founder) {
  const current = localStorage.getItem(storageKey(founder));
  if (current) return;
  const candidates = [
    `fitcoach-founder:${founder}`,
    `fitcoach-founder-live-v1:${founder}`,
    `fitcoach-founder-live-v1${founder}`
  ];
  for (const key of candidates) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      if (raw) {
        localStorage.setItem(storageKey(founder), JSON.stringify(normalizeLegacy(raw, founder)));
        return;
      }
    } catch {
      // Ignore malformed legacy records and continue.
    }
  }
}

function load() {
  migrateFounder(app.founder);
  const base = initialData(app.founder);
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (!stored) return base;
    return normalizeLegacy(stored, app.founder);
  } catch {
    return base;
  }
}
