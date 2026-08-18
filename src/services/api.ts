import { setStoreUser } from "../db/db";

export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function ensureRandomUUID() {
  if (typeof globalThis.crypto === "undefined") return;
  if (typeof globalThis.crypto.randomUUID === "function") return;
  const fallback = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  const cryptoLike = globalThis.crypto as Crypto & { randomUUID?: Crypto["randomUUID"] };
  try { cryptoLike.randomUUID = fallback as Crypto["randomUUID"]; }
  catch { try { Object.defineProperty(cryptoLike, "randomUUID", { configurable: true, value: fallback }); } catch {} }
}
ensureRandomUUID();

type ReviewIdentity = { id: string; wordId: string; reviewedAt: number };
type AuthUser = { id?: string | number; [key: string]: unknown };

let cachedAuthUser: unknown | undefined;
let authCacheReady = false;
let settingsQuotaCache: number | undefined;
let speechCompletion: Promise<void> = Promise.resolve();
let speechPending = false;
let speechPatched = false;

function patchSpeechRate() {
  if (speechPatched || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synthesis = window.speechSynthesis;
    const originalSpeak = synthesis.speak.bind(synthesis);
    synthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      utterance.rate = 0.75;
      speechPending = true;
      let resolveSpeech!: () => void;
      speechCompletion = new Promise<void>(resolve => { resolveSpeech = resolve; });
      const finish = () => {
        speechPending = false;
        window.setTimeout(resolveSpeech, 0);
      };
      utterance.addEventListener("end", finish, { once: true });
      utterance.addEventListener("error", finish, { once: true });
      originalSpeak(utterance);
    };
    speechPatched = true;
  } catch {}
}

patchSpeechRate();

export function clearApiCaches() {
  cachedAuthUser = undefined;
  authCacheReady = false;
  settingsQuotaCache = undefined;
}

function alignReviewIdentity(path: string, init?: RequestInit): RequestInit | undefined {
  if (!init?.body || path !== "/reviews" || typeof init.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as { wordId?: string; reviewedAt?: string; reviewId?: string };
    if (!payload.wordId || !payload.reviewedAt) return init;
    const rows = JSON.parse(localStorage.getItem("fsrs-review-identities") || "[]") as ReviewIdentity[];
    const target = new Date(payload.reviewedAt).getTime();
    const match = rows.filter(row => row.wordId === payload.wordId && Number.isFinite(row.reviewedAt))
      .map(row => ({ row, distance: Math.abs(row.reviewedAt - target) }))
      .filter(item => item.distance <= 5000).sort((a, b) => a.distance - b.distance)[0];
    return match ? { ...init, body: JSON.stringify({ ...payload, reviewId: match.row.id }) } : init;
  } catch { return init; }
}

async function afterAuthMe(user: unknown) {
  cachedAuthUser = user;
  authCacheReady = true;
  if (!user || typeof user !== "object") {
    setStoreUser(null);
    settingsQuotaCache = undefined;
    return;
  }
  const authUser = user as AuthUser;
  if (authUser.id !== undefined && authUser.id !== null) setStoreUser(String(authUser.id));
  else setStoreUser(null);

  try {
    if (settingsQuotaCache === undefined) {
      const response = await fetch(`${API_BASE_URL}/settings`, { credentials: "include" });
      if (response.ok) {
        const settings = await response.json() as { dailyNewQuota?: number };
        if (Number.isFinite(settings.dailyNewQuota)) {
          settingsQuotaCache = settings.dailyNewQuota;
          localStorage.setItem("daily-new-quota", String(settings.dailyNewQuota));
        }
      }
    }
  } catch {}
}

function selectionPath(path: string) {
  return path === "/study/new-answer" || path === "/reviews" || path === "/study/known-exclude";
}

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

function markCorrectNewOption(correctAnswer: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-action="new-answer"]'));
  const button = buttons.find(item => {
    try { return decodeURIComponent(item.dataset.option || "") === correctAnswer; } catch { return item.dataset.option === correctAnswer; }
  });
  if (!button) return;
  button.style.borderColor = "#16a34a";
  button.style.background = "rgba(34, 197, 94, 0.10)";
  button.style.color = "#166534";
  button.style.boxShadow = "0 0 0 2px rgba(34, 197, 94, 0.12) inset";
}

async function speakCorrectNewAnswer(answer: string) {
  if (!answer.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = "en-US";
    utterance.rate = 0.75;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

export const API_TIMEOUT = 15000; // 15 second timeout

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestInit = alignReviewIdentity(normalizedPath, init);

  if (normalizedPath === "/auth/me" && authCacheReady && !requestInit?.method) {
    return { user: cachedAuthUser } as T;
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    credentials: "include", ...requestInit,
    headers: { "Content-Type": "application/json", ...(requestInit?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    if (normalizedPath === "/auth/me") {
      authCacheReady = true;
      cachedAuthUser = null;
      setStoreUser(null);
    }
    throw new Error(String(body.error || `API ${response.status}`));
  }
  const result = await response.json() as T;

  if (normalizedPath === "/study/new-answer") {
    const feedback = result as { correct?: boolean; correctAnswer?: string; direction?: string };
    if (feedback.correct === false && feedback.correctAnswer) {
      markCorrectNewOption(feedback.correctAnswer);
      if (feedback.direction === "ce") await speakCorrectNewAnswer(feedback.correctAnswer);
      await speechCompletion.catch(() => undefined);
      await sleep(1200);
    }
  }

  if (selectionPath(normalizedPath)) {
    if (speechPending) {
      await speechCompletion.catch(() => undefined);
      await sleep(100);
    } else {
      await sleep(600);
    }
  }
  if (normalizedPath === "/auth/me" || normalizedPath === "/auth/login" || normalizedPath === "/auth/register") {
    const user = (result as { user?: unknown }).user;
    await afterAuthMe(user);
  }
  if (normalizedPath === "/auth/logout") {
    clearApiCaches();
    setStoreUser(null);
  }
  return result;
}
