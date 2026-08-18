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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
